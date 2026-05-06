# Bug #1 — Script de migração

## Arquivo
`scripts/fix-bug1-orphan-quotes.ts`

## O que faz

Para cada `Sale` com `convertedFromQuoteId NOT NULL` que não tem os side-effects esperados, recria:

| Faltando | Recria | Como |
|---|---|---|
| `AccountReceivable` para `STORE_CREDIT` | sim | N parcelas com `dueDate` estimado (hoje +30/+60/+90...) — **descrição marca `[MIGRAÇÃO]`** e pede verificação manual com cliente |
| `AccountReceivable` para `BALANCE_DUE` | sim | 1 parcela com `dueDate` = hoje +30 |
| `CardReceivable` para `CREDIT_CARD` | sim | N parcelas com `expectedDate` = hoje +30*i |
| `FinanceEntry` (DRE) | sim | Chama `generateSaleEntries` (idempotente via `@@unique` do schema) |

## O que NÃO faz (decisões)

| Item | Por quê |
|---|---|
| Cashback retroativo | Decisão Matheus: cliente comprou há semanas, recebe cashback agora = confuso |
| Recriar `StockMovement` | Risco de duplicar histórico — auditoria fica parcial; documentado como dívida técnica |
| Atualizar `BranchStock` retroativamente | É problema do Bug #2 — script dedicado |
| Apagar `CashMovement` excedente | Operação destrutiva em dados financeiros — auditável demais |
| Corrigir `SaleItem.costPrice = 0` retroativo | Decisão Matheus (2026-05-06) — ver §Dívida técnica abaixo |

## Dívida técnica aceita: `SaleItem.costPrice = 0` em vendas convertidas antigas

Vendas convertidas de orçamento ANTES desta correção têm `SaleItem.costPrice = 0`
(o código de `quote.convertToSale` antigo não buscava `Product.costPrice` ao criar
o SaleItem).

**Decisão (Matheus, 2026-05-06):** NÃO corrigir retroativamente.

**Justificativa:**
1. `Product.costPrice` ATUAL pode ser diferente do custo histórico no momento da
   venda original. Aplicar o valor atual nas vendas antigas distorce os
   relatórios ainda mais.
2. A solução correta exigiria buscar o histórico via `InventoryLot` (lote ativo
   na data da venda + custo desse lote). É complexo, com risco de erro, e fora
   do escopo desta migração.
3. A partir desta correção, NOVAS conversões registram `costPrice` corretamente.

**Impacto operacional:** relatórios de margem para vendas convertidas desse
período mostram **lucro inflado** (lucro = preço de venda, sem deduzir o custo).
Atendentes e gestores devem ser orientados a interpretar com cautela.

**Como identificar essas vendas:**
```sql
SELECT s.id, s."convertedFromQuoteId", s."createdAt", COUNT(si.id) as items_zero_cost
FROM "Sale" s
JOIN "SaleItem" si ON si."saleId" = s.id
WHERE s."convertedFromQuoteId" IS NOT NULL
  AND si."costPrice" = 0
  AND si."productId" IS NOT NULL
GROUP BY s.id, s."convertedFromQuoteId", s."createdAt"
ORDER BY s."createdAt" DESC;
```

**O script `fix-bug1-orphan-quotes.ts` imprime aviso no log final** com a
contagem de vendas/itens nessa situação. Use o aviso para dimensionar quanto
do relatório histórico de margem está distorcido.

## Como rodar

### 1. Pré-requisito
`.env.diagnostic` configurado com `DATABASE_URL` correto.

### 2. Sempre PRIMEIRO em dry-run
```bash
npx tsx scripts/fix-bug1-orphan-quotes.ts
```

Saída esperada:
- Banner com URL mascarada e modo "DRY-RUN"
- Lista de Sales que serão modificadas
- Para cada uma: ações que seriam tomadas (sem fazer nada)
- Resumo numérico

### 3. (Opcional) Filtrar por empresa primeiro

```bash
# Roda só pra uma empresa
npx tsx scripts/fix-bug1-orphan-quotes.ts --company-id <cuid>

# Roda só pra um período
npx tsx scripts/fix-bug1-orphan-quotes.ts --start-date 2026-01-01 --end-date 2026-04-30

# Roda só os 10 primeiros (para teste piloto)
npx tsx scripts/fix-bug1-orphan-quotes.ts --limit 10
```

### 4. Aplicar de verdade
```bash
# 1) Em horário de baixo movimento (ex: 22h-06h)
# 2) Recomendado: começa por uma empresa só (--company-id)
# 3) Recomendado: limita N por execução (--limit 50)

npx tsx scripts/fix-bug1-orphan-quotes.ts --apply --i-know-what-im-doing --company-id <cuid> --limit 50
```

O script vai:
1. Imprimir banner com URL mascarada e modo APPLY
2. Pedir para digitar `CONFIRMO` no terminal
3. Processar Sales uma a uma, **cada uma em sua própria transação**
4. Logar cada ação em `scripts/logs/fix-bug1-orphan-quotes-<timestamp>.log`
5. Imprimir resumo final

## Idempotência

Se o script for rodado 2× contra a mesma Sale, **não duplica**:
- Antes de criar AR para STORE_CREDIT: verifica se `Sale.accountsReceivable.length > 0`
- Antes de criar AR para BALANCE_DUE: verifica se já existe AR com `installmentNumber: 1`
- Antes de criar CR para CREDIT_CARD: verifica se há CR com `salePaymentId` correspondente
- Antes de gerar FinanceEntry: verifica se há entries com `[companyId, sourceType=Sale, sourceId]` (proteção do schema)

## Estimativa de tempo

Cada Sale processada em ~1-3 transações (uma por método de pagamento + uma para finance entries).

- Latência típica de cada `$transaction` em Neon: 100-300ms
- 50 Sales: ~30s a 2min
- 500 Sales: ~5-15min
- 5.000 Sales: ~50min a 2h

**Recomendação:** rodar com `--limit 100` em iterações, validando o log entre cada execução.

## Rollback (se algo der errado)

⚠️ **NÃO há rollback automático.**

Estratégias de rollback manual:

### Cenário A: parou no meio (alguns AR criados, outros não)
Não tem problema. Roda de novo (idempotente).

### Cenário B: criou AR errados (datas estimadas) e cliente reclama
- AR criadas pelo script têm a tag `[MIGRAÇÃO]` na descrição
- Para ajustar datas: editar manualmente em `/dashboard/financeiro/contas`
- Para anular completamente: `UPDATE "AccountReceivable" SET status='CANCELED' WHERE description LIKE '[MIGRAÇÃO]%' AND companyId='X'`

### Cenário C: gerou FinanceEntry duplicado (não deve acontecer pelo unique)
- `@@unique([companyId, sourceType, sourceId, type, side])` no schema impede.
- Se acontecer, é bug do `generateSaleEntries` — **investigar antes de continuar.**

## Checklist antes de aplicar

- [ ] Diagnóstico (`diagnose-bug1-orphan-quotes.ts`) rodado e revisado
- [ ] Backup do banco recente (Neon point-in-time recovery disponível?)
- [ ] Horário de baixo movimento (sem operadores ativos no PDV)
- [ ] `.env.diagnostic` aponta para PROD (confirmou no banner)
- [ ] Rodou primeiro com `--limit 1` em uma empresa de teste/menor volume
- [ ] Validou que as ARs criadas fazem sentido (descrição clara)
- [ ] Avisou os atendentes que vão aparecer parcelas marcadas com `[MIGRAÇÃO]`
