/**
 * Testes do divisor de statements SQL.
 *
 * Este é o ÚNICO ponto onde a correção do divisor pode ser provada sem banco: é
 * lógica pura sobre texto. E precisa ser provada, porque o modo de falha dele é
 * silencioso e caro — um `$$` estilhaçado vira "tabelas criadas, triggers não",
 * que é a violação de I2 que a migração 20260729180000 existe para impedir.
 *
 * O caso central não é sintético: é o `.sql` REAL da migração, lido do disco.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Módulo CJS de propósito: quem o consome de verdade é um script `.cjs`
// (`scripts/apply-billing-obligations.cjs`), que não pode importar TS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  splitSqlStatements,
  verboDoStatement,
  ehControleDeTransacao,
  removerComentarios,
} = require("./sql-statements.cjs") as {
  splitSqlStatements: (sql: string) => string[];
  verboDoStatement: (statement: string) => string;
  ehControleDeTransacao: (statement: string) => boolean;
  removerComentarios: (sql: string) => string;
};

const MIGRATION_SQL = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260729180000_billing_obligations",
  "migration.sql",
);

describe("splitSqlStatements — casos de sintaxe", () => {
  it("divide statements simples pelo ; de topo", () => {
    const st = splitSqlStatements("SELECT 1; SELECT 2; SELECT 3;");
    expect(st).toEqual(["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  it("NÃO divide dentro de $$ ... $$", () => {
    const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1) THEN
    CREATE TYPE "X" AS ENUM ('a', 'b');
  END IF;
END$$;
SELECT 1;`;
    const st = splitSqlStatements(sql);
    expect(st).toHaveLength(2);
    // O corpo inteiro ficou num statement só — nenhum "END IF" solto.
    expect(st[0]).toContain("END IF;");
    expect(st[0]).toContain("CREATE TYPE");
    expect(st[1]).toBe("SELECT 1");
  });

  it("respeita dollar-quote COM TAG e só fecha na tag igual", () => {
    // O $b$ interno NÃO pode fechar o $corpo$ externo.
    const sql = `CREATE FUNCTION f() RETURNS void AS $corpo$
BEGIN
  RAISE NOTICE $b$ tem ; e $$ aqui dentro $b$;
  RETURN;
END;
$corpo$ LANGUAGE plpgsql;
SELECT 1;`;
    const st = splitSqlStatements(sql);
    expect(st).toHaveLength(2);
    expect(st[0]).toContain("$corpo$ LANGUAGE plpgsql");
    expect(st[1]).toBe("SELECT 1");
  });

  it("NÃO trata $1 como abertura de dollar-quote (é parâmetro)", () => {
    // Se $1 abrisse dollar-quote, o resto do arquivo viraria um statement só.
    const st = splitSqlStatements(`INSERT INTO t VALUES ($1, $2); SELECT 1;`);
    expect(st).toEqual(["INSERT INTO t VALUES ($1, $2)", "SELECT 1"]);
  });

  it("NÃO divide dentro de string literal, e entende '' escapado", () => {
    const st = splitSqlStatements(
      `INSERT INTO t VALUES ('a;b', 'aspa '' dentro; ainda'); SELECT 1;`,
    );
    expect(st).toHaveLength(2);
    expect(st[0]).toContain("'a;b'");
    expect(st[1]).toBe("SELECT 1");
  });

  it('NÃO divide dentro de identificador "..." e entende "" escapado', () => {
    const st = splitSqlStatements(`CREATE TABLE "tem;ponto" ("col""ok" INT); SELECT 1;`);
    expect(st).toHaveLength(2);
    expect(st[0]).toContain('"tem;ponto"');
    expect(st[1]).toBe("SELECT 1");
  });

  // Os três casos abaixo vieram de uma revisão adversarial do divisor. Os três
  // eram defeitos REAIS na primeira versão: o `;` era tratado como fim de
  // statement estando dentro de um literal ou identificador válido.
  it("entende \\' como escape dentro de E'...' (escape string)", () => {
    const st = splitSqlStatements(`SELECT E'a\\';b'; SELECT 2;`);
    expect(st).toEqual([`SELECT E'a\\';b'`, "SELECT 2"]);
  });

  it("em string COMUM a barra é literal, não escape", () => {
    // `'C:\'` é uma string terminada — se tratássemos \ como escape aqui, ela
    // pareceria não-terminada e engoliria o resto do arquivo.
    const st = splitSqlStatements(`SELECT 'C:\\'; SELECT 2;`);
    expect(st).toEqual([`SELECT 'C:\\'`, "SELECT 2"]);
  });

  it("NÃO trata $tag$ colado a identificador como dollar-quote", () => {
    // `foo$bar$` é identificador não-delimitado válido no Postgres.
    const st = splitSqlStatements(`SELECT foo$bar$; SELECT 2;`);
    expect(st).toEqual(["SELECT foo$bar$", "SELECT 2"]);
  });

  it("ignora ; dentro de comentário de linha", () => {
    const st = splitSqlStatements(`SELECT 1 -- comentario com ; aqui\n; SELECT 2;`);
    expect(st).toHaveLength(2);
    expect(st[1]).toBe("SELECT 2");
  });

  it("ignora ; dentro de comentário de bloco, inclusive ANINHADO", () => {
    const st = splitSqlStatements(`SELECT 1 /* a ; /* aninhado ; */ ainda ; */ ; SELECT 2;`);
    expect(st).toHaveLength(2);
    expect(st[1]).toBe("SELECT 2");
  });

  it("NÃO produz statement vazio a partir de comentário de rodapé ou ;;", () => {
    const st = splitSqlStatements(`SELECT 1;;\n-- so um comentario no fim\n\n`);
    expect(st).toEqual(["SELECT 1"]);
  });

  it("preserva o texto CRU do statement (não reescreve SQL)", () => {
    const sql = `-- cabecalho\nSELECT 1;`;
    expect(splitSqlStatements(sql)[0]).toBe("-- cabecalho\nSELECT 1");
  });

  it("dollar-quote sem fechamento não fatia o resto do arquivo", () => {
    // Preferimos um statement truncado (o Postgres reclama alto) a fatiar no
    // meio de um corpo plpgsql (que falharia de forma confusa).
    const st = splitSqlStatements(`CREATE FUNCTION f() AS $$ BEGIN; RETURN; `);
    expect(st).toHaveLength(1);
  });
});

describe("ehControleDeTransacao", () => {
  it("reconhece BEGIN/COMMIT/ROLLBACK isolados", () => {
    expect(ehControleDeTransacao("BEGIN")).toBe(true);
    expect(ehControleDeTransacao("  commit  ")).toBe(true);
    expect(ehControleDeTransacao("ROLLBACK;")).toBe(true);
    expect(ehControleDeTransacao("START TRANSACTION")).toBe(true);
  });

  // Achado de revisão adversarial: reconhecer só as formas secas era um FURO.
  // Um `COMMIT WORK;` no miolo passaria pelo preflight, chegaria ao banco
  // dentro da $transaction do Prisma e encerraria a transação pelas costas
  // dele — metade da migração commitada. É o estado "tabelas sim, triggers
  // não" produzido pelo próprio guarda que deveria impedi-lo.
  it.each([
    "COMMIT WORK",
    "END WORK",
    "ROLLBACK WORK",
    "COMMIT AND CHAIN",
    "ROLLBACK AND NO CHAIN",
    "COMMIT TRANSACTION",
    "ABORT",
    "SAVEPOINT s1",
    "RELEASE SAVEPOINT s1",
    "ROLLBACK TO SAVEPOINT s1",
    "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE",
    "BEGIN WORK",
  ])("reconhece a variante de controle de transação %s", (sql) => {
    expect(ehControleDeTransacao(sql)).toBe(true);
  });

  it.each([
    "CREATE TABLE t ()",
    "ALTER TABLE t ADD COLUMN c INT",
    "DROP TRIGGER IF EXISTS x ON y",
    "CREATE TRIGGER x AFTER INSERT ON y FOR EACH ROW EXECUTE FUNCTION f()",
  ])("NÃO classifica o DDL %s como controle de transação", (sql) => {
    expect(ehControleDeTransacao(sql)).toBe(false);
  });

  it("NÃO confunde o BEGIN de um corpo plpgsql com BEGIN de transação", () => {
    const bloco = `DO $$\nBEGIN\n  PERFORM 1;\nEND$$`;
    expect(ehControleDeTransacao(bloco)).toBe(false);
    expect(verboDoStatement(bloco)).toBe("DO");
  });

  it("NÃO confunde CREATE FUNCTION ... BEGIN ... com controle de transação", () => {
    const fn = `CREATE OR REPLACE FUNCTION f() RETURNS void AS $$\nBEGIN\n RETURN;\nEND;\n$$ LANGUAGE plpgsql`;
    expect(ehControleDeTransacao(fn)).toBe(false);
    expect(verboDoStatement(fn)).toBe("CREATE");
  });

  it("enxerga o verbo mesmo com comentário antes", () => {
    expect(verboDoStatement("-- nota\n/* outra */\nCREATE TABLE t ()")).toBe("CREATE");
  });
});

describe("removerComentarios", () => {
  it("preserva -- que está DENTRO de string literal", () => {
    expect(removerComentarios(`SELECT 'nao -- e comentario'`)).toContain("nao -- e comentario");
  });
});

describe("o .sql REAL da migração 20260729180000_billing_obligations", () => {
  const sql = fs.readFileSync(MIGRATION_SQL, "utf8");
  const statements = splitSqlStatements(sql);

  it("produz exatamente 35 statements (BEGIN + 33 DDL + COMMIT)", () => {
    // Número fixado de propósito: se alguém acrescentar ou remover statement no
    // `.sql`, este teste cai e obriga a revisar o inventário do apply, que
    // enumera objeto por objeto. Contagem que "se ajusta sozinha" não protege.
    expect(statements).toHaveLength(35);
    expect(ehControleDeTransacao(statements[0])).toBe(true);
    expect(verboDoStatement(statements[0])).toBe("BEGIN");
    expect(ehControleDeTransacao(statements[statements.length - 1])).toBe(true);
    expect(verboDoStatement(statements[statements.length - 1])).toBe("COMMIT");
  });

  it("NÃO estilhaça os corpos plpgsql — nenhum fragmento solto", () => {
    // Estes são exatamente os fragmentos que `split(";")` produzia (59 pedaços,
    // medidos). Se algum aparecer como statement inteiro, o divisor quebrou.
    const fragmentosProibidos =
      /^(END\s*IF|RETURN\s+(NEW|OLD)|PERFORM\b|DECLARE\b|IF\s+NOT\s+EXISTS\b|END\$\$)/i;
    const soltos = statements.filter((s) => fragmentosProibidos.test(removerComentarios(s).trim()));
    expect(soltos).toEqual([]);
  });

  it("mantém INTEIROS os 4 blocos com $$ (2 DO + 2 CREATE FUNCTION)", () => {
    const comDollar = statements.filter((s) => removerComentarios(s).includes("$$"));
    expect(comDollar).toHaveLength(4);
    for (const st of comDollar) {
      // Todo $$ aberto tem que estar fechado dentro do MESMO statement.
      //
      // A contagem roda sobre o texto SEM COMENTÁRIO: o cabeçalho da §1 do
      // `.sql` menciona "Padrao DO $$ do projeto" em prosa, e contar no texto
      // cru daria um número ímpar por causa de um `$$` que é literatura, não
      // código. Contar no cru foi o primeiro jeito que escrevi este teste, e
      // ele acusou o divisor por um defeito que era do teste.
      const ocorrencias = removerComentarios(st).split("$$").length - 1;
      expect(ocorrencias % 2).toBe(0);
    }

    // Os dois DO carregam o bloco completo, do BEGIN ao END$$.
    const blocosDo = comDollar.filter((s) => verboDoStatement(s) === "DO");
    expect(blocosDo).toHaveLength(2);
    for (const bloco of blocosDo) {
      expect(bloco).toMatch(/BEGIN[\s\S]*END\$\$$/);
      expect(bloco).toContain("END IF;");
    }

    // As duas funções carregam corpo e o LANGUAGE plpgsql final.
    const funcoes = comDollar.filter((s) => /CREATE OR REPLACE FUNCTION/i.test(s));
    expect(funcoes).toHaveLength(2);
    for (const fn of funcoes) {
      expect(fn).toMatch(/LANGUAGE plpgsql$/);
      expect(fn).toContain("PERFORM");
    }
    expect(funcoes[0]).toContain("bump_entitlement_revision_by_subscription");
    expect(funcoes[1]).toContain("trg_billing_entitlement_revision");
  });

  it("os 6 triggers de I2 sobrevivem como CREATE TRIGGER inteiros", () => {
    const triggers = statements.filter((s) => /^CREATE TRIGGER/im.test(removerComentarios(s).trim()));
    expect(triggers).toHaveLength(6);
    // Os dois de UPDATE carregam o WHEN inteiro (que tem parênteses e OR).
    const comWhen = triggers.filter((s) => /\bWHEN\s*\(/i.test(s));
    expect(comWhen).toHaveLength(2);
    for (const t of comWhen) {
      expect(t).toMatch(/EXECUTE FUNCTION "trg_billing_entitlement_revision"\(\)$/);
    }
  });

  it("BEGIN e COMMIT são os ÚNICOS statements de controle de transação", () => {
    const ctrl = statements.filter((s) => ehControleDeTransacao(s));
    expect(ctrl).toHaveLength(2);
  });

  it("todo statement não-controle tem verbo DDL executável", () => {
    const verbosAceitos = new Set(["CREATE", "ALTER", "DROP", "DO", "COMMENT", "INSERT"]);
    for (const st of statements) {
      if (ehControleDeTransacao(st)) continue;
      expect(verbosAceitos.has(verboDoStatement(st))).toBe(true);
    }
  });

  it("nenhum statement sai vazio ou só com comentário", () => {
    for (const st of statements) {
      expect(removerComentarios(st).trim().length).toBeGreaterThan(0);
    }
  });
});
