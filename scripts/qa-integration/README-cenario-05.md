# Cenário 5 — Funil Inteligente Fatia 1 (auto-Ganho E2E)

Teste de integração **end-to-end** (banco real de TESTE) do elo Lead↔Sale + auto-Ganho
introduzido no commit `762254f`. Prova o que a suíte unitária só cobre com `tx` mockado.

## Por que existe
A feature de auto-Ganho **nunca foi exercida em produção** (0 vendas pós-deploy na auditoria
de 2026-06-30). Este script exercita o fluxo real: cria lead aberto → cria venda → confere
que `Sale.leadId` gravou e que o card foi p/ o estágio Ganho — tudo via `saleService.create`
de verdade, não mock.

## Segurança (NUNCA roda contra prod)
`_env-shim.ts`/`_prisma.ts` **ABORTAM** se a `TEST_DATABASE_URL` contiver o host de produção
(`ep-blue-thunder`) ou não for Neon. É impossível este script tocar o banco do dono.

## Pré-requisitos
1. Um **branch de teste do Neon** (cópia isolada de prod, mesmas migrações aplicadas).
2. Um arquivo `.env.test.local` na raiz do projeto (gitignored) com:
   ```
   TEST_DATABASE_URL="postgresql://...<branch de TESTE, NÃO prod>...neon.tech/...?sslmode=require"
   TEST_DIRECT_URL="postgresql://...<branch de TESTE>...neon.tech/...?sslmode=require"
   ```
3. Estado base criado (company/branch/customer/products):
   ```
   npx tsx scripts/qa-integration/01-setup.ts
   npx tsx scripts/qa-integration/02-customer.ts
   ```

## Rodar
```
npx tsx scripts/qa-integration/05-funil-auto-ganho.ts
```

## O que valida
- **5.1** lead aberto + venda → `Sale.leadId` gravado + lead movido p/ estágio `isWon`.
- **5.2** multi-tenant: `Sale.companyId == Lead.companyId == empresa de teste`.
- **5.3** re-compra (lead já terminal) → só vincula, **não** re-move (idempotente).
- **5.4** venda **sem** customerId (walk-in anônima) → `Sale.leadId` null.
- **5.5** **estorno** da venda → verifica se o auto-Ganho é revertido.
  ⚠️ Achado da auditoria: **HOJE não reverte** — o script registra isso como BUG conhecido
  (severidade MÉDIO) em `.state.json`, documentando o comportamento real em vez de mascará-lo.

Resultados (PASS/FAIL) e bugs são gravados em `scripts/qa-integration/.state.json`.
