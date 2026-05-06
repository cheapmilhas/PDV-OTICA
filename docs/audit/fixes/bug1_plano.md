# Bug #1 — Plano de Correção

## Estratégia escolhida: **Opção A — Helpers compartilhados**

### Por quê não Opção B (replicar)
Replicar lógica em `quote.convertToSale` causaria divergência futura (qualquer fix em `sale.create` precisaria ser duplicado). Já temos divergência hoje — a causa raiz do bug.

### Por quê não refatoração total de `sale.create`
`sale.service.ts` é código de produção testado em 1.205 linhas. Mexer em tudo aumenta o risco de quebrar o caminho feliz. A estratégia é **conservadora**: extrair só o que é necessário para `quote.convertToSale` reusar, e fazer com que `sale.create` chame os mesmos helpers (refatoração mínima, comportamento idêntico).

---

## Helpers a criar

### 1. `services/sale-side-effects.service.ts` (novo arquivo)

Centraliza side-effects que aparecem em `sale.create` E `quote.convertToSale`. Cada função recebe um `tx` (Prisma TransactionClient) e parâmetros tipados.

#### Funções

```ts
// Dentro da $transaction
applyStockDebitForSale(tx, params): Promise<void>
  // params: { sale, items, branchId, companyId, userId }
  // Para cada item: atomicStockDebit + StockMovement (type: SALE)

applyPaymentSideEffects(tx, params): Promise<void>
  // params: { sale, payments, branchId, companyId, userId, openShift, companySettings, customerId }
  // Para cada payment:
  //   - Cria SalePayment
  //   - Auto-fee de cartão (CREDIT/DEBIT)
  //   - CashMovement APENAS para METHODS_IN_CASH (filtra)
  //   - AccountReceivable (STORE_CREDIT × N parcelas)
  //   - AccountReceivable (BALANCE_DUE × 1 parcela em +30 dias)
  //   - CardReceivable (CREDIT_CARD × N parcelas)
  // NÃO debita cashback usado (responsabilidade do caller — diferente em sale.create vs quote.convert)
  // Retorna lista de SalePayments criados

applyCashbackUsage(tx, params): Promise<void>
  // params: { sale, customerId, branchId, cashbackUsed, userId }
  // Decrementa CustomerCashback + cria CashbackMovement DEBIT

applyCommission(tx, params): Promise<void>
  // params: { sale, sellerUserId, companyId }
  // Calcula percentual + cria Commission

applyFinanceEntries(tx, params): Promise<void>
  // params: { saleId, companyId }
  // Chama generateSaleEntries com try/catch — MAS LOGA o erro estruturadamente
  // (em vez de silently swallow)

// Fora da $transaction (depois do commit)
applyCashbackEarned(params): Promise<void>
  // params: { saleId, customerId, total, branchId, companyId }
  // Chama cashbackService.earnCashback. Falha não bloqueia.

applyProductCampaigns(params): Promise<void>
  // Chama processaSaleForCampaigns

applyPostSaleReminder(params): Promise<void>
  // params: { saleId, customerId, companyId, total }
  // Cria CustomerReminder POST_SALE_30_DAYS se não existir
```

### 2. Refatoração de `sale.service.ts:create`

Substituir os blocos correspondentes por chamadas ao helper. Comportamento idêntico, mas elimina a duplicação.

### 3. Refatoração de `quote.service.ts:convertToSale`

Substituir o conteúdo da `$transaction` para chamar os mesmos helpers.

---

## Validações a adicionar em `convertToSale`

| Validação | Adicionar onde |
|---|---|
| `validateBranchOwnership(branchId, companyId)` | antes da transação |
| `validateStoreCredit(payment, customerId)` para STORE_CREDIT | antes da transação |
| `validateCreditLimit(customerId, amount, companyId)` | antes da transação (mesmo sendo stub hoje, será corrigido no Bug #3) |
| `BALANCE_DUE` exige customer | antes da transação |
| Buscar `CompanySettings` para juros/multa default | antes da transação (passa pro helper) |
| `costPrice` por item (busca `Product.costPrice`) | dentro da transação, no helper de stock |

---

## Comportamentos divergentes a CORRIGIR

### CashMovement criado para todos os métodos
**Atual** (`quote.convertToSale:826`): cria CashMovement para CREDIT_CARD, STORE_CREDIT, BALANCE_DUE — **errado**.

**Corrigir para:** filtrar `METHODS_IN_CASH` igual ao `sale.create:490`.

Justificativa: CREDIT_CARD entra como CardReceivable; STORE_CREDIT/BALANCE_DUE entram como AccountReceivable. Não há entrada física de dinheiro no caixa nesses casos.

### completedAt
**Atual** (`quote.convertToSale:746`): `status: COMPLETED` mas sem `completedAt`.

**Corrigir para:** setar `completedAt: new Date()` igual `sale.create:386`.

### costPrice em SaleItem
**Atual** (`quote.convertToSale:760`): não passa `costPrice`.

**Corrigir para:** buscar `Product.costPrice` no momento da conversão e gravar (helper).

---

## Comportamentos NÃO replicar (decisão)

### Auto-abertura de caixa
`sale.create:342-363` auto-abre caixa se não houver. `quote.convertToSale:697` rejeita explicitamente.

**Decisão:** manter o comportamento atual da conversão (rejeitar) — operador deve abrir o caixa explicitamente antes de converter um orçamento. Mais previsível.

### `cashbackUsed` em conversão
`sale.create` aceita usar cashback no momento da venda. `convertToSale` não tem esse parâmetro hoje.

**Decisão:** NÃO adicionar agora (escopo do bug 1 é restaurar paridade dos side-effects existentes). Funcionalidade de "usar cashback ao converter orçamento" fica como follow-up.

---

## Comportamentos preservados

- `Quote.convertedToSaleId @unique` — proteção contra dupla conversão (DB constraint)
- Validação `quote.status === "APPROVED"`
- Validação `quote.validUntil >= today`
- `Sale.convertedFromQuoteId @unique`
- Caixa aberto obrigatório

---

## Tratamento de erros (mudança de padrão)

### Antes (silently swallow)
```ts
try {
  const { generateSaleEntries } = await import("@/services/finance-entry.service");
  await generateSaleEntries(tx, sale.id, companyId);
} catch (financeError) {
  console.error("[FINANCE] Erro ao gerar lançamentos:", financeError);
  // NÃO throw — venda já completada, finance é secundário
}
```

### Depois (log estruturado, mantém comportamento de não bloquear)
```ts
try {
  await generateSaleEntries(tx, sale.id, companyId);
} catch (financeError) {
  // Log estruturado para Sentry/Vercel pickup
  console.error(JSON.stringify({
    level: "error",
    event: "finance_entries_generation_failed",
    saleId: sale.id,
    companyId,
    error: financeError instanceof Error ? financeError.message : String(financeError),
    stack: financeError instanceof Error ? financeError.stack : undefined,
  }));
  // NÃO throw — comportamento documentado: venda completa, DRE precisa correção manual.
}
```

Mesma decisão (não bloquear) mas log auditável.

---

## Arquivos afetados

| Arquivo | Tipo de mudança |
|---|---|
| `src/services/sale-side-effects.service.ts` | **NOVO** — helpers compartilhados |
| `src/services/sale.service.ts` | refatoração mínima — substitui blocos por chamadas ao helper |
| `src/services/quote.service.ts` | refatoração — `convertToSale` passa a chamar helpers |
| `scripts/diagnose-bug1-orphan-quotes.ts` | já criado |
| `scripts/fix-bug1-orphan-quotes.ts` | a criar |
| `docs/audit/fixes/bug1_*.md` | docs |

---

## Estimativa de risco: **MÉDIO**

### Risco baixo
- Helpers novos (não modifica caminho existente do `sale.create` por enquanto)
- Bugs apenas no `convertToSale` que hoje JÁ está quebrado

### Risco médio
- Refatorar `sale.create` para usar os helpers (potencial regressão)
- Mitigação: testes manuais cobrindo todos os métodos de pagamento

### Risco alto (não nesta fase)
- Migração de dados antigos é IRREVERSÍVEL → script tem dry-run obrigatório

---

## Lista de testes manuais (resumo — detalhado em bug1_testes.md)

1. Quote → Sale com CASH puro
2. Quote → Sale com PIX puro
3. Quote → Sale com DEBIT_CARD
4. Quote → Sale com CREDIT_CARD 1x
5. Quote → Sale com CREDIT_CARD 3x
6. Quote → Sale com STORE_CREDIT 3x
7. Quote → Sale com BALANCE_DUE
8. Quote → Sale com mix (STORE_CREDIT + CREDIT_CARD)
9. Sale direto (PDV) com STORE_CREDIT — confirma regressão zero
10. Sale direto com refund — confirma regressão zero
