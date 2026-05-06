# 06 — Multi-tenant e Multi-branch

## 1. Modelo de tenancy

| Camada | Identificador | Onde fica |
|---|---|---|
| Empresa | `companyId` | `Company` (model line 89) |
| Filial | `branchId` | `Branch` (model line 214) |
| Rede | `networkId` | `Company.networkId` opcional → `Network` model |

**Hierarquia:** `Network ←─ many Company ←─ many Branch ←─ many User (via UserBranch)`

`Company` tem campos relevantes para tenancy:
- `networkId` (FK opcional)
- `isHeadquarters` Boolean
- `isBlocked`, `blockedReason`, `blockedAt`
- `accessEnabled`, `accessEnabledAt`, `accessEnabledBy`
- `maxUsers`, `maxBranches`, `maxProducts` — limites de plano

## 2. Mecanismos de isolamento

### 2.1 Padrão real: `getCompanyId()` da session

Implementado em `src/lib/auth-helpers.ts:72-83`. Pega `companyId` da JWT session (settada no callback `auth.ts:135`). Lança 401 se ausente.

**Uso:** ~214 das 254 routes incluem string `companyId`. As 40 sem são:
- Auth/public/admin (legitimamente sem tenant)
- Templates (vazios)
- Catálogos globais (`/api/permissions`, `/api/permissions/by-module`)

### 2.2 `prisma-tenant.ts` — extension UNIVERSAL (não usada)

**Arquivo `src/lib/prisma-tenant.ts`** define `createTenantPrismaClient(companyId)` que estende `PrismaClient` para automaticamente injetar `companyId` em **todas** queries das tabelas de uma lista hard-coded:

```ts
const TENANT_TABLES = [
  "sale", "product", "customer", "serviceorder", "user",
  "supportticket", "branch", "cashregister", "stockmovement",
  "stockadjustment", "companynote", "quote", "prescription",
  "agreement", "commission", "accountpayable", "accountreceivable",
  "cashshift", "loyaltypoint", "warranty", "dreport", "auditlog",
];
```

Nas operações `find*`, `count`, `aggregate`, `groupBy`, `update*`, `delete*`, `upsert` adiciona `where.companyId`. Em `create*` adiciona `data.companyId`.

⚪ **NÃO É USADA EM PRODUÇÃO:**
- `getTenantContext()` em `src/lib/get-tenant.ts:15-31` é a única chamadora — e exige header `x-company-id` que o middleware **não injeta**.
- `grep -rln "getTenantContext\|createTenantPrismaClient" src/app/api` retorna **0 ocorrências**.

**Consequência:** o isolamento depende de cada developer lembrar de adicionar `where: { companyId }` manualmente. Funciona porque é prática consistente, mas é frágil — basta esquecer uma vez.

**Lacunas conhecidas da abordagem manual:**
- `customer.import` faz `findFirst({ where: { companyId, cpf }})` ✅
- `findUnique({ where: { id }})` em routes `[id]` — depende do desenvolvedor lembrar de checar `companyId` depois
- Joins implícitos via `include` não são filtrados (ex: `Sale.items.product` inclui o Product mesmo se o Product fosse de outra empresa — improvável aqui mas possível em rede)

### 2.3 `validateBranchOwnership` (`src/lib/validate-branch.ts`)

```ts
export async function validateBranchOwnership(branchId, companyId): Promise<void>
```

Faz `prisma.branch.findUnique` e checa `branch.companyId === companyId`. Lança 403 caso contrário.

**Uso:** apenas em **`src/services/sale.service.ts`**. Outras 76 routes que recebem `branchId` no body **NÃO validam ownership** e confiam que o branchId pertence ao tenant.

🟠 **Risco prático:** um usuário malicioso pode passar `branchId` de outra empresa em endpoints como:
- `/api/stock-transfers` (POST) — valida via `branches.length !== 2` no `WHERE companyId, active: true` ✅ (na verdade está protegido!)
- `/api/cash/shift` (POST) — usa `getBranchId()` da session, não do body ✅
- `/api/service-orders` (POST) — branchId vem do body (via `createServiceOrderSchema`) — ⚪ verificar service
- `/api/quotes` (POST) — idem
- `/api/customers` (POST) — `originBranchId` opcional — ⚪ verificar

⚪ **Precisa investigação caso a caso** — tabela detalhada no relatório 03 §3 mostra "Multi-branch" como Sim/Não/(service) para cada route.

### 2.4 Middleware (`src/middleware.ts`)

🔴 **NÃO injeta `x-company-id`/`x-branch-id` no header.** Apenas verifica:
- Cookie admin para `/admin/**` (com `jose.jwtVerify`)
- Cookie `next-auth.session-token` para `/dashboard/**` e `/api/**` — **só presença**, não decodifica.

Isto significa que:
- `getTenantContext()` quebra (lança "Tenant não identificado")
- Não é viável passar tenant via header sem alterar middleware

## 3. Network (multi-empresa)

`src/lib/network-helpers.ts`:
- `getNetworkCompanyIds(companyId)` — retorna IDs de todas as empresas da mesma `Network`
- `getNetworkConfig(companyId)` — retorna flags `sharedCatalog`, `sharedCustomers`, `sharedPricing`, `sharedSuppliers`

`Network` (no schema) tem flags de compartilhamento. Permite uma rede compartilhar catálogo de produtos entre empresas (`Product.sharedToNetwork` Boolean default false).

⚪ **NÃO LIDO**: como exatamente o `sharedCatalog` é aplicado — em quais queries o `where.companyId` é substituído por `where.companyId IN (networkCompanyIds)`. Provável uso em `product.service.ts` ou `customer.service.ts`. Risco de vazamento entre empresas se mal implementado.

## 4. UserBranch (relação user ↔ filial)

Schema: `UserBranch` (line 336). Relação N:N entre `User` e `Branch`. Cada user pode ter múltiplas filiais; em login pega `user.branches[0]` (ver auth.ts:80-85).

**Implicações:**
- Se user tem múltiplas filiais, **só a primeira é usada como `branchId` na sessão**.
- Para trocar de filial, o sistema precisa reabrir a sessão? Ou existe seletor que muda o cookie? ⚪ Verificar `BranchProviderWrapper` / `use-branch-context.tsx` no relatório 12.
- O componente `BranchProviderWrapper` (visto em `(dashboard)/layout.tsx:50`) sugere que sim, há um contexto de filial mutável no front. Mas a session JWT tem só `branchId` único.

## 5. Impersonation (admin → tenant)

Implementação completa e bem auditada: `src/app/api/admin/impersonate/route.ts:1-131`.

### Fluxo:
1. `POST /api/admin/impersonate { companyId, reason }` (admin auth via cookie + role SUPER_ADMIN/ADMIN)
2. Busca primeiro `User { role: 'ADMIN', active: true, companyId }` da empresa-alvo
3. Cria `ImpersonationSession` com `expiresAt = now + 2h`, IP, UA, reason
4. **Gera JWT NextAuth válido** com `next-auth/jwt.encode()`, `salt: 'next-auth.session-token'`
5. Inclui no token: `impersonation: { sessionId, adminId, adminName, adminEmail }`
6. Registra `GlobalAudit { actorType: 'ADMIN_USER', actorId, companyId, action: 'IMPERSONATION_STARTED', metadata: { sessionId, companyName, targetUserId, reason, adminEmail } }`
7. Retorna `{ sessionId, token, expiresAt }`

### Setar cookie
`GET /api/auth/impersonate-session?token=...&sessionId=...` (`src/app/api/auth/impersonate-session/route.ts`):
- Valida `ImpersonationSession.expiresAt`, `endedAt`
- Seta cookie `next-auth.session-token` com `maxAge: 7200` (2h)
- Redireciona para `/dashboard`

### ✅ Pontos fortes
- Auditoria via `GlobalAudit` + `ImpersonationSession` (duplo registro)
- `expiresAt` 2h no DB **e** `maxAge: 7200` no cookie
- Restrição de role: SUPER_ADMIN/ADMIN
- IP + UserAgent capturados

### 🟡 Pontos a verificar
- `endedAt` é setado no logout? Ou só expira por tempo? ⚪
- Se admin fecha o navegador, `ImpersonationSession.endedAt` continua null?
- `impersonation` no JWT — alguma rota usa essa info para diferenciar ações? ⚪ (deveria, para audit log)
- Impersonação cria entrada em `AuditLog` por ação? ⚪
- Impossível "exitar" impersonação sem fazer logout/cookie clear?

## 6. Audit logs

| Tabela | Quando |
|---|---|
| `GlobalAudit` (model 2137) | Ações admin/sistema (impersonation, etc.) |
| `AuditLog` (model 345) | ⚪ INCERTO — não lido. Provavelmente ações por user dentro do tenant. |
| `ServiceOrderHistory` (model 872) | Mudanças de status de OS |
| `SubscriptionHistory` (model 2220) | Mudanças de plano |

`AuditLog` está na lista de `TENANT_TABLES` mas precisa de inspeção para confirmar uso.

## 7. 🚨 Routes com `branchId` no body sem validação explícita

Cruzando o relatório 03 com `validateBranchOwnership` (usado só em sale.service):

| Route | branchId vem de | Validação ownership? |
|---|---|---|
| `POST /api/sales` | body | ✅ via `sale.service.ts` chama `validateBranchOwnership` |
| `POST /api/quotes` | body | ⚪ (depende de service) |
| `POST /api/service-orders` | body | ⚪ |
| `POST /api/cash/shift` | session (`getBranchId`) | ✅ não vem do body |
| `POST /api/cash/shift/close` | shiftId no body | indireto via shift.branchId |
| `POST /api/stock-transfers` | body (`fromBranchId`, `toBranchId`) | ✅ via `branches.length !== 2 WHERE companyId` |
| `POST /api/stock-movements/transfer` | body | ⚪ |
| `POST /api/stock-adjustments` | body | ⚪ |
| `POST /api/customers` (originBranchId) | body opcional | ⚪ |
| `POST /api/finance/entries` | body | ⚪ |
| `POST /api/accounts-payable` | body | ⚪ |
| `POST /api/accounts-receivable` | body | ⚪ |
| `POST /api/recurring-expenses` | body | ⚪ |
| `POST /api/cash-registers` | body | ⚪ |
| `POST /api/cash-terminals` | body | ⚪ |
| `POST /api/finance/accounts` | body | ⚪ |
| `POST /api/cardreceivables` | derived | ⚪ |
| `POST /api/branches` | body — meta-tabela | ⚪ |

🟠 **17 routes com risco potencial de "branchId injection"** (passar branchId de outra empresa). Mitigação: companyId já filtra, então o `branchId` precisa pertencer à mesma `companyId`. **Risco real é cross-branch dentro da mesma empresa**, o que é menos grave (mas ainda vazamento de dados/recurso entre filiais da mesma rede de óticas).

## 8. 🚨 Modelos sem `companyId` que recebem operações sensíveis

(Cruzando com relatório 04 §4)

| Model | Risco |
|---|---|
| `BranchStock` | filtrar via `branch.companyId` requer JOIN; queries diretas por `branchId` precisam estar dentro do contexto da empresa |
| `CashbackConfig` | unique por branchId; mas sem companyId pode ser editado por admin de outra empresa se passar branchId diretamente |
| `CustomerCashback` | balance por filial — pode ser atualizado se atacante conhece o `customerId+branchId` de outra empresa? Improvável em runtime mas a defesa é só `companyId` derivado da session |
| `ReminderConfig` | idem cashback |
| `Permission`, `RolePermission` | catálogos globais — OK |

## 9. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| G1 | `prisma-tenant.ts` (extension automática) está **completa mas não usada** | 🟡 | `lib/prisma-tenant.ts` + `lib/get-tenant.ts` |
| G2 | Middleware NÃO injeta `x-company-id` no header — `getTenantContext()` lança erro se chamado | 🟡 | `src/middleware.ts` |
| G3 | `validateBranchOwnership` usado apenas em `sale.service.ts` — ~17 routes recebem branchId no body sem validar | 🟠 | grep |
| G4 | Middleware aceita cookie sem validar JWT — qualquer cookie com nome correto passa pela proteção do dashboard | 🟠 | `src/middleware.ts:96-99` |
| G5 | `userBranch` permite múltiplas filiais por usuário, mas session só carrega a primeira | 🟡 | `auth.ts:80-85` |
| G6 | `BranchProviderWrapper` permite trocar filial no front, mas session JWT tem branchId fixo — INCERTO se backend respeita o branchId do contexto front | ⚪ | `(dashboard)/layout.tsx:50` |
| G7 | `Cashback*`/`Reminder*` por filial sem `companyId` direto — defesa só por session | 🟡 | rel. 04 §4 |
| G8 | `Network.shared*` flags — implementação de compartilhamento entre empresas não auditada (pode vazar) | ⚪ | `network-helpers.ts:32-40` |
| G9 | Impersonation bem implementada (audit + expiry + role check + IP/UA) | 🟢 | `/api/admin/impersonate` |
| G10 | Não vi mecanismo para "encerrar" impersonação manualmente — só expira por tempo (2h) | 🟡 | `impersonate-session/route.ts` |
| G11 | Routes que dão `findUnique({where:{id}})` em modelos tenant sem checagem de companyId podem vazar entre tenants | 🟠 | grep — precisa investigação manual |
| G12 | Joins via `include` (ex: `Sale.items.product`) **NÃO filtram** companyId — em `Network.sharedCatalog`, pode vazar Product de outra empresa | 🟠 | inspeção em runtime |

**Recomendação imediata** (apenas para trilha de auditoria, não execução):
- Adicionar `validateBranchOwnership` em todas as POST/PUT/PATCH que recebam `branchId` no body
- Adotar `prisma-tenant.ts` (já implementado) globalmente, ou remover (legado morto)
- Validar tipo do JWT no middleware (decode + check companyId match)
