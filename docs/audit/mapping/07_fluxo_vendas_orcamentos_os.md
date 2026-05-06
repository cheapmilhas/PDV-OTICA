# 07 — Fluxo Vendas / Orçamentos / OS

## 1. Visão geral

Sistema cobre 3 tipos de "documento" que podem se encadear:

```
Orçamento (Quote)
    └─ Aprovação → Conversão (POST /quotes/[id]/convert)
                        ↓
                       Venda (Sale, status=COMPLETED)
                        ├─ SaleItem[]      (com lotConsumption opcional)
                        ├─ SalePayment[]   (CASH, PIX, ..., STORE_CREDIT, BALANCE_DUE)
                        ├─ AccountReceivable[]  (se STORE_CREDIT/BALANCE_DUE)
                        ├─ CardReceivable[]     (se CREDIT_CARD)
                        ├─ CashMovement[]       (se método "in cash")
                        ├─ Commission           (vendedor)
                        └─ CashbackMovement     (CREDIT)

Ordem de Serviço (ServiceOrder)
    ├─ ServiceOrderItem[]  (pode referenciar Lab)
    ├─ ServiceOrderHistory (audit de status)
    ├─ Prescription (FK opcional, ou prescriptionData Json inline)
    ├─ FrameMeasurement[]
    └─ Sale  (1:1 — `Sale.serviceOrderId @unique`)
```

OS é **independente** da Venda — pode existir sem venda anexa (DRAFT) ou ser convertida para venda.

## 2. Orçamento (`Quote`)

### 2.1 Criação
**Página:** `/dashboard/orcamentos/novo` (`src/app/(dashboard)/dashboard/orcamentos/novo/page.tsx`) — `permission="quotes.create"`
**API:** `POST /api/quotes` → `quoteService.create()` (`quote.service.ts:220`)

**Campos:** `customerId?` (ou snapshot com `customerName`/`Email`/`Phone`), `branchId`, `sellerUserId`, `items[]` (com `prescriptionData` Json opcional), `discount`, `validUntil`, `notes`.
**Validação Zod:** `createQuoteSchema` (em `lib/validations/quote.schema.ts`).
**Transação:** Sim (linha 220).
**Cria:** `Quote` + `QuoteItem[]`.

### 2.2 Status possíveis
Enum `QuoteStatus`: **DRAFT → PENDING → SENT → APPROVED → CONVERTED** (caminho feliz).
Lateral: **EXPIRED, CANCELED, LOST**.

### 2.3 Transições
| API | Mudança |
|---|---|
| `POST /api/quotes/[id]/mark-sent` | qualquer → SENT (com `sentAt`, `sentVia`) |
| `PATCH /api/quotes/[id]/status` | qualquer → outro (validação no service) |
| `POST /api/quotes/[id]/cancel` | → CANCELED (com `lostReason` opcional) |
| `POST /api/quotes/[id]/convert` | APPROVED → CONVERTED (cria Sale) |
| `POST /api/quotes/[id]/follow-up` | adiciona `QuoteFollowUp`; incrementa `followUpCount` |

### 2.4 🔥 Conversão Quote → Sale

**Arquivo:** `src/services/quote.service.ts:735-908` (`convertToSale`)

**Validações (antes da transação):**
1. Quote existe e pertence à `companyId`
2. ⚪ INCERTO: confirmação de `quote.status === "APPROVED"` — visto no comentário mas não no trecho lido. Preciso ler antes para confirmar.
3. Verifica caixa aberto na filial — se não, lança 400 (linha 700)
4. Valida estoque: `item.product.stockQty < item.qty` lança erro (linha 715) — **usa `Product.stockQty` global, NÃO `BranchStock`**
5. `validateQuotePayments(payments, quote.total)` — soma de pagamentos == total

**Idempotência:**
- ✅ **A nível de schema:** `Quote.convertedToSaleId @unique` impede dupla criação. Se duas requests simultâneas tentarem converter, a segunda quebra com violation.
- ⚪ **A nível de aplicação:** Não vi check explícito de `quote.status === "CONVERTED"` antes — depende de quem leia o status atual. **Race condition possível** entre check e set, mas mitigada pela unique constraint.

**Ações dentro da transação (linha 735):**
1. Cria `Sale` com `convertedFromQuoteId`
2. Cria `SaleItem`s a partir de `QuoteItem`s
3. ✅ Decrementa **`Product.stockQty`** (linha 769) — 🔴 **NÃO toca `BranchStock`** — divergente de `sale.create` que usa `atomicStockDebit`
4. Cria `SalePayment`s + auto-calcula `feeAmount` para cartões
5. ✅ Cria `CashMovement` para **TODOS** os métodos (linha 826) — 🔴 **divergente de `sale.create`** que cria só para `METHODS_IN_CASH` (CASH, PIX, DEBIT)
6. Cria `Commission` ✅
7. Atualiza `Quote.status = CONVERTED` + `convertedToSaleId` ✅

**🔴 OMISSÕES vs `sale.create`:**
- ❌ NÃO cria `AccountReceivable` para STORE_CREDIT/BALANCE_DUE → cliente não tem parcelas registradas!
- ❌ NÃO cria `CardReceivable` para CREDIT_CARD → previsão de recebíveis quebra
- ❌ NÃO chama `cashbackService.earnCashback` → cliente não ganha cashback
- ❌ NÃO chama `generateSaleEntries` → não gera `FinanceEntry` (DRE sem o lançamento)
- ❌ NÃO debita cashback usado (se quote tinha)

**🔴 Conclusão:** Vendas convertidas de orçamento são **incompletas financeiramente**. Risco confirmado.

## 3. Venda (`Sale`)

### 3.1 Criação
**Página:** `/dashboard/pdv` (`src/app/(dashboard)/dashboard/pdv/page.tsx`) — `permission="sales.create"`
**API:** `POST /api/sales` (rel. 03 §4.1) → `saleService.create()` (`sale.service.ts:280-680`)

**Cálculo de subtotal/desconto/total:** ⚪ **INCERTO se backend recalcula.** Vendo o trecho da transação, o service grava `subtotal`, `discount`, `total` que vêm do DTO. **Não vi recálculo defensivo.** ⚪ verificar `sanitizeSaleDTO`.

**🔥 Confirmações importantes do que `sale.create` faz dentro da transação (linhas 372-664):**

1. ✅ Cria `Sale` com `status = "COMPLETED"` direto
2. ✅ Para cada item:
   - Busca custo do produto (`Product.costPrice`) e grava em `SaleItem.costPrice` (linha 392-396)
   - Cria `SaleItem`
   - Chama `atomicStockDebit(productId, qty, companyId, tx, branchId)` — **debita estoque atomicamente** ✅ (lib `stock-utils.ts`)
   - Cria `StockMovement` (type SALE, quantity negativa)
3. ✅ Para cada pagamento:
   - Cria `SalePayment` (status RECEIVED, com cardBrand/lastDigits/nsu/auth)
   - Auto-calcula `feeAmount` para CREDIT_CARD/DEBIT_CARD via `calculateCardFee` (linha 463) — **silently fails** se erro (linha 482)
   - Se `METHODS_IN_CASH`: cria `CashMovement` (linha 487) — 🔴 se falhar, lança (linha 509) — diferente do auto-fee
   - Se `STORE_CREDIT` + `installmentConfig`: cria N `AccountReceivable` (linha 514-540)
   - Se `BALANCE_DUE`: cria 1 `AccountReceivable` com `dueDate = now + 30 dias` (linha 545-562)
   - Se `CREDIT_CARD`: cria N `CardReceivable` com `expectedDate = now + 30*i dias` (linha 565-590)
4. ✅ Se `cashbackUsed > 0`: decrementa `CustomerCashback.balance`, incrementa `totalUsed`, cria `CashbackMovement` (linhas 595-624)
5. ✅ Calcula e cria `Commission` (5% default ou `User.defaultCommissionPercent`, base = `total`)
6. ✅ Chama `generateSaleEntries(tx, saleId, companyId)` — gera `FinanceEntry` para DRE — **dentro de try/catch silencioso** (linhas 655-661) — 🟠 erro só logado

**Após a transação (não atomic):**
7. Se `customerId`: chama `cashbackService.earnCashback` — falha não bloqueia (linha 676)

**🟠 Botão "Finalizar Venda":** ⚪ verificado no relatório 12.

### 3.2 Cancelamento (`sale.service.ts:745-891`)

**API:** `DELETE /api/sales/[id]` → `saleService.cancel(id, companyId, reason)`
**Permissão:** `sales.cancel` (verificado no rel. 02)

**Validações:**
1. Não permitir cancelar venda já CANCELED ou REFUNDED (linha 749)
2. Busca caixa aberto da filial (linha 758) — usado para criar REFUND no caixa

**Ações na transação:**
1. ✅ `Sale.status = CANCELED`
2. ✅ Para cada item: `BranchStock.upsert + increment`, **`Product.stockQty.increment`** (linha 776-790), `StockMovement` (CUSTOMER_RETURN)
3. ✅ `cardReceivable.deleteMany` (linha 807)
4. ✅ Para cada pagamento: marca `VOIDED`; se método in_cash e há shift aberto → cria `CashMovement` REFUND
5. ✅ `accountReceivable.updateMany` { status: CANCELED } onde PENDING/OVERDUE
6. ✅ `commission.updateMany` { status: CANCELED } onde PENDING
7. ✅ `financeEntry.deleteMany` para Sale, SalePayment, SaleItem
8. ✅ Reverte `FinanceAccount.balance` (decrement) para CASH/PIX/CARD_ACQUIRER

**Após transação (não atomic):**
9. Reverte cashback (linha 894+) — falha não bloqueia

**Avaliação:** ✅ **Completo e bem-feito.** Atualiza `BranchStock` corretamente.

### 3.3 Devolução (refund) — `POST /api/sales/[id]/refund`

Implementação **na própria route** (não em service), `src/app/api/sales/[id]/refund/route.ts:8-172`. Já analisada no rel. 03 §4.3.

**🔴 Inconsistências vs `sale.cancel`:**
- ❌ Restock atualiza só `Product.stockQty`, **NÃO `BranchStock`**
- ❌ Não usa `requirePermission`
- ❌ Não cria CashMovement REFUND no caixa
- ❌ Não cancela AccountReceivable / Commission
- ❌ Não deleta FinanceEntry
- ❌ Não reverte FinanceAccount.balance
- ❌ `generateRefundEntries` em try/catch silencioso → se falhar, refund foi feito mas finance não

**Devolução parcial:** ✅ Suportada (`qtyReturned <= saleItem.qty`).
**Devolução total:** automática (se `allItemsReturned` → `Sale.status = REFUNDED`).
**Múltiplas devoluções:** ⚪ não há check se a soma das devoluções > total vendido em chamadas sucessivas.

### 3.4 Reativação — `POST /api/sales/[id]/reactivate`

⚪ NÃO LIDO. Provavelmente desfaz CANCELED (e re-debita estoque, re-cria AccountReceivable etc.) — verificar para auditar simetria.

## 4. Ordem de Serviço (`ServiceOrder`)

### 4.1 Quando é gerada
**Página:** `/dashboard/ordens-servico/nova` (sem ProtectedRoute! — rel. 02 §4)
**API:** `POST /api/service-orders` → `serviceOrderService.create()` (`service-order.service.ts:182-265`)

OS pode existir **sem venda anexa** (status DRAFT). É necessária para qualquer venda que tenha **lente** (LENS_SERVICE/OPHTHALMIC_LENS) — porque carrega prescrição, lab, prazo. ⚪ INCERTO se a UI obriga, ou se vendedor pode "esquecer".

### 4.2 Campos
- `customerId` (obrigatório, NOT NULL)
- `branchId` (obrigatório)
- `laboratoryId?` opcional
- `prescriptionId?` ou `prescriptionData` Json inline
- `prescriptionImageUrl?`
- `lensType`, `lensDescription`, `lensColoring`, `treatments String[]`
- `expectedDate` (DateTime)
- `notes`
- `items[]` { `productId?`, `description`, `qty`, `observations?` }

**Validação:** Zod `createServiceOrderSchema` (em `lib/validations/service-order.schema.ts`).

**Transação:** Sim (linha 198):
1. `getNextNumber(companyId, tx)` — incremento atomic via `Counter` model (a checar — pode ser falha de concorrência se mal-implementado)
2. Cria `ServiceOrder` com `status = "DRAFT"`
3. Para cada item: busca `salePrice` do produto, cria `ServiceOrderItem`
4. Cria `ServiceOrderHistory` { action: CREATED, toStatus: DRAFT }

### 4.3 Status possíveis
Enum `ServiceOrderStatus`:
**DRAFT → APPROVED → SENT_TO_LAB → IN_PROGRESS → READY → DELIVERED**
Lateral: **CANCELED**

### 4.4 Transições
| API | Mudança |
|---|---|
| `PATCH /api/service-orders/[id]/status` | mudança genérica |
| `POST /api/service-orders/[id]/convert` | DRAFT → cria Sale anexa |
| `POST /api/service-orders/[id]/deliver` | READY → DELIVERED |
| `POST /api/service-orders/[id]/revert` | reverte status |
| `POST /api/service-orders/[id]/warranty` | abre garantia |

Cada transição registra `ServiceOrderHistory`. ✅ trilha completa.

### 4.5 Datas críticas
- `promisedDate` — prometida ao cliente
- `labExpectedDate` — esperada do lab
- `sentToLabAt` — quando foi enviada
- `readyAt` — quando voltou pronto
- `deliveredAt` — quando entregue
- `canceledAt` — quando cancelada
- `isDelayed`, `delayDays`, `delayReason` — atraso (provavelmente calculado em job?)

### 4.6 Status Sale × Status OS
**Independentes.** `Sale.status = COMPLETED` não força `ServiceOrder.status = DELIVERED`. Cliente pode ter pago mas OS ainda em IN_PROGRESS.

🟡 **Risco:** UI precisa mostrar ambos, e pode ser confuso. Não há trigger DB sincronizando.

### 4.7 Numeração
**`@@unique([companyId, number])`** — sequencial **por empresa, não por filial**. Em rede com 5 lojas, números misturam-se cronologicamente. ⚪ Pode ser intencional (dashboard agrega) ou problemático (cada loja prefere ter sua numeração).

### 4.8 Específico de ótica — campos do schema
| Campo | Onde | Tipo |
|---|---|---|
| Prescrição completa | `PrescriptionValues` (1:1 com `Prescription`) | Decimal(6,2) para sph/cyl/add/prism, Int para axis, Decimal(5,2) para PD |
| Frame measurements | `FrameMeasurement` (1:N com `ServiceOrder`) | Decimals(4,1) e (5,1) |
| Imagem da receita | `Prescription.imageUrl` ou `ServiceOrder.prescriptionImageUrl` | String URL |
| OCR | `/api/ocr/prescription` (Anthropic SDK?) | extrai dados de imagem |
| Lab | `Lab` model + `LabPriceRange` (faixas de preço) | preços por faixa de grau |
| Tratamentos | `LensTreatment` model + `ServiceOrder.treatments String[]` | catalogo + selecionado |
| Garantia | `Warranty` model com `WarrantyType` (FRAME, LENS, MOUNTING, ADJUSTMENT) | prazo `startAt`/`expiresAt`. ⚪ NÃO LIDO como `expiresAt` é calculado (parece ser informado, não derivado de regra) |
| Receituário externo (anexar) | `Prescription.imageUrl` | sim, suportado |
| Reagendamento entrega | `delayDays`, `delayReason`, `isDelayed` | sim, mas mecanismo de update não-investigado |
| Impressão | rotas `imprimir/page.tsx` para vendas, OS, orçamentos | manual |

## 5. Cancelamento de OS

⚪ NÃO LIDO em detalhe. `ServiceOrder.canceledAt` existe. Provavelmente reverte status sem afetar Sale (são independentes).

## 6. Triggers automáticos da Venda (resumo)

| Ação | Quando | Atomic? | Service |
|---|---|---|---|
| Estoque −qty | `sale.create` | ✅ atomic via `atomicStockDebit` | sale.service:415 |
| `Sale.status = COMPLETED` | imediatamente | ✅ | sale.service:385 |
| AccountReceivable | se STORE_CREDIT/BALANCE_DUE | ✅ dentro tx | sale.service:514, 549 |
| CardReceivable | se CREDIT_CARD | ✅ dentro tx | sale.service:566 |
| CashMovement IN | se método in_cash | ✅ dentro tx | sale.service:490 |
| Commission | sempre | ✅ dentro tx | sale.service:640 |
| Cashback DEBIT (se usado) | sempre | ✅ dentro tx | sale.service:597 |
| Cashback CREDIT (ganho) | sempre se customerId | ❌ **fora tx** | sale.service:669 |
| FinanceEntry (DRE) | sempre | ⚠️ dentro tx mas com try/catch silencioso | sale.service:655 |

**🟠 Cashback ganho fora da transação:** se a venda commitar mas o cashback falhar, o cliente perde o ganho mas a venda existe. Reversível manualmente.

## 7. Específico de ótica — extra

### Numeração
- **OS**: `Counter` table + `getNextNumber(companyId, tx)`. Sequência por empresa. ⚪ Verificar atomicidade do `Counter.value++` — `transaction` ajuda mas precisa lock pessimista (`SELECT FOR UPDATE`) ou `findUnique + update` em mesma tx (Prisma garante? só com `$queryRaw`).
- **Vendas**: `Sale.id` é cuid — sem numeração sequencial visível ao usuário.

### Prescrição como dado de saúde
- Campos em `PrescriptionValues` (Decimal(6,2)) ✅ precisão clínica adequada
- `Doctor.crm + uf @@unique` — vínculo médico/CRM ✅
- 🟠 `Prescription` sem `deletedAt` (LGPD)
- 🟠 Sem audit log dedicado para acesso/edição de prescrição

### Garantia
- `Warranty` model com tipos FRAME/LENS/MOUNTING/ADJUSTMENT
- `startAt`/`expiresAt` armazenados — ⚪ INCERTO se calculados automaticamente ou manuais

### Receituário externo
- `Prescription.imageUrl` ou `ServiceOrder.prescriptionImageUrl` — sim, anexa
- Upload via `/api/upload/prescription-image`
- OCR via `/api/ocr/prescription` (extrai grau de imagem)

### Reagendamento
- `delayDays`, `delayReason`, `isDelayed` em `ServiceOrder`
- ⚪ INCERTO se atualização é manual ou via job (`isDelayed = promisedDate < now && status != DELIVERED`)

## 8. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| H1 | Conversão de orçamento → venda **NÃO** cria AccountReceivable, CardReceivable, FinanceEntry, nem aplica cashback ganho | 🔴 | `quote.service.ts:735-908` |
| H2 | Conversão de orçamento decrementa só `Product.stockQty`, ignora `BranchStock` | 🔴 | `quote.service.ts:766-774` |
| H3 | Refund decrementa só `Product.stockQty`, ignora `BranchStock` | 🔴 | `sales/[id]/refund/route.ts:122-129` (rel. 03) |
| H4 | Refund não tem `requirePermission`, finance entries em try/catch silencioso | 🔴 | idem |
| H5 | `sale.cancel` é completo (BranchStock + Product + financeEntry + commission + AR + cashback) | 🟢 | `sale.service.ts:745-891` |
| H6 | `Quote.convertedToSaleId @unique` impede dupla conversão a nível DB | 🟢 | schema linha 988 |
| H7 | `quote.convertToSale` valida estoque via `Product.stockQty`, não `BranchStock` | 🟠 | `quote.service.ts:715` |
| H8 | `cashbackService.earnCashback` chamado fora da transação principal | 🟠 | `sale.service.ts:669-680` |
| H9 | `generateSaleEntries` em try/catch silencioso (venda OK, finance falha sem rollback) | 🟠 | `sale.service.ts:655-661` |
| H10 | Status Sale × Status OS são **independentes** sem trigger de sincronização | 🟡 | schema |
| H11 | OS números sequenciais por empresa, misturam entre filiais | 🟡 | schema |
| H12 | OS `Counter`-based numbering — atomicidade depende da implementação de `getNextNumber` | ⚪ | `service-order.service.ts:199` |
| H13 | Devolução parcial não checa se soma de devoluções não excede o vendido em chamadas sucessivas | 🟠 | `refund/route.ts` |
| H14 | `Warranty.expiresAt` armazenado, não derivado — sem regra automática para frame vs lente | 🟡 | schema 1289 |
| H15 | Reativação de venda (`/api/sales/[id]/reactivate`) — comportamento e simetria com cancel não auditados | ⚪ | rota não lida |
| H16 | Auto-abertura de caixa em `sale.create` (linha 342-363) — pode surpreender operador | 🟡 | sale.service.ts |
| H17 | Backend confia nos valores `subtotal`/`discount`/`total` enviados pelo front (sem recálculo defensivo confirmado) | 🟠 | sale.service.ts:280-450 — não vi recálculo |
| H18 | Botão "Finalizar Venda" — proteção contra duplo clique não confirmada (rel. 12) | ⚪ | UI |

## 9. Fluxos de teste em runtime sugeridos (para fase 2)

1. **Conversão de orçamento**: criar quote APPROVED com STORE_CREDIT, converter, verificar se `AccountReceivable` foi criada (esperado: NÃO foi). Confirma H1.
2. **Refund parcial multi-filial**: vender produto da filial B, devolver a partir de loja A, verificar `BranchStock`. Esperado: `Product.stockQty` aumenta em 1, `BranchStock` da filial B continua errado. Confirma H3.
3. **Dupla conversão**: chamar `/quotes/[id]/convert` 2× simultaneamente. Esperado: 1 venda criada, 2ª chamada erra com unique violation. Confirma H6.
4. **Manipulação de total**: enviar `total = 0.01` no body do POST sales. Esperado: backend grava 0.01 (vulnerabilidade). Confirma H17.
