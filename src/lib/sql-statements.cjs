/**
 * Divisor de um arquivo `.sql` em statements individuais.
 *
 * ## Por que isto existe
 *
 * O Prisma emite `$executeRawUnsafe` como PREPARED STATEMENT, e no Postgres um
 * prepared statement aceita EXATAMENTE UM comando. Mandar o `.sql` inteiro numa
 * chamada só devolve, sem escrever nada:
 *
 *   Code: `42601`. Message: `cannot insert multiple commands into a prepared statement`
 *
 * Foi o que aconteceu ao aplicar 20260729180000_billing_obligations em produção.
 * Logo, quem aplica precisa mandar UM statement POR CHAMADA — e, portanto,
 * precisa saber onde cada statement termina.
 *
 * ## Por que `split(";")` NÃO serve
 *
 * Medido contra o `.sql` real desta migração: `split(";")` produz 59 fragmentos,
 * dos quais vários são pedaços SOLTOS do corpo das funções plpgsql — `END IF`,
 * `RETURN OLD`, `PERFORM "bump_entitlement_revision"(target_company_id)`. Cada
 * um desses é sintaticamente inválido isolado. O `;` dentro de um corpo
 * `$$ ... $$` NÃO termina statement; ele pertence ao corpo.
 *
 * ## O que este divisor respeita
 *
 * O `;` só encerra um statement quando está em NÍVEL DE TOPO, isto é, fora de:
 *
 *   - dollar-quoting `$$ ... $$` e a forma com tag `$corpo$ ... $corpo$`
 *     (a abertura só casa com o fechamento de MESMA tag — `$a$ ... $b$ ... $a$`
 *     fecha no `$a$ final, não no `$b$`);
 *   - string literal `'...'`, incluindo o escape SQL `''` (aspa duplicada);
 *   - identificador entre aspas duplas `"..."`, incluindo o escape `""`;
 *   - comentário de linha `-- ...` até o fim da linha;
 *   - comentário de bloco `/* ... *​/`, que no Postgres é ANINHÁVEL.
 *
 * O texto de cada statement é devolvido CRU (comentários preservados). Não
 * reescrevemos SQL: um `.sql` de migração é auditado por humano, e um divisor
 * que "limpa" o texto vira mais uma coisa a desconfiar quando algo falha.
 *
 * ## Um detalhe do dollar-quoting que morde
 *
 * `$` não abre dollar-quote em qualquer posição: `$1`, `$2` são PARÂMETROS, e
 * `a$b` é continuação de identificador. A abertura válida é `$` + tag opcional
 * (letra ou `_`, seguido de letras/dígitos/`_`) + `$`. Uma tag que comece com
 * dígito não é tag. Tratar `$1` como abertura de dollar-quote engoliria o resto
 * do arquivo inteiro num "statement" só — falha silenciosa e catastrófica.
 */

/**
 * Casa uma abertura/fechamento de dollar-quote em `sql` na posição `i`.
 *
 * @param {string} sql
 * @param {number} i
 * @param {boolean} [podeAbrir] quando `true` (o caso de ABERTURA), exige que o
 *   caractere anterior não seja de identificador. Motivo: `foo$bar$` é um
 *   identificador não-delimitado VÁLIDO no Postgres, não uma dollar-quote — e
 *   lê-lo como abertura engoliria o resto do arquivo num "statement" só. No
 *   FECHAMENTO a checagem não se aplica: ali procuramos a tag literal.
 */
function matchDollarTag(sql, i, podeAbrir = false) {
  if (sql[i] !== "$") return null;
  // `a$b$` — o `$` colado num identificador não abre dollar-quote.
  if (podeAbrir && i > 0 && /[A-Za-z0-9_]/.test(sql[i - 1])) return null;
  let j = i + 1;
  // Tag opcional: [A-Za-z_][A-Za-z0-9_]*  — NUNCA começa com dígito (senão $1
  // viraria dollar-quote e não parâmetro).
  if (j < sql.length && /[A-Za-z_]/.test(sql[j])) {
    j += 1;
    while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
  }
  if (sql[j] !== "$") return null;
  return sql.slice(i, j + 1); // ex.: "$$" ou "$corpo$"
}

/**
 * `true` se a aspa em `i` abre uma ESCAPE STRING do Postgres (`E'...'`), onde a
 * barra invertida é escape — diferente da string comum, em que `\` é literal.
 *
 * O `E` tem que estar colado na aspa e não pode ser continuação de outro
 * identificador (`nome'...'` não é escape string).
 */
function ehEscapeString(sql, i) {
  if (i === 0) return false;
  if (sql[i - 1] !== "e" && sql[i - 1] !== "E") return false;
  return i - 1 === 0 || !/[A-Za-z0-9_]/.test(sql[i - 2]);
}

/**
 * Índice logo APÓS o fechamento da string/identificador que começa em `i`.
 *
 * @param {string} sql
 * @param {number} i posição da aspa de abertura (`'` ou `"`)
 * @param {boolean} aceitaBarra `true` só para `E'...'`, onde `\'` escapa a aspa
 *   e `\\` é barra literal. Em string comum e em identificador, `\` é caractere
 *   qualquer — tratá-lo como escape ali faria `'C:\'` parecer não-terminada.
 *
 * Aspa duplicada (`''` ou `""`) é escape nos dois modos.
 * String não terminada consome até o fim do texto: preferimos um statement
 * truncado (que o Postgres recusa alto) a cortar no meio de um literal.
 */
function fimDaString(sql, i, aceitaBarra) {
  const aspa = sql[i];
  let j = i + 1;
  while (j < sql.length) {
    const ch = sql[j];
    if (aceitaBarra && ch === "\\") {
      j += 2; // pula a barra e o caractere escapado (inclusive \\ e \')
      continue;
    }
    if (ch === aspa) {
      if (sql[j + 1] === aspa) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return sql.length;
}

/**
 * Divide `sql` em statements de topo.
 *
 * @param {string} sql conteúdo bruto do arquivo `.sql`
 * @returns {string[]} statements na ordem original, já sem o `;` final e sem
 *   entradas vazias (um `;;` ou o rabicho de comentário do fim do arquivo não
 *   viram statement).
 */
function splitSqlStatements(sql) {
  const statements = [];
  let inicio = 0;
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];

    // -- comentário de linha
    if (c === "-" && sql[i + 1] === "-") {
      const fim = sql.indexOf("\n", i);
      i = fim === -1 ? sql.length : fim + 1;
      continue;
    }

    // /* comentário de bloco */ — aninhável no Postgres, então conta nível.
    if (c === "/" && sql[i + 1] === "*") {
      let nivel = 1;
      i += 2;
      while (i < sql.length && nivel > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          nivel += 1;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          nivel -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }

    // 'string literal' — '' é aspa escapada, não fim de string.
    // E'...' (escape string) aceita TAMBÉM \' como escape, e \\ como barra
    // literal. Sem tratar isso, `E'a\';b'` seria cortado no `;` que ainda está
    // DENTRO da string.
    if (c === "'") {
      i = fimDaString(sql, i, ehEscapeString(sql, i));
      continue;
    }

    // "identificador" — "" é aspa escapada. Nunca aceita \ como escape.
    if (c === '"') {
      i = fimDaString(sql, i, false);
      continue;
    }

    // $$ ... $$ / $tag$ ... $tag$ — só fecha com a MESMA tag.
    const tag = matchDollarTag(sql, i, true);
    if (tag) {
      const fim = sql.indexOf(tag, i + tag.length);
      // Tag sem fechamento: o resto do arquivo pertence a este statement.
      // Não inventamos um fim — deixar o Postgres reclamar de SQL truncado é
      // melhor que fatiar no meio de um corpo plpgsql.
      i = fim === -1 ? sql.length : fim + tag.length;
      continue;
    }

    // ; de TOPO: aqui, e só aqui, o statement acaba.
    if (c === ";") {
      const bruto = sql.slice(inicio, i);
      if (temConteudoExecutavel(bruto)) statements.push(bruto.trim());
      inicio = i + 1;
      i += 1;
      continue;
    }

    i += 1;
  }

  // Rabicho depois do último `;` (comentário de rodapé, espaço em branco).
  const resto = sql.slice(inicio);
  if (temConteudoExecutavel(resto)) statements.push(resto.trim());

  return statements;
}

/**
 * `true` se o trecho tem algo além de espaço em branco e comentários.
 *
 * Sem isto, o comentário de rodapé do arquivo (depois do `COMMIT;`) viraria um
 * "statement" que o Postgres recusa com erro de sintaxe — falha inventada pelo
 * divisor, não pelo SQL.
 */
function temConteudoExecutavel(trecho) {
  const semComentarios = removerComentarios(trecho);
  return semComentarios.trim().length > 0;
}

/**
 * Remove comentários de linha e de bloco, preservando o que está DENTRO de
 * string, identificador ou dollar-quote (um `--` dentro de `'...'` é texto, não
 * comentário).
 *
 * Usado por `temConteudoExecutavel` e pela detecção de verbo do statement.
 */
function removerComentarios(sql) {
  let saida = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];

    if (c === "-" && sql[i + 1] === "-") {
      const fim = sql.indexOf("\n", i);
      i = fim === -1 ? sql.length : fim; // mantém o \n como separador
      continue;
    }

    if (c === "/" && sql[i + 1] === "*") {
      let nivel = 1;
      i += 2;
      while (i < sql.length && nivel > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          nivel += 1;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          nivel -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      saida += " ";
      continue;
    }

    if (c === "'") {
      const j = fimDaString(sql, i, ehEscapeString(sql, i));
      saida += sql.slice(i, j);
      i = j;
      continue;
    }

    if (c === '"') {
      const j = fimDaString(sql, i, false);
      saida += sql.slice(i, j);
      i = j;
      continue;
    }

    const tag = matchDollarTag(sql, i, true);
    if (tag) {
      const fim = sql.indexOf(tag, i + tag.length);
      const ate = fim === -1 ? sql.length : fim + tag.length;
      saida += sql.slice(i, ate);
      i = ate;
      continue;
    }

    saida += c;
    i += 1;
  }
  return saida;
}

/**
 * Primeira palavra executável do statement (maiúscula), ignorando comentários.
 *
 * Serve para o executor reconhecer `BEGIN`/`COMMIT`/`ROLLBACK` de CONTROLE DE
 * TRANSAÇÃO. Cuidado: `BEGIN` também abre bloco plpgsql — mas ali ele está
 * DENTRO de `$$`, e um statement que começa com `DO`/`CREATE FUNCTION` tem
 * `DO`/`CREATE` como primeira palavra, nunca `BEGIN`. A comparação é feita
 * sobre o statement INTEIRO (`BEGIN` sozinho), não sobre "contém BEGIN".
 */
function verboDoStatement(statement) {
  const limpo = removerComentarios(statement).trim();
  const m = limpo.match(/^([A-Za-z_]+)/);
  return m ? m[1].toUpperCase() : "";
}

/**
 * `true` se o statement é controle de transação.
 *
 * ⚠️ A lista é DELIBERADAMENTE ampla, e cobrir só `BEGIN`/`COMMIT`/`ROLLBACK`
 * secos seria um furo de segurança, não um detalhe de estilo. Quem consome isto
 * (`prepararStatements` no apply) usa a resposta para RECUSAR controle de
 * transação no miolo do arquivo. Um `COMMIT WORK;` esquecido no meio passaria
 * por um reconhecedor estreito, chegaria ao banco dentro da `$transaction` do
 * Prisma e encerraria a transação pelas costas dele — metade da migração
 * commitada, a outra metade não. Ou seja: exatamente o estado "tabelas sim,
 * triggers não" que a I2 proíbe, produzido pelo próprio guarda que deveria
 * impedi-lo.
 *
 * Cobre a gramática do Postgres:
 *   BEGIN | START TRANSACTION | COMMIT | END | ROLLBACK | ABORT
 *     (+ WORK | TRANSACTION, + AND [NO] CHAIN, + modos de isolamento)
 *   SAVEPOINT | RELEASE | ROLLBACK TO — que também mexem no escopo da transação.
 *
 * Falso positivo aqui é barato (recusa aplicar, e alguém olha); falso negativo
 * custa a invariante. Na dúvida, classifica como controle.
 */
function ehControleDeTransacao(statement) {
  const limpo = removerComentarios(statement).trim().replace(/;+$/, "").trim();
  return /^(BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE)\b/i.test(limpo);
}

module.exports = {
  splitSqlStatements,
  removerComentarios,
  verboDoStatement,
  ehControleDeTransacao,
};
