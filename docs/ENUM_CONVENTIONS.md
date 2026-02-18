# Convenções de Enums — PDV Ótica

## Padrão Adotado

### Sufixos de Cancelamento
- ✅ Usar: `CANCELED` (padrão americano, 1 L)
- ❌ Evitar: `CANCELLED` (2 L — padrão britânico)

### Status Inicial
- Para orçamentos: `DRAFT` (rascunho inicial)
- Para pedidos/transações: `PENDING` (aguardando)
- Para caixa (CashShift): `OPEN` / `CLOSED` (semântica de caixa aberto/fechado)

---

## Enums do Sistema

| Enum | Valores | Observações |
|------|---------|-------------|
| `UserRole` | ADMIN, GERENTE, VENDEDOR, CAIXA, ATENDENTE | OK |
| `SaleStatus` | OPEN, COMPLETED, CANCELED, REFUNDED | OPEN = venda em andamento no PDV |
| `QuoteStatus` | DRAFT, PENDING, SENT, APPROVED, CONVERTED, EXPIRED, CANCELED, LOST | ✅ Padronizado na Fase 1 |
| `ServiceOrderStatus` | DRAFT, APPROVED, SENT_TO_LAB, IN_PROGRESS, READY, DELIVERED, CANCELED | OK |
| `ServiceOrderPriority` | URGENT, HIGH, NORMAL, LOW | OK |
| `CashShiftStatus` | OPEN, CLOSED | OK — semântica correta para caixa |
| `CashMovementType` | SALE_PAYMENT, REFUND, SUPPLY, WITHDRAWAL, ADJUSTMENT, OPENING_FLOAT, CLOSING | OK |
| `PaymentMethod` | CASH, PIX, DEBIT_CARD, CREDIT_CARD, BOLETO, STORE_CREDIT, CHEQUE, AGREEMENT, OTHER | OK |
| `PaymentStatus` | PENDING, RECEIVED, VOIDED, REFUNDED | OK |
| `AccountReceivableStatus` | PENDING, RECEIVED, OVERDUE, CANCELED | OK |
| `AccountPayableStatus` | PENDING, PAID, OVERDUE, CANCELED | OK |
| `CommissionStatus` | PENDING, APPROVED, PAID, CANCELED | OK |
| `GoalStatus` | ACTIVE, CLOSED, CANCELLED | ⚠️ CANCELLED — manter por compatibilidade (sem dados com este valor) |
| `StockMovementType` | PURCHASE, CUSTOMER_RETURN, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT, SALE, LOSS, SUPPLIER_RETURN, INTERNAL_USE, OTHER | OK |
| `StockAdjustmentType` | DAMAGE, THEFT, SUPPLIER_RETURN, COUNT_ERROR, FREE_SAMPLE, EXPIRATION, INTERNAL_USE, OTHER | OK |
| `StockAdjustmentStatus` | PENDING, APPROVED, REJECTED, AUTO_APPROVED | OK |
| `WarrantyStatus` | ACTIVE, IN_ANALYSIS, APPROVED, DENIED, EXPIRED, USED | OK |
| `WarrantyType` | FRAME, LENS, MOUNTING, ADJUSTMENT | OK |
| `AppointmentStatus` | SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, NO_SHOW, CANCELED | OK |
| `FiscalStatus` | NOT_REQUESTED, PENDING, AUTHORIZED, FAILED, CANCELED | OK |
| `ProductType` | FRAME, CONTACT_LENS, ACCESSORY, SUNGLASSES, LENS_SERVICE, SERVICE, OPHTHALMIC_LENS, OPTICAL_ACCESSORY, LENS_SOLUTION, CASE, CLEANING_KIT, OTHER | OK |
| `BarcodeType` | EAN13, CODE128, QRCODE | OK |
| `RuleCategory` | STOCK, SALES, FINANCIAL, PRODUCTS, CUSTOMERS, REPORTS | OK |

---

## Migração Fase 1 Realizada

- Removidos `OPEN` e `CANCELLED` do enum `QuoteStatus` (0 registros afetados no banco)
- Adicionados `DRAFT` e `LOST` ao enum `QuoteStatus`
- Código atualizado: `quote.service.ts`, páginas de orçamentos

## Pendências

- `GoalStatus.CANCELLED` → considerar migrar para `CANCELED` em versão futura
- `SaleStatus.OPEN` → manter (semanticamente correto para "venda em andamento")
