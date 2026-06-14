# Funil de Leads (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um Funil de Leads (CRM kanban manual) ao Vis que captura o interessado antes da venda e o conduz por etapas configuráveis até virar venda, reusando o motor Quote→Sale→Customer existente.

**Architecture:** Entidade nova e leve `Lead` (só `name` obrigatório) + `LeadStage` (colunas configuráveis por empresa). Espelha os padrões da feature `Quote`: service layer multi-tenant, rotas REST com Zod + RBAC, soft-delete, seed idempotente via `resyncCompanySetup`. Tela kanban com shadcn/ui + dnd-kit. IA/WhatsApp/tokens ficam para a Fase 2 (fora deste plano).

**Tech Stack:** Next.js (App Router) · Prisma · TypeScript · Zod · Vitest · shadcn/ui · lucide-react · react-hot-toast · @dnd-kit (drag-and-drop).

**Spec de referência:** `docs/superpowers/specs/2026-06-14-funil-leads-design.md`

---

## Convenções verificadas no código (seguir à risca)

- **⚠️ RBAC é por BANCO, não por enum em memória.** `requirePermission` (`src/lib/auth-permissions.ts`) chama `permissionService.userHasPermission`, que lê as tabelas `Permission` + `RolePermission` do banco. Essas tabelas são populadas por **`prisma/seeds/permissions-catalog.ts`** (catálogo de códigos) + **`prisma/seeds/role-permissions-map.ts`** (`ROLE_PERMISSIONS_MAP`). Editar só `src/lib/permissions.ts` NÃO basta — todo usuário não-ADMIN tomaria 403. ADMIN tem short-circuit (passa sempre), por isso o dev não percebe.
- **Roles reais (enum Prisma, em PT):** `ADMIN | GERENTE | VENDEDOR | CAIXA | ATENDENTE` (`prisma/schema.prisma`). O `role-permissions-map.ts` usa essas chaves em PT.
- **Códigos de permissão de leads (espelhar `quotes.*` reais):** `leads.access`, `leads.create`, `leads.view_own`, `leads.view_all`, `leads.edit`, `leads.delete`, `leads.convert`. (O catálogo real usa `quotes.view_own`/`quotes.view_all`, NÃO `quotes.view` — seguir esse formato.)
- **Auth numa rota:** `await requireAuth()` → `getCompanyId()` → `getBranchId()` → `getUserId()` (de `src/lib/auth-helpers.ts`). `await requirePermission("leads.create")`.
- **Rotas seguem o padrão de quotes (vale para TODAS as rotas deste plano — Tasks 9, 10, 11, 14):** usar `NextRequest`, envolver o corpo em `try { ... } catch (error) { return handleApiError(error); }` (de `src/lib/error-handler.ts`). A Task 10 mostra o padrão completo; **aplicar o mesmo `try/catch` + `handleApiError` em todas as outras rotas** (os exemplos das Tasks 9/11/14 omitem o boilerplate por brevidade, mas ele é obrigatório).
- **Erros tipados nos services:** nos services (`lead.service.ts`, `lead-stage.service.ts`), trocar `throw new Error("...")` pelos helpers tipados de `src/lib/error-handler.ts` para o status HTTP correto: `notFoundError("Lead não encontrado")` (404), `forbiddenError`/`badRequestError` (400) para validações como "Informe o motivo da perda", e `conflictError(...)` (409) para o conflito de optimistic-lock no `moveLead`. Confirmar os nomes exatos dos helpers em `src/lib/error-handler.ts` antes de usar.
- **Responses:** helpers de `src/lib/api-response.ts` — `paginatedResponse(data, pagination)`, `createdResponse(data)`, `successResponse(data)`, `deletedResponse()`. Paginação via `getPaginationParams(page, pageSize)` + `createPaginationMeta(page, pageSize, total)`.
- **Decimals:** serializar com `Number(...)` antes de retornar JSON.
- **Soft-delete:** campo `deletedAt DateTime?`; filtrar com `softDeleteFilter()` (`{ deletedAt: null }`) de `src/lib/soft-delete.ts`; registrar o model `"lead"` no union `SoftDeleteModel` e no `switch` de `softDelete()`.
- **Multi-tenant:** SEMPRE filtrar por `companyId`; `branchId` opcional.
- **Testes:** Vitest (`describe/it/vi.mock`). Rodar `npm run test -- <arquivo>`.
- **Migrations:** `npx prisma migrate dev --name <snake_case>`; nome `YYYYMMDDHHMMSS_<desc>` é gerado pelo Prisma.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `prisma/schema.prisma` | models `Lead`, `LeadStage`, enum `LeadFunnelSource` + back-relations | Modificar |
| `prisma/migrations/<ts>_lead_funnel/` | migration aditiva | Criar (via prisma) |
| `src/lib/permissions.ts` | constantes `LEADS_*` + `ROLE_PERMISSIONS` + labels | Modificar |
| `src/lib/soft-delete.ts` | registrar model `"lead"` | Modificar |
| `src/lib/validations/lead.schema.ts` | schemas Zod + tipos DTO | Criar |
| `src/services/lead-stage.service.ts` | CRUD de etapas + seed padrão | Criar |
| `src/services/lead.service.ts` | list/getById/create/update/move/convert | Criar |
| `src/services/lead-stage.service.test.ts` | testes do stage service | Criar |
| `src/services/lead.service.test.ts` | testes do lead service | Criar |
| `src/app/api/lead-stages/route.ts` | GET/POST etapas | Criar |
| `src/app/api/lead-stages/[id]/route.ts` | PATCH/DELETE etapa | Criar |
| `src/app/api/leads/route.ts` | GET lista + POST criar | Criar |
| `src/app/api/leads/[id]/route.ts` | GET/PATCH/DELETE lead | Criar |
| `src/app/api/leads/[id]/move/route.ts` | PATCH mover de etapa (optimistic-lock) | Criar |
| `src/app/api/leads/[id]/convert/route.ts` | converter em venda | Criar |
| `src/services/company-resync.service.ts` | plugar seed de LeadStage | Modificar |
| `src/app/(dashboard)/dashboard/funil/page.tsx` | tela kanban | Criar |
| `src/components/funil/*` | board, coluna, card, modais | Criar |
| sidebar/menu | item "Funil" | Modificar |

---

## Task 1: Schema — models Lead, LeadStage, enum LeadFunnelSource

**Files:**
- Modify: `prisma/schema.prisma`
- Create (via prisma): `prisma/migrations/<ts>_lead_funnel/migration.sql`

- [ ] **Step 1: Adicionar enum + models ao schema**

Em `prisma/schema.prisma`, adicionar perto dos models de CRM/Quote:

```prisma
enum LeadFunnelSource {
  WHATSAPP
  INSTAGRAM
  GOOGLE
  REFERRAL
  WALK_IN
  OTHER
}

model LeadStage {
  id        String   @id @default(cuid())
  companyId String
  name      String
  order     Int
  isWon     Boolean  @default(false)
  isLost    Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id])
  leads   Lead[]

  @@unique([companyId, name])
  @@index([companyId, order])
}

model Lead {
  id             String      @id @default(cuid())
  companyId      String
  branchId       String?
  name           String
  phone          String?
  email          String?
  interest       String?
  source         LeadFunnelSource?
  stageId        String
  sellerUserId   String?
  estimatedValue Decimal?    @db.Decimal(12, 2)
  customerId     String?
  quoteId        String?
  lostReason     String?
  notes          String?
  lastActivityAt DateTime    @default(now())
  deletedAt      DateTime?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  company  Company   @relation(fields: [companyId], references: [id])
  branch   Branch?   @relation(fields: [branchId], references: [id])
  stage    LeadStage @relation(fields: [stageId], references: [id])
  seller   User?     @relation("LeadSeller", fields: [sellerUserId], references: [id])
  customer Customer? @relation("LeadCustomer", fields: [customerId], references: [id], onDelete: SetNull)
  quote    Quote?    @relation("LeadQuote", fields: [quoteId], references: [id], onDelete: SetNull)

  @@index([companyId, stageId])
  @@index([companyId, sellerUserId])
  @@index([companyId, deletedAt])
}
```

Adicionar as back-relations nos models existentes:
- Em `model Company`: `leads Lead[]` e `leadStages LeadStage[]`
- Em `model Branch`: `leads Lead[]`
- Em `model User`: `leadsAsSeller Lead[] @relation("LeadSeller")`
- Em `model Customer`: `leads Lead[] @relation("LeadCustomer")`
- Em `model Quote`: `leads Lead[] @relation("LeadQuote")`

- [ ] **Step 2: Validar o schema**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 3: Gerar a migration aditiva**

Run: `npx prisma migrate dev --name lead_funnel`
Expected: cria `prisma/migrations/<ts>_lead_funnel/` com CREATE TYPE/TABLE/INDEX; aplica no banco local; regenera Prisma Client. Nenhum `DROP`/`ALTER` em tabela existente (apenas novas tabelas + novas colunas de relação reversa, que não alteram dados).

- [ ] **Step 4: Confirmar geração do client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(funil): schema Lead + LeadStage + enum LeadFunnelSource (migration aditiva)"
```

---

## Task 2: Permissões — leads.* (catálogo do BANCO + role-map + enum)

**Files:**
- Modify: `prisma/seeds/permissions-catalog.ts` (fonte de verdade do RBAC)
- Modify: `prisma/seeds/role-permissions-map.ts` (grants por role, em PT)
- Modify: `src/lib/permissions.ts` (enum/labels usados pela UI)

> **Por que os 3:** o `requirePermission` em runtime lê o BANCO (catálogo + role-map). O `src/lib/permissions.ts` alimenta UI/labels. Editar só o enum deixaria todo não-ADMIN com 403.

- [ ] **Step 1: Adicionar os 7 códigos `leads.*` ao catálogo**

Em `prisma/seeds/permissions-catalog.ts`, após o bloco `quotes.*`, seguindo EXATAMENTE o formato `{ code, name, description, module, category, sortOrder }`:

```typescript
  // =================================================================
  // FUNIL DE LEADS
  // =================================================================
  { code: "leads.access",    name: "Acessar Funil",         description: "Entrar na seção do funil de leads", module: "leads", category: "Funil", sortOrder: 30 },
  { code: "leads.create",    name: "Criar Leads",           description: "Cadastrar novos leads",             module: "leads", category: "Funil", sortOrder: 31 },
  { code: "leads.view_own",  name: "Ver Seus Leads",        description: "Ver apenas os próprios leads",       module: "leads", category: "Funil", sortOrder: 32 },
  { code: "leads.view_all",  name: "Ver Todos os Leads",    description: "Ver leads de todos da empresa",      module: "leads", category: "Funil", sortOrder: 33 },
  { code: "leads.edit",      name: "Editar Leads",          description: "Editar/mover leads no funil",        module: "leads", category: "Funil", sortOrder: 34 },
  { code: "leads.delete",    name: "Excluir Leads",         description: "Remover leads",                      module: "leads", category: "Funil", sortOrder: 35 },
  { code: "leads.convert",   name: "Converter Lead",        description: "Converter lead em venda",            module: "leads", category: "Funil", sortOrder: 36 },
```

> Ajustar `sortOrder` para não colidir com os existentes (conferir os números ao redor).

- [ ] **Step 2: Conceder aos papéis em `ROLE_PERMISSIONS_MAP` (chaves em PT)**

Em `prisma/seeds/role-permissions-map.ts`:
- `ADMIN`: adicionar os 7 códigos.
- `GERENTE`: adicionar os 7 (`access, create, view_own, view_all, edit, delete, convert`).
- `VENDEDOR`: adicionar `leads.access, leads.create, leads.view_own, leads.edit, leads.convert` (sem `view_all` nem `delete` — vendedor vê só os próprios).
- `CAIXA` / `ATENDENTE`: não adicionar (a menos que decisão diga o contrário).

- [ ] **Step 3: Refletir no enum/labels de UI (`src/lib/permissions.ts`)**

Adicionar as constantes ao enum `Permission` e as entradas em `PERMISSION_LABELS` (necessário pois é `Record<Permission,string>`):

```typescript
  LEADS_ACCESS = "leads.access",
  LEADS_CREATE = "leads.create",
  LEADS_VIEW_OWN = "leads.view_own",
  LEADS_VIEW_ALL = "leads.view_all",
  LEADS_EDIT = "leads.edit",
  LEADS_DELETE = "leads.delete",
  LEADS_CONVERT = "leads.convert",
```
(+ labels correspondentes). Se houver `ROLE_PERMISSIONS` em inglês neste arquivo, manter consistente, mas lembrar que NÃO é a fonte de verdade do runtime.

- [ ] **Step 4: Re-seed das permissões (local) + verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

Descobrir e rodar o seeder de permissões que o projeto usa (ex.: `npx tsx prisma/seeds/seed-permissions.ts` OU `POST /api/permissions/seed`) para popular `leads.*` no banco local. Confirmar que as rows `leads.*` existem e que um usuário VENDEDOR/GERENTE recebe as permissões.

> **Nota de deploy (registrar):** em produção, o re-seed de permissões precisa rodar após o deploy (mesma forma que `quotes.*` foi populado), senão não-ADMIN fica sem acesso. Anotar no checklist de deploy da feature.

- [ ] **Step 5: Commit**

```bash
git add prisma/seeds/permissions-catalog.ts prisma/seeds/role-permissions-map.ts src/lib/permissions.ts
git commit -m "feat(funil): permissões leads.* no catálogo + role-map (PT) + enum/labels"
```

---

## Task 3: Soft-delete — registrar model "lead"

**Files:**
- Modify: `src/lib/soft-delete.ts`

- [ ] **Step 1: Adicionar "lead" ao union e ao switch**

No tipo `SoftDeleteModel`, adicionar `| "lead"`. No `switch (model)` de `softDelete()`, adicionar:

```typescript
    case "lead":
      await client.lead.update({ where: { id }, data });
      break;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/soft-delete.ts
git commit -m "feat(funil): registrar lead no soft-delete"
```

---

## Task 4: Validação Zod — lead.schema.ts

**Files:**
- Create: `src/lib/validations/lead.schema.ts`
- Test: `src/lib/validations/lead.schema.test.ts`

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect } from "vitest";
import { createLeadSchema, leadQuerySchema, moveLeadSchema } from "./lead.schema";

describe("createLeadSchema", () => {
  it("aceita lead só com nome (resto opcional)", () => {
    const r = createLeadSchema.parse({ name: "Maria" });
    expect(r.name).toBe("Maria");
    expect(r.source).toBeUndefined();
  });

  it("rejeita lead sem nome", () => {
    expect(() => createLeadSchema.parse({})).toThrow();
  });

  it("coage estimatedValue string para number", () => {
    const r = createLeadSchema.parse({ name: "João", estimatedValue: "890.50" });
    expect(r.estimatedValue).toBe(890.5);
  });

  it("valida source contra o enum", () => {
    expect(() => createLeadSchema.parse({ name: "X", source: "TIKTOK" })).toThrow();
    expect(createLeadSchema.parse({ name: "X", source: "WHATSAPP" }).source).toBe("WHATSAPP");
  });
});

describe("leadQuerySchema", () => {
  it("aplica defaults de paginação", () => {
    const r = leadQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(50);
  });
});

describe("moveLeadSchema", () => {
  it("exige stageId e aceita updatedAt para optimistic-lock", () => {
    const r = moveLeadSchema.parse({ stageId: "stg_1", expectedUpdatedAt: "2026-06-14T00:00:00.000Z" });
    expect(r.stageId).toBe("stg_1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/lib/validations/lead.schema.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o schema**

```typescript
import { z } from "zod";
import { LeadFunnelSource } from "@prisma/client";

export const createLeadSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  interest: z.string().optional(),
  source: z.nativeEnum(LeadFunnelSource).optional(),
  stageId: z.string().optional(), // se ausente, service usa a 1ª etapa
  sellerUserId: z.string().optional(),
  estimatedValue: z.coerce.number().min(0).optional(),
  customerId: z.string().optional(),
  quoteId: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateLeadDTO = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial().extend({
  lostReason: z.string().optional(),
});
export type UpdateLeadDTO = z.infer<typeof updateLeadSchema>;

export const moveLeadSchema = z.object({
  stageId: z.string().min(1),
  lostReason: z.string().optional(), // obrigatório quando a etapa destino é isLost (validado no service)
  expectedUpdatedAt: z.string().optional(), // optimistic-lock
});
export type MoveLeadDTO = z.infer<typeof moveLeadSchema>;

export const leadQuerySchema = z.object({
  search: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
  stageId: z.string().optional(),
  source: z.nativeEnum(LeadFunnelSource).optional(),
  sellerUserId: z.string().optional(),
  branchId: z.string().optional(),
});
export type LeadQuery = z.infer<typeof leadQuerySchema>;

export const createLeadStageSchema = z.object({
  name: z.string().min(1, "Nome da etapa é obrigatório"),
  order: z.coerce.number().int().min(0),
  isWon: z.boolean().optional().default(false),
  isLost: z.boolean().optional().default(false),
});
export type CreateLeadStageDTO = z.infer<typeof createLeadStageSchema>;

export const updateLeadStageSchema = createLeadStageSchema.partial();
export type UpdateLeadStageDTO = z.infer<typeof updateLeadStageSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/lib/validations/lead.schema.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/lead.schema.ts src/lib/validations/lead.schema.test.ts
git commit -m "feat(funil): schemas Zod de Lead e LeadStage + testes"
```

---

## Task 5: LeadStage service + seed padrão

**Files:**
- Create: `src/services/lead-stage.service.ts`
- Test: `src/services/lead-stage.service.test.ts`

As etapas padrão (constante exportada para reuso no resync):
`Novo` (order 0) → `Em atendimento` (1) → `Orçamento enviado` (2) → `Fechado` (3, isWon) → `Perdido` (4, isLost).

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_LEAD_STAGES, ensureDefaultStages } from "./lead-stage.service";

vi.mock("@/lib/prisma", () => ({
  prisma: { leadStage: { count: vi.fn(), createMany: vi.fn() } },
}));
import { prisma } from "@/lib/prisma";

describe("DEFAULT_LEAD_STAGES", () => {
  it("tem 5 etapas com exatamente 1 isWon e 1 isLost", () => {
    expect(DEFAULT_LEAD_STAGES).toHaveLength(5);
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isWon)).toHaveLength(1);
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isLost)).toHaveLength(1);
  });
});

describe("ensureDefaultStages (idempotente/aditivo)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não cria nada se a empresa já tem etapas", async () => {
    (prisma.leadStage.count as any).mockResolvedValue(5);
    const created = await ensureDefaultStages("co_1");
    expect(created).toBe(0);
    expect(prisma.leadStage.createMany).not.toHaveBeenCalled();
  });

  it("cria as etapas padrão se a empresa não tem nenhuma", async () => {
    (prisma.leadStage.count as any).mockResolvedValue(0);
    (prisma.leadStage.createMany as any).mockResolvedValue({ count: 5 });
    const created = await ensureDefaultStages("co_1");
    expect(created).toBe(5);
    expect(prisma.leadStage.createMany).toHaveBeenCalledWith({
      data: DEFAULT_LEAD_STAGES.map((s) => ({ ...s, companyId: "co_1" })),
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/lead-stage.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o service**

```typescript
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const DEFAULT_LEAD_STAGES = [
  { name: "Novo", order: 0, isWon: false, isLost: false },
  { name: "Em atendimento", order: 1, isWon: false, isLost: false },
  { name: "Orçamento enviado", order: 2, isWon: false, isLost: false },
  { name: "Fechado", order: 3, isWon: true, isLost: false },
  { name: "Perdido", order: 4, isWon: false, isLost: true },
] as const;

/** Aditivo + idempotente: cria as etapas padrão só se a empresa não tem nenhuma. Retorna nº criado. */
export async function ensureDefaultStages(
  companyId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? prisma;
  const existing = await client.leadStage.count({ where: { companyId } });
  if (existing > 0) return 0;
  const res = await client.leadStage.createMany({
    data: DEFAULT_LEAD_STAGES.map((s) => ({ ...s, companyId })),
  });
  return res.count;
}

export async function listStages(companyId: string) {
  return prisma.leadStage.findMany({ where: { companyId }, orderBy: { order: "asc" } });
}

export async function createStage(
  companyId: string,
  data: { name: string; order: number; isWon?: boolean; isLost?: boolean }
) {
  return prisma.leadStage.create({ data: { ...data, companyId } });
}

export async function updateStage(
  id: string,
  companyId: string,
  data: { name?: string; order?: number; isWon?: boolean; isLost?: boolean }
) {
  // garante isolamento por empresa
  const stage = await prisma.leadStage.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!stage) throw new Error("Etapa não encontrada");
  return prisma.leadStage.update({ where: { id }, data });
}

/** Bloqueia apagar etapa terminal ou com leads dentro. */
export async function deleteStage(id: string, companyId: string) {
  const stage = await prisma.leadStage.findFirst({ where: { id, companyId } });
  if (!stage) throw new Error("Etapa não encontrada");
  if (stage.isWon || stage.isLost) throw new Error("Não é possível apagar etapas Fechado/Perdido");
  const leadsInStage = await prisma.lead.count({ where: { stageId: id, deletedAt: null } });
  if (leadsInStage > 0) throw new Error("Mova os leads desta etapa antes de apagá-la");
  await prisma.leadStage.delete({ where: { id } });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/lead-stage.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/lead-stage.service.ts src/services/lead-stage.service.test.ts
git commit -m "feat(funil): LeadStage service + seed padrão idempotente"
```

---

## Task 6: Lead service — create (só nome) + dedupe warning

**Files:**
- Create: `src/services/lead.service.ts`
- Test: `src/services/lead.service.test.ts`

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    leadStage: { findFirst: vi.fn() },
    lead: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { createLead } from "./lead.service";

beforeEach(() => vi.clearAllMocks());

describe("createLead", () => {
  it("cria lead só com nome, usando a 1ª etapa quando stageId não é dado", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue(null); // sem duplicado
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_1", name: "Maria", stageId: "stg_novo" });

    const r = await createLead({ name: "Maria" }, "co_1", "user_1", "br_1");
    expect(r.lead.stageId).toBe("stg_novo");
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it("lança se a empresa não tem nenhuma etapa", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue(null);
    await expect(createLead({ name: "X" }, "co_1", "u", "b")).rejects.toThrow();
  });

  it("retorna duplicateWarning quando há lead ativo com mesmo telefone", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "lead_old" }); // duplicado
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_2", name: "Maria" });

    const r = await createLead({ name: "Maria", phone: "85999" }, "co_1", "u", "b");
    expect(r.duplicateWarning).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar createLead**

```typescript
import { prisma } from "@/lib/prisma";
import { softDeleteFilter } from "@/lib/soft-delete";
import type { CreateLeadDTO } from "@/lib/validations/lead.schema";

export async function createLead(
  data: CreateLeadDTO,
  companyId: string,
  userId: string,
  branchId: string | null
) {
  // Resolve a etapa: usa a fornecida (validada por empresa) ou a 1ª (menor order)
  let stageId = data.stageId;
  if (stageId) {
    const stage = await prisma.leadStage.findFirst({
      where: { id: stageId, companyId },
      select: { id: true },
    });
    if (!stage) throw new Error("Etapa inválida");
  } else {
    const first = await prisma.leadStage.findFirst({
      where: { companyId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!first) throw new Error("Funil não configurado: nenhuma etapa encontrada");
    stageId = first.id;
  }

  // Dedupe não-bloqueante por telefone
  let duplicateWarning = false;
  if (data.phone) {
    const dup = await prisma.lead.findFirst({
      where: { companyId, phone: data.phone, ...softDeleteFilter() },
      select: { id: true },
    });
    duplicateWarning = !!dup;
  }

  const lead = await prisma.lead.create({
    data: {
      companyId,
      branchId,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      interest: data.interest,
      source: data.source,
      stageId,
      sellerUserId: data.sellerUserId ?? userId,
      estimatedValue: data.estimatedValue,
      customerId: data.customerId,
      quoteId: data.quoteId,
      notes: data.notes,
    },
  });

  return { lead, duplicateWarning };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/lead.service.ts src/services/lead.service.test.ts
git commit -m "feat(funil): lead.service.createLead (só nome, 1ª etapa, dedupe warning)"
```

---

## Task 7: Lead service — list (multi-tenant + view_all) e getById

**Files:**
- Modify: `src/services/lead.service.ts`
- Modify: `src/services/lead.service.test.ts`

- [ ] **Step 1: Adicionar testes**

```typescript
import { listLeads } from "./lead.service";

describe("listLeads", () => {
  it("filtra sempre por companyId e deletedAt:null", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "" } as any, "co_1", null, { viewAll: true, userId: "u" });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.companyId).toBe("co_1");
    expect(where.deletedAt).toBeNull();
  });

  it("quando viewAll=false, filtra pelo sellerUserId do usuário", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);
    (prisma.lead.count as any).mockResolvedValue(0);
    await listLeads({ page: 1, pageSize: 50, search: "" } as any, "co_1", null, { viewAll: false, userId: "u_5" });
    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where.sellerUserId).toBe("u_5");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: FAIL (funções não existem).

- [ ] **Step 3: Implementar listLeads + getLeadById**

```typescript
import { getPaginationParams, createPaginationMeta } from "@/lib/api-response";
import type { LeadQuery } from "@/lib/validations/lead.schema";

const LEAD_INCLUDE = {
  stage: true,
  seller: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  quote: { select: { id: true, total: true, status: true } },
} as const;

export async function listLeads(
  query: LeadQuery,
  companyId: string,
  branchId: string | null,
  access: { viewAll: boolean; userId: string }
) {
  const where: any = { companyId, deletedAt: null };
  if (branchId) where.branchId = branchId;
  if (query.stageId) where.stageId = query.stageId;
  if (query.source) where.source = query.source;
  if (query.sellerUserId) where.sellerUserId = query.sellerUserId;
  if (!access.viewAll) where.sellerUserId = access.userId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { interest: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const { skip, take } = getPaginationParams(query.page, query.pageSize);
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, include: LEAD_INCLUDE, orderBy: { lastActivityAt: "desc" }, skip, take }),
    prisma.lead.count({ where }),
  ]);

  return {
    data: rows.map(serializeLead),
    pagination: createPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function getLeadById(id: string, companyId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    include: LEAD_INCLUDE,
  });
  if (!lead) throw new Error("Lead não encontrado");
  return serializeLead(lead);
}

function serializeLead(l: any) {
  return {
    ...l,
    estimatedValue: l.estimatedValue == null ? null : Number(l.estimatedValue),
    quote: l.quote ? { ...l.quote, total: Number(l.quote.total) } : null,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/lead.service.ts src/services/lead.service.test.ts
git commit -m "feat(funil): lead.service list (view_all + multi-tenant) e getById"
```

---

## Task 8: Lead service — move (optimistic-lock + lostReason em isLost) e update/softDelete

**Files:**
- Modify: `src/services/lead.service.ts`
- Modify: `src/services/lead.service.test.ts`

- [ ] **Step 1: Adicionar testes**

```typescript
import { moveLead } from "./lead.service";

describe("moveLead", () => {
  it("exige lostReason ao mover para etapa isLost", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_lost", isLost: true, isWon: false });
    await expect(
      moveLead("l1", { stageId: "stg_lost" } as any, "co_1")
    ).rejects.toThrow(/motivo/i);
  });

  it("detecta conflito de optimistic-lock (expectedUpdatedAt diferente)", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    await expect(
      moveLead("l1", { stageId: "stg2", expectedUpdatedAt: "2026-06-14T09:00:00.000Z" } as any, "co_1")
    ).rejects.toThrow(/atualizado/i);
  });

  it("move e atualiza lastActivityAt no caminho feliz", async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "l1", updatedAt: new Date("2026-06-14T10:00:00Z") });
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg2", isLost: false, isWon: false });
    (prisma.lead.update as any).mockResolvedValue({ id: "l1", stageId: "stg2" });
    await moveLead("l1", { stageId: "stg2" } as any, "co_1");
    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    expect(data.stageId).toBe("stg2");
    expect(data.lastActivityAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar moveLead + updateLead + deleteLead**

```typescript
import { softDelete } from "@/lib/soft-delete";
import type { MoveLeadDTO, UpdateLeadDTO } from "@/lib/validations/lead.schema";

export async function moveLead(id: string, data: MoveLeadDTO, companyId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true, updatedAt: true },
  });
  if (!lead) throw new Error("Lead não encontrado");

  if (data.expectedUpdatedAt && new Date(data.expectedUpdatedAt).getTime() !== lead.updatedAt.getTime()) {
    throw new Error("Este lead foi atualizado por outra pessoa. Recarregue o funil.");
  }

  const stage = await prisma.leadStage.findFirst({
    where: { id: data.stageId, companyId },
    select: { id: true, isLost: true },
  });
  if (!stage) throw new Error("Etapa inválida");
  if (stage.isLost && !data.lostReason) {
    throw new Error("Informe o motivo da perda");
  }

  return prisma.lead.update({
    where: { id },
    data: {
      stageId: data.stageId,
      lostReason: stage.isLost ? data.lostReason : null,
      lastActivityAt: new Date(),
    },
  });
}

export async function updateLead(id: string, data: UpdateLeadDTO, companyId: string) {
  const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } });
  if (!lead) throw new Error("Lead não encontrado");
  return prisma.lead.update({
    where: { id },
    data: {
      ...data,
      email: data.email === "" ? null : data.email,
      lastActivityAt: new Date(),
    },
  });
}

export async function deleteLead(id: string, companyId: string) {
  const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } });
  if (!lead) throw new Error("Lead não encontrado");
  await softDelete("lead", id);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/lead.service.ts src/services/lead.service.test.ts
git commit -m "feat(funil): lead.service move (optimistic-lock + lostReason), update, softDelete"
```

---

## Task 9: Rotas API — /api/lead-stages

**Files:**
- Create: `src/app/api/lead-stages/route.ts`
- Create: `src/app/api/lead-stages/[id]/route.ts`

- [ ] **Step 1: Implementar GET/POST de etapas**

`src/app/api/lead-stages/route.ts`:

```typescript
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse, createdResponse } from "@/lib/api-response";
import { listStages, createStage, ensureDefaultStages } from "@/services/lead-stage.service";
import { createLeadStageSchema } from "@/lib/validations/lead.schema";

export async function GET() {
  await requireAuth();
  await requirePermission("leads.access");
  const companyId = await getCompanyId();
  await ensureDefaultStages(companyId); // garante funil pronto no 1º acesso
  const stages = await listStages(companyId);
  return successResponse(stages);
}

export async function POST(request: Request) {
  await requireAuth();
  await requirePermission("leads.edit");
  const companyId = await getCompanyId();
  const data = createLeadStageSchema.parse(await request.json());
  const stage = await createStage(companyId, data);
  return createdResponse(stage);
}
```

- [ ] **Step 2: Implementar PATCH/DELETE de etapa**

`src/app/api/lead-stages/[id]/route.ts`:

```typescript
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse, deletedResponse } from "@/lib/api-response";
import { updateStage, deleteStage } from "@/services/lead-stage.service";
import { updateLeadStageSchema } from "@/lib/validations/lead.schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await requirePermission("leads.edit");
  const companyId = await getCompanyId();
  const { id } = await params;
  const data = updateLeadStageSchema.parse(await request.json());
  const stage = await updateStage(id, companyId, data);
  return successResponse(stage);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await requirePermission("leads.edit");
  const companyId = await getCompanyId();
  const { id } = await params;
  await deleteStage(id, companyId);
  return deletedResponse();
}
```

> Nota: confirmar a assinatura de `params` (Promise vs objeto) consultando uma rota `[id]` existente, ex.: `src/app/api/quotes/[id]/route.ts`, e seguir o mesmo padrão.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/lead-stages
git commit -m "feat(funil): rotas /api/lead-stages (GET/POST/PATCH/DELETE)"
```

---

## Task 10: Rotas API — /api/leads (list + create)

**Files:**
- Create: `src/app/api/leads/route.ts`

- [ ] **Step 1: Implementar GET (list) + POST (create)**

> **Imports corretos (verificados):** o guard de assinatura é `requireWriteAccess` de **`@/lib/subscription`** (NÃO `@/lib/subscription-guard`, que não existe). O `PermissionService` é uma **classe** exportada de `@/services/permission.service` (não há instância `permissionService` exportada) — instanciar localmente. Usar `NextRequest` + `try/catch` + `handleApiError`, como em `src/app/api/quotes/[id]/route.ts`.

```typescript
import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, getBranchId, requirePermission } from "@/lib/auth-helpers";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { requireWriteAccess } from "@/lib/subscription";
import { handleApiError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";
import { listLeads, createLead } from "@/services/lead.service";
import { createLeadSchema, leadQuerySchema } from "@/lib/validations/lead.schema";

const permissionService = new PermissionService();

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const query = leadQuerySchema.parse(Object.fromEntries(searchParams));

    const branchId = searchParams.get("branchId");
    const effectiveBranchId = branchId && branchId !== "ALL" ? branchId : null;

    const viewAll =
      session.user.role === "ADMIN" ||
      (await permissionService.userHasPermission(userId, "leads.view_all"));

    const result = await listLeads(query, companyId, effectiveBranchId, { viewAll, userId });
    return paginatedResponse(result.data, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requireWriteAccess(companyId);
    await requirePermission("leads.create");
    const userId = session.user.id;
    const branchId = session.user.branchId ?? null; // lead permite branch nulo (ler da sessão, não lançar)

    const data = createLeadSchema.parse(await request.json());
    const { lead, duplicateWarning } = await createLead(data, companyId, userId, branchId);

    return createdResponse({
      ...lead,
      estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue),
      duplicateWarning,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

> Confirmar a assinatura exata de `requireWriteAccess` (em `src/lib/subscription.ts`) e de `userHasPermission` antes de usar. Confirmar que `requireWriteAccess` recebe `companyId`.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/leads/route.ts
git commit -m "feat(funil): rota /api/leads (GET lista com view_all + POST cria)"
```

---

## Task 11: Rotas API — /api/leads/[id], /move, /convert

**Files:**
- Create: `src/app/api/leads/[id]/route.ts`
- Create: `src/app/api/leads/[id]/move/route.ts`
- Create: `src/app/api/leads/[id]/convert/route.ts`

- [ ] **Step 1: GET/PATCH/DELETE do lead**

`src/app/api/leads/[id]/route.ts`:

```typescript
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse, deletedResponse } from "@/lib/api-response";
import { getLeadById, updateLead, deleteLead } from "@/services/lead.service";
import { updateLeadSchema } from "@/lib/validations/lead.schema";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await requirePermission("leads.access");
  const companyId = await getCompanyId();
  const { id } = await params;
  return successResponse(await getLeadById(id, companyId));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await requirePermission("leads.edit");
  const companyId = await getCompanyId();
  const { id } = await params;
  const data = updateLeadSchema.parse(await request.json());
  const lead = await updateLead(id, data, companyId);
  return successResponse({ ...lead, estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue) });
}

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await requirePermission("leads.delete");
  const companyId = await getCompanyId();
  const { id } = await params;
  await deleteLead(id, companyId);
  return deletedResponse();
}
```

- [ ] **Step 2: PATCH /move**

`src/app/api/leads/[id]/move/route.ts`:

```typescript
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { moveLead } from "@/services/lead.service";
import { moveLeadSchema } from "@/lib/validations/lead.schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await requirePermission("leads.edit");
  const companyId = await getCompanyId();
  const { id } = await params;
  const data = moveLeadSchema.parse(await request.json());
  const lead = await moveLead(id, data, companyId);
  return successResponse(lead);
}
```

- [ ] **Step 3: POST /convert (deep-link ao fluxo Quote→Sale existente)**

`src/app/api/leads/[id]/convert/route.ts`:

Para a Fase 1, o convert **não cria venda server-side** (o motor de venda exige itens/pagamento que o lead não tem). Em vez disso, retorna os dados necessários para o front abrir o PDV/Quote pré-preenchido, marca o lead como "ganho" e vincula. Comportamento:

```typescript
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { getLeadById } from "@/services/lead.service";

export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  await requirePermission("leads.convert");
  const companyId = await getCompanyId();
  const { id } = await params;
  const lead = await getLeadById(id, companyId);

  // Se o lead já tem quoteId, o front reusa esse orçamento; senão, abre o PDV pré-preenchido.
  return successResponse({
    leadId: lead.id,
    customerId: lead.customer?.id ?? null,
    quoteId: lead.quote?.id ?? null,
    prefill: { name: lead.name, phone: lead.phone, interest: lead.interest },
  });
}
```

> A movimentação do lead para a etapa `isWon` acontece via `/move` (UI chama os dois). Manter o convert idempotente e sem efeitos colaterais de venda nesta fase.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads
git commit -m "feat(funil): rotas /api/leads/[id], /move (optimistic-lock), /convert (prefill)"
```

---

## Task 12: Seed de etapas no resync das empresas existentes

**Files:**
- Modify: `src/services/company-resync.service.ts`

- [ ] **Step 1: Plugar ensureDefaultStages no resync**

Em `resyncCompanySetup()`, dentro da transação de setup (junto de `setupCompanyFinance`), chamar:

```typescript
import { ensureDefaultStages } from "@/services/lead-stage.service";
// ...
await prisma.$transaction(async (tx) => {
  await setupCompanyFinance(tx, companyId, branch?.id, { additiveOnly: true });
  await ensureDefaultStages(companyId, tx); // aditivo + idempotente
});
```

> Verificar a forma exata da transação no arquivo e inserir a chamada no mesmo bloco. Como `ensureDefaultStages` já é no-op quando há etapas, é seguro rodar no cron diário.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: (Opcional) Rodar resync local de uma empresa de teste**

Se houver script/CLI de resync (ex.: rota admin ou `npx tsx`), rodar em dry-run e confirmar que reportaria criação de etapas para empresas sem funil.

- [ ] **Step 4: Commit**

```bash
git add src/services/company-resync.service.ts
git commit -m "feat(funil): seed de LeadStage via resyncCompanySetup (backfill empresas existentes)"
```

---

## Task 13: UI — tela do funil (kanban) e componentes

**Files:**
- Create: `src/app/(dashboard)/dashboard/funil/page.tsx`
- Create: `src/components/funil/funil-board.tsx`
- Create: `src/components/funil/lead-card.tsx`
- Create: `src/components/funil/novo-lead-modal.tsx`
- Create: `src/components/funil/lost-reason-modal.tsx`

> Confirmar a lib de DnD já usada no projeto (`@dnd-kit/*`). Se não houver, instalar `@dnd-kit/core @dnd-kit/sortable` antes (e commitar o package.json). Seguir os componentes shadcn/ui existentes (Card, Button, Dialog, Input, Select, Badge), `lucide-react` e `react-hot-toast` como nas outras telas (`dashboard/orcamentos/page.tsx` é a referência).

- [ ] **Step 1: Página container (fetch de stages + leads)**

`funil/page.tsx` (client component): busca `GET /api/lead-stages` e `GET /api/leads` (agrupa leads por `stageId`), usa `useBranchContext()` para filtro de filial, renderiza `<FunilBoard>`. Inclui botão "Novo Lead", filtros (origem, vendedor, busca) e link/aba de métricas (Task 14).

- [ ] **Step 2: Board kanban**

`funil-board.tsx`: colunas = stages ordenadas; cada coluna lista `<LeadCard>` filtrados por `stageId`. Drag-and-drop entre colunas → chama `PATCH /api/leads/[id]/move` com `expectedUpdatedAt`. Se a etapa destino é `isLost`, abre `<LostReasonModal>` antes de confirmar. Se `isWon`, chama `/convert` e oferece abrir o PDV/Quote. Em conflito de optimistic-lock (erro), exibe toast e recarrega. Limite de cards por coluna com "carregar mais"; coluna "Perdido" oculta antigos por padrão.

- [ ] **Step 3: Card do lead**

`lead-card.tsx`: mostra nome, interesse, ícone de origem, vendedor, valor estimado (formatado BRL) e "parado há X dias" (a partir de `lastActivityAt`).

- [ ] **Step 4: Modais**

`novo-lead-modal.tsx`: form com **só nome obrigatório** + opcionais (telefone, email, interesse, origem, vendedor, valor). Ao submeter, `POST /api/leads`; se `duplicateWarning`, mostrar aviso não-bloqueante.
`lost-reason-modal.tsx`: input de motivo, obrigatório, ao mover para "Perdido".

- [ ] **Step 5: Adicionar item "Funil" no menu/sidebar**

Localizar o componente de navegação (sidebar) usado nas outras páginas do dashboard e adicionar o item "Funil" apontando para `/dashboard/funil`, protegido por `leads.view` (usar o componente de permissão `Can`/`FeatureGate` conforme o padrão do projeto).

- [ ] **Step 6: Smoke manual (dev server)**

Run: `npm run dev` e abrir `/dashboard/funil`.
Expected: board com as 5 colunas; criar um lead só com nome aparece em "Novo"; arrastar para outra coluna persiste; arrastar para "Perdido" pede motivo.

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/dashboard/funil src/components/funil package.json package-lock.json
git commit -m "feat(funil): tela kanban (board, card, modais) + item no menu"
```

---

## Task 14: Métricas do funil (quick wins)

**Files:**
- Modify: `src/services/lead.service.ts`
- Modify: `src/services/lead.service.test.ts`
- Create: `src/app/api/leads/stats/route.ts`
- Modify: `src/app/(dashboard)/dashboard/funil/page.tsx` (aba/seção de métricas)

- [ ] **Step 1: Teste de getLeadStats**

```typescript
import { getLeadStats } from "./lead.service";

describe("getLeadStats", () => {
  it("calcula conversão = ganhos / total e agrega lostReason e source", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { stage: { isWon: true, isLost: false }, source: "WHATSAPP", lostReason: null },
      { stage: { isWon: false, isLost: true }, source: "INSTAGRAM", lostReason: "Preço" },
      { stage: { isWon: false, isLost: false }, source: "WHATSAPP", lostReason: null },
    ]);
    const s = await getLeadStats("co_1", null);
    expect(s.total).toBe(3);
    expect(s.won).toBe(1);
    expect(s.conversionRate).toBeCloseTo(1 / 3);
    expect(s.byLostReason["Preço"]).toBe(1);
    expect(s.bySource["WHATSAPP"]).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar getLeadStats**

```typescript
export async function getLeadStats(companyId: string, branchId: string | null) {
  const where: any = { companyId, deletedAt: null };
  if (branchId) where.branchId = branchId;
  const leads = await prisma.lead.findMany({
    where,
    select: { source: true, lostReason: true, stage: { select: { isWon: true, isLost: true } } },
  });
  const total = leads.length;
  const won = leads.filter((l) => l.stage.isWon).length;
  const byLostReason: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const l of leads) {
    if (l.stage.isLost && l.lostReason) byLostReason[l.lostReason] = (byLostReason[l.lostReason] ?? 0) + 1;
    if (l.source) bySource[l.source] = (bySource[l.source] ?? 0) + 1;
  }
  return { total, won, conversionRate: total ? won / total : 0, byLostReason, bySource };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/services/lead.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Rota /api/leads/stats**

```typescript
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { getLeadStats } from "@/services/lead.service";

export async function GET(request: Request) {
  await requireAuth();
  await requirePermission("leads.access");
  const companyId = await getCompanyId();
  const branchId = new URL(request.url).searchParams.get("branchId");
  const stats = await getLeadStats(companyId, branchId && branchId !== "ALL" ? branchId : null);
  return successResponse(stats);
}
```

- [ ] **Step 6: Exibir na tela** (conversão, "por que perdemos", origem que converte) — seção simples com Cards/Badges.

- [ ] **Step 7: Commit**

```bash
git add src/services/lead.service.ts src/services/lead.service.test.ts src/app/api/leads/stats src/app/(dashboard)/dashboard/funil/page.tsx
git commit -m "feat(funil): métricas (conversão, motivos de perda, origem) + rota stats"
```

---

## Task 15: Verificação final

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm run test`
Expected: todos verdes (incluindo os novos de lead/stage/schema).

- [ ] **Step 2: Typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros de tipo; build conclui.

- [ ] **Step 3: Revisar a migration**

Confirmar que `prisma/migrations/<ts>_lead_funnel/migration.sql` é **aditiva** (só CREATE; sem DROP/ALTER destrutivo em tabelas existentes).

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(funil): verificação final (testes + build + migration aditiva)"
```

---

## Notas de fronteira (Fase 2 — NÃO implementar aqui)

O `Lead` já tem `source` e campos abertos para a IA preencher; nenhuma porta fechada. A Fase 2 (Evolution API por ótica, IA Claude qualificando leads, medição de tokens com liga/desliga no super admin e consumo nas configurações da ótica) é plano separado. O histórico de conversa da Fase 2 deve reusar/estender o `CrmContact` existente, não criar nova tabela de interação.
