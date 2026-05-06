# 11 — Relatórios e Dashboards

## 1. Visão geral

| Categoria | Quantidade |
|---|---|
| Pages de relatório (`/dashboard/relatorios/*`) | 13 |
| Pages de dashboard (`/dashboard`, `/dashboard/financeiro/dashboard`, `/dashboard/financeiro/bi`, `/dashboard/goals/dashboard`) | 4+ |
| API routes em `/api/reports/*` | 24 |
| API routes em `/api/dashboard/*` | 4 |
| API routes em `/api/finance/reports/*` | 2 (`cash-flow`, `dre`) |
| Services em `src/services/reports/*` | 10 |

## 2. Services dedicados

```
accounts-payable.service.ts
accounts-receivable.service.ts
cash-history.service.ts
commissions.service.ts
dre.service.ts
no-movement-products.service.ts
products-top-sellers.service.ts
sales-consolidated.service.ts
stock-position.service.ts
index.ts
```

✅ Boa separação de concerns.

## 3. Relatórios principais

### 3.1 Dashboard principal (`/dashboard`)

**API:** `/api/dashboard/metrics` (GET)
**Filtros:** `branchId` (querystring, "ALL" = todas) — pega da session se não informado
**Métricas:**
- Vendas hoje × ontem
- Vendas mês × mês anterior
- Ticket médio
- (presumido) Top produtos, clientes ativos, OS pendentes

**🔥 Timezone:** ✅ aplica offset UTC-3 manualmente (linhas 22-28). **Sem `date-fns-tz`** — implementação manual:
```ts
const spOffset = -3 * 60 * 60 * 1000;
const nowSP = new Date(now.getTime() + spOffset);
const today = new Date(Date.UTC(nowSP.getUTCFullYear(), nowSP.getUTCMonth(), nowSP.getUTCDate()) - spOffset);
```

🟠 **Risco horário de verão:** Brasil aboliu DST em 2019, então UTC-3 é constante. Mas se algum dia voltar, este código não considera. Aceitável atualmente.

**Permission:** ❌ a página `/dashboard` (root) **não tem `ProtectedRoute`** (rel. 02 §4). Qualquer usuário logado vê.

### 3.2 `/dashboard/financeiro/dashboard`
**API:** `/api/finance/dashboard`
**Permission:** `financial.view`
**Conteúdo:** dashboard dedicado a financeiro

### 3.3 `/dashboard/relatorios/vendas` — Relatório de vendas
**API:** `/api/reports/sales-evolution` (GET)
**Filtros:** `months` (default 6)
**Métricas:** vendas por mês + lucro por mês
**Cálculo de lucro:** in-app — busca todos `SaleItem` do período e faz `sum(lineTotal - costPrice * qty)` (linha 47-50). 🔴 **N+1 implícito**: para 6 meses, 6 queries `findMany` separadas em loop (linha 19), cada uma traz todos os items.
**🟡 Performance:** se a empresa tem 10k vendas/mês, 60k items por chamada, acumula em memória. Recomenda `prisma.saleItem.groupBy` por mês.

### 3.4 `/dashboard/relatorios/dre` — DRE
**API:** `/api/reports/financial/dre`
**Filtros:** `startDate`, `endDate` (required, ISO)
**Service:** `DREService.generateReport(companyId, {startDate, endDate})` (`reports/dre.service.ts`)
**Permission:** `reports.financial`
⚪ Implementação do service não auditada — provavelmente agrega `FinanceEntry` por `ChartOfAccounts.kind`.

### 3.5 `/dashboard/relatorios/comissoes`
**API:** `/api/reports/commissions`
**Filtros:** `startDate`, `endDate` (required)
**Service:** `CommissionsService` (`reports/commissions.service.ts`)
**Permission:** `reports.sales`
**Métricas:** comissão por vendedor, status (PENDING/APPROVED/PAID)

### 3.6 `/dashboard/relatorios/historico-caixas`
**API:** `/api/reports/financial/cash-history`
**Service:** `cash-history.service.ts`

### 3.7 `/dashboard/relatorios/posicao-estoque`
**API:** `/api/reports/stock/position`
**Service:** `stock-position.service.ts`
**Permission:** `reports.inventory`

### 3.8 `/dashboard/relatorios/produtos-vendidos`
**API:** `/api/reports/products/top-sellers`
**Service:** `products-top-sellers.service.ts`
**Permission:** `reports.sales`

### 3.9 `/dashboard/relatorios/produtos-sem-giro`
**API:** `/api/reports/stock/no-movement`
**Service:** `no-movement-products.service.ts`
**Permission:** `reports.inventory`

### 3.10 `/dashboard/relatorios/contas-receber` / `contas-pagar`
**APIs:** `/api/reports/financial/accounts-{receivable,payable}`
**Services:** `accounts-receivable.service.ts`, `accounts-payable.service.ts`
**Permission:** `reports.financial`

### 3.11 `/dashboard/relatorios/comparativo-lojas`
**API:** `/api/reports/branch-comparison`
**Permission:** `reports.view`

### 3.12 `/dashboard/relatorios/metricas-lentes`
**API:** `/api/reports/optical/labs` (presumido)
**Permission:** `reports.sales`

### 3.13 `/dashboard/relatorios/avancados`
**API:** ⚪ INCERTO
**Permission:** `reports.financial`

### 3.14 Outras APIs de relatório
- `/api/reports/branch-comparison`
- `/api/reports/card-settlement`
- `/api/reports/category-distribution`
- `/api/reports/customers`
- `/api/reports/dashboard`
- `/api/reports/payment-methods`
- `/api/reports/sales/consolidated`
- `/api/reports/summary`
- `/api/reports/team-performance`
- `/api/reports/temporal`
- `/api/reports/top-products`

## 4. Outros dashboards

| Página | API | Permission |
|---|---|---|
| `/dashboard/financeiro/bi` | `/api/finance/bi` (+ `/stock-aging`) | `financial.view` |
| `/dashboard/goals/dashboard` (?) | `/api/goals/dashboard` | `goals.view` |
| `/dashboard/cashback` | `/api/cashback/summary` | `cashback.view` |

## 5. Padrão técnico observado

### 5.1 Auth/tenant
- `getCompanyId()` em **todas** as routes de relatório ✅
- `requireAuth()` ou `auth()` direto ✅
- ⚠️ `requirePermission()` **NÃO** é usado em routes de relatório (apenas no `ProtectedRoute` no front). Isso significa que **um cliente que conheça a URL `/api/reports/dre` consegue acessar** sem ter `reports.financial` — só precisa ser autenticado e da empresa certa. 🟠 **proteção apenas no front**.

### 5.2 Filtros
- Padrão: `searchParams.get("startDate")`, `endDate`, `branchId`, etc.
- `branchId === "ALL"` ou ausente → não filtra por filial (pega tudo da empresa)
- Datas: `parseISO` ou conversão manual
- `branchId` da session usado como default em alguns dashboards

### 5.3 Queries
- Mistura de `findMany` em loop, `aggregate`, `groupBy`
- 🟠 **N+1** detectado em `sales-evolution` (1 query × N meses)
- 🟡 Cálculos in-app vs banco — alguns relatórios fazem `reduce` em JS, outros usam `aggregate._sum`

### 5.4 Timezone
- **`/api/dashboard/metrics`**: aplica UTC-3 manual ✅ (mas sem DST safety)
- **`/api/dashboard/sales-last-7-days`**: usa `subDays(today, 6)` direto (sem timezone explícito) — vai usar fuso do servidor (Vercel = UTC) → 🟠 vendas das últimas horas do dia em SP podem cair em dia errado
- **`/api/finance/reports/dre`**: usa `parseISO(startDate)` — depende do que o cliente envia
- 🟠 **Sem padrão único** — algumas rotas timezone-aware, outras não

### 5.5 Exportação
- Relatórios de ações operacionais exportam Excel via `xlsx`:
  - `/api/customers/export`, `/api/products/export`, `/api/suppliers/export`
  - `/api/admin/export/{assinaturas,auditoria,clientes,faturas,health-scores,tickets}`
- Relatórios de análise (DRE, vendas-evolution): ❌ não vi exportação direta; provavelmente CSV/PDF é gerado no front

### 5.6 Performance (não testada em runtime)

| Route | Risco | Razão |
|---|---|---|
| `/api/reports/sales-evolution` | 🟠 N+1 | 1 query findMany por mês × N meses |
| `/api/reports/dashboard` | ⚪ não auditado | |
| `/api/dashboard/top-products` | ⚪ usa groupBy ✅ provavelmente OK | |
| `/api/finance/reports/dre` | ⚪ depende do `DREService` | |
| Relatórios que fazem `aggregate._sum`/`groupBy` | ✅ OK | |

## 6. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| L1 | Routes de relatório **não usam `requirePermission`** — só `ProtectedRoute` no front | 🟠 | grep |
| L2 | `/api/reports/sales-evolution` faz 1 query por mês (N+1 em loop) | 🟠 | linha 17-25 |
| L3 | Timezone tratado de forma inconsistente entre rotas | 🟠 | grep |
| L4 | `/api/dashboard/metrics` aplica offset UTC-3 manual sem DST safety | 🟡 | linhas 22-28 |
| L5 | `/api/dashboard/sales-last-7-days` não aplica timezone — pode pular vendas no fim do dia | 🟠 | route |
| L6 | Relatórios usam `parseISO` direto sem normalizar para fim/início de dia em SP | 🟠 | grep |
| L7 | DRE service usa `FinanceEntry` ✅ (single source of truth para contábil) | 🟢 | dre.service |
| L8 | Exportação Excel só para cadastros operacionais; não há export padrão para relatórios | 🟡 | grep |
| L9 | Cálculo de lucro em `sales-evolution` faz reduce em JS — escala mal | 🟠 | linhas 47-50 |
| L10 | `/dashboard/relatorios` (índice) sem `ProtectedRoute` | 🟡 | rel. 02 §4 |
| L11 | Exportações XLSX não tem rate limit (XLSX é caro de gerar) | 🟡 | rel. 03 §6 |
| L12 | Múltiplos dashboards — risco de divergência entre métricas (metrics vs sales-evolution vs dre) | 🟡 | grep |
