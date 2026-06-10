# RELATÓRIO — FASE 2: DINHEIRO BLINDADO

> Branch: `fix/fase2-dinheiro-blindado` (a partir de `fix/fase1-blindagem-acesso`) · Commit: `cc07c04` · **NÃO deployado.**
> tsc: 0 erros · Testes: **538 passando** (67 arquivos; +29 vs. base da F1: 16 paridade + 13 guard) · Detecção e migrations validadas em **Neon branch isolada** — produção NÃO foi tocada.

---

## 1. Resumo em linguagem simples

Blindamos a parte de dinheiro do sistema. O maior ganho: **uma fonte única de cálculo** (`sale-totals.ts`) agora soma subtotal/desconto/total com matemática decimal (sem o erro de centavo do float), e é usada igual no servidor, no PDV e nos orçamentos — antes cada lugar calculava do seu jeito, com pequenas divergências. Provamos que o novo cálculo dá **exatamente o mesmo resultado** do atual (0 centavos de diferença) numa bateria de casos reais.

Descobrimos que **o BUG-01 ("backend confia no preço do body") já estava resolvido** — o sistema já recalcula o total e já tem trava anti-fraude de preço por item (bloqueia vender abaixo do custo ou dar desconto acima do teto sem gerente). Provamos isso atacando o sistema com 4 fraudes — todas foram barradas, e a venda de lente (preço montado na hora) continua passando como deve.

No banco, criamos travas que impedem **parcela duplicada** e **conta recorrente gerada duas vezes**. O banco de teste estava limpo (zero sujeira), então as travas entram sem precisar limpar nada. Para o operador, nada muda no dia a dia — as travas só agem contra erro/fraude/duplicação.

---

## 2. Divergências de fórmula encontradas e como o helper resolveu

| Divergência (antes) | Resolução |
|---|---|
| `sale.schema.calculateSaleTotal` misturava cashback no `total` (`subtotal - discount - cashback`), enquanto o sale.service separa `total` de `totalAfterCashback` | Helper separa: `total` (sem cashback) e `totalAfterCashback`. Os helpers do schema delegam ao único; o campo `total` legado preserva semântica histórica documentada. |
| Arredondamento inconsistente: `toFixed` na exibição, `Math.round(×100)/100` no refund, tolerância 0,01 na validação | Helper arredonda a 2 casas com `ROUND_HALF_UP` (decimal.js) de forma central. |
| Desconto percentual vs fixo calculado em 2 lugares (quote.schema, frontend) | Centralizado: `discountPercent > 0` tem precedência sobre fixo, num só lugar. |
| Float puro acumulava erro (ex: 0.1+0.2 = 0.30000…04) | decimal.js elimina — `0.1+0.2 = 0.3` exato. |

**Prova de paridade:** `src/lib/sale-totals.test.ts` recria a fórmula float antiga e compara com o helper em **12 casos reais de ótica** (armação+lente, desconto fixo/percentual, cashback, qty múltipla, centavos quebrados, combinação completa, valores grandes/pequenos/zero). **Resultado: 0 centavos de diferença em todos.** Nenhuma divergência de arredondamento a reportar.

---

## 3. BUG-01 — reclassificado como COBERTO (com evidência)

O relatório de diagnóstico descreveu "backend confia em total/unitPrice do body". O mapeamento mostrou que:
- `createSaleSchema` **não aceita `total`** no body; o servidor recalcula (`sale.service`).
- Já existe `assertSalePricing` (`sale-price-guard.ts`, "Grupo D") que valida preço por item.

**Auditoria adversarial** (`src/lib/sale-price-guard.test.ts`, 13 testes) — veredito por ataque:

| Ataque | Esperado | Resultado |
|---|---|---|
| 1. `unitPrice: 1` num FRAME de R$399 | bloquear (abaixo do custo) | ✅ BLOQUEADO |
| 1b. idem, com override de gerente | passar | ✅ passa |
| 2. desconto disfarçado 50% no item | bloquear (> teto) | ✅ BLOQUEADO |
| 2b. desconto 10% (no teto) | passar | ✅ passa |
| 3. lente sem preço/custo, `unitPrice: 1` | logar e passar (preço montado na hora) | ✅ passa (não trava lente) |
| 4. combinação (preço reduzido + desconto, "um pouco em cada") | bloquear (validações se conversam) | ✅ BLOQUEADO |
| 4b. combinação dentro do teto | passar | ✅ passa |
| extra. desconto do total rateado | conta no teto | ✅ bloqueia |

**Nenhum furo.** O desconto efetivo é medido sobre o líquido final vs. preço de referência — não dá para fraudar "um pouco em cada". A política escalonada por tipo (rígido p/ FRAME, log p/ lente) já está implementada na prática. **BUG-01 não exigiu nova blindagem; ganhou a rede de testes que faltava.**

---

## 4. Resultado da detecção de dados e tratamento

Rodado em Neon branch isolada (`scripts/fase2/detect-dirty-data.ts`, SELECT-only):

| Achado | Resultado | Tratamento |
|---|---|---|
| Parcelas duplicadas (BUG-05) | **0** | Nenhum — migration entra direto |
| Estoque negativo (BUG-06) | **0** | Nenhum; valida descartar o CHECK (não há negativos a preservar) |
| Caixas OPEN duplicados (RACE-01) | **0** | Índice existente funciona |
| Pagáveis recorrentes duplicados (RACE-02) | **0** | Nenhum — migration entra direto |

**Caixa fantasma:** 5 caixas abertos há +2 dias (1 desde 25/02/2026, empresa "Oticas Matheus Teste"). Não bloqueia migration. Análise completa em `RELATORIO_CAIXA_FANTASMA.md` — fechar pela tela, ação do dono.

> ⚠️ A detecção é uma **foto** da produção no momento da criação da branch. O deploy real deve **re-detectar na mesma janela** (ver §10), não confiar nestes números.

---

## 5. Migrations criadas (validadas na Neon branch)

| Arquivo | O que faz | Auto-dedup? |
|---|---|---|
| `20260610120000_ar_installment_unique` | unique parcial `AccountReceivable(saleId, installmentNumber) WHERE saleId IS NOT NULL` | **NÃO** (parcela = cobrança real; falha de propósito se houver duplicata, forçando limpeza revisada antes) |
| `20260610120100_recurring_payable_unique` | unique parcial `AccountPayable(recurringExpenseId, date_trunc('month', dueDate)) WHERE recurringExpenseId IS NOT NULL` | **NÃO** (mesmo motivo) |

**Validação:** ambas aplicadas na branch de teste via `prisma db execute --url "$FASE2_TEST_DATABASE_URL" --file ...` (URL **explícita**, host `ep-small-sun` = teste). Aplicaram limpas; índices confirmados via `pg_indexes`. **Produção (`ep-blue-thunder`) NÃO foi tocada.**

⚠️ **Quase-incidente registrado:** uma tentativa de `prisma migrate status` apontando para a branch via variável de shell **foi sobrescrita pelo `.env` (produção)** — o Prisma 5.22 auto-carrega o `.env` e não tem `--env-file`. O comando era read-only (não aplicou nada; produção intocada), mas revela que **`migrate deploy` com este setup pegaria produção**. Por isso a validação usou `db execute --url` (URL explícita). Ver §10 para o deploy seguro.

RACE-01: nenhuma migration nova — confirmado que `CashShift_branchId_open_unique` já existe (migration `20260526160000`) e está aplicado na branch. BUG-06: migration de CHECK **descartada** (quebraria override de gerente).

---

## 6. Arquivos criados/modificados

**Criados:**
- `src/lib/sale-totals.ts` — helper único (decimal.js)
- `src/lib/sale-totals.test.ts` — 16 testes (paridade + comportamento)
- `src/lib/sale-price-guard.test.ts` — 13 testes (auditoria adversarial do guard)
- `prisma/migrations/20260610120000_ar_installment_unique/migration.sql`
- `prisma/migrations/20260610120100_recurring_payable_unique/migration.sql`
- `scripts/fase2/detect-dirty-data.ts` — detecção SELECT-only (exige `FASE2_TEST_DATABASE_URL`)
- `docs/audit/fixes/RELATORIO_CAIXA_FANTASMA.md`

**Modificados:**
- `src/services/sale.service.ts` — usa `calculateTotals` + `itemLineTotal`
- `src/lib/validations/quote.schema.ts` — helpers delegam ao único
- `src/lib/validations/sale.schema.ts` — helpers delegam ao único
- `src/app/(dashboard)/dashboard/pdv/page.tsx` — subtotal/total via helper (mantém % por item)
- `src/app/(dashboard)/dashboard/orcamentos/novo/page.tsx` + `[id]/editar/page.tsx` — via helper
- `src/app/api/recurring-expenses/generate/route.ts` — P2002 idempotente (RACE-02)

---

## 7. Testes

- **Suíte completa: 538 passando** (era 522 na F1; +16 paridade/comportamento do helper, +13 auditoria do guard; −0 quebrados). tsc 0 erros.
- **Paridade (16):** 12 casos reais com 0 centavos de diferença + 4 de comportamento (precedência percentual, cashback separado, float).
- **Guard adversarial (13):** 4 ataques + variações, todos com veredito correto.
- **Funcional das migrations:** índices criados e confirmados na branch de teste.

---

## 8. Erros/imprevistos e desvios do plano aprovado

1. **BUG-01 reclassificado** (aprovado pelo dono): de "implementar blindagem" para "provar cobertura existente + adicionar testes". O guard já existia.
2. **RACE-01 era falso positivo** (índice já existe) — confirmado, sem trabalho.
3. **BUG-06 (CHECK) descartado** (aprovado): quebraria override de gerente; reforço fica na app.
4. **Quase-incidente do `migrate status`** (§5): Prisma sobrepôs a URL de teste com o `.env` de produção. Read-only, sem dano. Mudou a estratégia de validação para `db execute --url`.
5. **Validação por `db execute --url` em vez de `migrate deploy`** na branch: decisão de segurança dado o risco acima. O SQL é idêntico ao que `migrate deploy` aplicaria; o registro em `_prisma_migrations` ocorre no deploy real de produção (onde o `.env` correto é o de prod).
6. **Senha do banco:** exposição no histórico local **aceita pelo dono em 10/06/2026** (sem rotação). Daqui pra frente, credenciais sempre mascaradas em output.

---

## 9. Validação manual para o dono (na tela)

1. **PDV:** monte uma venda (armação + lente), aplique desconto em R$ e em %, com e sem cashback → o total na tela deve bater com o atual, ao centavo.
2. **Orçamento:** crie e edite um orçamento com desconto percentual → subtotal/total corretos.
3. **Anti-fraude (se quiser testar):** como vendedor, tente uma venda com desconto acima do seu teto → deve pedir autorização de gerente. Venda de lente com preço digitado na hora → deve passar normalmente.
4. **Conta recorrente:** gere as contas do mês duas vezes seguidas → a segunda deve dizer "já existem", sem duplicar.

---

## 10. Checklist de deploy (Fase 2 — ORDENADO COM A FASE 1)

> A Fase 2 nasce da Fase 1 (ainda não deployada). Deploya as duas juntas, F1 antes (ou o merge contém ambas).

1. [ ] **Janela de baixo tráfego** (domingo de madrugada).
2. [ ] **Backup do Neon (produção).**
3. [ ] Merge `fix/fase1-blindagem-acesso` → depois `fix/fase2-dinheiro-blindado` (ou a F2 que já contém a F1) na branch de deploy.
4. [ ] **RE-DETECTAR dados sujos em produção NA MESMA JANELA** (não confiar nos números de hoje — a detecção foi uma foto): rodar `scripts/fase2/detect-dirty-data.ts` apontando para **produção** (read-only) imediatamente antes das migrations. Se aparecer **parcela ou pagável duplicado** que não existia: **PARAR** e limpar caso-a-caso (manter o que tem pagamento/baixa) **antes** de aplicar as migrations. Senão o `CREATE UNIQUE INDEX` falha.
5. [ ] **`prisma migrate deploy`** (em produção, o `.env` correto é o de prod — aqui é o uso certo). Aplica F1 (nenhuma migration de schema) + F2 (os 2 índices). ⚠️ NUNCA tentar apontar `migrate deploy` para outro banco com o `.env` de prod presente.
6. [ ] **`vercel deploy --prod`** (deploy é MANUAL; push não dispara).
7. [ ] **Seed de permissões da Fase 1:** `POST /api/permissions/seed` (ADMIN) — senão GERENTE não devolve venda. (item crítico herdado da F1)
8. [ ] **Smoke:** criar venda no PDV (total bate), gerar conta recorrente 2× (não duplica), tentar abrir 2º caixa na mesma filial (bloqueia).
9. [ ] **Se a migration falhar** (ex.: duplicata surgida entre a detecção e o deploy): o `migrate deploy` aborta naquela migration; o índice não é criado; **rollback = remover a migration pendente do banco não é necessário** (ela não chega a aplicar). Limpar a duplicata e re-rodar `migrate deploy`. O código novo (helper, guard, P2002 idempotente) é retrocompatível e não depende do índice para funcionar — só a garantia de banco fica adiada.
10. [ ] **Pós-fase:** deletar a Neon branch de teste (`ep-small-sun-...`) — contém dados reais (LGPD) e consome cota. Remover `.env.fase2.local` local.
