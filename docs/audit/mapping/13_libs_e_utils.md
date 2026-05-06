# 13 — Libs e Utils

> 38 arquivos em `src/lib/`. Detalhamento dos críticos.

## 1. Inventário rápido

```
admin-auth-helpers.ts       admin-session.ts          ⭐ rel. 06
animations.ts               api-response.ts           ⭐ §6
auth-helpers.ts             ⭐ rel. 03/05
auth-permissions.ts         ⭐ rel. 05
constants.ts                counter.ts
customer-segments.ts        date-utils.ts             ⭐⭐ §2
default-messages.ts         error-handler.ts          ⭐ §5
excel-utils.ts              get-tenant.ts             ⭐ rel. 06
health-score.ts             installment-utils.ts      ⭐⭐ §3
network-helpers.ts          payment-labels.ts         ⭐ §4
payment-methods.ts          ⭐ §4
pdf-utils.ts                penalty-utils.ts          ⭐ §7
permissions.ts              ⭐ rel. 05
plan-features.ts            plan-limits.ts
prisma-audit-middleware.ts  prisma-tenant.ts          ⭐ rel. 06
prisma.ts                   product-price.ts
rate-limit.ts               ⭐ §8
report-export.ts            soft-delete.ts            ⭐ §9
stock-utils.ts              ⭐ rel. 09
subscription.ts             supabase.ts
utils-landing.ts            utils.ts
validate-branch.ts          ⭐ rel. 06
└── validations/            (Zod schemas)
```

## 2. ⭐⭐ `date-utils.ts` (127 linhas)

**Excelente implementação.** Helper completo para timezone São Paulo (`America/Sao_Paulo`) usando `date-fns-tz`.

### Funções
| Função | Uso |
|---|---|
| `toLocalTime(utcDate)` | UTC → SP (para EXIBIÇÃO) |
| `toUTCFromLocal(localDate)` | SP → UTC (para SALVAR) |
| `dateOnlyToUTC(dateStr)` | "YYYY-MM-DD" → UTC representando meio-dia em SP — evita o bug de "23/03 vira 22/03" |
| `startOfLocalDay(date)` | Início do dia em SP → UTC (para filtros de relatório) |
| `endOfLocalDay(date)` | Fim do dia em SP → UTC |
| `startOfLocalMonth(date?)` | Início do mês em SP → UTC |
| `endOfLocalMonth(date?)` | Fim do mês em SP → UTC |
| `getLocalHour(utcDate)` | Hora em SP (0-23) |
| `formatDateBR(utcDate)` | "DD/MM/YYYY" (extrai UTC direto, evita bug date-only) |
| `formatDateTimeBR(utcDate)` | "DD/MM/YYYY HH:mm" (com timezone SP) |

### ✅ Boas práticas
- TIMEZONE constante (`"America/Sao_Paulo"`)
- Documentação clara de quando usar cada função
- Trata bug clássico de "date-only string em UTC vira dia anterior em SP"

### 🚨 Problema
**Várias rotas NÃO usam `date-utils`** (visto no rel. 11):
- `/api/dashboard/metrics` faz offset UTC-3 manual em vez de usar `startOfLocalDay`
- `/api/dashboard/sales-last-7-days` usa `subDays(today, 6)` sem timezone
- `/api/finance/reports/dre` usa `parseISO` direto

🟠 **Inconsistência crítica:** boa lib existe mas adoção parcial.

## 3. ⭐⭐ `installment-utils.ts` (75 linhas)

### `calculateInstallments(total, count, firstDueDate, intervalDays=30)`

**Lógica:** ✅ correta
```ts
const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
const remainder = totalAmount - baseAmount * count;
// Última parcela recebe o remainder
if (i === count - 1) amount += remainder;
```

🟢 **Soma das parcelas == total exato.** Trata corretamente centavos.

### `validateCreditLimit(customerId, requestedAmount, companyId)`

```ts
// TODO: Implementar se houver regra de limite de crédito por cliente
// Por enquanto, sempre aprova
return { approved: true };
```

🔴 **STUB. Sempre retorna aprovado.** Logo, a chamada em `sale.service.ts:310-321`:
```ts
const creditCheck = await validateCreditLimit(...)
if (!creditCheck.approved) throw ...
```
**É teatro.** Cliente pode comprar STORE_CREDIT sem nenhum limite. 🔴 grave para uma ótica que vende a prazo.

## 4. ⭐ `payment-methods.ts` + `payment-labels.ts`

### `payment-methods.ts` (84 linhas)
- `ALL_PAYMENT_METHODS[]` — config centralizada de cada método (id Prisma, onboardingId, label, icon, color)
- `DEFAULT_PAYMENT_METHOD_IDS` — métodos default no onboarding
- `PAYMENT_METHOD_LABELS` — Record<id, label> derivado
- `ONBOARDING_TO_PRISMA` — mapping
- **Constantes de comportamento:**
  - `METHODS_IN_CASH = ["CASH", "PIX", "DEBIT_CARD"]` — entram no caixa físico
  - `METHODS_A_PRAZO = ["STORE_CREDIT", "CREDIT_CARD", "BALANCE_DUE"]`
  - `METHODS_WITH_RECEIVABLE = ["STORE_CREDIT", "BALANCE_DUE"]`
  - `METHODS_REQUIRE_CUSTOMER = ["STORE_CREDIT", "BALANCE_DUE"]`
- `getEnabledPaymentMethods(onboardingIds[])` — helper para filtrar habilitados

✅ **Centralização excelente.** Mas a constante `METHODS_IN_CASH` define DEBIT_CARD como caixa físico, **enquanto a doc do enum diz "à vista"** — DEBIT é à vista mas não é dinheiro físico (é cartão). Conceitualmente OK (cai no extrato como recebimento da operadora — pode estar tratado como caixa para compatibilidade prática).

### `payment-labels.ts` (21 linhas)
Provavelmente helper trivial: `getPaymentLabel(method)` → string. ⚪ não lido inteiro.

## 5. ⭐ `error-handler.ts` (236 linhas) — não lido em detalhe

Provavelmente:
- `AppError` class
- `ERROR_CODES` enum (FORBIDDEN, VALIDATION_ERROR, NOT_FOUND, etc.)
- `handleApiError(error)` → `NextResponse` com status apropriado
- Helpers: `notFoundError`, `unauthorizedError`, `forbiddenError`, `businessRuleError`

✅ Padrão consistente — usado em ~239 das 254 routes (rel. 03).

## 6. ⭐ `api-response.ts` (155 linhas)

Provavelmente: `paginatedResponse`, `createdResponse`, `okResponse`, etc. — helpers para padronizar JSON de resposta.

## 7. ⭐ `penalty-utils.ts` (60 linhas)

`calculatePenalties(account, asOfDate)` — calcula multa+juros+desconto baseado em `account.finePercent`, `interestPercent`, `graceDays`, `dueDate` vs `asOfDate`. Usado em `/api/accounts-receivable/receive-multiple` (rel. 03 §4.7).

⚪ implementação não lida — provavelmente:
1. Se `daysOverdue <= graceDays` → 0
2. `fine = amount * finePercent / 100`
3. `interest = amount * interestPercent / 100 * (daysOverdue - graceDays)`

## 8. ⭐ `rate-limit.ts` (69 linhas)

### Implementação
- `Map<string, {count, resetTime}>` em memória do processo
- Limpeza estocástica a cada ~100 checks (`Math.random() < 0.01`)
- `checkRateLimit(key, config)` → boolean
- `rateLimitResponse(key, config)` → `Response | null` (com `Retry-After` header)

### 🟠 Limitações
- **In-memory:** Vercel serverless reseta por cold start. Mesmo IP em duas regiões/contêineres tem buckets separados.
- **Não distribuído:** sem Redis. Para ataques DDoS distribuídos é inútil — só protege contra burst do mesmo container.
- **Comentário do autor:** "objetivo é proteger contra burst, não contra ataques distribuídos" — aceita as limitações.

### Adoção
Apenas **3 routes** (rel. 03 §6): `/api/sales`, `/api/cash/shift`, `/api/cash/shift/close`.

🟠 **Cobertura insuficiente.** Login, OCR, exports XLSX, geração de PDF, geração de barcode-image — todos sem.

## 9. ⭐ `soft-delete.ts`

⚪ não lido. Provavelmente helper para queries que filtram `deletedAt: null`. Como apenas 6 models têm `deletedAt`, uso é limitado.

## 10. Outros utils mencionados

| Lib | Função |
|---|---|
| `prisma.ts` | Cria cliente Prisma único (singleton) |
| `prisma-audit-middleware.ts` | Middleware Prisma para auditoria? ⚪ |
| `excel-utils.ts` | Helpers para `xlsx` (geração de planilhas) |
| `pdf-utils.ts` | Helpers para `jspdf` |
| `report-export.ts` | Helpers para exportar relatórios |
| `health-score.ts` | Cálculo de health score do tenant |
| `subscription.ts` | `checkSubscription(companyId)` — usado em layout |
| `plan-features.ts`, `plan-limits.ts` | Features e limites por plano |
| `customer-segments.ts` | Segmentação de clientes (CRM) |
| `default-messages.ts` | Mensagens padrão (WhatsApp, etc.) |
| `product-price.ts` | Helpers de cálculo de preço (margem, etc.) |
| `network-helpers.ts` | Helpers para Network (rede) — rel. 06 |
| `supabase.ts` | Cliente Supabase (provavelmente upload de imagens) |
| `constants.ts` | Constantes globais |
| `counter.ts` | Helpers para `Counter` model (numeração) |
| `animations.ts` | Variantes Framer Motion |
| `utils.ts` | `cn()` (class merge), helpers diversos |
| `utils-landing.ts` | Específicos da landing |

### `validations/` (subdiretório)
Provavelmente schemas Zod:
- `sale.schema.ts` (visto)
- `quote.schema.ts` (visto)
- `service-order.schema.ts` (visto)
- `cash.schema.ts` (visto)
- `customer.schema.ts`, `product.schema.ts`, `cashback.schema.ts`, etc.

## 11. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| N1 | `date-utils.ts` é completo e correto, mas **adoção parcial** — várias rotas usam `parseISO`/`new Date` direto | 🟠 | grep |
| N2 | `validateCreditLimit` é **stub** que sempre aprova — sale.service usa achando que valida | 🔴 | `installment-utils.ts:67-75` |
| N3 | `calculateInstallments` trata centavos corretamente (última parcela recebe resto) | 🟢 | `installment-utils.ts:31-44` |
| N4 | `payment-methods.ts` centraliza configuração e regras — ✅ | 🟢 | `payment-methods.ts` |
| N5 | `rate-limit.ts` in-memory — não funciona em escala distribuída | 🟡 | `rate-limit.ts` |
| N6 | Rate limit aplicado em apenas 3 routes — login, OCR, export, barcode-gen sem proteção | 🟠 | rel. 03 §6 |
| N7 | Apenas 6 models com `deletedAt` — `soft-delete.ts` impacto pequeno | 🔵 | rel. 04 §3 |
| N8 | Prisma audit middleware (`prisma-audit-middleware.ts`) — uso e cobertura não auditados | ⚪ | grep |
| N9 | Helpers de timezone usados inconsistentemente em relatórios | 🟠 | rel. 11 |
| N10 | Validation schemas (`lib/validations/*`) — boa estrutura mas 64% das routes não validam body com Zod | 🟠 | rel. 03 |
