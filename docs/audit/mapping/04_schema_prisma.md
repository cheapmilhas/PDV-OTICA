# 04 — Schema Prisma

> Schema PostgreSQL via Prisma 5.22. Tamanho: **3.820 linhas**, **130 models**, **75 enums**.

## 0. Visão geral

| Métrica | Valor |
|---|---|
| Linha do schema | 3.820 |
| `model` | 130 |
| `enum` | 75 |
| Models com `companyId` | majoritário (estimado >100) |
| Models com `branchId` | ~40 |
| Models com `deletedAt` (soft delete) | **6** (ver §3) |
| Migrations | **5** |
| Datasource | PostgreSQL com `directUrl` (Neon) |

Generator: `prisma-client-js` (default). Datasource: `postgresql` com env `DATABASE_URL` + `DIRECT_URL`.

## 1. Lista completa de models (130)

```
Counter                       FrameMeasurement              CashRegister
CardFeeRule                   Company                       Branch
User                          UserBranch                    AuditLog
Customer                      Doctor                        Lab
LensTreatment                 LabPriceRange                 Supplier
Category                      Brand                         Shape
Color                         Product                       FrameDetail
ContactLensDetail             AccessoryDetail               ServiceDetail
LensServiceDetail             Prescription                  PrescriptionValues
ServiceOrder                  ServiceOrderItem              ServiceOrderHistory
QualityChecklist              StockReservation              StockMovement
QuoteFollowUp                 Quote                         QuoteItem
Sale                          SaleItem                      SalePayment
CardReceivable                CommissionRule                Commission
CashShift                     CashMovement                  Warranty
WarrantyClaim                 Agreement                     AgreementBeneficiary
LoyaltyProgram                LoyaltyTier                   LoyaltyPoints
DREReport                     AccountPayable                RecurringExpense
AccountReceivable             StockAdjustment               SystemRule
ProductBarcode                Permission                    RolePermission
UserPermission                CompanySettings               CashbackConfig
CustomerCashback              CashbackMovement              ReminderConfig
CustomerContact               Reminder                      SalesGoal
SellerGoal                    CommissionConfig              SellerCommission
Plan                          PlanFeature                   Subscription
Invoice                       BillingEvent                  TenantDomain
UsageMetric                   AdminUser                     ImpersonationSession
GlobalAudit                   SupportTicket                 SupportMessage
CompanyNote                   SubscriptionHistory           HealthScore
UsageSnapshot                 BranchStock                   StockTransfer
StockTransferItem             ProductCampaign               ProductCampaignItem
CampaignBonusEntry            DailyAgg                      Network
CrmContact                    CrmSettings                   ContactGoal
ClientPortalConfig            CompanyTag                    CrmReminder ⚪
CustomerReminder              MessageTemplate               OnboardingChecklist
ActivityLog                   DunningEvent                  Invite
EmailQueue                    EmailLog                      SlaConfig
TicketTag                     SupportNotification           AdminNotification
ChartOfAccounts               FinanceAccount                FinanceEntry
InventoryLot                  SaleItemLot                   Refund
RefundItem                    ReconciliationBatch           ReconciliationItem
ReconciliationRule            ReconciliationTemplate        ReconciliationResolution
PaymentInvoice                Tag                           ⚪ (verifique faltantes)
```

> Lista preliminar — alguns models podem estar duplicados ou faltando. Posicione `prisma format` antes da auditoria seguinte.

## 2. Models críticos detalhados

### 2.1 `Sale`

**Linhas:** 1045–1094.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String | cuid |
| `companyId` | String | ✅ tenant |
| `branchId` | String | ✅ filial |
| `customerId` | String? | opcional (consumidor não cadastrado) |
| `serviceOrderId` | String? **@unique** | 1:1 com OS |
| `sellerUserId` | String | obrigatório |
| `status` | `SaleStatus` | enum: OPEN, COMPLETED, CANCELED, REFUNDED |
| `subtotal`, `discountTotal`, `total` | **Decimal(12,2)** | ✅ |
| `agreementId` | String? | convênio |
| `agreementDiscount` | Decimal(12,2)? | desconto convênio |
| `cashbackUsed` | **Decimal(10,2)** | ⚠️ **precisão diferente** dos outros (10,2 vs 12,2) |
| `authorizationCode`, `fiscalStatus`, `fiscalKey`, `fiscalXmlUrl`, `fiscalPdfUrl` | strings | NF-e |
| `convertedFromQuoteId` | String? **@unique** | rastreio orçamento → venda |
| `legacyId` | String? @unique | importação legada |
| `completedAt`, `deletedAt` | DateTime? | ✅ tem soft delete |
| `createdAt`, `updatedAt` | DateTime | ✅ |

**Soft delete?** ✅ `deletedAt`
**Timestamps?** ✅ ambos
**Índices:**
- `@@index([companyId, branchId, createdAt])`
- `@@index([customerId, createdAt])`
- `@@index([sellerUserId, createdAt])`
- `@@index([agreementId])`

**🔥 Campos monetários:** `subtotal`, `discountTotal`, `total`, `agreementDiscount`, `cashbackUsed` — todos Decimal. `cashbackUsed` é Decimal(10,2), os demais Decimal(12,2). 🟡 inconsistência menor.

### 2.2 `SaleItem`

**Linhas:** 1096–1118.

| Campo | Tipo | Notas |
|---|---|---|
| `qty` | Int default 1 | quantidade |
| `unitPrice` | Decimal(12,2) | ✅ |
| `discount` | Decimal(12,2) default 0 | ✅ |
| `lineTotal` | Decimal(12,2) | calculado no service |
| `costPrice` | Decimal(12,2) default 0 | ✅ |
| `stockControlled` | Boolean default true | snapshot (caso produto mude) |
| `stockQtyConsumed` | Int default 0 | uso INCERTO |

**🔥 Auditoria monetária consistente** com Sale. ✅

### 2.3 `SalePayment`

**Linhas:** 1120–1154.

| Campo | Tipo | Notas |
|---|---|---|
| `method` | `PaymentMethod` | enum (10 valores — ver §6) |
| `status` | `PaymentStatus` default PENDING | enum: PENDING, RECEIVED, VOIDED, REFUNDED |
| `amount` | Decimal(12,2) | ✅ |
| `installments` | Int? | parcelas |
| `cardBrand`, `cardLastDigits`, `authorizationCode`, `nsu`, `acquirer` | strings | dados de cartão |
| `feePercent` | **Decimal(5,4)** | ⚠️ outra precisão (0.0285 = 2.85%) |
| `feeAmount`, `netAmount` | Decimal(10,2) | ⚠️ vs (12,2) acima |
| `settlementDate`, `settledAt`, `settlementStatus` | settlement (D+0/D+30) |

**🔥 Inconsistência monetária**: `amount` é (12,2), `feeAmount`/`netAmount` são (10,2), `feePercent` é (5,4). Limites diferentes.

### 2.4 `CardReceivable`

**Linhas:** 1156–1190. (ver migration `20260328_add_card_receivable`)

Recebíveis de cartão por parcela. `grossAmount`, `netAmount`, `feePercent` (5,4), `expectedDate`, `settledDate`, `status` String default `"PENDING"` (⚠️ não enum).

### 2.5 `Quote`

**Linhas:** 973–1024.

| Campo | Tipo | Notas |
|---|---|---|
| `status` | `QuoteStatus` default PENDING | DRAFT, PENDING, SENT, APPROVED, **CONVERTED**, EXPIRED, CANCELED, LOST |
| `validUntil` | DateTime? | validade |
| `convertedToSaleId` | String? **@unique** | 1:1 ↔ Sale (proteção contra dupla conversão!) ✅ |
| `convertedToOsId` | String? | NÃO unique — pode ter múltiplas? 🟡 |
| `convertedAt`, `convertedByUserId` | rastreio |
| `lostReason`, `internalNotes`, `paymentConditions` | gestão |
| `lastFollowUpAt`, `followUpCount`, `contactCount` | follow-up |
| `customerEmail`, `customerName`, `customerPhone` | snapshot (cliente não cadastrado?) |
| `subtotal`, `discountTotal`, `total` | Decimal(12,2) ✅ |
| `discountPercent` | Decimal(5,2) |
| `deletedAt` | ✅ soft delete |

**🔴 CONFIRMADO:** `convertedToSaleId @unique` impede dupla conversão **a nível de schema** (constraint do DB). Isso é proteção forte contra race condition.

### 2.6 `QuoteItem`

**Linhas:** 1026–1043. `unitPrice` (12,2), `discount` (12,2), `total` (12,2). `prescriptionData` Json (snapshot da prescrição). 🟡 dado de saúde armazenado como Json sem schema validado.

### 2.7 `ServiceOrder`

**Linhas:** 784–849. **44 colunas**.

| Campo crítico | Tipo |
|---|---|
| `number` | **Int default 0** |
| `status` | `ServiceOrderStatus` default DRAFT (DRAFT, APPROVED, SENT_TO_LAB, IN_PROGRESS, READY, DELIVERED, CANCELED) |
| `priority` | `ServiceOrderPriority` (URGENT/HIGH/NORMAL/LOW) |
| `promisedDate`, `labExpectedDate`, `sentToLabAt`, `readyAt`, `deliveredAt`, `canceledAt` | datas do ciclo |
| `laboratoryId` | FK para Lab |
| `labOrderNumber`, `labNotes` | dados do lab |
| `isDelayed`, `delayDays`, `delayReason` | atraso |
| `isWarranty`, `isRework`, `warrantyReason`, `reworkReason`, `originalOrderId` | garantia/retrabalho |
| `qualityRating`, `qualityNotes` | qualidade |
| `prescriptionData` | **Json?** (snapshot) — 🟡 dado de saúde sem schema |
| `prescriptionImageUrl` | URL imagem da receita — 🟠 LGPD |
| `lensType`, `lensDescription`, `lensColoring`, `treatments` String[] | dados ópticos |
| `deletedAt` | ✅ soft delete |

**🔥 Numeração:**
```
@@unique([companyId, number])
```
**Por empresa, NÃO por filial.** Significa: rede com 5 lojas tem uma sequência única. Pode ser intencional ou problemático (ver relatório 07/16).

### 2.8 `Prescription` + `PrescriptionValues`

**`Prescription`** (linhas 732–757): metadados (`issuedAt`, `expiresAt`, `prescriptionType`, `notes`, **`imageUrl`**, `doctorId?`).

**`PrescriptionValues`** (linhas 759–782): grau e medidas.

| Campo | Tipo | Significado |
|---|---|---|
| `odSph`, `oeSph` | Decimal(6,2) | esférico OD/OE |
| `odCyl`, `oeCyl` | Decimal(6,2) | cilíndrico |
| `odAxis`, `oeAxis` | Int | eixo (0–180) |
| `odAdd`, `oeAdd` | Decimal(6,2) | adição |
| `odPrism`, `oePrism` | Decimal(6,2) | prisma |
| `odBase`, `oeBase` | String | base do prisma |
| `pdFar`, `pdNear` | Decimal(5,2) | DNP longe/perto |
| `fittingHeightOd/Oe` | Decimal(5,2) | altura |
| `pantoscopicAngle`, `vertexDistance`, `frameCurvature` | Decimal(5,2) | medidas avançadas |

**🟠 LGPD**: `Prescription` + `PrescriptionValues` = **dado sensível de saúde** (CFM/LGPD art. 11). Não há campo `consentGivenAt` ou similar. Sem soft delete (`deletedAt` ausente em Prescription). Ver relatórios 10 e 15.

### 2.9 `Customer`

**Linhas:** 367–419.

| Campo PII | Tipo |
|---|---|
| `name` | String |
| `cpf` | String? **@unique compostamente** (`[companyId, cpf]`) |
| `rg` | String? |
| `phone`, `phone2`, `email` | strings |
| `birthDate`, `gender` | strings |
| `address`, `number`, `complement`, `neighborhood`, `city`, `state`, `zipCode` | endereço |
| `cnpj`, `companyName`, `tradeName`, `personType` (PF/PJ) | jurídico |
| `acceptsMarketing` | **Boolean default true** | ⚠️ opt-out, não opt-in (🟠 LGPD art. 7º consentimento) |
| `referralSource`, `notes`, `externalId` | extras |
| `originBranchId` | filial onde foi cadastrado |
| `active`, `deletedAt` | ✅ soft delete |

**Relacionamentos:** sales, serviceOrders, quotes, prescriptions, accountsReceivable, refunds, reminders, agreementBenefits, cashback, loyaltyPoints, contacts, crmContacts, crmReminders.

**🚨 LGPD findings:**
- `acceptsMarketing` default true — opt-out automático
- Sem `consentGivenAt`, `consentVersion`, `dataDeletedAt`, `anonymizedAt`
- Sem coluna que registre consentimento explícito para coleta de dados sensíveis

### 2.10 `Product`

**Linhas:** 613–677.

| Campo | Tipo | Notas |
|---|---|---|
| `companyId` | String | ✅ |
| `type` | `ProductType` | enum (12 valores) |
| `sku` | String **@unique compostamente** (`[companyId, sku]`) |
| `barcode` | String? | indexado |
| `costPrice`, `salePrice`, `promoPrice` | Decimal(12,2) | ✅ |
| `marginPercent` | Decimal(5,2) | ⚠️ **calculado redundantemente** com costPrice/salePrice — risco de dessincronia |
| `stockControlled` | Boolean default true |
| `stockQty` | **Int default 0** | 🔴 **cache global, NÃO multi-filial** |
| `stockMin`, `stockMax`, `reorderPoint` | gestão |
| `abcClass`, `turnoverDays` | classificação |
| `ncm`, `cest` | fiscal |
| `mainImage`, `images String[]` | mídia |
| `active`, `featured`, `launch`, `deletedAt` | ✅ soft delete |
| `sharedToNetwork` | Boolean default false | compartilhamento entre empresas da rede |

**🔴 CRÍTICO:** `Product.stockQty` é um número global por produto, mas existe `BranchStock` com `quantity` por filial. **Schema permite as duas fontes ficarem dessincronizadas.** Já documentado em rel. 03 (refund atualiza só `Product.stockQty`).

### 2.11 `BranchStock`

**Linhas:** 2278–2297. Snake_case (`@map`) → tabela `branch_stocks`.

| Campo | Tipo | Notas |
|---|---|---|
| `branchId` (`branch_id`) | String | ✅ |
| `productId` | String | ✅ |
| `quantity` | Int default 0 | **fonte de verdade do estoque por filial** |
| `minStock`, `maxStock` | Int | por filial |
| `costPrice`, `salePrice`, `promoPrice` | Decimal(12,2) opcional | **override de preço por filial** |
| `marginPercent` | Decimal(5,2)? | idem |
| `updatedAt` | DateTime |

**Constraint:** `@@unique([branchId, productId])` ✅

**❌ NÃO TEM `companyId`** — derivado via `branch.companyId`. 🟡 Permite query por `companyId` via join, mas obriga `JOIN` em todo filtro multi-tenant.

### 2.12 `CashShift`

**Linhas:** 1236–1262.

| Campo | Tipo | Notas |
|---|---|---|
| `companyId`, `branchId` | String | ✅ |
| `status` | `CashShiftStatus` default OPEN (OPEN/CLOSED) |
| `openedByUserId` | String | obrigatório |
| `openedAt` | DateTime default now |
| `openingFloatAmount` | Decimal(12,2) | troco inicial |
| `closedByUserId`, `closedAt` | nullable (preenchidos no fechamento) |
| `closingDeclaredCash` | Decimal(12,2)? | declarado pelo operador |
| `closingExpectedCash` | Decimal(12,2)? | calculado pelo sistema |
| `differenceCash` | Decimal(12,2)? | diferença |
| `differenceJustification` | String? | obrigatório se houver diferença? ⚪ INCERTO |
| `cashRegisterId` | String? | hardware |

**Índices:** `[branchId, status]`, `[companyId, openedAt]`, `[cashRegisterId, status]`.

**🟠 NÃO há constraint impedindo dois `OPEN` simultâneos da mesma filial.** Validação fica no service. Ver rel. 08.

### 2.13 `CashMovement`

**Linhas:** 1264–1287.

| Campo | Tipo |
|---|---|
| `cashShiftId` | String (FK) |
| `branchId` | String |
| `type` | `CashMovementType` (SALE_PAYMENT, REFUND, SUPPLY, WITHDRAWAL, ADJUSTMENT, OPENING_FLOAT, CLOSING) |
| `direction` | `CashDirection` (IN/OUT) |
| `method` | `PaymentMethod` |
| `amount` | Decimal(12,2) |
| `originType` String, `originId` String | polimórfico (ex: "Sale"+id, "AccountReceivable"+id) |
| `salePaymentId` | String? | FK opcional |
| `migrated` | Boolean default false | flag de migração |

**🟡 Polimorfismo via String** (`originType`/`originId`) — sem FK garantindo integridade. Comum mas frágil.

### 2.14 `AccountPayable`

**Linhas:** 1474–1504.

| Campo | Tipo |
|---|---|
| `companyId`, `branchId?`, `supplierId?` | tenant |
| `description`, `category` (`AccountCategory`) | classificação |
| `amount` | Decimal(12,2) |
| `dueDate` | DateTime |
| `paidDate`, `paidAmount` | nullable |
| `status` | `AccountPayableStatus` default PENDING |
| `recurringExpenseId` | FK para RecurringExpense |
| `createdByUserId`, `paidByUserId` | rastreio |

### 2.15 `RecurringExpense`

**Linhas:** 1506–1536. (migration `20260328_add_recurring_expenses`).

| Campo | Tipo |
|---|---|
| `frequency` | **String** default `"MONTHLY"` | 🟡 não é enum |
| `dayOfMonth` | Int default 10 |
| `lastGeneratedAt`, `nextDueDate` | DateTime? — chave para idempotência ao gerar contas do mês |
| `generatedPayables` | relação com AccountPayable[] |

**❌ NÃO há `@@unique` sobre `[recurringExpenseId, periodMonth, periodYear]`** em `AccountPayable` para impedir geração duplicada. Service deve verificar via `lastGeneratedAt` — frágil.

### 2.16 `AccountReceivable`

**Linhas:** 1538–1577.

| Campo | Tipo | Notas |
|---|---|---|
| `installmentNumber`, `totalInstallments` | Int default 1 | parcelamento |
| `amount` | Decimal(12,2) | valor da parcela |
| `dueDate` | DateTime | vencimento |
| `receivedDate`, `receivedAmount` | nullable | baixa |
| `status` | `AccountReceivableStatus` default PENDING (PENDING, PARTIAL?, RECEIVED, OVERDUE?, CANCELED — verificar enum) |
| `finePercent`, `fineAmount` | Decimal(5,2)/(12,2)? | multa |
| `interestPercent`, `interestAmount` | juros |
| `discountAmount` | desconto |
| `graceDays` | Int? | carência |
| `reversedAt`, `reversedBy` | reversão de baixa |

**Índices úteis:** `[companyId, status, dueDate]`, `[customerId, status]`, `[saleId]`, `[dueDate, status]`.

**❌ NÃO há `@@unique([saleId, installmentNumber])`** — duas chamadas do gerador de parcelas podem criar duplicadas (idempotência só por código).

### 2.17 `FinanceEntry`

**Linhas:** 2710–2740.

| Campo | Tipo |
|---|---|
| `type` | `FinanceEntryType` |
| `side` | `FinanceEntrySide` (DEBIT/CREDIT — partidas dobradas) |
| `amount` | **Decimal(14,2)** ⚠️ (vs 12,2 alhures) |
| `debitAccountId`, `creditAccountId` | FK ChartOfAccounts |
| `financeAccountId` | FK FinanceAccount (caixa/banco) |
| `sourceType`, `sourceId` | polimórfico |
| `entryDate`, `cashDate` | regime competência vs caixa |

**🔴 IDEMPOTÊNCIA NO SCHEMA:**
```prisma
@@unique([companyId, sourceType, sourceId, type, side])
```
✅ Impede dupla geração de lançamento financeiro para a mesma fonte. **Boa defesa.**

### 2.18 `Refund` + `RefundItem`

**Linhas:** 2781–2823. **Sem `deletedAt`.** `totalRefund`, `totalCost` Decimal(12,2). `refundMethod` String (não enum) — 🟡.

### 2.19 `ImpersonationSession`

**Linhas:** 2119–2135. (migration `20260331_add_impersonation_audit`).

| Campo | Tipo |
|---|---|
| `adminUserId` | FK AdminUser |
| `companyId` | empresa impersonada |
| `reason` | String — obrigatório (`@db` String, sem nullable) |
| `ipAddress`, `userAgent` | rastreio |
| `startedAt`, `endedAt`, `expiresAt` | ciclo |

✅ Modelo completo para auditoria. Falta confirmar se o **endedAt** é setado no logout/expiração ou só na sessão atual. ⚪

### 2.20 `GlobalAudit`

**Linhas:** 2137–2152. Tabela genérica de auditoria.

| Campo | Tipo |
|---|---|
| `actorType`, `actorId` | quem (admin, user, system) |
| `companyId` | sobre qual tenant |
| `action` | string |
| `metadata` Json | conteúdo |
| `ipAddress` |  |

**🟡 Sem TTL/partitioning** — tabela cresce indefinidamente.

## 3. Soft delete — cobertura

Models com `deletedAt`:
1. `Customer`
2. `Product`
3. `Sale`
4. `Quote`
5. `QuoteItem`
6. `ServiceOrder`
7. `StockMovement` (?? aparece no grep mas não muito usado)
8. `Brand`, `Category`, `Color`, `Shape` (cadastros catálogo)
9. `Invite`, `EmailQueue`, `SlaConfig`, `ProductCampaign`
10. `Prescription` ❌ **NÃO TEM** — ver §2.8 (LGPD!)
11. `SalePayment` ❌
12. `AccountReceivable` ❌ **NÃO TEM** — só status CANCELED, sem trilha
13. `AccountPayable` ❌
14. `CashShift`, `CashMovement` ❌ — financeiro não permite delete
15. `User` ❌ — só `active` boolean
16. `BranchStock` ❌
17. `Commission` ❌
18. `Refund` ❌

**Avaliação:** padrão **inconsistente**. Vendas e cadastros têm soft delete; financeiro/auditoria/comissão não. Possíveis intenções:
- ✅ Financeiro: nunca deletar (correto contabilmente)
- 🟠 `Prescription`: deveria ter (dado de saúde, exige rastreabilidade de exclusão)
- 🟠 `AccountReceivable`: status CANCELED + reversedAt cobre parcialmente

## 4. 🚨 Models sem `companyId` (precisam atenção multi-tenant)

| Model | Tem companyId? | Substituto | Nota |
|---|---|---|---|
| `BranchStock` | ❌ | `branchId` (e branch.companyId) | precisa JOIN |
| `CashbackConfig` | ❌ | `branchId @unique` | **config por filial** |
| `CustomerCashback` | ❌ | `customerId` + `branchId` | saldo por filial |
| `CashbackMovement` | ❌ | via `customerCashbackId` | herda |
| `ReminderConfig` | ❌ | `branchId @unique` | por filial |
| `Permission` | ❌ | é catálogo global | OK |
| `RolePermission` | ❌ | catálogo global | OK |
| `PrescriptionValues` | ❌ | via `prescriptionId` | OK (1:1) |
| `FrameDetail`, `ContactLensDetail`, `AccessoryDetail`, `ServiceDetail`, `LensServiceDetail` | ❌ | via `productId` | OK (1:1) |
| `SaleItem`, `SalePayment` | ❌ | via `saleId` | OK |
| `QuoteItem` | ❌ | via `quoteId` | OK |
| `ServiceOrderItem`, `ServiceOrderHistory`, `QualityChecklist` | ❌ | via `serviceOrderId` | OK |
| `RefundItem` | ❌ | via `refundId` | OK |
| `SaleItemLot` | ❌ | via `saleItemId` | OK |

**🔴 Findings significativos:**
- **Cashback é por FILIAL, não por empresa** (CashbackConfig, CustomerCashback, CashbackMovement). Cliente acumula em filial A e **não pode usar em filial B** da mesma empresa. ⚪ Pode ser intencional (decisão de produto), mas é uma limitação importante.
- **Reminders são por filial.** Idem.

## 5. Numeração sequencial

| Tipo | Modelo | Como |
|---|---|---|
| Numeração de OS | `ServiceOrder.number` Int + `@@unique([companyId, number])` | **por EMPRESA, não por filial** |
| `Counter` (model) | `@@unique([companyId, key])` — provavelmente usado para gerar números | atomicidade depende de implementação |
| Number genérico | `SupportTicket.number` String @unique global | global |
| `code` | `Branch.code`, `Lab.code`, `Agreement.code`, `CashRegister.code` | unique por empresa |

**🟡 ServiceOrder por empresa pode causar gaps em multi-filial** (ex: filial A cria #100, filial B cria #101 simultaneamente — ambas válidas mas uma das filiais "salta"). Não é gap real, só "desordem" entre filiais. ⚪ Verificar em runtime.

## 6. Enums (75 totais)

Lista resumida dos críticos:

```
UserRole              = ADMIN, GERENTE, VENDEDOR, CAIXA, ATENDENTE
SaleStatus            = OPEN, COMPLETED, CANCELED, REFUNDED
PaymentMethod         = CASH, PIX, DEBIT_CARD, CREDIT_CARD, BOLETO,
                        STORE_CREDIT, CHEQUE, AGREEMENT, OTHER, BALANCE_DUE
PaymentStatus         = PENDING, RECEIVED, VOIDED, REFUNDED
CashShiftStatus       = OPEN, CLOSED
CashMovementType      = SALE_PAYMENT, REFUND, SUPPLY, WITHDRAWAL, ADJUSTMENT,
                        OPENING_FLOAT, CLOSING
CashDirection         = IN, OUT
ProductType           = FRAME, CONTACT_LENS, ACCESSORY, SUNGLASSES,
                        LENS_SERVICE, SERVICE, OPHTHALMIC_LENS,
                        OPTICAL_ACCESSORY, LENS_SOLUTION, CASE,
                        CLEANING_KIT, OTHER
ServiceOrderStatus    = DRAFT, APPROVED, SENT_TO_LAB, IN_PROGRESS, READY,
                        DELIVERED, CANCELED
ServiceOrderPriority  = URGENT, HIGH, NORMAL, LOW
WarrantyStatus        = ACTIVE, IN_ANALYSIS, APPROVED, DENIED, EXPIRED, USED
WarrantyType          = FRAME, LENS, MOUNTING, ADJUSTMENT
WarrantyClaimStatus   = PENDING, ANALYZING, APPROVED, REJECTED, IN_PROGRESS,
                        COMPLETED, CANCELED
FiscalStatus          = NOT_REQUESTED, PENDING, AUTHORIZED, FAILED, CANCELED
QuoteStatus           = DRAFT, PENDING, SENT, APPROVED, CONVERTED, EXPIRED,
                        CANCELED, LOST
QuoteItemType         = PRODUCT, SERVICE, CUSTOM
CommissionStatus      = PENDING, APPROVED, PAID, CANCELED
StockMovementType     = PURCHASE, CUSTOMER_RETURN, TRANSFER_IN, TRANSFER_OUT,
                        ADJUSTMENT, SALE, LOSS, SUPPLIER_RETURN,
                        INTERNAL_USE, OTHER
StockReservationStatus= RESERVED, RELEASED, CONSUMED
StockAdjustmentType   = ?
StockAdjustmentStatus = PENDING, …
StockTransferStatus   = PENDING, COMPLETED, … (verificar)
CashbackMovementType  = CREDIT, DEBIT, EXPIRED, ADJUSTMENT, BONUS
AccountPayableStatus  = PENDING, ?, PAID, ?, CANCELED
AccountReceivableStatus= PENDING, RECEIVED, OVERDUE?, CANCELED
AccountCategory       = (categorias contábeis)
RuleCategory          = ?
SubscriptionStatus    = (SaaS)
BillingCycle          = MONTHLY, YEARLY
InvoiceStatus         = (SaaS billing)
AdminRole             = SUPER_ADMIN, …
TicketPriority        = LOW, MEDIUM, HIGH, URGENT?
TicketStatus          = OPEN, …, RESOLVED
HealthCategory        = HEALTHY, AT_RISK, …
OnboardingStatus      = PENDING_INVITE, …, COMPLETED
InviteStatus          = …
EmailStatus           = …
CampaignScope, CampaignBonusType, CampaignCountMode, CampaignStatus,
MinimumCountMode, BonusEntryStatus  = sistema de campanhas
CustomerSegment       = …
ContactType, ContactChannel, ContactStatus, ContactResult
ReminderStatus, CrmReminderStatus
GoalStatus
LensType
RefundStatus          = PENDING, COMPLETED, CANCELED?
ReconciliationSource, ReconciliationBatchStatus, ReconciliationItemStatus,
ReconciliationItemDirection, ReconciliationResolutionType
FinanceEntryType, FinanceEntrySide, FinanceAccountType, ChartAccountKind
DunningAction, DunningChannel, DunningEventStatus
AdminNotificationType, ReportType
InvoicePaymentMethod
CompanySegment, LeadSource, TagCategory, ActivityType, ActorType
BarcodeType
AgreementType         = HEALTH_PLAN, CORPORATE, UNION, ASSOCIATION, PARTNERSHIP
```

## 7. 🔥 Auditoria monetária consolidada

### 7.1 Inconsistências de precisão

| Padrão | Onde aparece |
|---|---|
| `Decimal(12,2)` | **majoritário** — Sale, SaleItem, SaleItem, Quote, AccountPayable, AccountReceivable, CashShift, CashMovement, Refund, Product, BranchStock |
| `Decimal(10,2)` | `Sale.cashbackUsed`, `SalePayment.feeAmount/netAmount`, `CardFeeRule.feeFixed`, `CashbackConfig.minPurchaseToEarn`, `LensTreatment.price`, `RecurringExpense.amount` (não — é 12,2), `CustomerCashback.balance/totalEarned/totalUsed/totalExpired` |
| `Decimal(14,2)` | `FinanceEntry.amount`, `FinanceAccount.balance`, `InventoryLot.totalCost`, `SaleItemLot.totalCost` |
| `Decimal(5,2)` (percentual) | `marginPercent`, `discountPercent`, `finePercent`, `interestPercent`, `defaultCommissionPercent` |
| `Decimal(5,4)` (taxa fina) | `feePercent` em SalePayment, CardFeeRule, CardReceivable |
| `Decimal(12,1)` ou `(5,1)` | medidas (`FrameMeasurement`) |

**🔴 CONFIRMADO**: limites diferentes podem causar overflow silencioso. Exemplo: uma venda muito grande (R$ 9.999.999,99 cabe em 12,2 → 9 dígitos antes do ponto), mas se o sistema computar `feeAmount = total * feePercent` em uma venda perto do limite, pode estourar `(10,2)` que só guarda R$ 99.999.999,99 (9 dígitos).

### 7.2 Onde mistura Decimal × number

- Routes serializam `Number(decimal)` antes de devolver JSON (ver rel. 03)
- Frontend recebe number e devolve number → backend converte de volta
- 🟠 risco real para valores acima de `Number.MAX_SAFE_INTEGER / 100` (~R$ 90 trilhões — improvável, mas conceitualmente)

### 7.3 Cents-as-Int (centavos como inteiro)

❌ **Não usado.** Apenas em `Plan.priceMonthly`/`priceYearly` (Int em centavos — visto no rel. 03 `/api/admin/seed`). Resto do sistema usa Decimal.

## 8. Achados / red flags do schema

| # | Achado | Classe | Onde |
|---|---|---|---|
| D1 | `Product.stockQty` (cache global) coexiste com `BranchStock.quantity` (verdade por filial) sem trigger de sincronia | 🔴 | linhas 631 vs 2282 |
| D2 | `CashbackConfig`/`CustomerCashback` são por filial, sem `companyId` | 🟠/🔵 | linhas 1726, 1741 |
| D3 | `Customer.acceptsMarketing` default `true` (LGPD opt-in violado) | 🟠 | linha 385 |
| D4 | `Prescription` (dado sensível de saúde) **sem soft delete** | 🟠 | linha 732 |
| D5 | `Customer` **sem campos de consentimento LGPD** | 🟠 | linha 367-419 |
| D6 | Schema permite 2 `CashShift` OPEN simultâneos (sem partial unique index) | 🟠 | linha 1259 |
| D7 | `AccountReceivable` sem unique para evitar duplicação por parcela | 🟠 | linha 1538 |
| D8 | `RecurringExpense` → `AccountPayable` sem unique de período | 🟠 | linha 1506 |
| D9 | `FinanceEntry` TEM unique de idempotência `[companyId, sourceType, sourceId, type, side]` ✅ | 🟢 | linha 2732 |
| D10 | `Quote.convertedToSaleId @unique` impede dupla conversão a nível de DB ✅ | 🟢 | linha 988 |
| D11 | `Sale.cashbackUsed` Decimal(10,2) vs total Decimal(12,2) | 🟡 | linha 1069 |
| D12 | `SalePayment.feeAmount/netAmount` Decimal(10,2), `amount` Decimal(12,2) | 🟡 | linha 1137-1138 |
| D13 | `FinanceEntry.amount` Decimal(14,2) — limite diferente de Sale | 🟡 | linha 2716 |
| D14 | `prescriptionData` Json em ServiceOrder, QuoteItem (sem schema validado) | 🟡 | linhas 815, 1037 |
| D15 | Polimorfismo via String em `CashMovement.originType/originId` (sem FK) | 🟡 | linhas 1272-1273 |
| D16 | `RecurringExpense.frequency` String, deveria ser enum | 🟡 | linha 1515 |
| D17 | `CardReceivable.status`, `Refund.refundMethod` Strings sem enum | 🟡 | linhas 1171, 2791 |
| D18 | `GlobalAudit` sem TTL/particionamento | 🔵 | linha 2137 |
| D19 | `User` sem soft delete (só `active` boolean) | 🔵 | linha 277 |
| D20 | Numeração `ServiceOrder.number` por empresa, não por filial | 🟡/🔵 | linha 843 |
| D21 | `marginPercent` em Product/BranchStock duplicado e calculado redundantemente | 🟡 | linhas 629, 2289 |
