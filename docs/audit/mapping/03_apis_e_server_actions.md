# 03 — APIs e Server Actions

> 254 API routes mapeadas. Server Actions: ⚪ NÃO ENCONTRADO uso de `"use server"` em arquivos `.ts`/`.tsx` separados (todos os mutations passam por `/api/*`).

## 0. Padrão arquitetural detectado

**Padrão repetido em ~85% das routes:**
```ts
export async function POST(request: Request) {
  try {
    // 1. Auth (uma das formas):
    const session = await auth();
    if (!session?.user?.id) throw new Error("...");
    //   OU
    await requireAuth();

    // 2. Tenant
    const companyId = await getCompanyId();   // (lib/auth-helpers.ts)
    //   às vezes também: const branchId = await getBranchId();

    // 3. Rate limit (raríssimo, ver §6)
    const rl = rateLimitResponse(`...`, { maxRequests: N, windowMs: 60_000 });
    if (rl) return rl;

    // 4. Permissão (granular)
    await requirePermission("modulo.acao");

    // 5. Validação Zod (em ~36% das routes)
    const body = await request.json();
    const data = schema.parse(body);  // ou .safeParse

    // 6. Delegação ao service (lógica em src/services/*.ts)
    const result = await someService.create(data, companyId, userId);

    // 7. Serialização Decimal → number antes de responder
    return createdResponse(serializedResult);
  } catch (error) {
    return handleApiError(error);  // (lib/error-handler.ts)
  }
}
```

**Onde a transação acontece:** dentro do **service**, não da route. `prisma.$transaction(async (tx) => { ... })` aparece em **24 routes** + **12 services** = ~36 fluxos transacionais.

## 1. Estatísticas globais

| Métrica | Valor | Observação |
|---|---|---|
| Total routes | **254** | `find src/app/api -name route.ts` |
| Routes com auth (qualquer forma) | **239 (94%)** | grep por `requireAuth\|getCompanyId\|getBranchId\|getUserId\|requireRole\|requirePermission\|getAdminSession\|await auth()` |
| Routes **sem nenhum auth** | **15** (ver §5) | das quais 13 são intencionalmente públicas |
| Routes que filtram por `companyId` | **214** | grep `companyId` (não exclui falsos positivos) |
| Routes com `requirePermission(...)` | **76** | granularidade fina |
| Routes que usam `prisma.$transaction` | **24** | (services adicionam mais) |
| Routes com Zod `parse`/`safeParse` | **92** (36%) | 🟠 **64% das routes não validam body** |
| Routes com **rate limit** | **3** | 🟠 muito baixo (ver §6) |
| Server Actions (`"use server"`) | **0** dedicadas | tudo via API routes |

## 2. Helpers de auth identificados (`src/lib/auth-helpers.ts`)

| Helper | Comportamento | Onde usar |
|---|---|---|
| `requireAuth()` | Lança 401 se sem sessão | abre o handler |
| `requireRole(roles[])` | Lança 403 se role ≠ permitida | gates por role |
| `requirePermission(code)` | (de `auth-permissions.ts`, exportado por `auth-helpers`) — checa permissão granular via `PermissionService.userHasPermission()` | mutations sensíveis |
| `getCompanyId()` | Lança 401 se sem companyId; retorna string | TODA query/mutation |
| `getBranchId()` | Idem | quando filial obrigatória |
| `getUserId()` | Idem | quando precisa do user |
| `getUserSession()` | Retorna session ou null (não lança) | leituras opcionais |
| `checkPermission(roles[])` | boolean (não lança) | UI-condicionais server-side |
| `isAdmin()` / `isAdminOrManager()` | atalhos | — |

> **Nota:** `requirePermission` está em **`src/lib/auth-permissions.ts`** (re-exportado de `auth-helpers.ts:189`). Verificado no relatório 05.

**Outro helper paralelo (não usado nas routes):** `src/middleware/require-permission.ts` — exporta `requirePermission(request, code)` que faz o mesmo via `PermissionService` direto. ⚪ INCERTO se algum dia foi usado; busca em `src/app/api` retorna 0 ocorrências dessa assinatura. Provavelmente legado.

## 3. Tabela completa — TODAS as 254 routes

> Legenda das colunas:
> - **Auth**: `RA`=requireAuth, `A`=`auth()`, `AS`=adminSession, `RR`=requireRole, `—`=nenhum
> - **Perm**: string passada a `requirePermission(...)` (vazio = role-based ou sem checagem granular)
> - **Co**: filtra por companyId (Y/N — heurístico, grep por "companyId" no arquivo)
> - **Tx**: usa `$transaction` na própria route (Y/N) — services podem adicionar transação
> - **Zod**: usa `.parse`/`.safeParse` (Y/N)
> - **Rate**: tem rate limit (Y/N)

### 3.1 Vendas, OS, orçamentos, prescrições

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/sales` | GET, POST | A,RA | `sales.create` | Y | N (no service) | Y | **Y** |
| `/api/sales/[id]` | GET, PATCH, DELETE | A,RA | `sales.cancel` (DELETE) | Y | (service) | Y | N |
| `/api/sales/[id]/refund` | POST | RA | — | Y | **Y** | N | N |
| `/api/sales/[id]/refunds` | GET | RA | — | Y | N | N | N |
| `/api/sales/[id]/reactivate` | POST | A | `sales.cancel` (INCERTO) | Y | (service) | N | N |
| `/api/sales/[id]/cashback` | GET | RA | — | Y | N | N | N |
| `/api/sales/[id]/carne` | GET | RA | — | Y | N | N | N |
| `/api/sales/[id]/pdf` | GET | RA | — | Y | N | N | N |
| `/api/sales/[id]/seller` | PATCH | A | `sales.edit_seller` | Y | N | Y | N |
| `/api/quotes` | GET, POST | A,RA | `quotes.create` | Y | (service) | Y | N |
| `/api/quotes/[id]` | GET, PATCH, DELETE | A,RA | `quotes.edit`/`quotes.delete` | Y | (service) | Y | N |
| `/api/quotes/[id]/convert` | POST | A | `quotes.convert` | Y | (service: `quote.service.ts:735`) | Y | N |
| `/api/quotes/[id]/cancel` | POST | A | `quotes.edit` | Y | (service) | N | N |
| `/api/quotes/[id]/follow-up` | POST | A | — | Y | N | N | N |
| `/api/quotes/[id]/follow-ups` | GET | RA | — | Y | N | N | N |
| `/api/quotes/[id]/mark-sent` | POST | A | — | Y | N | N | N |
| `/api/quotes/[id]/status` | PATCH | A | — | Y | N | Y | N |
| `/api/quotes/stats` | GET | RA | — | Y | N | N | N |
| `/api/service-orders` | GET, POST | A,RA | `service_orders.create` | Y | (service) | Y | N |
| `/api/service-orders/[id]` | GET, PATCH, DELETE | A,RA | `service_orders.edit`, `service_orders.delete` | Y | (service) | Y | N |
| `/api/service-orders/[id]/convert` | POST | A | — | Y | (service) | N | N |
| `/api/service-orders/[id]/deliver` | POST | A | — | Y | (service) | N | N |
| `/api/service-orders/[id]/revert` | POST | A | — | Y | (service) | N | N |
| `/api/service-orders/[id]/status` | PATCH | A | — | Y | (service) | Y | N |
| `/api/service-orders/[id]/warranty` | POST | A | — | Y | (service) | N | N |
| `/api/prescriptions` | GET, POST | RA | — | Y | N | N | N |
| `/api/prescriptions/[id]` | GET, PATCH, DELETE | RA | — | Y | N | N | N |
| `/api/prescriptions/customer/[customerId]` | GET | RA | — | Y | N | N | N |
| `/api/ocr/prescription` | POST | RA | — | N (?) | N | N | N |
| `/api/upload/prescription-image` | POST | RA | — | Y | N | N | N |

### 3.2 Caixa e Financeiro

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/cash/shift` | GET, POST | A,RA | `cash_shift.open` | Y | (service: `cash.service.ts:46`) | Y | **Y** |
| `/api/cash/shift/close` | POST | A | `cash_shift.close` | Y | (service) | Y | **Y** |
| `/api/cash/shift/[id]` | GET | RA | — | Y | N | N | N |
| `/api/cash/movements` | GET, POST | A,RA | `cash.move` (INCERTO) | Y | N | Y | N |
| `/api/cash/debug` | GET | RA | — | Y | N | N | N (gated por `NODE_ENV === "development"`) |
| `/api/cash-registers` | GET, POST | RA | — | Y | N | Y | N |
| `/api/cash-registers/[id]/transactions` | GET | RA | — | Y | N | N | N |
| `/api/cash-terminals` | GET, POST | RA | — | Y | N | Y | N |
| `/api/accounts-payable` | GET, POST, PATCH, DELETE | A,RA | `accounts_payable.manage` | Y | **Y** | Y | N |
| `/api/accounts-receivable` | GET, POST, PATCH, DELETE | A,RA | `accounts_receivable.manage` | Y | **Y** | Y | N |
| `/api/accounts-receivable/[id]` | GET, PATCH, DELETE | A,RA | `accounts_receivable.manage` | Y | (service) | Y | N |
| `/api/accounts-receivable/[id]/penalties` | GET | RA | — | Y | N | N | N |
| `/api/accounts-receivable/[id]/receipt` | GET | RA | — | Y | N | N | N |
| `/api/accounts-receivable/receive-multiple` | POST | A | `accounts_receivable.manage` | Y | **Y** | Y | N |
| `/api/finance/accounts` | GET, POST | RA | — | Y | N | Y | N |
| `/api/finance/accounts/[id]/statement` | GET | RA | — | Y | N | N | N |
| `/api/finance/aggregate` | GET | RA | — | Y | N | N | N |
| `/api/finance/backfill-expense-entries` | POST | A | `financial.manage` | Y | **Y** | N | N |
| `/api/finance/bi` | GET | RA | — | Y | N | N | N |
| `/api/finance/bi/stock-aging` | GET | RA | — | Y | N | N | N |
| `/api/finance/card-receivables` | GET | RA | — | Y | N | N | N |
| `/api/finance/chart` | GET | RA | — | Y | N | N | N |
| `/api/finance/dashboard` | GET | RA | — | Y | N | N | N |
| `/api/finance/entries` | GET, POST, PATCH | A,RA | `financial.manage` | Y | **Y** | Y | N |
| `/api/finance/reconciliation/batches` | GET, POST | RA | — | Y | (service) | Y | N |
| `/api/finance/reconciliation/batches/[id]` | GET, PATCH, DELETE | RA | — | Y | (service) | Y | N |
| `/api/finance/reconciliation/batches/[id]/auto-match` | POST | RA | — | Y | **Y** | N | N |
| `/api/finance/reconciliation/batches/[id]/close` | POST | RA | — | Y | **Y** | N | N |
| `/api/finance/reconciliation/batches/[id]/import` | POST | RA | — | Y | (service) | N | N |
| `/api/finance/reconciliation/batches/[id]/items` | GET | RA | — | Y | N | N | N |
| `/api/finance/reconciliation/batches/[id]/items/[itemId]` | GET, PATCH | RA | — | Y | N | N | N |
| `/api/finance/reconciliation/batches/[id]/items/[itemId]/resolve` | POST | RA | — | Y | **Y** | N | N |
| `/api/finance/reconciliation/rules` | GET, POST | RA | — | Y | (service) | Y | N |
| `/api/finance/reconciliation/search-payments` | GET | RA | — | Y | N | N | N |
| `/api/finance/reconciliation/templates` | GET, POST | RA | — | Y | (service) | Y | N |
| `/api/finance/reports/cash-flow` | GET | RA | — | Y | N | N | N |
| `/api/finance/reports/dre` | GET | RA | — | Y | N | N | N |
| `/api/recurring-expenses` | GET, POST | RA | — | Y | N | Y | N |
| `/api/recurring-expenses/[id]` | GET, PATCH, DELETE | RA | — | Y | N | Y | N |
| `/api/recurring-expenses/generate` | POST | RA | — | Y | (service) | N | N |
| `/api/card-fees` | GET, POST | RA | — | Y | N | Y | N |

### 3.3 Cashback

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/cashback/config` | GET, POST | RA | — | Y | N | Y | N |
| `/api/cashback/balance/[customerId]` | GET | RA | — | Y | N | N | N |
| `/api/cashback/customer/[customerId]` | GET | RA | — | Y | N | N | N |
| `/api/cashback/customers` | GET | RA | — | Y | N | N | N |
| `/api/cashback/expiring` | GET | RA | — | Y | N | N | N |
| `/api/cashback/summary` | GET | RA | — | Y | N | N | N |
| `/api/cashback/validate` | POST | RA | — | Y | N | Y | N |

### 3.4 Estoque

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/stock-adjustments` | GET, POST | RA | `stock.adjust` | Y | (service) | Y | N |
| `/api/stock-adjustments/[id]` | GET, PATCH, DELETE | RA | `stock.adjust` | Y | (service) | Y | N |
| `/api/stock-adjustments/[id]/approve` | POST | RA | `stock.adjust` | Y | (service) | N | N |
| `/api/stock-adjustments/[id]/reject` | POST | RA | `stock.adjust` | Y | (service) | N | N |
| `/api/stock-movements` | GET, POST | RA | `stock.adjust` | Y | (service) | Y | N |
| `/api/stock-movements/transfer` | POST | RA | `stock.adjust` | Y | (service: `stock-movement.service.ts`) | Y | N |
| `/api/stock-transfers` | GET, POST | A | (role-check ADMIN auto-approve) | Y | **Y** | N | N |
| `/api/stock-transfers/[id]` | GET, PATCH, DELETE | A | — | Y | **Y** | N | N |
| `/api/inventory/lots` | GET, POST | RA | — | Y | **Y** | Y | N |

### 3.5 Cadastros

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/customers` | GET, POST | A,RA | `customers.create` | Y | N | Y | N |
| `/api/customers/[id]` | GET, PATCH, DELETE | A,RA | `customers.edit`/`delete` | Y | N | Y | N |
| `/api/customers/[id]/receivables` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/customers/export` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/customers/import` | POST | (getCompanyId) | `customers.create` | Y | N | N | N |
| `/api/customers/template` | GET | **NENHUM** ⚠️ | — | N | N | N | N |
| `/api/customers/filters` | GET | RA | — | Y | N | N | N |
| `/api/products` | GET, POST | A,RA | `products.create` | Y | (service) | Y | N |
| `/api/products/[id]` | GET, PATCH, DELETE | A,RA | `products.edit`/`delete` | Y | (service) | Y | N |
| `/api/products/[id]/barcodes` | GET, POST | RA | — | Y | N | Y | N |
| `/api/products/[id]/barcodes/[barcodeId]` | DELETE, PATCH | RA | — | Y | N | N | N |
| `/api/products/[id]/barcodes/generate-all` | POST | RA | — | Y | N | N | N |
| `/api/products/export` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/products/import` | POST | (getCompanyId) | `products.create` | Y | N | N | N |
| `/api/products/template` | GET | **NENHUM** ⚠️ | — | N | N | N | N |
| `/api/products/filters` | GET | RA | — | Y | N | N | N |
| `/api/products/print` | POST | RA | — | Y | N | N | N |
| `/api/products/search` | GET | RA | — | Y | N | N | N |
| `/api/products/search-by-barcode` | GET | RA | — | Y | N | N | N |
| `/api/suppliers` | GET, POST | RA | — | Y | N | Y | N |
| `/api/suppliers/[id]` | GET, PATCH, DELETE | RA | — | Y | N | Y | N |
| `/api/suppliers/{export,import,filters}` | … | RA | — | Y | N | N | N |
| `/api/suppliers/template` | GET | **NENHUM** ⚠️ | — | N | N | N | N |
| `/api/categories` | GET, POST | RA | — | Y | N | Y | N |
| `/api/brands` | GET, POST | RA | — | Y | N | Y | N |
| `/api/laboratories` | GET, POST | RA | — | Y | N | Y | N |
| `/api/laboratories/[id]` | GET, PATCH, DELETE | RA | — | Y | N | Y | N |
| `/api/laboratories/[id]/service-orders` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/lens-treatments` | GET, POST | RA | — | Y | N | Y | N |
| `/api/lens-treatments/[id]` | GET, PATCH, DELETE | RA | — | Y | N | Y | N |
| `/api/users` | GET, POST | A,RA | `users.create` | Y | (service) | Y | N |
| `/api/users/[id]` | GET, PATCH, DELETE | A,RA | `users.edit`/`delete` | Y | (service) | Y | N |
| `/api/users/[id]/permissions` | GET, PATCH | A | `permissions.manage` | Y | (service) | Y | N |
| `/api/users/[id]/permissions/reset` | POST | A | `permissions.manage` | Y | (service) | N | N |
| `/api/users/[id]/profile` | PATCH | A | — | Y | N | Y | N |
| `/api/users/sellers` | GET | RA | — | Y | N | N | N |
| `/api/branches` | GET, POST | RA | — | Y | N | Y | N |
| `/api/company` | GET, PATCH | A | `company.settings` | Y | N | Y | N |
| `/api/company/logo` | POST | A | `company.settings` | Y | N | N | N |
| `/api/company/payment-methods` | GET, PATCH | A | `company.settings` | Y | N | Y | N |
| `/api/company/settings` | GET, PATCH | A | `company.settings` | Y | N | Y | N |

### 3.6 Permissões / Settings / Onboarding / Plan

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/permissions` | GET | (getCompanyId) | — | N | N | N | N |
| `/api/permissions/by-module` | GET | (getCompanyId) | — | N | N | N | N |
| `/api/permissions/seed` | POST | RR (`["ADMIN"]`) | — | N | N | N | N |
| `/api/settings` | GET, PATCH | RA | — | Y | N | Y | N |
| `/api/settings/reset-message` | POST | RA | — | Y | N | N | N |
| `/api/settings/rules` | GET, POST | RA | — | Y | N | Y | N |
| `/api/settings/rules/[key]` | GET, PATCH, DELETE | RA | — | Y | N | Y | N |
| `/api/settings/rules/restore-defaults` | POST | RA | — | Y | N | N | N |
| `/api/onboarding` | GET, PATCH | (getCompanyId) | — | Y | N | N | N |
| `/api/plan-features` | GET | RA | — | Y | N | N | N |
| `/api/data-management/count` | GET | RR (?) | — | Y | N | N | N |
| `/api/data-management/delete` | POST | RR (`["ADMIN"]`) | — | Y | **Y** | Y | N |
| `/api/data-management/import/customers` | POST | RR | — | Y | N | N | N |
| `/api/data-management/import/products` | POST | RR | — | Y | N | N | N |

### 3.7 Dashboard / Relatórios

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/dashboard/metrics` | GET | (getCompanyId+getBranchId) | — | Y | N | N | N |
| `/api/dashboard/payment-distribution` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/dashboard/sales-last-7-days` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/dashboard/top-products` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/reports/branch-comparison` | GET | RA | — | Y | N | N | N |
| `/api/reports/card-settlement` | GET | RA | — | Y | N | N | N |
| `/api/reports/category-distribution` | GET | RA | — | Y | N | N | N |
| `/api/reports/commissions` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/reports/customers` | GET | RA | — | Y | N | N | N |
| `/api/reports/dashboard` | GET | RA | — | Y | N | N | N |
| `/api/reports/financial/accounts-payable` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/reports/financial/accounts-receivable` | GET | (getCompanyId) | — | Y | N | N | N |
| `/api/reports/financial/cash-history` | GET | RA | — | Y | N | N | N |
| `/api/reports/financial/dre` | GET | RA | — | Y | N | N | N |
| `/api/reports/optical` | GET | RA | — | Y | N | N | N |
| `/api/reports/optical/labs` | GET | RA | — | Y | N | N | N |
| `/api/reports/payment-methods` | GET | RA | — | Y | N | N | N |
| `/api/reports/products` | GET | RA | — | Y | N | N | N |
| `/api/reports/products/top-sellers` | GET | RA | — | Y | N | N | N |
| `/api/reports/sales/consolidated` | GET | RA | — | Y | N | N | N |
| `/api/reports/sales-evolution` | GET | RA | — | Y | N | N | N |
| `/api/reports/stock/no-movement` | GET | RA | — | Y | N | N | N |
| `/api/reports/stock/position` | GET | RA | — | Y | N | N | N |
| `/api/reports/summary` | GET | RA | — | Y | N | N | N |
| `/api/reports/team-performance` | GET | RA | — | Y | N | N | N |
| `/api/reports/temporal` | GET | RA | — | N (?) | N | N | N |
| `/api/reports/top-products` | GET | RA | — | Y | N | N | N |

### 3.8 CRM / Lembretes / Metas / Campanhas

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/crm/contacts` | GET | RA | — | Y | N | N | N |
| `/api/crm/goals` | GET, POST, PATCH | RA | — | Y | N | Y | N |
| `/api/crm/reminders` | GET | RA | — | Y | N | N | N |
| `/api/crm/reminders/counts` | GET | RA | — | Y | N | N | N |
| `/api/crm/reports` | GET | RA | — | Y | N | N | N |
| `/api/crm/settings` | GET, PATCH | RA | — | Y | N | Y | N |
| `/api/crm/templates` | GET, POST | RA | — | Y | N | Y | N |
| `/api/crm/templates/[segment]/message` | GET | RA | — | Y | N | N | N |
| `/api/reminders` | GET, POST | RA | — | Y | N | Y | N |
| `/api/reminders/[id]` | GET, PATCH, DELETE | RA | — | N (?) | N | Y | N |
| `/api/reminders/config` | GET, PATCH | RA | — | N (?) | N | Y | N |
| `/api/reminders/contacts` | GET | RA | — | N (?) | N | N | N |
| `/api/reminders/summary` | GET | RA | — | N (?) | N | N | N |
| `/api/goals` | GET, POST | RA | `goals.manage` | Y | (service) | Y | N |
| `/api/goals/commissions` | GET, POST | RA | — | Y | (service) | Y | N |
| `/api/goals/commissions/[id]` | GET, PATCH, DELETE | RA | — | Y | (service) | Y | N |
| `/api/goals/config` | GET, PATCH | RA | — | Y | N | Y | N |
| `/api/goals/dashboard` | GET | RA | — | Y | N | N | N |
| `/api/goals/monthly-summary` | GET | RA | — | Y | N | N | N |
| `/api/goals/sellers` | GET | RA | — | Y | N | N | N |
| `/api/goals/sellers-ranking` | GET | RA | — | Y | N | N | N |
| `/api/product-campaigns` | GET, POST | RA | — | Y | (service) | Y | N |
| `/api/product-campaigns/[id]` | GET, PATCH, DELETE | RA | — | Y | (service) | Y | N |
| `/api/product-campaigns/[id]/activate` | POST | RA | — | Y | (service) | N | N |
| `/api/product-campaigns/[id]/pause` | POST | RA | — | Y | (service) | N | N |
| `/api/product-campaigns/[id]/reconcile` | POST | RA | — | Y | (service) | N | N |
| `/api/product-campaigns/[id]/report` | GET | RA | — | Y | N | N | N |
| `/api/product-campaigns/[id]/simulate` | POST | RA | — | Y | N | Y | N |

### 3.9 Search / Misc

| Route | Methods | Auth | Perm | Co | Tx | Zod | Rate |
|---|---|---|---|---|---|---|---|
| `/api/search` | GET | RA | — | Y | N | N | N |
| `/api/barcodes/generate-image` | POST | **NENHUM** ⚠️ | — | N | N | N | N |

### 3.10 Auth / Public

| Route | Methods | Auth | Notas |
|---|---|---|---|
| `/api/auth/[...nextauth]` | (NextAuth handlers) | — | provedor de sessão |
| `/api/auth/activate` | POST | — | público (token na URL) — `prisma.$transaction` Y |
| `/api/auth/clear-session` | POST | — | público |
| `/api/auth/impersonate-session` | POST | — | público (validação interna) |
| `/api/auth/validate-invite` | GET | — | público |
| `/api/public/contact` | POST | — | público |
| `/api/public/plans` | GET | — | público |
| `/api/public/register` | POST | — | público — `prisma.$transaction` Y |

### 3.11 Admin SaaS (todas via cookie `admin.session-token`)

> Todas estas rotas são protegidas pelo **middleware** (`src/middleware.ts:26-67`) que valida `admin.session-token` com `jose.jwtVerify`. Dentro do handler, a maioria usa `getAdminSession()` para obter dados.

| Route | Methods | Tx | Notas |
|---|---|---|---|
| `/api/admin/auth/[...nextauth]`, `/auth/login`, `/auth/logout` | — | N | login admin (cookie próprio) |
| `/api/admin-auth/login`, `/logout`, `/me` | POST/GET | N | API alternativa de admin auth |
| `/api/admin/audit-logs` | GET | N | logs |
| `/api/admin/clientes` (12 rotas) | GET/POST/PATCH/DELETE | algumas Y (`actions`, `create`) | gestão de tenants |
| `/api/admin/companies/[id]/branches[/branchId]` | GET/POST/PATCH/DELETE | N | filiais por empresa |
| `/api/admin/companies/[id]/users[/userId][/permissions,reset-password]` | GET/POST/PATCH | **Y** em `users`, `[userId]`, `permissions`, `reset-password` | usuários por empresa |
| `/api/admin/company-users[/id]` | GET/POST/PATCH/DELETE | N | — |
| `/api/admin/export/{assinaturas,auditoria,clientes,faturas,health-scores,tickets}` | GET | N | XLSX exports |
| `/api/admin/faturas/create`, `/[id]/workflow` | POST | N | faturas SaaS |
| `/api/admin/health-score` | GET, POST | N | scoring de tenants |
| `/api/admin/impersonate`, `/[id]` | POST/DELETE | N | gerar token de impersonação |
| `/api/admin/networks`, `/[id]` | GET/POST/PATCH/DELETE | **Y** em ambas | redes (multi-empresa) |
| `/api/admin/notifications`, `/[id]/read`, `/read-all` | GET/POST/PATCH | N | — |
| `/api/admin/plans`, `/[id]` | GET/POST/PATCH/DELETE | **Y** em `[id]` | catálogo de planos |
| `/api/admin/seed` | POST | N | 🟠 RISCO — ver §5 |
| `/api/admin/tags`, `/[id]` | GET/POST/PATCH/DELETE | N | — |
| `/api/admin/tickets`, `/[id]/messages`, `/[id]/status` | GET/POST/PATCH | N | suporte |
| `/api/admin/users`, `/[id]` | GET/POST/PATCH/DELETE | N | usuários admin |

## 4. Fluxos críticos detalhados (template completo)

### 4.1 `POST /api/sales` — criar venda no PDV
**Arquivo:** `src/app/api/sales/route.ts:92-160`
**Recebe:** body JSON `CreateSaleDTO` (`customerId`, `branchId`, `items[]`, `payments[]`, `discount`, `notes`)
**Retorna:** Sale serializado (Decimals → number) com itens e pagamentos
**Auth:** Sim — `await auth()` + `getCompanyId()` (linhas 95–104)
**Multi-tenant:** Sim — `companyId` derivado da session
**Multi-branch:** Sim — `branchId` no body; **`validateBranchOwnership` chamado dentro do service** (`sale.service.ts`) ⚪ verificar
**Permissão exigida:** `sales.create` (linha 105)
**Modelos Prisma tocados:** `Sale`, `SaleItem`, `SalePayment`, `Product` (decremento estoque), `StockMovement`, `BranchStock` (via `atomicStockDebit`), `CashShift` (auto-cria se não houver), `CashMovement`, `Commission`, `Cashback*`, `AccountReceivable` (se BALANCE_DUE/STORE_CREDIT)
**Validação Zod:** Sim — `createSaleSchema.safeParse(body)` (linha 112), com `sanitizeSaleDTO` adicional
**🔥 Usa `prisma.$transaction`?** **Sim** — `sale.service.ts:372` envolve criação de Sale + items + payments + estoque + cashMovement
**Idempotência:** ❌ **NÃO há idempotency key**. Proteção contra duplo clique deve estar no front (ver relatório 12). Há **rate limit: 30 vendas/min/usuário** (linha 101) — não é idempotência mas mitiga.
**Tratamento de erro:** `handleApiError(error)` → 400/403/404/500 conforme tipo
**Observações:**
- Faz **auto-abertura de caixa** se não houver caixa aberto (`sale.service.ts:342-363`) — pode surpreender o usuário
- Recalcula nada do total — confia no que o front mandou (🟠 ver relatório 17 — risco de manipulação)
- Decimal → number na resposta (perde precisão em cents > 7 dígitos — improvável mas possível)

### 4.2 `POST /api/quotes/[id]/convert` — converter orçamento em venda
**Arquivo:** `src/app/api/quotes/[id]/convert/route.ts`
**Recebe:** `{ payments: [{ method, amount, installments? }] }`
**Auth:** `auth()` + `getCompanyId()` + `requirePermission("quotes.convert")`
**Multi-tenant:** Sim
**Multi-branch:** Sim — `branchId` da session
**Modelos tocados:** Sale, SaleItem, SalePayment, Product/BranchStock, CashShift/CashMovement, Commission, Quote (status → CONVERTED)
**🔥 Transação:** **Sim** — `quote.service.ts:735` (`convertToSale`)
**Idempotência:** ⚪ INCERTO — comentário no header diz "Orçamento deve estar APPROVED" e "Quote.status → CONVERTED" mas **não vi a checagem do status atual no service** (precisa investigação). Se duas conversões simultâneas: ⚪ teste em runtime.
**Risco se duplo clique:** ⚠️ duas vendas para o mesmo orçamento. Sem proof de proteção encontrada na route.

### 4.3 `POST /api/sales/[id]/refund` — devolução
**Arquivo:** `src/app/api/sales/[id]/refund/route.ts:8-172`
**Auth:** `requireAuth()` + `getCompanyId()` + `getUserId()`
**Permissão:** ❌ **Nenhum `requirePermission`** — qualquer logado pode devolver! 🔴 RISCO
**🔥 Transação:** **Sim** — toda a route é `prisma.$transaction(async tx => {...})` (linha 25)
**Faz:**
1. Valida venda COMPLETED (linha 41)
2. Valida `qtyReturned <= qty` por item (linha 61)
3. Cria `Refund` + `RefundItem`s
4. Restock atomic (linha 122) — `Product.stockQty.increment` (cuidado: ❌ **não atualiza `BranchStock`** explicitamente! 🔴 DIVERGÊNCIA com baixa em `atomicStockDebit`)
5. Cria `StockMovement` (CUSTOMER_RETURN)
6. Chama `generateRefundEntries(tx, refund.id, companyId)` para lançamentos financeiros — **dentro do try/catch** (linha 146), erro é só logado, não propagado → 🔴 venda parcialmente revertida se finance falhar
7. Se devolução total → `Sale.status = REFUNDED`
**🔴 Problema confirmado:** restock só toca `Product.stockQty`, não `BranchStock` — multi-filial **vai ficar dessincronizado**. Ver relatório 09.
**Validação Zod:** ❌ **Não usa Zod** — só validação manual ad-hoc
**Idempotência:** ❌ Permite múltiplas devoluções pequenas (não checa se total já devolvido excede o vendido em chamadas sucessivas) — ⚪ verificar service
**Devolução parcial:** Sim, suportada (`qtyReturned < saleItem.qty`)

### 4.4 `POST /api/cash/shift` — abrir caixa
**Arquivo:** `src/app/api/cash/shift/route.ts:49-88`
**Auth:** `auth()` + `getCompanyId()` + `getBranchId()` + `requirePermission("cash_shift.open")`
**Rate limit:** **Sim** — 10 aberturas/min/usuário (linha 57)
**Validação Zod:** Sim — `openShiftSchema.parse`
**Transação:** Sim — `cash.service.ts:46`
**🔥 Pode abrir 2 caixas simultâneos da mesma filial?** ⚪ INCERTO — depende do `cash.service.ts:46` ter checagem de status OPEN existente. Ver relatório 08.

### 4.5 `POST /api/cash/shift/close` — fechar caixa
**Arquivo:** `src/app/api/cash/shift/close/route.ts:15-63`
**Auth:** ✅ + permissão `cash_shift.close`
**Rate limit:** Sim — 10/min
**Validação Zod:** Sim
**🔥 Conferência de saldo:** ⚪ INCERTO — service compara `closingDeclaredCash` vs `closingExpectedCash`? Diferença vai pra `differenceCash`. Mas valida se diferença é aceitável? Investigar relatório 08.

### 4.6 `POST /api/stock-transfers` — transferência de estoque
**Arquivo:** `src/app/api/stock-transfers/route.ts:55-190`
**Auth:** `auth()` + `getCompanyId()`
**Permissão:** ❌ **Não usa `requirePermission`** — usa `userRole === "ADMIN"` para auto-aprovar (linha 107)
**Validação:** ❌ **Não usa Zod** — validação manual ad-hoc (linhas 67–104)
**Transação:** **Sim** — debit/credit + 2 StockMovements
**Tratamento atomic correto** ✅
**Validação cross-branch:** ✅ `branches.length !== 2` checa que ambas pertencem à empresa (linha 81)
**🟡 Concorrência:** Não há lock pessimista; duas transferências paralelas que esgotem o estoque podem permitir negativo. ⚪ teste em runtime. Mas o `findUnique` antes do transaction (linha 91) **fica fora da transação** — race condition real entre check e write.

### 4.7 `POST /api/accounts-receivable/receive-multiple` — baixa de conta com multi-pagamento
**Arquivo:** `src/app/api/accounts-receivable/receive-multiple/route.ts:38-252`
**Auth:** ✅ + `accounts_receivable.manage`
**Validação Zod:** Sim — `receiveMultiplePaymentsSchema`
**Transação:** **Sim** — atualiza `AccountReceivable` + cria N `CashMovement`s
**Cobertura de status:** rejeita se `RECEIVED` ou `CANCELED` (linhas 75–88) ✅
**Validação de valor:** rejeita se `totalReceived > totalExpected + 0.01` (linha 105) ✅
**Cálculo de penalidade:** usa `calculatePenalties` (lib `penalty-utils.ts`) — frontend pode sobrescrever via `data.fineAmount` etc. (linhas 94–96) — 🟠 cliente sobrescreve multa/juros sem revalidação no back
**Mapeamento de método:** `BANK_TRANSFER → OTHER`, `BANK_SLIP → BOLETO` (linhas 191–197) — 🟡 estranho

### 4.8 `POST /api/admin/seed` — seed admin
**Arquivo:** `src/app/api/admin/seed/route.ts`
**Auth:** Cookie admin (via `getAdminSession`)
**🔴 Risco operacional:** **Reseta a senha do admin para `admin123`** (linhas 26–32). Cria/atualiza planos. Marca `onboardingDoneAt` da 1ª empresa. **Idempotente** (verifica existência) mas **destrutivo** se executado por engano em produção. Recomenda-se proteger por ENV (`ALLOW_SEED=true`) ou remover em produção.

## 5. 🔴 Routes SEM autenticação — checklist

| Route | Justificativa | Veredicto |
|---|---|---|
| `/api/auth/[...nextauth]` | NextAuth handler | ✅ OK (público por design) |
| `/api/auth/activate` | Token na URL | ✅ OK |
| `/api/auth/clear-session` | Logout | ✅ OK |
| `/api/auth/impersonate-session` | Tokenizado internamente | ⚪ verificar segurança do token |
| `/api/auth/validate-invite` | Token | ✅ OK |
| `/api/admin/auth/*` | Login admin | ✅ OK |
| `/api/public/contact` | Form público | ✅ OK |
| `/api/public/plans` | Planos públicos | ✅ OK |
| `/api/public/register` | Cadastro novo cliente | ✅ OK |
| `/api/customers/template` | Modelo de planilha vazio | 🟡 OK mas sem auth permite enumerar a existência da rota |
| `/api/products/template` | idem | 🟡 |
| `/api/suppliers/template` | idem | 🟡 |
| `/api/barcodes/generate-image` | Gera QR/Code128 a partir de input arbitrário | 🟠 **RISCO** — endpoint público que faz processamento (CPU). Útil para DOS / abuse. Sem rate limit. |

## 6. 🟠 Rate limiting — só 3 routes

Encontrado em:
- `/api/sales` (POST) — 30/min/user
- `/api/cash/shift` (POST) — 10/min/user
- `/api/cash/shift/close` (POST) — 10/min/user

❌ **Nenhuma das outras 251 routes** tem rate limit. Endpoints sensíveis a abuse (login, OCR, exports XLSX, geração de PDF, geração de imagem de barcode) ficam expostos. Ver relatórios 14 e 15.

## 7. Outras observações

| # | Achado | Classe | Onde |
|---|---|---|---|
| C1 | 64% das routes não validam body com Zod | 🟠 | grep `.parse|.safeParse` |
| C2 | `/api/sales/[id]/refund` sem `requirePermission` | 🔴 | linha 12-19 |
| C3 | `/api/sales/[id]/refund` restock só `Product.stockQty`, ignora `BranchStock` | 🔴 | linha 125-128 |
| C4 | `/api/sales/[id]/refund` financeiro dentro de try/catch silencioso | 🔴 | linha 146-150 |
| C5 | `/api/stock-transfers` validação ad-hoc, sem Zod | 🟡 | linhas 67-104 |
| C6 | `/api/stock-transfers` race condition entre check de estoque e transação | 🟠 | linhas 91 vs 109 |
| C7 | `/api/accounts-receivable/receive-multiple` aceita `fineAmount` do cliente sem revalidar | 🟠 | linhas 94-96 |
| C8 | `/api/barcodes/generate-image` público, sem rate limit | 🟠 | toda a route |
| C9 | Apenas 3 routes com rate limit | 🟠 | grep `rateLimitResponse` |
| C10 | `/api/admin/seed` reseta senha admin para `admin123` | 🟠 | linha 26-32 |
| C11 | `getTenantContext()` (lib/get-tenant.ts) presume header `x-company-id` que o middleware não injeta | 🟡 | lib/get-tenant.ts:17 (felizmente nenhuma route usa) |
| C12 | `/api/quotes/[id]/convert` — não confirmado se há lock contra dupla conversão | ⚪ | precisa investigação no service |
| C13 | `/api/cash/movements` — INCERTO se a permissão `cash.move` existe no catálogo | 🟡 | ver rel. 05 |
| C14 | Várias rotas serializam Decimal → number (perda de precisão em centavos > MAX_SAFE_INTEGER/100) | 🟡 | grep `Number(.*subtotal\|total\|amount)` |
