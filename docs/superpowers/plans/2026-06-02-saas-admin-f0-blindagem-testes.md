# SaaS Admin — Fase 0: Blindagem + Rede de Testes do Dinheiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os vetores de risco de segurança do admin (impersonate cross-tenant, exports sem RBAC/limite/escape) e criar a malha de testes das áreas de dinheiro (`subscription.ts`, sanitização CSV, escopo de admin), sem alterar o comportamento funcional legítimo (o botão de impersonate permanece).

**Architecture:** Extrai lógica pura testável (escopo de admin, sanitização CSV, decisão de status de assinatura) para funções em `src/lib/*` cobertas por Vitest, e aplica essas funções nas rotas. Reusa o `rateLimitResponse` e o padrão `requireAdminRole` já existentes. Migration aditiva no `AdminUser` (campo de escopo) com backfill seguro antes de ativar a checagem.

**Tech Stack:** Next.js App Router (route handlers), Prisma + Neon, Vitest (env `node`, `globals: true`, escopo de cobertura `src/lib/**` + `src/services/**`), next-auth/jwt (encode/decode), `src/lib/rate-limit.ts`.

**Contexto herdado (verificado no código):**
- Impersonate é criado em `src/app/api/admin/impersonate/route.ts` e consumido em `src/app/api/auth/impersonate-session/route.ts`. O TTL de 2h aparece em **dois lugares**: `expiresAt` (impersonate/route.ts:~59) e `maxAge: 7200` do cookie (impersonate-session/route.ts:~66). **Ambos precisam mudar juntos.** (Localizar por conteúdo com Grep, não confiar no número de linha.)
- `subscription.ts` tem ~297 linhas. `checkSubscription` usa `Math.ceil` para `daysLeft`/`daysOverdue`, faz fallback `pastDueSince ?? currentPeriodEnd ?? now`, e considera `accessEnabled`/`isBlocked`/`NO_SUBSCRIPTION`. `LIVE_STATUSES` fica ~linha 271. **Não refatorar este arquivo nesta fase** (o spec proíbe: "NÃO entra: refactor de subscription.ts").
- `getAdminSession()` retorna `{id,email,name,role,isAdmin}` (sem escopo). `requireAdminRole(roles[])` já existe em `src/lib/admin-session.ts`.
- Não há mock de Prisma nos testes hoje → testes cobrem **funções puras**, não rotas com banco.
- `AdminRole` enum: SUPER_ADMIN | ADMIN | SUPPORT | BILLING.
- Exports em `src/app/api/admin/export/*` (6 rotas): só checam `getAdminSession()`, sem `take`, CSV com `r.join(",")` cru.

**Gate de fim de fase (decisão do dono — obrigatório antes de deploy):**
`npx tsc --noEmit` → `npm run build` → code-reviewer (caçar regressão) → verificar bugs → só então commit final + `vercel deploy --prod --yes`.

---

## File Structure

**Criar:**
- `src/lib/admin-scope.ts` — lógica pura de escopo: dado um admin (role + lista de companyIds permitidas) e um `companyId` alvo, decide se pode agir. SUPER_ADMIN = todas.
- `src/lib/admin-scope.test.ts` — testes da lógica de escopo.
- `src/lib/csv-safe.ts` — sanitização de célula CSV (anti-injection + escape de aspas/vírgula/quebra de linha).
- `src/lib/csv-safe.test.ts` — testes da sanitização.
- `src/lib/subscription.test.ts` — testes de **caracterização** de `subscription.ts` (trava o comportamento atual, SEM refatorar o código).

**Modificar:**
- `prisma/schema.prisma` — adicionar `scopeAllCompanies Boolean @default(true)` e relação de escopo no `AdminUser` (ver Task 1 para decisão de modelagem).
- `src/lib/admin-session.ts` — `AdminPayload` e `getAdminSession` passam a carregar o escopo; novo helper `requireCompanyScope`.
- `src/app/api/admin/impersonate/route.ts` — validar escopo, rate-limit, revalidar admin ativo, TTL 30min, auditar falha.
- `src/app/api/auth/impersonate-session/route.ts` — cookie `maxAge` alinhado a 30min.
- `src/app/api/admin/export/clientes/route.ts` (+ faturas, assinaturas, tickets, auditoria, health-scores) — RBAC, `take`, `csv-safe`.
- `src/app/api/admin/audit-logs/route.ts` — exigir role ADMIN/SUPER_ADMIN.

---

## Task 1: Migration — campo de escopo no AdminUser

**Files:**
- Modify: `prisma/schema.prisma` (model `AdminUser`, ~linha 2189)
- Create: `prisma/migrations/<timestamp>_admin_user_scope/migration.sql` (gerado)

**Decisão de modelagem (YAGNI):** Em vez de uma tabela de junção AdminUser↔Company (over-engineering para hoje, onde só há 1 super-admin), usar um campo booleano `scopeAllCompanies` (default `true`) + um campo `scopedCompanyIds String[]` (default `[]`, usado só quando `scopeAllCompanies=false`). Simples, cobre o caso "equipe futura restrita a algumas empresas", e o backfill é trivialmente seguro (todos os admins atuais ficam `true`).

- [ ] **Step 1: Editar o schema**

No `model AdminUser`, adicionar após `active`:
```prisma
  scopeAllCompanies Boolean  @default(true)
  scopedCompanyIds  String[] @default([])
```

- [ ] **Step 2: Gerar a migration sem aplicar**

Run: `npx prisma migrate dev --name admin_user_scope --create-only`
Expected: cria pasta de migration com `ALTER TABLE "AdminUser" ADD COLUMN ...` e defaults. Como `scopeAllCompanies` default `true`, todos os admins existentes ficam com escopo total (backfill seguro, sem downtime).

- [ ] **Step 3: Revisar o SQL gerado**

Abrir o `migration.sql` e confirmar: duas colunas aditivas, com default, **sem** `NOT NULL` sem default e **sem** drop. Nenhuma operação destrutiva.

- [ ] **Step 4: Aplicar em dev e regenerar client**

Run: `npx prisma migrate dev` (aplica) seguido de `npx prisma generate`
Expected: migration aplicada; `prisma.adminUser` agora tem os campos no tipo.

> **Se `migrate dev` falhar** por falta de shadow database (comum em Neon): rodar apenas `npx prisma generate` para atualizar o client (os campos têm default, então o tipo fica correto) e aplicar o SQL diretamente no banco de dev via `npx prisma db execute --file prisma/migrations/<...>/migration.sql` ou aplicar em prod com `migrate deploy` (Task 9). O importante para as Tasks 3/4 é que `npx prisma generate` tenha rodado.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(admin): campo de escopo (scopeAllCompanies/scopedCompanyIds) no AdminUser"
```

> **Nota de deploy:** Em prod, esta migration aditiva roda via `npx prisma migrate deploy` antes do deploy do código (padrão da casa). Por ser aditiva com default, é segura.

---

## Task 2: Lógica pura de escopo de admin (`admin-scope.ts`)

**Files:**
- Create: `src/lib/admin-scope.ts`
- Test: `src/lib/admin-scope.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// src/lib/admin-scope.test.ts
import { describe, it, expect } from "vitest";
import { canAccessCompany, type AdminScope } from "./admin-scope";

const superAdmin: AdminScope = { role: "SUPER_ADMIN", scopeAllCompanies: true, scopedCompanyIds: [] };
const restricted: AdminScope = { role: "SUPPORT", scopeAllCompanies: false, scopedCompanyIds: ["c1", "c2"] };
const fullSupport: AdminScope = { role: "SUPPORT", scopeAllCompanies: true, scopedCompanyIds: [] };

describe("canAccessCompany", () => {
  it("SUPER_ADMIN acessa qualquer empresa", () => {
    expect(canAccessCompany(superAdmin, "qualquer")).toBe(true);
  });
  it("admin com scopeAllCompanies acessa qualquer empresa", () => {
    expect(canAccessCompany(fullSupport, "c9")).toBe(true);
  });
  it("admin restrito acessa empresa na lista", () => {
    expect(canAccessCompany(restricted, "c1")).toBe(true);
  });
  it("admin restrito NÃO acessa empresa fora da lista", () => {
    expect(canAccessCompany(restricted, "c3")).toBe(false);
  });
  it("admin restrito com lista vazia não acessa nada", () => {
    expect(canAccessCompany({ role: "BILLING", scopeAllCompanies: false, scopedCompanyIds: [] }, "c1")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/admin-scope.test.ts`
Expected: FAIL — `Cannot find module './admin-scope'`.

- [ ] **Step 3: Implementação mínima**

```typescript
// src/lib/admin-scope.ts
export interface AdminScope {
  role: string;
  scopeAllCompanies: boolean;
  scopedCompanyIds: string[];
}

/** SUPER_ADMIN ou scopeAllCompanies => todas. Senão, só as da lista. */
export function canAccessCompany(admin: AdminScope, companyId: string): boolean {
  if (admin.role === "SUPER_ADMIN" || admin.scopeAllCompanies) return true;
  return admin.scopedCompanyIds.includes(companyId);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/admin-scope.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-scope.ts src/lib/admin-scope.test.ts
git commit -m "feat(admin): lógica pura de escopo de empresa (canAccessCompany) + testes"
```

---

## Task 3: Carregar escopo na sessão admin + helper `requireCompanyScope`

**Files:**
- Modify: `src/lib/admin-session.ts`

**Dependência:** requer Task 1 concluída (campos de escopo no client Prisma via `prisma generate`) e Task 2 (`canAccessCompany`). Não executar isoladamente antes delas.

> O token admin (`admin.session-token`) é gerado no login (`src/app/api/admin/auth/login/route.ts`). Para evitar reissue de tokens, **não** colocamos escopo no JWT; em vez disso `getAdminSession` mantém o payload do JWT (id/role) e o escopo é carregado do banco quando necessário, via novo helper. Isso também garante revalidação (admin desativado não passa).

- [ ] **Step 1: Adicionar helper que valida escopo lendo do banco**

Em `src/lib/admin-session.ts`, adicionar (no topo, o import do prisma e do helper puro):
```typescript
import { prisma } from "@/lib/prisma";
import { canAccessCompany } from "@/lib/admin-scope";
```
E ao final do arquivo:
```typescript
/**
 * Carrega o admin do banco (revalida active) e checa escopo para companyId.
 * Retorna o admin se ok, ou null se não autorizado / inativo / fora de escopo.
 */
export async function requireCompanyScope(
  adminId: string,
  companyId: string
): Promise<{ id: string; role: string } | null> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, role: true, active: true, scopeAllCompanies: true, scopedCompanyIds: true },
  });
  if (!admin || !admin.active) return null;
  if (!canAccessCompany(admin, companyId)) return null;
  return { id: admin.id, role: admin.role };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos (o campo de escopo existe no client desde a Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin-session.ts
git commit -m "feat(admin): requireCompanyScope (revalida admin ativo + escopo de empresa)"
```

---

## Task 4: Blindar o impersonate (escopo + rate-limit + revalidação + TTL 30min + auditar falha)

**Files:**
- Modify: `src/app/api/admin/impersonate/route.ts`
- Modify: `src/app/api/auth/impersonate-session/route.ts`

> O botão e o fluxo permanecem idênticos para o usuário. Mudam só as proteções.

- [ ] **Step 1: Constante de TTL única**

No topo de `src/app/api/admin/impersonate/route.ts`, adicionar:
```typescript
import { rateLimitResponse } from "@/lib/rate-limit";
import { requireCompanyScope } from "@/lib/admin-session";

const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30 minutos
```

- [ ] **Step 2: Rate-limit + escopo + revalidação no POST**

Logo após o check de role (`if (!["SUPER_ADMIN","ADMIN"]...`), inserir o rate-limit:
```typescript
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limited = rateLimitResponse(`admin-impersonate:${admin.id}:${ip}`, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;
```
Dentro do `try`, **após** `impersonateSchema.parse(body)` e **antes** de buscar a empresa, validar escopo + revalidar admin ativo:
```typescript
    const scoped = await requireCompanyScope(admin.id, companyId);
    if (!scoped) {
      // companyId VAI no metadata (não na coluna FK) — companyId pode ser inexistente
      // e GlobalAudit.companyId é FK opcional → gravar id inválido dá P2003.
      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          companyId: null,
          action: "IMPERSONATION_DENIED",
          metadata: {
            attemptedCompanyId: companyId,
            reason: "fora de escopo ou admin inativo",
            adminEmail: admin.email, // admin (de getAdminSession) tem email; scoped não
          },
        },
      });
      return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
    }
```

> Nota: `admin` (de `getAdminSession`) continua em escopo e tem `.email`. O `companyId` vai em `metadata.attemptedCompanyId`, **não** na coluna FK, para evitar P2003 quando o id for inexistente.

- [ ] **Step 3: TTL 30min na sessão**

Localizar a linha do `expiresAt` (Grep por `2 \* 60 \* 60 \* 1000` em `impersonate/route.ts`) e trocá-la por:
```typescript
    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
```

- [ ] **Step 4: Alinhar o cookie do consumidor a 30min**

Em `src/app/api/auth/impersonate-session/route.ts`, localizar `maxAge: 7200` (Grep) e trocar por:
```typescript
    maxAge: 30 * 60, // 30 minutos — alinhado ao TTL da ImpersonationSession
```
(A validação `session.expiresAt < new Date()` já existente continua sendo a fonte de verdade; o cookie só não deve sobreviver à sessão.)

- [ ] **Step 5: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/impersonate/route.ts src/app/api/auth/impersonate-session/route.ts
git commit -m "feat(admin): blindar impersonate (escopo+rate-limit+revalidação+TTL 30min+audit de falha)"
```

---

## Task 5: Sanitização CSV (`csv-safe.ts`)

**Files:**
- Create: `src/lib/csv-safe.ts`
- Test: `src/lib/csv-safe.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// src/lib/csv-safe.test.ts
import { describe, it, expect } from "vitest";
import { csvCell, csvRow } from "./csv-safe";

describe("csvCell", () => {
  it("envolve valor simples em aspas", () => {
    expect(csvCell("Ótica Bom Ver")).toBe('"Ótica Bom Ver"');
  });
  it("escapa aspas internas dobrando-as", () => {
    expect(csvCell('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
  });
  it("mantém vírgula e quebra de linha dentro das aspas", () => {
    expect(csvCell("a,b\nc")).toBe('"a,b\nc"');
  });
  it("neutraliza injeção de fórmula (= + - @)", () => {
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@x")).toBe(`"'@x"`);
  });
  it("trata null/undefined/number", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });
});

describe("csvRow", () => {
  it("junta células sanitizadas com vírgula", () => {
    expect(csvRow(["a", "b,c"])).toBe('"a","b,c"');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/csv-safe.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementação mínima**

```typescript
// src/lib/csv-safe.ts
/** Sanitiza uma célula para CSV: neutraliza injeção de fórmula e escapa aspas. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  // Anti CSV-injection: prefixa com aspóstrofo se começa com caractere de fórmula
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  // Escapa aspas dobrando-as
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

/** Junta uma linha de células já sanitizadas. */
export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/csv-safe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv-safe.ts src/lib/csv-safe.test.ts
git commit -m "feat(admin): csv-safe (anti-injection + escape) com testes"
```

---

## Task 6: Aplicar RBAC + limite + csv-safe nos exports

**Files:**
- Modify: `src/app/api/admin/export/clientes/route.ts`
- Modify: `src/app/api/admin/export/faturas/route.ts`
- Modify: `src/app/api/admin/export/assinaturas/route.ts`
- Modify: `src/app/api/admin/export/tickets/route.ts`
- Modify: `src/app/api/admin/export/auditoria/route.ts`
- Modify: `src/app/api/admin/export/health-scores/route.ts`

> Padrão a aplicar em cada rota (exemplo com `clientes`; replicar nas demais ajustando os campos). RBAC: só `SUPER_ADMIN` e `ADMIN` exportam. Limite: `take: 5000`. Linhas via `csvRow`.

- [ ] **Step 1: clientes — trocar guard, adicionar take e csv-safe**

Substituir o início e a montagem do CSV de `clientes/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { csvRow } from "@/lib/csv-safe";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const companies = await prisma.company.findMany({
    include: { subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const headers = ["ID","Nome Fantasia","Razão Social","CNPJ","Email","Telefone","Cidade","UF","Plano","Health Score","Criado em"];
  const rows = companies.map((c) => csvRow([
    c.id, c.tradeName || "", c.name || "", c.cnpj || "", c.email || "", c.phone || "",
    c.city || "", c.state || "", c.subscriptions[0]?.plan?.name || "", c.healthScore ?? "",
    new Date(c.createdAt).toLocaleDateString("pt-BR"),
  ]));
  const csv = [csvRow(headers), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Replicar o padrão nas outras 5 rotas**

Para cada uma (`faturas`, `assinaturas`, `tickets`, `auditoria`, `health-scores`):
1. Adicionar `import { csvRow } from "@/lib/csv-safe";`.
2. Adicionar o guard de role (`SUPER_ADMIN`/`ADMIN`) após o `getAdminSession`.
3. `take`: `clientes`/`faturas`/`assinaturas`/`tickets`/`health-scores` → adicionar `take: 5000` no `findMany`. `auditoria` **já tem `take: 5000`** → manter como está.
4. **Atenção a DOIS padrões antigos diferentes** (verificar com Read antes de editar):
   - **`clientes`, `tickets`, `auditoria`, `health-scores`** aplicam aspas inline por célula (`` `"${valor}"` ``) e fazem `headers.join(",")` / `rows.map(r => r.join(","))`. → Trocar por `csvRow(headers)` / `rows.map((r) => csvRow(r))` **e remover as aspas inline** dos valores (senão dobra).
   - **`faturas` e `assinaturas`** usam `rows.map((row) => row.map((cell) => `"${cell}"`).join(","))` (aspas em bloco, sem aspas inline). → Substituir o `row.map((cell) => `"${cell}"`).join(",")` **inteiro** por `csvRow(row)`. Não há aspas inline a remover aqui — o cuidado é remover o `.map(cell => `"${cell}"`)` para não dobrar.
5. **Verificação anti-regressão:** após editar cada rota, abrir mentalmente o CSV — nenhuma célula pode ter `""valor""` (aspas dobradas por engano). Em caso de dúvida, `npm run build` + abrir o export no passo de checagem.

> Mudança de formato consciente: campos antes sem aspas (ex. `cnpj`, `email`) agora vêm citados — é RFC 4180 correto e o Excel lê bem. Não há reimportação desses exports (o import de clientes usa caminho separado), então é seguro.

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/export/
git commit -m "fix(admin): exports com RBAC + take 5000 + csv-safe (anti OOM/injection)"
```

---

## Task 7: RBAC no audit-logs

**Files:**
- Modify: `src/app/api/admin/audit-logs/route.ts`

- [ ] **Step 1: Exigir role**

Após o check de `getAdminSession()` (que retorna 401 se ausente), adicionar:
```typescript
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
```
(`admin` é o objeto retornado por `getAdminSession`; ajustar o nome da variável ao que já existe na rota.)

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/audit-logs/route.ts
git commit -m "fix(admin): audit-logs exige role ADMIN/SUPER_ADMIN"
```

---

## Task 8: Testes de caracterização de `checkSubscription` (SEM refatorar)

**Files:**
- Create: `src/lib/subscription.test.ts`

> **Escopo (corrigido após review):** o spec diz **"NÃO entra: refactor de subscription.ts"**. Portanto **não** extraímos função nem alteramos `subscription.ts` nesta fase. Em vez disso, escrevemos **testes de caracterização** que travam o comportamento atual (rede de segurança para as fases futuras que vão mexer em cobrança).
>
> `checkSubscription` faz I/O (Prisma) e o projeto **não tem mock de Prisma**. Então testamos a **parte determinística testável sem banco**. Inspecionar `subscription.ts` primeiro e escolher UMA das duas estratégias abaixo conforme o que o código expõe:
> - **Estratégia A (preferida):** se houver (ou for trivial exportar) uma função pura pequena já isolada — ex. um helper de cálculo de dias ou um `LIVE_STATUSES`/predicado — testar essa unidade exportada **sem alterar a lógica** (só adicionar `export` a um helper já existente conta como mudança mínima aceitável, não é refactor de comportamento).
> - **Estratégia B (fallback):** se a decisão estiver toda embutida e não-exportável sem refatorar, testar `getSubscriptionInfo`/`LIVE_STATUSES` (já exportados) e os predicados exportados, cobrindo: quais status expõem features (TRIAL/ACTIVE/PAST_DUE) e quais zeram (`SUSPENDED`/`CANCELED`/`TRIAL_EXPIRED`).

- [ ] **Step 1: Ler `subscription.ts` inteiro**

Usar a ferramenta **Read** em `src/lib/subscription.ts` (NÃO usar `sed`/`cat` — proibido pelo CLAUDE.md). Ler do início ao fim (~297 linhas). Anotar:
- `LIVE_STATUSES` (valor exato) e se é `export`.
- Quais funções/predicados já são `export` e são puros (sem Prisma).
- Uso de `Math.ceil` em `daysLeft`/`daysOverdue` e o fallback `pastDueSince ?? currentPeriodEnd ?? now`.
- Tratamento de `accessEnabled` (bypass) e `isBlocked`.

- [ ] **Step 2: Escrever testes de caracterização do que JÁ é exportável e puro**

Criar `src/lib/subscription.test.ts` cobrindo o comportamento OBSERVADO (não inventado). Exemplo mínimo — ajustar aos símbolos reais exportados que o Step 1 revelar:
```typescript
import { describe, it, expect } from "vitest";
import { LIVE_STATUSES } from "./subscription"; // ajustar ao export real

describe("LIVE_STATUSES (caracterização)", () => {
  it("inclui TRIAL, ACTIVE e PAST_DUE", () => {
    expect(LIVE_STATUSES).toContain("TRIAL");
    expect(LIVE_STATUSES).toContain("ACTIVE");
    expect(LIVE_STATUSES).toContain("PAST_DUE");
  });
  it("NÃO inclui SUSPENDED, CANCELED nem TRIAL_EXPIRED", () => {
    expect(LIVE_STATUSES).not.toContain("SUSPENDED");
    expect(LIVE_STATUSES).not.toContain("CANCELED");
    expect(LIVE_STATUSES).not.toContain("TRIAL_EXPIRED");
  });
});
```
Se o Step 1 revelar um helper puro de dias/decisão exportável, adicionar `describe` cobrindo as **bordas reais** (incluindo o efeito de `Math.ceil`: ex. atraso de 7.2 dias → ainda no grace? confirmar contra o código e travar o resultado observado).

- [ ] **Step 3: Rodar e ver passar (caracterização)**

Run: `npx vitest run src/lib/subscription.test.ts`
Expected: PASS — os testes descrevem o comportamento que JÁ existe. Se algum falhar, o teste está errado (não o código); corrigir o teste para refletir a realidade.

- [ ] **Step 4: Commit**

```bash
git add src/lib/subscription.test.ts
git commit -m "test(billing): testes de caracterização de subscription.ts (LIVE_STATUSES/predicados) — rede de segurança p/ fases de cobrança"
```

> **Decisão de escopo registrada:** a extração de uma função pura `decideAccess` (que tornaria a decisão TRIAL/PAST_DUE 100% testável unitariamente) fica para a fase que de fato mexer em cobrança (F1/F2), onde o refactor é justificado e acompanhado de smoke-test em sandbox Asaas. Aqui só travamos o comportamento atual.

---

## Task 9: Gate de fim de fase + deploy

**Files:** nenhum (verificação + deploy)

- [ ] **Step 1: Type-check completo**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 2: Suíte de testes completa**

Run: `npx vitest run`
Expected: todos verdes, incluindo os novos (`admin-scope`, `csv-safe`, `subscription-status`).

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Revisão de regressão (code-reviewer)**

Dispatch do agente `code-reviewer` sobre o diff da fase (`git diff main...HEAD`). Foco: regressão no fluxo de impersonate (o botão deve continuar funcionando para SUPER_ADMIN), exports não devem duplicar aspas, `subscription.ts` deve manter comportamento. Corrigir CRITICAL/HIGH antes de seguir.

- [ ] **Step 5: Checagem de bugs (decisão do dono)**

Confirmar manualmente os caminhos sensíveis:
- Impersonate como SUPER_ADMIN ainda gera token e entra no PDV (TTL agora 30min).
- Export de clientes/faturas/assinaturas abre no Excel sem coluna quebrada, sem aspas dobradas (`""x""`) e sem executar fórmula (`=...` vira texto).
- `npx vitest run` continua verde.

> **Sobre o critério do spec "impersonate fora de escopo → 403 auditado":** com apenas 1 SUPER_ADMIN hoje, esse caminho NÃO é alcançável em prod (SUPER_ADMIN sempre passa em `canAccessCompany`). A garantia dele vem do **teste unitário `admin-scope.test.ts`** (Task 2), que prova que um admin restrito recebe `false`. O 403 real só será exercitável quando existir um AdminUser com `scopeAllCompanies=false`. Anotar isso como verificação por teste, não por smoke manual.

- [ ] **Step 6: Migration em produção + deploy**

```bash
npx prisma migrate deploy   # aplica admin_user_scope (aditiva, segura)
vercel deploy --prod --yes
```
Expected: migration aplicada; deploy ok. Smoke-test pós-deploy: login admin → impersonar uma empresa → confirmar entrada no PDV; baixar 1 export e abrir.

- [ ] **Step 7: Atualizar memória**

Registrar em `MEMORY.md` / `saas-admin-resolucao.md`: "F0 DEPLOYADA — impersonate blindado (escopo via canAccessCompany/rate-limit/TTL 30min/audit de falha), exports com RBAC+take 5000+csv-safe, audit-logs com RBAC, testes de caracterização de subscription.ts. Migration admin_user_scope aplicada em prod."

---

## Notas finais

- **DRY/YAGNI:** escopo modelado com 2 campos simples (não tabela de junção); sanitização CSV num único helper reusado por 6 rotas.
- **TDD:** Tasks 2 e 5 são test-first; Task 8 é teste de caracterização (trava comportamento existente, sem refatorar). Tasks 4, 6, 7 são mudanças em rotas com I/O (sem mock de Prisma no projeto) — cobertas pelo gate manual + code-reviewer + smoke-test.
- **Sem mudança de comportamento legítimo:** o botão de impersonate continua idêntico para o super-admin; só ganha proteções.
- **Próxima fase:** F1 (trocar plano reflete cobrança Asaas) — terá seu próprio plano, começando por adicionar `asaas.subscriptions.update`.
