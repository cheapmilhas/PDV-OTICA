# 05 — Permissões e Auth

## 1. Arquitetura geral de auth

PDV Ótica tem **dois sistemas de autenticação paralelos**:

| Sistema | Para | Cookie | Mecanismo |
|---|---|---|---|
| **NextAuth v5 (beta.30)** | Usuários do tenant (`/dashboard`, `/api/*`) | `next-auth.session-token` (HTTP-only, lax, secure em prod) | JWT (`maxAge: 30 dias`, sem PrismaAdapter) |
| **Custom JWT (`jose`)** | Painel admin SaaS (`/admin`, `/api/admin/*`) | `admin.session-token` | JWT assinado com `AUTH_SECRET`/`NEXTAUTH_SECRET` |

Arquivos principais:
- `src/auth.ts` — NextAuth completo (Prisma + bcrypt)
- `src/auth.config.ts` — versão Edge-safe (sem deps Node) — usada pelo middleware
- `src/middleware.ts` — roteamento dual entre os dois auth systems
- `src/lib/admin-session.ts` — helper que valida cookie admin e retorna payload

## 2. NextAuth v5 — detalhes

### 2.1 Configuração (`src/auth.ts`)

```ts
strategy: "jwt",
maxAge: 30 * 24 * 60 * 60,   // 30 dias
trustHost: true,             // produção (Vercel)
adapter: PrismaAdapter desativado (linha 14, comentário "conflito de tipos no NextAuth v5 beta")
```

### 2.2 Provider único: Credentials

Login aceita **email OU "login" (nome do usuário)**. Lógica em `src/auth.ts:42-50`:

```ts
{ email: login },
{ email: login.includes("@") ? login : `${login.toLowerCase()}@login` },
```

🟡 fallback estranho — usuário com email `joao@login` colide com um login `joao`.

Validações:
- Zod `loginSchema` — `email.min(1)`, `password.min(8)` (linha 8-11)
- Compara `passwordHash` (bcrypt)
- Pega `firstBranch` do `user.branches[0]` (linhas 80-85) — usuário **deve** ter ao menos 1 branch ou login é negado.

### 2.3 Callbacks

| Callback | Função |
|---|---|
| `redirect` | URLs relativas → `${baseUrl}${url}`; mesmo domínio → permite; default `/dashboard` |
| `jwt` | No login (user presente): seta `id, name, email, role, branchId, companyId, networkId` no token |
| `session` | Propaga campos do token para `session.user.*` |

### 2.4 Estrutura da Session

Tipos em `src/types/next-auth.d.ts` (não lido mas inferido do uso):

```ts
session.user = {
  id: string,
  name: string,
  email: string,
  role: UserRole,         // enum Prisma: ADMIN | GERENTE | VENDEDOR | CAIXA | ATENDENTE
  branchId: string,
  companyId: string,
  networkId: string | null,
}
```

### 2.5 🔴 Problemas confirmados

| # | Achado | Linha |
|---|---|---|
| E1 | `console.log` em produção com email/role do login (`✅ Login bem-sucedido`, `🔐 JWT callback`, `👤 Session callback`, `❌ Senha inválida`) | `src/auth.ts:76, 84, 98, 126, 142, 150` |
| E2 | `PrismaAdapter` desativado (sessões só em JWT — sem persistência em DB) | `src/auth.ts:14` |
| E3 | Login secundário com sufixo `@login` colide se houver email real assim | `src/auth.ts:49` |

## 3. Admin auth (paralelo)

Arquivo: `src/middleware.ts:13-67`. `src/lib/admin-session.ts` (não lido) provavelmente faz `jwtVerify(cookie, secret)` e valida `payload.isAdmin`.

- Endpoint `/api/admin-auth/login` → emite o cookie
- Endpoint `/api/admin-auth/logout` → limpa cookie
- Endpoint `/api/admin-auth/me` → retorna admin atual

⚪ **NÃO LIDO**: implementação de `/api/admin-auth/login` para confirmar:
- Como é gerada/expirada a sessão?
- 2FA?
- Existe hash bcrypt do `AdminUser.password` (sim — visto em `/api/admin/seed:27`)

## 4. ProtectedRoute (componente)

Arquivo: `src/components/auth/ProtectedRoute.tsx` (153 linhas).

### Props
```ts
{
  permission: string | string[];
  requireAny?: boolean;          // default false (precisa TODAS)
  redirectTo?: string;           // default "/dashboard"
  message?: string;              // mensagem custom de "sem permissão"
  children: ReactNode;
}
```

### Comportamento
1. Chama `usePermission()` (hook DB-backed)
2. Se `isLoading` → spinner com texto "Verificando permissões..."
3. Se `!hasAccess` → render de "Acesso Negado" com botão de voltar
4. Se OK → renderiza `children`

⚠️ **Comportamento interessante:** quando o usuário não tem permissão, ele **NÃO é redirecionado automaticamente** (apesar da prop `redirectTo` existir), apenas mostra a tela. O botão "Voltar para o Dashboard" usa `router.push(redirectTo)`. **A prop `redirectTo` só é usada no botão**, não em redirect automático.

### Onde é usado
75 pages dentro de `(dashboard)/dashboard/**` (ver relatório 02 §3.2). 13 pages dentro do dashboard NÃO usam (ver §4 do relatório 02).

## 5. Hooks de permissão

Existem **DOIS hooks** com nomes parecidos:

### 5.1 `usePermission` (kebab — `use-permission.ts`)

109 linhas. Usado pelo `ProtectedRoute`. Retorna:
```ts
{
  hasPermission, hasAnyPermission, hasAllPermissions,
  permissions: string[],
  isLoading: boolean,
  role: string | null,
  refetch: () => void,
}
```
- ADMIN sempre passa (curto-circuito).
- Faz `fetch('/api/users/{id}/permissions', { cache: 'no-store' })`.
- Tem `console.log` com email do usuário e lista completa de permissões — 🟠 LGPD/segurança em produção.

### 5.2 `usePermissions` (camel, plural — `usePermissions.ts`)

89 linhas. Mesma API mas **sem `refetch`** e com `isAdmin` adicional. Usa `fetch` SEM `cache: 'no-store'` (cache padrão do navegador) — **🟡 pode mostrar permissões antigas após mudança**.

🟡 **Duplicação confirmada.** Não há indicação de qual usar.

## 6. Sistema de permissões — modelo de dados

Tabelas no banco (ver relatório 04, §2 e §6):

| Tabela | Função |
|---|---|
| `Permission` (model line 1644) | Catálogo global de permissões (`code` String unique, `name`, `module`, `category`, `sortOrder`, `isActive`) |
| `RolePermission` (line 1663) | Permissões padrão por role (`role` String + `permissionId`, `granted` Boolean, `@@unique([role, permissionId])`) |
| `UserPermission` (line 1675) | Overrides individuais (`userId` + `permissionId`, `granted` Boolean, `grantedByUserId`, `grantedAt`) |

### Cálculo de "permissões efetivas" (`PermissionService.getUserEffectivePermissions`)

Algoritmo (`src/services/permission.service.ts:19-78`):
1. Busca `RolePermission` para o `user.role`
2. Busca `UserPermission` do usuário
3. `effective = Set(rolePermissions)`
4. Para cada `UserPermission`: se `granted=true` adiciona, se `granted=false` remove
5. Retorna `Array.from(effective).sort()`

✅ Modelo limpo. Permite override granular.

## 7. Helpers no backend

### 7.1 `src/lib/auth-helpers.ts`

| Helper | Descrição |
|---|---|
| `requireAuth()` | Lança 401 se sem session |
| `requireRole(roles[])` | Lança 403 se role não está em allowed |
| `requirePermission(code)` | (re-exporta de `auth-permissions.ts`) — checa via DB |
| `getCompanyId()` | Lança 401; retorna companyId |
| `getBranchId()` | Idem |
| `getUserId()` | Idem |
| `getUserSession()` | Retorna session ou null |
| `checkPermission(roles[])` | Boolean (não lança) |
| `isAdmin()`, `isAdminOrManager()` | atalhos role-based |

### 7.2 `src/lib/auth-permissions.ts`

| Helper | Descrição |
|---|---|
| `requirePermission(code)` | Checa se user tem `code`. **ADMIN sempre passa** (linha 24). Lança 403 se não. |
| `requireAllPermissions([])` | Idem para todas |
| `requireAnyPermission([])` | Idem para qualquer uma |
| `checkPermissionFromDB(code)` | Retorna `session | null` (não lança) |

🔴 **Detalhe:** `requirePermission` faz **2 queries por chamada** (uma para usuário, uma para `getUserEffectivePermissions`). Em rota com várias checks, multiplicar por N. Sem cache. 🟡 performance.

### 7.3 `src/middleware/require-permission.ts`

Outro arquivo que define `requirePermission(request, code)`. Não vi nenhum import dele em routes do `/api/*`. Provavelmente legado. Lança `Error` genérico (sem status) — se chamado em handler, vira 500.

## 8. 🚨 Inconsistência: enum TypeScript ≠ enum Prisma

### TypeScript (`src/lib/permissions.ts:93`)
```ts
export type UserRole = "ADMIN" | "MANAGER" | "SELLER" | "CASHIER" | "STOCK_MANAGER";
```

### Prisma schema (line 3167)
```prisma
enum UserRole {
  ADMIN
  GERENTE
  VENDEDOR
  CAIXA
  ATENDENTE
}
```

**🔴 NÃO BATEM:**
- `MANAGER` (TS) vs `GERENTE` (DB)
- `SELLER` vs `VENDEDOR`
- `CASHIER` vs `CAIXA`
- `STOCK_MANAGER` (TS) — **não existe no DB**
- `ATENDENTE` (DB) — **não existe no TS**

### Consequências
- `ROLE_PERMISSIONS` em `permissions.ts:98-276` mapeia para `MANAGER`, `SELLER`, `CASHIER`, `STOCK_MANAGER` — **NUNCA SÃO USADOS EM RUNTIME** porque o role real é `GERENTE`/`VENDEDOR`/`CAIXA`/`ATENDENTE`.
- `hasPermission(userRole, permission)` (linha 281) sempre retorna `false` para usuários reais (exceto ADMIN, que coincide).
- `getRolePermissions(role)` retorna `[]` para qualquer role real ≠ ADMIN.
- ⚪ Ainda assim, o sistema funciona porque a **fonte de verdade em runtime é o BANCO** (`RolePermission` table) — `permissions.ts` é usado APENAS no seed (`/api/permissions/seed`) para popular o catálogo.
- **`permissions.ts` é uma armadilha de pegadinha.** Se alguém usar suas funções acreditando que vão funcionar, vai bloquear todos os usuários não-ADMIN.

### Achados de uso
- `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx:18` importa `hasPermission as hasRolePermission` do `permissions.ts`. **🔴 CONFIRMADO**: caso seja chamado em runtime, vai retornar `false` para todos não-ADMIN (mas ver: linhas 91-92 usam o hook `usePermissions`, então `hasRolePermission` pode ser dead import).

## 9. Catálogo de permissões — fontes de verdade

### Fonte 1: enum `Permission` (`permissions.ts:7-91`) — 53 entradas
```
sales.create, sales.view, sales.view_all, sales.view_canceled,
sales.cancel, sales.edit_seller, sales.edit_discount,
quotes.{create,view,view_all,edit,delete,convert},
customers.{create,view,edit,delete},
products.{create,view,edit,delete,manage_stock},
stock.{view,adjust,transfer},
financial.{view,manage},
accounts_receivable.{view,manage},
accounts_payable.{view,manage},
cash_shift.{open,close,view,view_all},
reports.{sales,financial,inventory,customers},
users.{create,view,edit,delete},
permissions.manage,
settings.{view,edit},
company.settings,
branch.manage,
service_orders.{view,create,edit},
suppliers.{view,manage},
laboratories.{view,manage},
cashback.{view,manage},
goals.{view,manage},
campaigns.{view,manage},
reminders.view
```

### Fonte 2: strings literais usadas em código (76 únicas)

Cruzando o grep do código com o enum:

**Permissões em código MAS não no enum:** (provavelmente são ID de `SystemRule`, não `Permission`)
- `customers.block_overdue_sales`, `customers.default_credit_limit`, `customers.overdue_days_to_block`
- `products.alert_negative_margin`, `products.auto_calculate_margin`, `products.block_negative_margin_sale`, `products.min_margin_percent`, `products.require_ncm`
- `sales.delete`, `sales.edit`, `sales.manage`, `sales.max_installments`, `sales.min_card_amount`, `sales.monthly_goal`
- `financial.alert_days_before_due`
- `stock.allow_negative_stock`, `stock.block_sale_without_stock`, `stock.low_stock_alert_percent`
- `reports.allow_export_seller`, `reports.allow_financial_seller`, `reports.log_access`, `reports.view`

🟠 **Mistura conceitual:** o código mistura "permissões" (sales.create) e "regras de sistema" (sales.max_installments) com prefixos similares. Sem comentário/convenção, é fácil confundir. Modelo Prisma `SystemRule` (line 1612) provavelmente armazena os "rules".

**Permissões no enum MAS não vistas em código:** (potencialmente mortas)
- `sales.edit_seller` (mas vimos uso em vendas/[id]/detalhes)
- `quotes.view_all`, `service_orders.delete` (?)

⚪ verificar com mais grep, podem ser apenas labels de UI.

## 10. Mapa role → permissions (esperado pelo seed)

⚠️ **Lembre-se: estas atribuições foram escritas em `permissions.ts:98-276` usando os roles em INGLÊS (MANAGER, SELLER, CASHIER, STOCK_MANAGER), que NÃO batem com o DB (GERENTE, VENDEDOR, CAIXA, ATENDENTE).**

Para o seed funcionar (e ele funciona), `/api/permissions/seed` (linhas 5+) deve fazer mapeamento `MANAGER → GERENTE` etc. ⚪ NÃO LIDO o seed completo (1700+ linhas vimos só o início). Inferência: ou o seed mapeia, ou o seed NUNCA criou as RolePermissions corretamente para roles ≠ ADMIN. **Verificar em runtime.**

### Pelo que `permissions.ts` declara:

| Role TS | Role DB esperado | Permissões |
|---|---|---|
| `ADMIN` | `ADMIN` | **TODAS** (Object.values(Permission)) — 53 |
| `MANAGER` | `GERENTE` (?) | 47 (todas exceto users.create/delete + company.settings + branch.manage + permissions.manage + sales.cancel? — verificar) |
| `SELLER` | `VENDEDOR` (?) | 14 |
| `CASHIER` | `CAIXA` (?) | 9 |
| `STOCK_MANAGER` | (não existe no DB) | 11 |
| (não existe no TS) | `ATENDENTE` | ⚪ **NÃO MAPEADO** |

**🔴 Findings adicionais:**
- `STOCK_MANAGER` (TS) não corresponde a nenhum role no DB
- `ATENDENTE` (DB) não tem mapeamento padrão de permissões
- Se o seed não conseguiu popular `RolePermission` para `ATENDENTE`, esse role efetivamente fica **sem permissões** (só ADMIN passaria via short-circuit)

## 11. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| F1 | `UserRole` em TS (MANAGER/SELLER/CASHIER/STOCK_MANAGER) ≠ Prisma (GERENTE/VENDEDOR/CAIXA/ATENDENTE) | 🔴 | `lib/permissions.ts:93` vs `schema.prisma:3167` |
| F2 | `ATENDENTE` (DB) sem mapeamento padrão em `permissions.ts` | 🔴 | `permissions.ts:98-276` |
| F3 | `STOCK_MANAGER` (TS) não existe no DB | 🟡 | `permissions.ts:251` |
| F4 | `hasPermission(userRole, …)` em `permissions.ts:281` é função armadilha — sempre `false` para roles do DB | 🔴 | `permissions.ts:281-288` |
| F5 | Dois hooks `usePermission` (kebab) e `usePermissions` (camel) coexistem | 🟡 | `hooks/use-permission.ts` + `hooks/usePermissions.ts` |
| F6 | `console.log` em `usePermission` expõe email + lista de permissões em produção | 🟠 | `hooks/use-permission.ts:43, 61-63, 81, 86` |
| F7 | Strings de permissão e strings de "regra de sistema" misturadas (ambas com formato `modulo.acao`) | 🟡 | grep |
| F8 | `requirePermission` faz 2+ queries por chamada (sem cache) | 🟡 | `services/permission.service.ts` |
| F9 | `ProtectedRoute` não redireciona automaticamente — só mostra tela; prop `redirectTo` só usada no botão | 🟡 | `components/auth/ProtectedRoute.tsx:101-149` |
| F10 | Catálogo `Permission` no enum não inclui várias permissões usadas no código | 🟡 | grep cruzado |
| F11 | Sistema dual (NextAuth user + JWT admin) — middleware não valida assinatura do JWT do user, só presença do cookie | 🟠 | `src/middleware.ts:96-99` |
| F12 | `usePermissions` (camel) usa cache HTTP padrão — pode mostrar permissões antigas | 🟡 | `hooks/usePermissions.ts:27` |
| F13 | NextAuth sem PrismaAdapter — sessão fica no JWT (sem revogação imediata via DB) | 🟡 | `auth.ts:14` |
| F14 | Login email pode ser via "login@login" sufixo automático — colisão potencial | 🟡 | `auth.ts:49` |
