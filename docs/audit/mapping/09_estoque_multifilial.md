# 09 — Estoque Multi-filial

## 1. Modelo de dados

| Tabela | Função | Campos relevantes |
|---|---|---|
| `Product.stockQty` (line 631) | **Cache global agregado** (Int, default 0) | `stockMin`, `stockMax`, `reorderPoint`, `stockControlled` |
| `BranchStock` (line 2278) | **Verdade por filial** (Int, default 0) | `branchId + productId @@unique`, `quantity`, `minStock`, `maxStock`, `costPrice`, `salePrice`, `promoPrice` (override por filial) |
| `StockMovement` (line 928) | Histórico de movimentações | `type` (PURCHASE, SALE, CUSTOMER_RETURN, TRANSFER_IN/OUT, ADJUSTMENT, LOSS, SUPPLIER_RETURN, INTERNAL_USE, OTHER), `quantity` (positivo/negativo), `branchId`, `sourceBranchId`, `targetBranchId` |
| `StockTransfer` + `StockTransferItem` (line 2299, 2324) | Transferência entre filiais | status PENDING/COMPLETED/etc. |
| `StockAdjustment` (line 1579) | Ajuste manual com aprovação | `quantityBefore/Change/After`, `unitCost`, `totalValue`, `reason`, status |
| `StockReservation` (line 905) | Reserva temporária para OS/Sale | RESERVED/RELEASED/CONSUMED |
| `InventoryLot` + `SaleItemLot` | Controle FIFO de lotes | `qtyIn`, `qtyRemaining`, `unitCost`, `totalCost` |

## 2. 🔥 `atomicStockDebit` — função central

**Arquivo:** `src/services/stock.service.ts:15-112`

### O que faz
1. Busca produto (verifica `stockControlled`)
2. Se **`branchId` fornecido**: usa `BranchStock` como verdade
3. Se **NÃO fornecido**: usa `Product.stockQty` (compatibilidade legacy)

### Race-safety (✅ correto)
```ts
const updated = await client.branchStock.updateMany({
  where: {
    branchId,
    productId,
    quantity: { gte: quantity },     // ← condição atômica
  },
  data: { quantity: { decrement: quantity } },
});

if (updated.count === 0) {
  // estoque insuficiente OU concorrência perdeu
}
```

✅ **Race-safe via UPDATE condicional do Postgres.** Se 2 vendas concorrentes pedem 10 unidades de um produto com 15 em estoque, uma passa, a outra falha — sem locks pessimistas.

### Sincronização do cache
Após o BranchStock decrement, atualiza `Product.stockQty` via `$executeRaw`:
```sql
UPDATE "Product"
SET "stockQty" = "stockQty" - $quantity, "updatedAt" = NOW()
WHERE "id" = $productId AND "companyId" = $companyId
```

🟡 **Cuidado:** `Product.stockQty` é o **agregado entre todas as filiais**. Se duas vendas em filiais diferentes acontecem simultaneamente, o decremento concorrente do `Product.stockQty` está correto via SQL atômico (não via Prisma `decrement`).

### `atomicStockCredit` (estorno/devolução/entrada)
Mesma lógica reversa. **`upsert`** no `BranchStock` (cria se filial nunca teve esse produto). ✅

## 3. Quando se usa atomic vs naive

| Operação | Usa `atomic*`? | Onde |
|---|---|---|
| `sale.create` (criar venda) | ✅ `atomicStockDebit` | `sale.service.ts:415` |
| `sale.cancel` (cancelar venda) | ❌ usa `BranchStock.upsert` + `Product.stockQty.increment` (manual mas correto e atomic via Prisma) | `sale.service.ts:776-790` |
| `quote.convertToSale` | ❌ **só `Product.stockQty.decrement`**, **não toca `BranchStock`** | `quote.service.ts:766-774` 🔴 |
| `sales/[id]/refund` | ❌ **só `Product.stockQty.increment`** | `refund/route.ts:122-129` 🔴 |
| `stock-movement.service.transfer` | ✅ `atomicStockDebit` na origem | `stock-movement.service.ts:359` |
| `stock-transfers/[id]` (approve) | ⚪ verificar — não foi lido completo | `stock-transfers/[id]/route.ts` |
| `stock-adjustments` | ⚪ verificar service | `stock-adjustment.service.ts` |
| `inventory/lots` (entrada) | ⚪ verificar | `inventory/lots/route.ts` |

🔴 **Inconsistência confirmada:** `quote.convertToSale` e `refund` não usam `atomicStockDebit/Credit`. Resultado: `BranchStock` desatualiza ao longo do tempo. Sintoma: relatório de estoque por filial fica errado, mas o cache global em `Product.stockQty` continua "certo" (porque é manualmente decrementado).

## 4. `StockTransfer`

### Schema
- `status`: PENDING, COMPLETED, ⚪ outros — verificar enum `StockTransferStatus` (line 3508)
- `requestedById`, `approvedById` — fluxo de aprovação
- `requestedAt`, `approvedAt`, `completedAt` — datas
- Items em `StockTransferItem`

### Fluxo
1. `POST /api/stock-transfers` (rel. 03 §4.6)
   - Valida cross-branch (mesma empresa)
   - Valida estoque na origem (sem lock!)
   - **Admin auto-aprova** (`autoApprove = userRole === "ADMIN"`); outros → `PENDING`
   - Se auto-aprovada: debita `BranchStock` origem + credita destino + 2 `StockMovement` (TRANSFER_OUT/IN), tudo na transação
2. `POST /api/stock-transfers/[id]` (action: "approve")
   - Apenas `userRole === "ADMIN"` (linha 41)
   - Re-checa estoque (mesma race condition do POST)
   - ⚪ NÃO LIDO completo, mas presumível: debita/credita + status COMPLETED

### 🟠 Race condition
- Check de estoque (linha 91 ou 47 da approve) **fora da transação**
- Duas approves simultâneas podem ambas passar pelo check e estourar o estoque

### ✅ Boa prática presente
- `StockMovement` com `sourceBranchId`/`targetBranchId` para auditoria

## 5. `StockAdjustment` (ajuste manual)

Schema (line 1579):
- `quantityBefore`, `quantityChange`, `quantityAfter` — snapshot completo
- `unitCost`, `totalValue` — valor do ajuste
- `reason` String — obrigatório (não nullable)
- `attachments String[]` — arquivos comprobatórios
- `status` (`StockAdjustmentStatus`) — PENDING/APPROVED/REJECTED
- `approvedByUserId`, `approvedAt`, `rejectionReason`

### Fluxo
- `POST /api/stock-adjustments` — cria PENDING
- `POST /api/stock-adjustments/[id]/approve` — aprova (presume `requirePermission("stock.adjust")`)
- `POST /api/stock-adjustments/[id]/reject` — rejeita

✅ Modelo bem feito (com aprovação e auditoria).
⚪ Implementação do approve (atualiza estoque atomic?) não auditada.

## 6. `StockReservation`

Schema (line 905):
- `productId + branchId + qty + status`
- `serviceOrderId?` ou `saleId?`
- Status: `RESERVED`, `RELEASED`, `CONSUMED`
- `releasedAt`, `consumedAt`

### Uso atual
⚪ Não vi nenhuma route explicitamente criando StockReservation. Pode ser fluxo planejado mas não implementado, ou usado dentro de algum service. 🟡 INCERTO.

## 7. Cache `Product.stockQty` × `BranchStock.quantity`

### Como mantém sincronia
- `atomicStockDebit/Credit` atualiza ambos ✅
- `sale.cancel` atualiza ambos manualmente ✅
- `quote.convertToSale` atualiza só `Product.stockQty` 🔴 (BranchStock dessincroniza por sale convertida)
- `refund` atualiza só `Product.stockQty` 🔴
- `stock-transfers approve` atualiza ambos ✅ (presumido)

### ❌ Não há job/trigger de reconciliação
Sem mecanismo automático para detectar drift e ressincronizar `Product.stockQty = SUM(BranchStock.quantity)`. Recomenda-se cron periódico ou trigger Postgres.

### Como uma query sabe a qual usar?
- Telas globais (catálogo de produtos): usam `Product.stockQty` (mais rápido — uma query)
- Telas por filial (estoque, PDV): usam `BranchStock.quantity` (filtro por `branchId`)
- ⚪ INCERTO se há divergência visível ao usuário

## 8. Concorrência: 2 vendas simultâneas do mesmo produto/filial

### `sale.create` (caminho normal): ✅ PROTEGIDO
`atomicStockDebit` usa `updateMany WHERE quantity >= solicitado` — apenas uma decremerá com sucesso. A outra retorna `success: false, error: "Estoque insuficiente"` e **a transação inteira faz rollback** (linha 416-422 de `sale.service.ts` lança `AppError`).

### `quote.convertToSale`: ❌ NÃO PROTEGIDO
Decremento ingênuo via Prisma `decrement` em `Product.stockQty`. Race condition pode resultar em **estoque negativo no cache global**. 🔴

### `stock-transfers approve`: 🟠 PARCIALMENTE
Check fora da transação; transação sem lock. Race possível.

### `stock-adjustments`: ⚪ não verificado

## 9. Estoque negativo

### Permitido?
- `Product.stockQty`: schema permite (Int sem constraint `CHECK (>= 0)`)
- `BranchStock.quantity`: idem
- `atomicStockDebit`: bloqueia via `quantity: { gte: quantity }` ✅
- `quote.convertToSale`: **não bloqueia** (decrement direto)
- `refund` (credit): N/A (sempre incrementa)

### Validação de regra
- `SystemRule` `stock.allow_negative_stock` é uma chave (visto no grep do rel. 05) — pode habilitar/desabilitar permissão
- `SystemRule` `stock.block_sale_without_stock` — pode bloquear venda
- ⚪ INCERTO se essas regras são consultadas em runtime (não vi grep para `system-rule.service`)

## 10. Inventário/contagem

❌ **NÃO ENCONTRADO** mecanismo de inventário cíclico/contagem. `StockAdjustment` cobre ajustes pontuais, mas não há fluxo para "contagem física" (gerar lista, marcar contado, gerar adjustments em massa).

## 11. Comissão de vendedor por categoria

- `User.defaultCommissionPercent` Decimal(5,2)? — default por usuário
- `Category.defaultCommissionPercent` Decimal(5,2)? — por categoria
- `CommissionRule` model (line 1192) com `userId`, `categoryId?`, `brandId?`, `percentage`, `minMarginPercent`, `priority`
- `Lab.defaultDiscount` (não é comissão, é desconto do lab)

✅ Modelo permite regras complexas. ⚪ INCERTO se a lógica em `sale.create:629-652` consulta `CommissionRule`. Vimos que ela usa apenas `User.defaultCommissionPercent || 5`. **Schema rico, lógica simplificada**. Possível inconsistência: regras criadas em `CommissionRule` ignoradas no cálculo real.

## 12. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| J1 | `atomicStockDebit` é race-safe via `updateMany WHERE quantity >= solicitado` | 🟢 | `stock.service.ts:41-48` |
| J2 | `quote.convertToSale` decrementa só `Product.stockQty`, ignora `BranchStock` → drift | 🔴 | `quote.service.ts:766-774` |
| J3 | `sales/[id]/refund` credita só `Product.stockQty`, ignora `BranchStock` | 🔴 | `refund/route.ts:122-129` |
| J4 | `sale.cancel` atualiza ambos corretamente | 🟢 | `sale.service.ts:776-790` |
| J5 | Sem job/trigger de reconciliação `Product.stockQty = SUM(BranchStock.quantity)` | 🟠 | grep |
| J6 | `StockTransfer` approve sem lock — race entre check e debit | 🟠 | `stock-transfers/[id]/route.ts` |
| J7 | `StockReservation` modelo existe mas uso não confirmado | ⚪ | schema 905 |
| J8 | Sem mecanismo de inventário cíclico/contagem física | 🔵 | grep |
| J9 | `CommissionRule` schema robusto, mas `sale.create` usa apenas `User.defaultCommissionPercent` | 🟡 | `sale.service.ts:629-652` |
| J10 | `SystemRule.stock.*` chaves existem mas uso em runtime não confirmado | ⚪ | grep |
| J11 | Postgres sem CHECK constraint impedindo `stockQty < 0` | 🟡 | schema |
| J12 | `BranchStock` tem override de preço por filial (`salePrice`, `costPrice`, `promoPrice`) — escolha em runtime entre `Product.salePrice` e `BranchStock.salePrice` é INCERTA | 🟡 | schema 2287 |
| J13 | `InventoryLot` + `SaleItemLot` permite FIFO/lote, mas uso não confirmado em todas vendas | ⚪ | schema 2742 |
