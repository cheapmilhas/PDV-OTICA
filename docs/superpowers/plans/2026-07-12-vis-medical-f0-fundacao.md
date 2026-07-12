# Vis Medical — F0 (Fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer a fundação do produto "Vis Medical" dentro do Vis App — um discriminador de produto tipado na Company, um vínculo por titularidade entre empresas do mesmo dono, papéis clínicos, o esqueleto de permissões clínicas, e o super admin capaz de provisionar e alternar entre os dois produtos — sem regressão no Vis App.

**Architecture:** Empresas separadas e vinculadas (não módulo compartilhado). Uma `Company` ganha `platformProduct` (`enum PlatformProduct { VIS_APP, VIS_MEDICAL }`, default `VIS_APP`) e `ownerGroupId` (FK para um novo `model CompanyOwnerGroup`, vínculo magro por titularidade — sem compartilhar dado, diferente do `Network`). O super admin ganha um filtro de contexto por produto (cookie) que segmenta o dashboard, e o provisionador existente ganha um ramo condicional para `VIS_MEDICAL`. Papéis clínicos entram no enum `UserRole`; permissões clínicas entram no RBAC (`Permission` + seed catalog). Nesta fase não há UI clínica — só fundação.

**Tech Stack:** Next.js 16 (App Router), Prisma + Postgres/Neon, TypeScript, NextAuth (admin em `auth-admin`), Vitest, Shadcn/Tailwind.

**Environment notes:**
- **NÃO há Neon dev isolado.** `migrate dev` rodaria contra produção. Toda migração é `.sql` hand-written em `prisma/migrations/<timestamp>_<nome>/migration.sql`, aplicada com `./node_modules/.bin/prisma migrate deploy`. NÃO rodar `migrate dev`.
- `rtk` hook reescreve `npx` → use `./node_modules/.bin/` para binários.
- A tabela `Company` NÃO tem `@@map` → no SQL é `"Company"` (PascalCase entre aspas). Idem `User`.
- Migrações do projeto são **idempotentes** (`IF NOT EXISTS`, bloco `DO $$` para enums). Seguir esse padrão.
- Enum já existe: `enum ProductType` (estoque) — NÃO reusar. O discriminador novo é `PlatformProduct`.
- Há DUAS fontes de mapeamento role→permissão com nomes divergentes: `src/lib/permissions.ts` (inglês: MANAGER/SELLER/…) e `src/app/api/permissions/seed/catalog.ts` (português: GERENTE/VENDEDOR/… = enum Prisma). Ambas precisam conhecer os papéis clínicos.
- Esta rodada foi autorizada até "gerar o plano" — o dono quer **analisar antes de executar**. NÃO executar sem novo OK.

---

## File Structure

**Schema & migração (Task 1–2):**
- Modify: `prisma/schema.prisma` — `enum PlatformProduct` novo; `Company.platformProduct` + `Company.ownerGroupId`; `model CompanyOwnerGroup`; 2 valores novos em `enum UserRole`.
- Create: `prisma/migrations/<ts>_vis_medical_f0_platform_product/migration.sql` — enum + colunas + tabela + índices (aditivo, idempotente).
- Create: `prisma/migrations/<ts>_vis_medical_f0_user_role_clinical/migration.sql` — `ALTER TYPE "UserRole" ADD VALUE` (migração SEPARADA, regra do Postgres).

**RBAC clínico (Task 3):**
- Modify: `src/lib/permissions.ts` — novos códigos `Permission` clínicos + tipo `UserRole` (inglês) ganha papéis clínicos + `ROLE_PERMISSIONS`.
- Modify: `src/app/api/permissions/seed/catalog.ts` — novos códigos no array `PERMISSIONS` + `ROLE_PERMISSIONS_MAP` (português) ganha os papéis clínicos.

**Super admin — contexto de produto (Task 4–6):**
- Create: `src/lib/admin-product-context.ts` — leitura/escrita do cookie de produto ativo + helper de filtro Prisma.
- Modify: `src/app/admin/(painel)/admin-nav.tsx` — switcher de produto.
- Create: `src/app/api/admin/product-context/route.ts` — seta o cookie de produto.
- Modify: `src/app/admin/(painel)/page.tsx` — segmenta as ~15 queries por produto.

**Provisionamento (Task 7):**
- Modify: `src/app/api/admin/clientes/create/route.ts` — aceita `platformProduct` + `ownerGroupId`, ramo condicional VIS_MEDICAL.

**Verificação final (Task 8).**

---

## Task 1: Schema — enum, colunas, tabela de vínculo (sem UserRole ainda)

**Files:**
- Modify: `prisma/schema.prisma` (Company L89-228; adicionar enum e model)
- Create: `prisma/migrations/<timestamp>_vis_medical_f0_platform_product/migration.sql`

> `UserRole` fica FORA desta task — vai na Task 2, migração separada (regra do Postgres: não usar valor de enum novo na mesma transação que o cria).

- [ ] **Step 1: Adicionar o enum `PlatformProduct` ao schema**

Em `prisma/schema.prisma`, logo antes de `enum ProductType` (L3839), inserir:

```prisma
enum PlatformProduct {
  VIS_APP
  VIS_MEDICAL
}
```

- [ ] **Step 2: Adicionar campos `platformProduct` e `ownerGroupId` ao `model Company`**

Em `prisma/schema.prisma`, após `quickNote String?` (L134), inserir:

```prisma
  platformProduct         PlatformProduct          @default(VIS_APP)
  ownerGroupId            String?
```

E na lista de relações do Company (após a relação `network`, ~L153), inserir:

```prisma
  ownerGroup              CompanyOwnerGroup?       @relation("OwnerGroupCompanies", fields: [ownerGroupId], references: [id])
```

E no bloco de índices (após L227 `@@index([createdAt])`), inserir:

```prisma
  @@index([platformProduct])
  @@index([ownerGroupId])
```

- [ ] **Step 3: Adicionar o `model CompanyOwnerGroup`**

Em `prisma/schema.prisma`, junto aos outros models de agrupamento (após `model Network`, ~L2911), inserir:

```prisma
model CompanyOwnerGroup {
  id        String    @id @default(cuid())
  name      String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  companies Company[] @relation("OwnerGroupCompanies")

  @@map("company_owner_groups")
}
```

- [ ] **Step 4: Escrever a migração `.sql` (aditiva, idempotente)**

Criar `prisma/migrations/20260712120000_vis_medical_f0_platform_product/migration.sql`:

```sql
-- Vis Medical F0: discriminador de produto + vínculo por titularidade.
-- Migration ADITIVA e idempotente. Sem destrutivo. Backfill implícito pelo DEFAULT.

-- 1. Enum PlatformProduct (padrão DO $$ do projeto)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformProduct') THEN
    CREATE TYPE "PlatformProduct" AS ENUM ('VIS_APP', 'VIS_MEDICAL');
  END IF;
END$$;

-- 2. Tabela de grupo de titularidade
CREATE TABLE IF NOT EXISTS "company_owner_groups" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_owner_groups_pkey" PRIMARY KEY ("id")
);

-- 3. Colunas novas na Company (tabela SEM @@map → "Company")
--    platformProduct: NOT NULL com DEFAULT → todas as linhas existentes viram VIS_APP.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "platformProduct" "PlatformProduct" NOT NULL DEFAULT 'VIS_APP',
  ADD COLUMN IF NOT EXISTS "ownerGroupId" TEXT;

-- 4. FK ownerGroupId → company_owner_groups (SetNull: apagar o grupo não apaga a empresa)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_ownerGroupId_fkey'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_ownerGroupId_fkey"
      FOREIGN KEY ("ownerGroupId") REFERENCES "company_owner_groups"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- 5. Índices
CREATE INDEX IF NOT EXISTS "Company_platformProduct_idx" ON "Company"("platformProduct");
CREATE INDEX IF NOT EXISTS "Company_ownerGroupId_idx" ON "Company"("ownerGroupId");
```

- [ ] **Step 5: Regenerar o Prisma Client e validar o schema**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/prisma validate && ./node_modules/.bin/prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` e `Generated Prisma Client`. NÃO rodar `migrate dev`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260712120000_vis_medical_f0_platform_product/
git commit -m "feat(vis-medical): F0 schema — PlatformProduct + CompanyOwnerGroup (aditivo)"
```

---

## Task 2: Schema — papéis clínicos no enum UserRole (migração separada)

**Files:**
- Modify: `prisma/schema.prisma` (`enum UserRole` L3784-3790)
- Create: `prisma/migrations/<timestamp>_vis_medical_f0_user_role_clinical/migration.sql`

- [ ] **Step 1: Adicionar os valores clínicos ao enum no schema**

Em `prisma/schema.prisma`, `enum UserRole` (L3784-3790), adicionar dois valores:

```prisma
enum UserRole {
  ADMIN
  GERENTE
  VENDEDOR
  CAIXA
  ATENDENTE
  OFTALMOLOGISTA
  OPTOMETRISTA
}
```

- [ ] **Step 2: Escrever a migração `.sql` — SEPARADA, só ALTER TYPE**

Criar `prisma/migrations/20260712120100_vis_medical_f0_user_role_clinical/migration.sql`:

```sql
-- Vis Medical F0: papéis clínicos no enum UserRole.
-- Migração DEDICADA e idempotente. Postgres exige que ADD VALUE não seja usado
-- na mesma transação que o adiciona → esta migração NÃO usa os valores, só os cria.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'UserRole' AND e.enumlabel = 'OFTALMOLOGISTA') THEN
    ALTER TYPE "UserRole" ADD VALUE 'OFTALMOLOGISTA';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'UserRole' AND e.enumlabel = 'OPTOMETRISTA') THEN
    ALTER TYPE "UserRole" ADD VALUE 'OPTOMETRISTA';
  END IF;
END$$;
```

- [ ] **Step 3: Regenerar client e validar**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/prisma validate && ./node_modules/.bin/prisma generate`
Expected: schema válido + client gerado.

- [ ] **Step 4: Auditar pontos que assumem os 5 papéis (evitar `else → VENDEDOR`)**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && grep -rn "ATENDENTE\|requireRole\|UserRole" src/ --include=*.ts --include=*.tsx | grep -iv "test" | head -40`
Expected: uma lista de call-sites. Anotar (não corrigir aqui) quais fazem `switch(role)` exaustivo ou `else` default — vira nota para as fases clínicas. Nesta F0 os papéis existem mas não têm tela; o risco de `else` só se materializa quando forem atribuídos.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260712120100_vis_medical_f0_user_role_clinical/
git commit -m "feat(vis-medical): F0 schema — papéis clínicos OFTALMOLOGISTA/OPTOMETRISTA (migração separada)"
```

---

## Task 3: RBAC — esqueleto de permissões clínicas

**Files:**
- Modify: `src/lib/permissions.ts` (enum `Permission` L7-105; tipo `UserRole` L107; `ROLE_PERMISSIONS` L112-308; `PERMISSION_LABELS` L346)
- Modify: `src/app/api/permissions/seed/catalog.ts` (array `PERMISSIONS` L10; `ROLE_PERMISSIONS_MAP` L105)
- Test: `src/lib/__tests__/permissions-clinical.test.ts`

> Escopo F0: só o **esqueleto** de permissões (leitura/escrita de prontuário, exame, receita clínica, agenda clínica). Sem telas. Autorização clínica sempre via `requirePermission` (granular), nunca `requireRole`.

- [ ] **Step 1: Escrever o teste falho**

Criar `src/lib/__tests__/permissions-clinical.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Permission, ROLE_PERMISSIONS } from "@/lib/permissions";

describe("permissões clínicas (Vis Medical F0)", () => {
  it("define os códigos clínicos no enum Permission", () => {
    expect(Permission.CLINICAL_ENCOUNTER_VIEW).toBe("clinical.encounter.view");
    expect(Permission.CLINICAL_ENCOUNTER_CREATE).toBe("clinical.encounter.create");
    expect(Permission.CLINICAL_EXAM_CREATE).toBe("clinical.exam.create");
    expect(Permission.CLINICAL_PRESCRIPTION_ISSUE).toBe("clinical.prescription.issue");
    expect(Permission.CLINICAL_APPOINTMENT_MANAGE).toBe("clinical.appointment.manage");
  });

  it("concede permissões clínicas aos papéis clínicos e NUNCA aos comerciais", () => {
    // papéis comerciais não podem tocar dado clínico
    for (const role of ["SELLER", "CASHIER", "STOCK_MANAGER"] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(Permission.CLINICAL_ENCOUNTER_VIEW);
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run src/lib/__tests__/permissions-clinical.test.ts`
Expected: FAIL — `Permission.CLINICAL_ENCOUNTER_VIEW` é `undefined`.

- [ ] **Step 3: Adicionar os códigos ao enum `Permission`**

Em `src/lib/permissions.ts`, antes do fechamento do enum (L105, após `REMINDERS_VIEW`), inserir:

```ts
  // Clínico (Vis Medical) — dado de saúde, sempre via requirePermission
  CLINICAL_ENCOUNTER_VIEW = "clinical.encounter.view",
  CLINICAL_ENCOUNTER_CREATE = "clinical.encounter.create",
  CLINICAL_EXAM_VIEW = "clinical.exam.view",
  CLINICAL_EXAM_CREATE = "clinical.exam.create",
  CLINICAL_PRESCRIPTION_ISSUE = "clinical.prescription.issue",
  CLINICAL_APPOINTMENT_MANAGE = "clinical.appointment.manage",
```

- [ ] **Step 4: Estender o tipo `UserRole` e `ROLE_PERMISSIONS` (inglês)**

Em `src/lib/permissions.ts` L107, estender o tipo:

```ts
export type UserRole = "ADMIN" | "MANAGER" | "SELLER" | "CASHIER" | "STOCK_MANAGER" | "OPHTHALMOLOGIST" | "OPTOMETRIST";
```

E em `ROLE_PERMISSIONS` (L112-308), antes do fechamento `}` (L308), adicionar as entradas dos dois papéis clínicos (mesmo conjunto clínico para ambos nesta F0):

```ts
  OPHTHALMOLOGIST: [
    Permission.CLINICAL_ENCOUNTER_VIEW,
    Permission.CLINICAL_ENCOUNTER_CREATE,
    Permission.CLINICAL_EXAM_VIEW,
    Permission.CLINICAL_EXAM_CREATE,
    Permission.CLINICAL_PRESCRIPTION_ISSUE,
    Permission.CLINICAL_APPOINTMENT_MANAGE,
  ],
  OPTOMETRIST: [
    Permission.CLINICAL_ENCOUNTER_VIEW,
    Permission.CLINICAL_ENCOUNTER_CREATE,
    Permission.CLINICAL_EXAM_VIEW,
    Permission.CLINICAL_EXAM_CREATE,
    Permission.CLINICAL_PRESCRIPTION_ISSUE,
    Permission.CLINICAL_APPOINTMENT_MANAGE,
  ],
```

- [ ] **Step 5: Adicionar labels (`PERMISSION_LABELS`)**

Em `src/lib/permissions.ts` `PERMISSION_LABELS` (L346-442), antes do fechamento, inserir:

```ts
  [Permission.CLINICAL_ENCOUNTER_VIEW]: "Ver atendimentos clínicos",
  [Permission.CLINICAL_ENCOUNTER_CREATE]: "Registrar atendimento clínico",
  [Permission.CLINICAL_EXAM_VIEW]: "Ver exames",
  [Permission.CLINICAL_EXAM_CREATE]: "Registrar exames",
  [Permission.CLINICAL_PRESCRIPTION_ISSUE]: "Emitir receita clínica",
  [Permission.CLINICAL_APPOINTMENT_MANAGE]: "Gerenciar agenda clínica",
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run src/lib/__tests__/permissions-clinical.test.ts`
Expected: PASS.

- [ ] **Step 7: Refletir no seed catalog (runtime, nomes em português)**

Em `src/app/api/permissions/seed/catalog.ts`, no array `PERMISSIONS` (após a última entrada antes de L105), adicionar:

```ts
  // CLÍNICO (Vis Medical)
  { code: Permission.CLINICAL_ENCOUNTER_VIEW, name: PERMISSION_LABELS[Permission.CLINICAL_ENCOUNTER_VIEW], description: "Ver atendimentos clínicos", module: "clinical", category: "Clínico", sortOrder: 900 },
  { code: Permission.CLINICAL_ENCOUNTER_CREATE, name: PERMISSION_LABELS[Permission.CLINICAL_ENCOUNTER_CREATE], description: "Registrar atendimento clínico", module: "clinical", category: "Clínico", sortOrder: 901 },
  { code: Permission.CLINICAL_EXAM_VIEW, name: PERMISSION_LABELS[Permission.CLINICAL_EXAM_VIEW], description: "Ver exames", module: "clinical", category: "Clínico", sortOrder: 902 },
  { code: Permission.CLINICAL_EXAM_CREATE, name: PERMISSION_LABELS[Permission.CLINICAL_EXAM_CREATE], description: "Registrar exames", module: "clinical", category: "Clínico", sortOrder: 903 },
  { code: Permission.CLINICAL_PRESCRIPTION_ISSUE, name: PERMISSION_LABELS[Permission.CLINICAL_PRESCRIPTION_ISSUE], description: "Emitir receita clínica", module: "clinical", category: "Clínico", sortOrder: 904 },
  { code: Permission.CLINICAL_APPOINTMENT_MANAGE, name: PERMISSION_LABELS[Permission.CLINICAL_APPOINTMENT_MANAGE], description: "Gerenciar agenda clínica", module: "clinical", category: "Clínico", sortOrder: 905 },
```

E em `ROLE_PERMISSIONS_MAP` (L105-224), antes do fechamento `}` (L224), adicionar (nomes = enum Prisma):

```ts
  OFTALMOLOGISTA: [
    Permission.CLINICAL_ENCOUNTER_VIEW, Permission.CLINICAL_ENCOUNTER_CREATE,
    Permission.CLINICAL_EXAM_VIEW, Permission.CLINICAL_EXAM_CREATE,
    Permission.CLINICAL_PRESCRIPTION_ISSUE, Permission.CLINICAL_APPOINTMENT_MANAGE,
  ],
  OPTOMETRISTA: [
    Permission.CLINICAL_ENCOUNTER_VIEW, Permission.CLINICAL_ENCOUNTER_CREATE,
    Permission.CLINICAL_EXAM_VIEW, Permission.CLINICAL_EXAM_CREATE,
    Permission.CLINICAL_PRESCRIPTION_ISSUE, Permission.CLINICAL_APPOINTMENT_MANAGE,
  ],
```

- [ ] **Step 8: Rodar typecheck e commit**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

```bash
git add src/lib/permissions.ts src/app/api/permissions/seed/catalog.ts src/lib/__tests__/permissions-clinical.test.ts
git commit -m "feat(vis-medical): F0 RBAC — esqueleto de permissões clínicas + papéis clínicos"
```

---

## Task 4: Contexto de produto do super admin (cookie + helper)

**Files:**
- Create: `src/lib/admin-product-context.ts`
- Test: `src/lib/__tests__/admin-product-context.test.ts`

- [ ] **Step 1: Escrever o teste falho**

Criar `src/lib/__tests__/admin-product-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseProductContext, productWhereFilter } from "@/lib/admin-product-context";

describe("admin product context", () => {
  it("faz default para VIS_APP quando o valor é inválido ou ausente", () => {
    expect(parseProductContext(undefined)).toBe("VIS_APP");
    expect(parseProductContext("lixo")).toBe("VIS_APP");
    expect(parseProductContext("VIS_MEDICAL")).toBe("VIS_MEDICAL");
  });

  it("gera o filtro Prisma direto por produto", () => {
    expect(productWhereFilter("VIS_MEDICAL")).toEqual({ platformProduct: "VIS_MEDICAL" });
  });

  it("gera o filtro via relação company para entidades sem o campo", () => {
    expect(productWhereFilter("VIS_APP", { via: "company" })).toEqual({
      company: { platformProduct: "VIS_APP" },
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run src/lib/__tests__/admin-product-context.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o helper**

Criar `src/lib/admin-product-context.ts`:

```ts
import { cookies } from "next/headers";

export type PlatformProduct = "VIS_APP" | "VIS_MEDICAL";

const VALID: PlatformProduct[] = ["VIS_APP", "VIS_MEDICAL"];
export const PRODUCT_COOKIE = "admin.product";

/** Normaliza um valor cru de cookie para um produto válido (default VIS_APP). */
export function parseProductContext(raw: string | undefined | null): PlatformProduct {
  return VALID.includes(raw as PlatformProduct) ? (raw as PlatformProduct) : "VIS_APP";
}

/** Lê o produto ativo do cookie do super admin (Server Component / route handler). */
export async function getProductContext(): Promise<PlatformProduct> {
  const store = await cookies();
  return parseProductContext(store.get(PRODUCT_COOKIE)?.value);
}

/**
 * Filtro Prisma por produto. Sem opts → filtra direto (`platformProduct`).
 * `{ via: "company" }` → filtra via relação, para entidades que não têm o campo
 * (Subscription, Invoice).
 */
export function productWhereFilter(
  product: PlatformProduct,
  opts?: { via: "company" },
): Record<string, unknown> {
  if (opts?.via === "company") {
    return { company: { platformProduct: product } };
  }
  return { platformProduct: product };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run src/lib/__tests__/admin-product-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-product-context.ts src/lib/__tests__/admin-product-context.test.ts
git commit -m "feat(vis-medical): F0 — helper de contexto de produto do super admin"
```

---

## Task 5: Rota que seta o cookie de produto

**Files:**
- Create: `src/app/api/admin/product-context/route.ts`

- [ ] **Step 1: Implementar o handler**

Criar `src/app/api/admin/product-context/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { parseProductContext, PRODUCT_COOKIE } from "@/lib/admin-product-context";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const product = parseProductContext(body?.product);

  const res = NextResponse.json({ product });
  res.cookies.set(PRODUCT_COOKIE, product, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/product-context/route.ts
git commit -m "feat(vis-medical): F0 — rota para trocar produto ativo do super admin"
```

---

## Task 6: Switcher na nav + segmentação do dashboard

**Files:**
- Modify: `src/app/admin/(painel)/admin-nav.tsx` (return ~L70-72)
- Modify: `src/app/admin/(painel)/page.tsx` (queries L35-101)
- Test: `src/app/admin/(painel)/__tests__/dashboard-product-filter.test.ts`

- [ ] **Step 1: Teste — o dashboard aplica o filtro de produto às queries**

Criar `src/app/admin/(painel)/__tests__/dashboard-product-filter.test.ts`. Testamos a função pura de montagem de `where` (extraída no Step 3), não o Server Component:

```ts
import { describe, it, expect } from "vitest";
import { buildDashboardFilters } from "@/app/admin/(painel)/dashboard-filters";

describe("dashboard filters por produto", () => {
  it("VIS_MEDICAL filtra company direto e subscription/invoice via relação", () => {
    const f = buildDashboardFilters("VIS_MEDICAL");
    expect(f.company).toEqual({ platformProduct: "VIS_MEDICAL" });
    expect(f.subscriptionCompany).toEqual({ company: { platformProduct: "VIS_MEDICAL" } });
    expect(f.invoiceCompany).toEqual({ company: { platformProduct: "VIS_MEDICAL" } });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run "src/app/admin/(painel)/__tests__/dashboard-product-filter.test.ts"`
Expected: FAIL — módulo `dashboard-filters` não existe.

- [ ] **Step 3: Extrair a função de filtros**

Criar `src/app/admin/(painel)/dashboard-filters.ts`:

```ts
import { productWhereFilter, type PlatformProduct } from "@/lib/admin-product-context";

/** Fragmentos de `where` para as queries do dashboard, segmentados por produto. */
export function buildDashboardFilters(product: PlatformProduct) {
  return {
    // entidades com o campo direto
    company: productWhereFilter(product),
    // entidades sem o campo → filtram via relação company
    subscriptionCompany: productWhereFilter(product, { via: "company" }),
    invoiceCompany: productWhereFilter(product, { via: "company" }),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run "src/app/admin/(painel)/__tests__/dashboard-product-filter.test.ts"`
Expected: PASS.

- [ ] **Step 5: Aplicar os filtros nas queries do `page.tsx`**

Em `src/app/admin/(painel)/page.tsx`, no topo da função do Server Component (antes do `Promise.all` da L20), adicionar:

```ts
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "./dashboard-filters";
// ...
const product = await getProductContext();
const pf = buildDashboardFilters(product);
```

Então mesclar os filtros em cada query. Padrão para as de `company` direto (L35, L41, L59, L60, L77, L98, L99) — combinar com o `where` existente via spread:

```ts
// L35 antes:  prisma.company.count(),
prisma.company.count({ where: { ...pf.company } }),

// L59 antes:  prisma.company.count({ where: { healthCategory: "CRITICAL" } }),
prisma.company.count({ where: { healthCategory: "CRITICAL", ...pf.company } }),

// L98 antes:  prisma.company.count({ where: { createdAt: { gte: curStart, lte: curEnd } } }),
prisma.company.count({ where: { createdAt: { gte: curStart, lte: curEnd }, ...pf.company } }),
```

Padrão para as de `subscription` (L36-40, L51, L58) — combinar via relação:

```ts
// L36 antes:  prisma.subscription.count({ where: { status: "ACTIVE" } }),
prisma.subscription.count({ where: { status: "ACTIVE", ...pf.subscriptionCompany } }),
```

Padrão para as de `invoice` (L40, L61, L100, L101):

```ts
// L40 antes:  prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { total: true } }),
prisma.invoice.aggregate({ where: { status: "PAID", ...pf.invoiceCompany }, _sum: { total: true } }),
```

Aplicar o spread correspondente a TODAS as ~15 queries listadas nas âncoras do spec (company direto vs subscription/invoice via relação). `recentCompanies` (L41) recebe `where: { ...pf.company }`.

- [ ] **Step 6: Adicionar o switcher na nav**

Em `src/app/admin/(painel)/admin-nav.tsx`, dentro do `<nav>` (antes do `menuItems.map` na ~L72), inserir um seletor client-side. Como o arquivo já é `"use client"` (L1) e usa `usePathname`, adicionar estado e um POST para a rota da Task 5:

```tsx
// no topo do componente, junto aos outros hooks:
const [product, setProduct] = useState<"VIS_APP" | "VIS_MEDICAL">("VIS_APP");

async function switchProduct(p: "VIS_APP" | "VIS_MEDICAL") {
  setProduct(p);
  await fetch("/api/admin/product-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: p }),
  });
  window.location.reload(); // recarrega para as queries do server pegarem o novo cookie
}
```

E o controle visual, antes do `<nav>` map:

```tsx
<div className="px-3 py-2 mb-2 border-b">
  <label className="text-xs text-muted-foreground">Produto</label>
  <div className="mt-1 flex gap-1">
    <button
      type="button"
      onClick={() => switchProduct("VIS_APP")}
      className={product === "VIS_APP" ? "font-semibold underline" : ""}
    >
      Vis App
    </button>
    <span aria-hidden>·</span>
    <button
      type="button"
      onClick={() => switchProduct("VIS_MEDICAL")}
      className={product === "VIS_MEDICAL" ? "font-semibold underline" : ""}
    >
      Vis Medical
    </button>
  </div>
</div>
```

> Nota de acabamento: o estilo acima é funcional-mínimo. Ao implementar, seguir o design system do admin (`admin-redesign-light`) — usar os mesmos tokens/botões das outras telas do super admin, não classes soltas. Estado inicial pode ser hidratado lendo o cookie via um prop passado do layout server; para a F0, iniciar em VIS_APP e refletir a troca é suficiente.

- [ ] **Step 7: Adicionar `useState` ao import do React (se ausente)**

Confirmar que `admin-nav.tsx` importa `useState`. Se o import for `import { usePathname } from "next/navigation";` apenas, adicionar `import { useState } from "react";`.

- [ ] **Step 8: Typecheck + testes**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run "src/app/admin/(painel)/__tests__/dashboard-product-filter.test.ts"`
Expected: 0 erros de tipo; teste passa.

- [ ] **Step 9: Commit**

```bash
git add "src/app/admin/(painel)/admin-nav.tsx" "src/app/admin/(painel)/page.tsx" "src/app/admin/(painel)/dashboard-filters.ts" "src/app/admin/(painel)/__tests__/dashboard-product-filter.test.ts"
git commit -m "feat(vis-medical): F0 — switcher de produto + dashboard segmentado por produto"
```

---

## Task 7: Provisionar conta Vis Medical (ramo condicional)

**Files:**
- Modify: `src/app/api/admin/clientes/create/route.ts` (destructuring L35-71; validação L74-76; company.create L157-180; finance L276)
- Test: `src/app/api/admin/clientes/__tests__/create-product.test.ts`

> Padrão do arquivo: validação MANUAL (sem zod). Seguir esse padrão.

- [ ] **Step 1: Teste — a normalização de produto do provisionador**

Extraímos a decisão de produto numa função pura testável. Criar `src/app/api/admin/clientes/__tests__/create-product.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveProvisionProduct } from "@/app/api/admin/clientes/provision-product";

describe("resolveProvisionProduct", () => {
  it("default VIS_APP quando ausente", () => {
    expect(resolveProvisionProduct(undefined).platformProduct).toBe("VIS_APP");
  });
  it("aceita VIS_MEDICAL", () => {
    expect(resolveProvisionProduct("VIS_MEDICAL").platformProduct).toBe("VIS_MEDICAL");
  });
  it("VIS_MEDICAL pula o finance setup de ótica", () => {
    expect(resolveProvisionProduct("VIS_MEDICAL").runOpticalFinanceSetup).toBe(false);
    expect(resolveProvisionProduct("VIS_APP").runOpticalFinanceSetup).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run "src/app/api/admin/clientes/__tests__/create-product.test.ts"`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a função pura**

Criar `src/app/api/admin/clientes/provision-product.ts`:

```ts
import { parseProductContext, type PlatformProduct } from "@/lib/admin-product-context";

export interface ProvisionProductDecision {
  platformProduct: PlatformProduct;
  /** Finance setup de ótica (plano de contas etc.) só faz sentido no Vis App. */
  runOpticalFinanceSetup: boolean;
}

export function resolveProvisionProduct(raw: string | undefined | null): ProvisionProductDecision {
  const platformProduct = parseProductContext(raw);
  return {
    platformProduct,
    runOpticalFinanceSetup: platformProduct === "VIS_APP",
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run "src/app/api/admin/clientes/__tests__/create-product.test.ts"`
Expected: PASS.

- [ ] **Step 5: Ligar no provisionador**

Em `src/app/api/admin/clientes/create/route.ts`:

(a) No destructuring do body (L35-71), adicionar os dois campos:

```ts
  const { /* ...campos existentes... */ platformProduct: rawPlatformProduct, ownerGroupId } = body;
```

(b) Logo após a validação manual (L74-76), resolver a decisão:

```ts
  const provision = resolveProvisionProduct(rawPlatformProduct);
```

E o import no topo:

```ts
import { resolveProvisionProduct } from "./provision-product";
```

(c) Na criação da Company (L157-180), adicionar ao `data`:

```ts
      platformProduct: provision.platformProduct,
      ownerGroupId: ownerGroupId ?? null,
```

(d) No finance setup (L276), envolver na condição de produto:

```ts
      if (provision.runOpticalFinanceSetup) {
        await setupCompanyFinance(tx, company.id, branch?.id);
      }
```

(e) (validação de vínculo) Se `ownerGroupId` vier preenchido, validar existência antes da transação (após L118, junto às checagens de duplicidade):

```ts
  if (ownerGroupId) {
    const group = await prisma.companyOwnerGroup.findUnique({ where: { id: ownerGroupId } });
    if (!group) {
      return NextResponse.json({ error: "Grupo de titularidade inexistente" }, { status: 400 });
    }
  }
```

- [ ] **Step 6: Typecheck + teste**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run "src/app/api/admin/clientes/__tests__/create-product.test.ts"`
Expected: 0 erros; teste passa.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/admin/clientes/create/route.ts" "src/app/api/admin/clientes/provision-product.ts" "src/app/api/admin/clientes/__tests__/create-product.test.ts"
git commit -m "feat(vis-medical): F0 — provisionar conta Vis Medical (produto + vínculo + skip finance ótica)"
```

> **Fora do escopo F0 (nota para o implementador):** o formulário `new-client-form.tsx` ganhar o seletor de produto e o campo de vínculo é um passo de UI que pode ser feito aqui ou numa fatia de UI seguinte. A API acima já aceita os campos; o form pode enviar `platformProduct` e `ownerGroupId` quando a UI for construída. Se o dono quiser o form nesta fase, adicionar como Task 7b espelhando o padrão dos campos existentes de `new-client-form.tsx`.

---

## Task 8: Verificação final (OBRIGATÓRIA)

**Files:** nenhum novo — valida o conjunto.

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 2: Suíte de testes completa**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run`
Expected: todos passam (incluindo os 4 novos arquivos de teste desta F0 e a suíte de regressão do Vis App).

- [ ] **Step 3: Build de produção**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/next build`
Expected: build conclui sem erro.

- [ ] **Step 4: Verificação de não-regressão do Vis App (manual, conceitual)**

Confirmar por leitura: (a) todas as Companies existentes têm `platformProduct = VIS_APP` (garantido pelo DEFAULT da migração); (b) sem cookie de produto, `getProductContext()` retorna `VIS_APP` e o dashboard mostra os mesmos números de antes; (c) o provisionador de ótica (sem `platformProduct` no body) continua criando conta VIS_APP com finance setup rodando.

- [ ] **Step 5: Aplicar as migrações em produção (SÓ com OK do dono)**

> NÃO executar sem autorização explícita. Ordem obrigatória: migração ANTES do deploy.

```bash
cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/prisma migrate deploy
```
Expected: as duas migrações da F0 aplicadas (platform_product, depois user_role_clinical). Depois: deploy normal.

- [ ] **Step 6: Commit final de quaisquer ajustes**

```bash
git add -A && git commit -m "chore(vis-medical): F0 fundação — verificação final"
```

---

## Sequenciamento e dependências

- Task 1 → Task 2 (migrações separadas; UserRole depende do schema base estar coerente, mas roda em migração própria).
- Task 3 depende de Task 2 (papéis clínicos existirem no enum).
- Tasks 4, 5 são independentes entre si; Task 6 depende de 4 e 5.
- Task 7 depende de Task 1 (colunas) e Task 4 (`parseProductContext`).
- Task 8 por último.

## Fora da F0 (próximos planos, já mapeados no spec)
Núcleo clínico (agenda + prontuário SOAP + receita) → ponte receita→venda entre empresas (cruza tenant + LGPD; inclui o fix de `saleId` no cancelamento) → CRM/pós-venda/relatórios/IA → alto-custo (painel de TV, agendamento público, exames com viewer) → dono transita entre contas sem relogar.
