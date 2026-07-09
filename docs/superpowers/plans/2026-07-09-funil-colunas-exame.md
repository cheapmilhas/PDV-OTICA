# Funil de Ótica — Colunas de Exame + Gerenciar Colunas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao funil de leads da ótica colunas específicas do negócio (Exame agendado, Exame feito, Aguardando OS/lab), uma UI para o dono gerenciar as colunas, e um sinal automático que move o card para "Exame feito" quando o cliente compra **só** um exame de vista.

**Architecture:** Três blocos independentes-mas-encadeados. (1) **Backend do sinal de exame:** o helper `linkLeadAndMaybeWinInTx` (que hoje move qualquer venda ligada a um lead direto para "Ganho/Fechado") passa a detectar venda só-de-exame (`Product.isEyeExam`) e mirar o estágio "Exame feito" em vez de "Fechado". O estágio "Exame feito" é identificado por uma **flag estável** `systemKey` (nova coluna nullable no `LeadStage`), NÃO por nome — porque nome é editável pelo dono e o código já sofre com identificação por substring de nome (`funnel-advance.ts:52`). (2) **Colunas padrão de ótica:** as óticas novas nascem com as 8 colunas; a ação de seed adiciona as 3 novas colunas às óticas existentes de forma aditiva e idempotente. (3) **UI de gerenciar colunas** na aba Funil (usa o CRUD `/api/lead-stages` que já existe mas não tinha tela) + **botão "mover para coluna" no inbox** de conversas.

**Tech Stack:** Next.js 16 (App Router), Prisma + Neon (PostgreSQL), TypeScript, React, shadcn/ui, Vitest.

**Environment notes:**
- **Migração MANUAL antes do deploy:** `./node_modules/.bin/prisma migrate deploy` (o merge NÃO deploya prod; deploy é manual via `vercel deploy --prod --yes`). O rtk hook quebra `npx` → usar `./node_modules/.bin/`.
- A coluna nova `systemKey` é **nullable, aditiva, sem backfill** — óticas existentes não são tocadas pela migração; ganham as colunas de ótica ao rodar a ação de seed (Task 6).
- **NÃO** rodar `next lint` (não existe no Next 16.2.6). Typecheck = `./node_modules/.bin/tsc --noEmit`. Testes = `./node_modules/.bin/vitest run`.
- Multi-tenant: **SEMPRE `companyId` em todo filtro Prisma.**

---

## File Structure

**Novos arquivos:**
- `prisma/migrations/20260709120000_lead_stage_system_key/migration.sql` — adiciona `LeadStage.systemKey` (nullable) + índice único parcial `(companyId, systemKey)`.
- `src/lib/lead-stage-keys.ts` — constantes das flags estáveis de estágio (`EXAM_DONE` etc.) e helper puro para achar um estágio por `systemKey`. Fonte única, testável, sem tocar banco.
- `src/components/funil/gerenciar-colunas-dialog.tsx` — Dialog shadcn para criar/renomear/reordenar/excluir colunas do funil (consome `/api/lead-stages`).
- `src/components/funil/mover-coluna-inbox.tsx` — controle "mover para coluna" dentro de um item do inbox (consome `/api/leads/[id]/move`).
- Testes: `src/lib/__tests__/lead-stage-keys.test.ts`, e novos casos em `src/services/__tests__/sale-lead-link.test.ts`.

**Arquivos modificados:**
- `prisma/schema.prisma:1209-1224` — campo `systemKey` no model `LeadStage`.
- `src/services/lead-stage.service.ts` — `DEFAULT_LEAD_STAGES` com as 8 colunas + `systemKey` no "Exame feito"; `ensureDefaultStages` grava `systemKey`; nova função `ensureOpticalStages` (aditiva/idempotente para óticas existentes).
- `src/services/sale-side-effects.service.ts:735-805` — `linkLeadAndMaybeWinInTx` detecta venda só-de-exame e mira "Exame feito".
- `src/app/(dashboard)/dashboard/funil/page.tsx` — botão "Gerenciar colunas" + montagem do dialog; passar `refetchStages` para atualizar após CRUD.
- `src/components/funil/whatsapp-inbox.tsx` — montar o controle "mover para coluna" por item.
- (Task 6) a rota de seed que já adiciona estágios padrão — chamar `ensureOpticalStages`.

---

## Task 1: Flag estável `systemKey` no LeadStage (schema + migração)

Dá ao estágio "Exame feito" uma identidade que sobrevive a rename. Nullable e aditiva — óticas existentes não são tocadas. Só o estágio de exame usa a flag (decisão /forja: sem `systemKey` global com backfill).

**Files:**
- Modify: `prisma/schema.prisma:1209-1224`
- Create: `prisma/migrations/20260709120000_lead_stage_system_key/migration.sql`

- [ ] **Step 1: Adicionar o campo ao schema**

Em `prisma/schema.prisma`, no model `LeadStage`, adicionar o campo `systemKey` logo após `isLost` e um índice único parcial. O bloco fica assim:

```prisma
model LeadStage {
  id        String   @id @default(cuid())
  companyId String
  name      String
  order     Int
  isWon     Boolean  @default(false)
  isLost    Boolean  @default(false)
  /// Flag ESTÁVEL de identidade de estágio (ex.: "EXAM_DONE"), imune a rename do
  /// nome pelo dono. Nullable: só estágios com semântica de sistema a usam. NÃO é
  /// um systemKey global — decisão /forja 2026-07-09 (sem backfill do seed).
  systemKey String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id])
  leads   Lead[]

  @@unique([companyId, name])
  @@index([companyId, order])
}
```

> **Não** adicionar `@@unique([companyId, systemKey])` ao schema: o Prisma geraria um índice único COMUM, que conflita com o índice PARCIAL (com `WHERE systemKey IS NOT NULL`) que aplicamos na migração — isso causaria drift permanente no `migrate diff` de futuras migrações. A unicidade do `systemKey` é garantida só pelo índice parcial hand-written do Step 2. (Postgres trata múltiplos `NULL` como distintos, então o índice parcial cobre exatamente o que queremos: no máximo um estágio com cada flag por empresa, e vários NULLs livres.)

- [ ] **Step 2: Criar a migração SQL manual**

Criar `prisma/migrations/20260709120000_lead_stage_system_key/migration.sql` com:

```sql
-- Flag estável de identidade de estágio (nullable, aditiva). Óticas existentes
-- não são tocadas: systemKey fica NULL até a ação de seed criar/atualizar as
-- colunas de ótica. Índice único PARCIAL (WHERE systemKey IS NOT NULL) para que
-- múltiplos NULLs por empresa não colidam.
ALTER TABLE "LeadStage" ADD COLUMN "systemKey" TEXT;

CREATE UNIQUE INDEX "LeadStage_companyId_systemKey_key"
  ON "LeadStage"("companyId", "systemKey")
  WHERE "systemKey" IS NOT NULL;
```

- [ ] **Step 3: Regenerar o Prisma Client**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/prisma generate`
Expected: "Generated Prisma Client" sem erro. (NÃO rodar `migrate dev` — a migração é aplicada manualmente em prod via `migrate deploy`; aqui só geramos o client para o tsc enxergar `systemKey`.)

- [ ] **Step 4: Verificar o typecheck enxerga o campo**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: 0 erros novos relacionados a `systemKey` (pode haver erros pré-existentes não relacionados; confirmar que nenhum menciona `LeadStage` ou `systemKey`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260709120000_lead_stage_system_key/
git commit -m "feat(funil): coluna systemKey (flag estável) no LeadStage"
```

---

## Task 2: Constantes das flags de estágio + helper puro

Fonte única das flags estáveis e um localizador puro (testável, sem banco). Evita repetir strings mágicas e a fragilidade de buscar estágio por nome.

**Files:**
- Create: `src/lib/lead-stage-keys.ts`
- Test: `src/lib/__tests__/lead-stage-keys.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/__tests__/lead-stage-keys.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { LEAD_STAGE_KEYS, findStageByKey } from "@/lib/lead-stage-keys";

describe("lead-stage-keys", () => {
  const stages = [
    { id: "s1", systemKey: null },
    { id: "s2", systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
    { id: "s3", systemKey: "OUTRO" },
  ];

  it("acha o estágio pela flag estável (não pelo nome)", () => {
    expect(findStageByKey(stages, LEAD_STAGE_KEYS.EXAM_DONE)?.id).toBe("s2");
  });

  it("retorna null quando nenhum estágio tem a flag", () => {
    const semExame = [{ id: "s1", systemKey: null }];
    expect(findStageByKey(semExame, LEAD_STAGE_KEYS.EXAM_DONE)).toBeNull();
  });

  it("EXAM_DONE é a string estável esperada", () => {
    expect(LEAD_STAGE_KEYS.EXAM_DONE).toBe("EXAM_DONE");
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/vitest run src/lib/__tests__/lead-stage-keys.test.ts`
Expected: FAIL — "Cannot find module '@/lib/lead-stage-keys'".

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/lead-stage-keys.ts`:

```typescript
/**
 * Flags ESTÁVEIS de identidade de estágio do funil. Um estágio identificado por
 * `systemKey` é imune a rename do `name` pelo dono. Só estágios com semântica de
 * sistema recebem uma flag (não é um systemKey global — decisão /forja 2026-07-09).
 */
export const LEAD_STAGE_KEYS = {
  /** "Exame feito": destino do sinal automático de venda só-de-exame. */
  EXAM_DONE: "EXAM_DONE",
} as const;

export type LeadStageKey = (typeof LEAD_STAGE_KEYS)[keyof typeof LEAD_STAGE_KEYS];

/** Localizador puro: acha um estágio pela flag estável. Null se nenhum tiver. */
export function findStageByKey<T extends { systemKey: string | null }>(
  stages: readonly T[],
  key: LeadStageKey,
): T | null {
  return stages.find((s) => s.systemKey === key) ?? null;
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/vitest run src/lib/__tests__/lead-stage-keys.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-stage-keys.ts src/lib/__tests__/lead-stage-keys.test.ts
git commit -m "feat(funil): flags estáveis de estágio + localizador puro"
```

---

## Task 3: Colunas de ótica no seed (padrão + aditivo idempotente)

Óticas novas nascem com as 8 colunas; óticas existentes ganham as 3 novas de forma aditiva. O "Exame feito" recebe a flag `EXAM_DONE`.

**Files:**
- Modify: `src/services/lead-stage.service.ts`
- Test: `src/services/__tests__/lead-stage-optical.test.ts` (novo)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/__tests__/lead-stage-optical.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    leadStage: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { DEFAULT_LEAD_STAGES, ensureOpticalStages } from "@/services/lead-stage.service";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";

describe("colunas de ótica", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DEFAULT_LEAD_STAGES tem 8 colunas na ordem certa e o 'Exame feito' com a flag", () => {
    expect(DEFAULT_LEAD_STAGES.map((s) => s.name)).toEqual([
      "Novo",
      "Em atendimento",
      "Exame agendado",
      "Exame feito",
      "Orçamento enviado",
      "Aguardando OS/lab",
      "Fechado",
      "Perdido",
    ]);
    const examDone = DEFAULT_LEAD_STAGES.find((s) => s.name === "Exame feito");
    expect(examDone?.systemKey).toBe(LEAD_STAGE_KEYS.EXAM_DONE);
    // ordem estritamente crescente
    const orders = DEFAULT_LEAD_STAGES.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    // só um terminal Ganho e um Perdido
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isWon)).toHaveLength(1);
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isLost)).toHaveLength(1);
  });

  it("ensureOpticalStages: ótica sem as colunas de exame ganha as 3 novas (não duplica as que já tem)", async () => {
    // Ótica legada com o funil padrão antigo de 5 colunas.
    prismaMock.leadStage.findMany.mockResolvedValue([
      { name: "Novo", order: 0, systemKey: null },
      { name: "Em atendimento", order: 1, systemKey: null },
      { name: "Orçamento enviado", order: 2, systemKey: null },
      { name: "Fechado", order: 3, systemKey: null },
      { name: "Perdido", order: 4, systemKey: null },
    ]);
    prismaMock.leadStage.createMany.mockResolvedValue({ count: 3 });

    const created = await ensureOpticalStages("company_1");

    expect(created).toBe(3);
    const call = prismaMock.leadStage.createMany.mock.calls[0][0];
    const names = call.data.map((s: { name: string }) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(["Exame agendado", "Exame feito", "Aguardando OS/lab"]),
    );
    // não recria colunas já existentes
    expect(names).not.toContain("Novo");
    // o "Exame feito" leva a flag
    const examDone = call.data.find((s: { name: string }) => s.name === "Exame feito");
    expect(examDone.systemKey).toBe(LEAD_STAGE_KEYS.EXAM_DONE);
    // todas as novas carregam companyId (multi-tenant)
    expect(call.data.every((s: { companyId: string }) => s.companyId === "company_1")).toBe(true);
  });

  it("ensureOpticalStages: idempotente — ótica que já tem as colunas não cria nada", async () => {
    prismaMock.leadStage.findMany.mockResolvedValue([
      { name: "Novo", order: 0, systemKey: null },
      { name: "Exame agendado", order: 2, systemKey: null },
      { name: "Exame feito", order: 3, systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
      { name: "Aguardando OS/lab", order: 5, systemKey: null },
    ]);

    const created = await ensureOpticalStages("company_1");

    expect(created).toBe(0);
    expect(prismaMock.leadStage.createMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/vitest run src/services/__tests__/lead-stage-optical.test.ts`
Expected: FAIL — `ensureOpticalStages` não existe e `DEFAULT_LEAD_STAGES` ainda tem 5 colunas.

- [ ] **Step 3: Atualizar `DEFAULT_LEAD_STAGES` e adicionar `ensureOpticalStages`**

Em `src/services/lead-stage.service.ts`, substituir a constante `DEFAULT_LEAD_STAGES` (linhas 4-10) por:

```typescript
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";

export const DEFAULT_LEAD_STAGES = [
  { name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Exame agendado", order: 2, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Exame feito", order: 3, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE as string | null },
  { name: "Orçamento enviado", order: 4, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Aguardando OS/lab", order: 5, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Fechado", order: 6, isWon: true, isLost: false, systemKey: null as string | null },
  { name: "Perdido", order: 7, isWon: false, isLost: true, systemKey: null as string | null },
] as const;
```

O `ensureDefaultStages` existente (linhas 12-24) já faz `...s` no `createMany`, então passa a gravar `systemKey` automaticamente — nenhuma mudança nele além do `import`. Confirmar que o `import { LEAD_STAGE_KEYS }` foi adicionado no topo do arquivo.

Adicionar, ao final do arquivo, a função aditiva para óticas existentes:

```typescript
/** As 3 colunas de ótica que uma ótica legada (funil de 5) ainda não tem. */
const OPTICAL_STAGES = [
  { name: "Exame agendado", isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Exame feito", isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE as string | null },
  { name: "Aguardando OS/lab", isWon: false, isLost: false, systemKey: null as string | null },
] as const;

/**
 * Aditivo + idempotente: garante que a ótica tem as 3 colunas de ótica, SEM
 * reordenar/renomear o que já existe (respeita customização do dono). Cada nova
 * coluna entra ao FINAL da ordem atual (maior order + 1, +2, ...). Retorna nº criado.
 * Multi-tenant: companyId em todo filtro e no createMany.
 */
export async function ensureOpticalStages(companyId: string): Promise<number> {
  const existing = await prisma.leadStage.findMany({
    where: { companyId },
    select: { name: true, order: true, systemKey: true },
  });
  const existingNames = new Set(existing.map((s) => s.name));
  const hasExamDoneKey = existing.some((s) => s.systemKey === LEAD_STAGE_KEYS.EXAM_DONE);
  const maxOrder = existing.reduce((m, s) => Math.max(m, s.order), -1);

  const toCreate = OPTICAL_STAGES.filter((s) => !existingNames.has(s.name)).map((s, i) => ({
    name: s.name,
    isWon: s.isWon,
    isLost: s.isLost,
    // Não duplica a flag EXAM_DONE se a ótica já tem um estágio com ela (evita
    // colisão do índice único parcial (companyId, systemKey)).
    systemKey: s.systemKey === LEAD_STAGE_KEYS.EXAM_DONE && hasExamDoneKey ? null : s.systemKey,
    order: maxOrder + 1 + i,
    companyId,
  }));

  if (toCreate.length === 0) return 0;
  const res = await prisma.leadStage.createMany({ data: toCreate });
  return res.count;
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/vitest run src/services/__tests__/lead-stage-optical.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/services/lead-stage.service.ts src/services/__tests__/lead-stage-optical.test.ts
git commit -m "feat(funil): 8 colunas de ótica no seed + ensureOpticalStages aditivo"
```

---

## Task 4: Sinal automático — venda só-de-exame move p/ "Exame feito"

O ponto mais delicado. Hoje `linkLeadAndMaybeWinInTx` (`sale-side-effects.service.ts:735-805`) move QUALQUER venda ligada a um lead direto p/ "Ganho/Fechado". A régua nova: se a venda é **só de exame** (todos os itens com produto `isEyeExam`, e ao menos um item), o card mira o estágio **"Exame feito"** (via flag `EXAM_DONE`) em vez de "Fechado". Venda com exame + óculos, ou sem exame, mantém o comportamento atual (Fechado).

**Régua exata (decidida com o dono):**
- venda SÓ de exame → "Exame feito" (`EXAM_DONE`);
- venda exame + outros produtos → "Fechado" (isWon, comportamento atual);
- venda sem exame → "Fechado" (comportamento atual);
- se a ótica não tem estágio `EXAM_DONE` (funil legado que não rodou o seed) → cai no comportamento atual (Fechado);
- lead terminal → não mexe (inalterado);
- fail-safe inalterado (erro não quebra a venda).

**Files:**
- Modify: `src/services/sale-side-effects.service.ts:735-805` (função `linkLeadAndMaybeWinInTx`)
- Test: `src/services/__tests__/sale-lead-link.test.ts` (adicionar casos)

- [ ] **Step 1: Escrever os testes que falham**

Em `src/services/__tests__/sale-lead-link.test.ts`, dentro do `describe` existente, adicionar o `import` da flag no topo do arquivo (após a linha 7):

```typescript
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";
```

Atualizar o `makeTx` helper (linhas 21-28) para incluir o mock de `saleItem.findMany` (usado para detectar exame na venda):

```typescript
  function makeTx(overrides: Record<string, any> = {}) {
    return {
      lead: { findFirst: vi.fn(), updateMany: vi.fn() },
      leadStage: { findFirst: vi.fn() },
      sale: { updateMany: vi.fn() },
      saleItem: { findMany: vi.fn().mockResolvedValue([]) }, // default: sem itens
      ...overrides,
    } as any;
  }
```

E adicionar os novos casos ao final do describe (antes do fechamento `});`):

```typescript
  const EXAM_DONE_STAGE = { id: "stage_exam_done", isWon: false, isLost: false };

  it("venda SÓ de exame: move p/ 'Exame feito' (EXAM_DONE), não p/ Fechado", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    // todos os itens da venda são exame
    tx.saleItem.findMany.mockResolvedValue([{ product: { isEyeExam: true } }]);
    // resolve o estágio EXAM_DONE pela flag
    tx.leadStage.findFirst.mockResolvedValue(EXAM_DONE_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    // consultou o estágio pela flag EXAM_DONE (não por isWon)
    const stageQuery = tx.leadStage.findFirst.mock.calls[0][0];
    expect(stageQuery.where).toMatchObject({
      companyId: "company_1",
      systemKey: LEAD_STAGE_KEYS.EXAM_DONE,
    });
    // moveu p/ Exame feito
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1", companyId: "company_1" },
        data: expect.objectContaining({ stageId: "stage_exam_done" }),
      }),
    );
  });

  it("venda de exame + óculos: move p/ Fechado (comportamento atual), NÃO p/ Exame", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    // mistura: um exame + um produto normal
    tx.saleItem.findMany.mockResolvedValue([
      { product: { isEyeExam: true } },
      { product: { isEyeExam: false } },
    ]);
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    // resolveu o estágio Ganho (isWon), não a flag de exame
    const stageQuery = tx.leadStage.findFirst.mock.calls[0][0];
    expect(stageQuery.where).toMatchObject({ companyId: "company_1", isWon: true });
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: "stage_won" }) }),
    );
  });

  it("venda de exame mas ótica SEM estágio EXAM_DONE: cai no Fechado (fallback)", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.saleItem.findMany.mockResolvedValue([{ product: { isEyeExam: true } }]);
    // 1ª busca (EXAM_DONE) = null; 2ª busca (isWon) = WON_STAGE
    tx.leadStage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    // acabou movendo p/ o Ganho (fallback), não deixou o card parado
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: "stage_won" }) }),
    );
  });

  it("venda sem itens de exame: não consulta EXAM_DONE, vai p/ Fechado", async () => {
    const tx = makeTx();
    leadFound(tx, { id: "lead_1", stage: OPEN_STAGE });
    tx.saleItem.findMany.mockResolvedValue([{ product: { isEyeExam: false } }]);
    tx.leadStage.findFirst.mockResolvedValue(WON_STAGE);

    await linkLeadAndMaybeWinInTx(tx, {
      saleId: "sale_1",
      customerId: "cust_1",
      companyId: "company_1",
    });

    // nenhuma query de leadStage usou systemKey EXAM_DONE
    const usedExamKey = tx.leadStage.findFirst.mock.calls.some(
      (c: any[]) => c[0]?.where?.systemKey === LEAD_STAGE_KEYS.EXAM_DONE,
    );
    expect(usedExamKey).toBe(false);
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stageId: "stage_won" }) }),
    );
  });
```

- [ ] **Step 2: Rodar os testes para ver falhar**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/vitest run src/services/__tests__/sale-lead-link.test.ts`
Expected: FAIL — os 4 casos novos falham (a função ainda não consulta `saleItem` nem a flag EXAM_DONE). Os testes antigos continuam PASSANDO (o default `saleItem.findMany → []` = "sem exame" mantém o caminho Fechado).

- [ ] **Step 3: Implementar a régua de exame**

Em `src/services/sale-side-effects.service.ts`, adicionar o import no topo (junto aos outros imports):

```typescript
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";
```

Dentro de `linkLeadAndMaybeWinInTx`, **substituir o bloco que resolve o estágio Ganho e move** (linhas 776-796, do comentário "Card terminal" até o `log.info("lead_auto_won_by_sale"...)`) por:

```typescript
    // Card terminal: não mexe (decisão #5 — idempotente, não reabre Ganho/Perdido).
    if (lead.stage.isWon || lead.stage.isLost) return;

    // Régua de EXAME (2026-07-09): se a venda é SÓ de exame de vista, o card não
    // "fecha" — vai p/ "Exame feito" (o cliente ainda vai comprar os óculos). Venda
    // com exame + óculos, ou sem exame, mantém o Ganho determinístico de sempre.
    const items = await tx.saleItem.findMany({
      where: { saleId, sale: { companyId } },
      select: { product: { select: { isEyeExam: true } } },
    });
    const hasItems = items.length > 0;
    const isExamOnly = hasItems && items.every((it) => it.product?.isEyeExam === true);

    // Resolve o estágio de destino. Exame-puro → tenta "Exame feito" pela flag
    // ESTÁVEL (imune a rename). Se a ótica não tem esse estágio (funil legado),
    // cai no Ganho — nunca deixa o card parado.
    let targetStageId: string | null = null;
    if (isExamOnly) {
      const examStage = await tx.leadStage.findFirst({
        where: { companyId, systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
        select: { id: true },
      });
      targetStageId = examStage?.id ?? null;
    }
    if (!targetStageId) {
      // Caminho padrão (venda normal, ou exame sem estágio EXAM_DONE): estágio Ganho.
      const wonStage = await tx.leadStage.findFirst({
        where: { companyId, isWon: true },
        orderBy: { order: "desc" },
        select: { id: true },
      });
      if (!wonStage) {
        // Ótica não configurou estágio Ganho — não inventa. Só o vínculo fica.
        log.warn("lead_link_no_won_stage", { saleId, companyId, leadId: lead.id });
        return;
      }
      targetStageId = wonStage.id;
    }

    // Move determinístico. updateMany + companyId: guard multi-tenant.
    await tx.lead.updateMany({
      where: { id: lead.id, companyId },
      data: { stageId: targetStageId, lastActivityAt: new Date() },
    });
    log.info("lead_auto_moved_by_sale", {
      saleId, companyId, leadId: lead.id, stageId: targetStageId, isExamOnly,
    });
```

> Nota de tenancy: o `where: { saleId, sale: { companyId } }` no `saleItem.findMany` garante que os itens são da venda certa E da empresa certa (defense-in-depth, mesmo o `saleId` já vindo da tx). O `?.isEyeExam === true` trata item sem produto (`productId` null) como não-exame — correto: um item avulso sem produto não é um exame.

- [ ] **Step 4: Rodar os testes para ver passar**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/vitest run src/services/__tests__/sale-lead-link.test.ts`
Expected: PASS — todos (os ~11 antigos + os 4 novos). Se algum antigo quebrar por causa do `saleItem` mock ausente, confirmar que o `makeTx` foi atualizado no Step 1 com o default `saleItem.findMany → []`.

- [ ] **Step 5: Commit**

```bash
git add src/services/sale-side-effects.service.ts src/services/__tests__/sale-lead-link.test.ts
git commit -m "feat(funil): venda só-de-exame move card p/ 'Exame feito' (flag estável)"
```

---

## Task 5: UI "Gerenciar colunas" na aba Funil

Dialog para o dono criar / renomear / reordenar (subir/descer) / excluir colunas. Usa o CRUD `/api/lead-stages` que já existe. Reordenar por botões ↑/↓ (não drag — mais simples e mobile-friendly, decisão /forja "UI mínima"). Protege colunas terminais (Fechado/Perdido) e a coluna de exame (flag `EXAM_DONE`) de exclusão. O backend já bloqueia excluir coluna com leads — a UI mostra o erro retornado.

> **Nota de design:** consulte a skill **ui-ux-pro-max** para o polimento visual (espaçamento, estados de loading/erro, hierarquia). O código abaixo é funcional e segue o padrão do `novo-lead-modal.tsx`; refine a estética sem mudar o comportamento.

**Files:**
- Modify: `src/components/funil/funil-board.tsx:21-27` (adicionar `systemKey` ao type `LeadStage`)
- Create: `src/components/funil/gerenciar-colunas-dialog.tsx`
- Modify: `src/app/(dashboard)/dashboard/funil/page.tsx` (extrair refetch de stages, botão, montar dialog)

- [ ] **Step 1: Adicionar `systemKey` ao type `LeadStage`**

Em `src/components/funil/funil-board.tsx`, no `interface LeadStage` (linhas 21-27), adicionar o campo:

```typescript
export interface LeadStage {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  /** Flag estável de sistema (ex.: "EXAM_DONE"); null p/ colunas comuns. */
  systemKey?: string | null;
}
```

- [ ] **Step 2: Criar o componente do dialog**

Criar `src/components/funil/gerenciar-colunas-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, Trash2, Plus, Loader2, Lock } from "lucide-react";
import toast from "react-hot-toast";
import type { LeadStage } from "@/components/funil/funil-board";

interface GerenciarColunasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: LeadStage[];
  /** Chamado após qualquer mudança persistir, para o pai recarregar as colunas. */
  onChanged: () => void;
}

/** Uma coluna é protegida contra exclusão se é terminal ou tem flag de sistema. */
function isProtected(stage: LeadStage): boolean {
  return stage.isWon || stage.isLost || !!stage.systemKey;
}

export function GerenciarColunasDialog({
  open,
  onOpenChange,
  stages,
  onChanged,
}: GerenciarColunasDialogProps) {
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const sorted = [...stages].sort((a, b) => a.order - b.order);

  async function run(fn: () => Promise<Response>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fn();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Falha na operação");
      }
      toast.success(okMsg);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    // Nova coluna entra ANTES dos terminais: order = menor order terminal, ou fim.
    const terminalOrders = sorted.filter((s) => s.isWon || s.isLost).map((s) => s.order);
    const order = terminalOrders.length > 0 ? Math.min(...terminalOrders) : sorted.length;
    setNewName("");
    run(
      () =>
        fetch("/api/lead-stages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, order }),
        }),
      "Coluna criada",
    );
  }

  function handleRename(stage: LeadStage, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === stage.name) return;
    run(
      () =>
        fetch(`/api/lead-stages/${stage.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        }),
      "Coluna renomeada",
    );
  }

  // Troca a `order` de dois estágios adjacentes (dois PATCH em sequência).
  async function handleSwap(a: LeadStage, b: LeadStage) {
    setBusy(true);
    try {
      const r1 = await fetch(`/api/lead-stages/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: b.order }),
      });
      const r2 = await fetch(`/api/lead-stages/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: a.order }),
      });
      if (!r1.ok || !r2.ok) throw new Error("Falha ao reordenar");
      toast.success("Ordem atualizada");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reordenar");
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(stage: LeadStage) {
    run(
      () => fetch(`/api/lead-stages/${stage.id}`, { method: "DELETE" }),
      "Coluna removida",
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar colunas do funil</DialogTitle>
          <DialogDescription>
            Renomeie, reordene ou crie colunas. As colunas Fechado/Perdido e a de
            exame não podem ser excluídas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {sorted.map((stage, i) => (
            <div key={stage.id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={busy || i === 0}
                  onClick={() => handleSwap(stage, sorted[i - 1])}
                  aria-label="Subir"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={busy || i === sorted.length - 1}
                  onClick={() => handleSwap(stage, sorted[i + 1])}
                  aria-label="Descer"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <Input
                defaultValue={stage.name}
                disabled={busy}
                onBlur={(e) => handleRename(stage, e.target.value)}
                className="flex-1"
              />
              {isProtected(stage) ? (
                <span className="flex h-9 w-9 items-center justify-center text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => handleDelete(stage)}
                  aria-label={`Excluir ${stage.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 gap-2">
            <Input
              placeholder="Nome da nova coluna"
              value={newName}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <Button type="button" onClick={handleCreate} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Extrair o refetch de stages e montar o botão + dialog na page**

Em `src/app/(dashboard)/dashboard/funil/page.tsx`:

(a) Adicionar o import perto dos outros de funil (após a linha 38):

```typescript
import { GerenciarColunasDialog } from "@/components/funil/gerenciar-colunas-dialog";
import { Settings2 } from "lucide-react";
```

(b) Adicionar o estado do dialog perto do `useState` de `stages` (após a linha 106):

```typescript
const [colunasOpen, setColunasOpen] = useState(false);
```

(c) Substituir o `useEffect` que carrega stages (linhas 127-132) por um `useCallback` reutilizável + o effect que o chama:

```typescript
const refetchStages = useCallback(() => {
  fetch("/api/lead-stages")
    .then((res) => res.json())
    .then((json) => setStages(json.data || []))
    .catch(() => toast.error("Erro ao carregar etapas do funil"));
}, []);

useEffect(() => {
  refetchStages();
}, [refetchStages]);
```

(d) Na barra de filtros da aba Funil (o `<div className="flex flex-wrap items-center gap-2">` que vai até ~linha 505), adicionar o botão logo após o bloco "Precisa de atenção" (após a linha 505, ainda dentro do div de filtros):

```tsx
<Can permission="leads.edit">
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={() => setColunasOpen(true)}
  >
    <Settings2 className="mr-1 h-4 w-4" />
    Gerenciar colunas
  </Button>
</Can>
```

(e) Montar o dialog logo antes do fechamento do bloco de conteúdo do funil (perto do `<FunilBoard ... />` na linha 520, como irmão):

```tsx
<GerenciarColunasDialog
  open={colunasOpen}
  onOpenChange={setColunasOpen}
  stages={stages}
  onChanged={refetchStages}
/>
```

- [ ] **Step 4: Verificar o typecheck**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: 0 erros. Se `Can` ou `Button` já estão importados, não duplicar imports.

- [ ] **Step 5: Verificar o build da página**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/next build 2>&1 | tail -15`
Expected: build conclui sem erro na rota `/dashboard/funil`. (Se o build for muito lento, pode-se deixar para a verificação final da Task 7 — mas o tsc do Step 4 é obrigatório.)

- [ ] **Step 6: Commit**

```bash
git add src/components/funil/gerenciar-colunas-dialog.tsx src/components/funil/funil-board.tsx "src/app/(dashboard)/dashboard/funil/page.tsx"
git commit -m "feat(funil): UI de gerenciar colunas do funil (criar/renomear/reordenar/excluir)"
```

---

## Task 6: Botão "mover para coluna" no inbox de conversas

Permite a atendente mover o card do lead pela aba Conversas (age no funil pelo celular, 1 toque). O inbox conhece `conv.leadId` mas não o `stageId` atual — então o controle lista as colunas e faz PATCH `/api/leads/[id]/move`. Só aparece quando a conversa tem lead vinculado.

> **Nota de design:** consulte **ui-ux-pro-max** para o polimento. Mover p/ "Perdido" exige `lostReasonCategory` (o service valida) — para manter o inbox simples, o controle **só oferece colunas não-Perdido** (mover p/ Perdido continua no Kanban, que já tem o modal de motivo).

**Files:**
- Create: `src/components/funil/mover-coluna-inbox.tsx`
- Modify: `src/components/funil/whatsapp-inbox.tsx` (carregar stages + montar o controle no header do thread)

- [ ] **Step 1: Criar o controle**

Criar `src/components/funil/mover-coluna-inbox.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";
import type { LeadStage } from "@/components/funil/funil-board";

interface MoverColunaInboxProps {
  leadId: string;
  stages: LeadStage[];
  /** Chamado após mover, para o pai recarregar a lista/estado se quiser. */
  onMoved?: () => void;
}

/**
 * Move um lead p/ outra coluna direto do inbox. Oferece só colunas NÃO-Perdido
 * (Perdido exige motivo → fica no Kanban). Usa o endpoint de move existente, que
 * pega o ator da sessão (não do body) e exige permissão leads.edit.
 */
export function MoverColunaInbox({ leadId, stages, onMoved }: MoverColunaInboxProps) {
  const [busy, setBusy] = useState(false);
  const options = [...stages]
    .filter((s) => !s.isLost)
    .sort((a, b) => a.order - b.order);

  async function handleMove(stageId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message ?? "Falha ao mover");
      toast.success("Lead movido");
      onMoved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select disabled={busy} onValueChange={handleMove}>
      <SelectTrigger size="sm" className="w-[160px]" aria-label="Mover para coluna">
        <SelectValue placeholder="Mover para…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

> Nota: se o `SelectTrigger` do projeto não aceitar a prop `size`, remover `size="sm"` (verificar em `src/components/ui/select.tsx`). Mantido pequeno para caber no header do thread.

- [ ] **Step 2: Carregar as stages no inbox e montar o controle**

Em `src/components/funil/whatsapp-inbox.tsx`:

(a) Adicionar imports no topo:

```typescript
import { MoverColunaInbox } from "@/components/funil/mover-coluna-inbox";
import type { LeadStage } from "@/components/funil/funil-board";
```

(b) Adicionar estado e carregamento das stages (junto aos outros `useState`/`useEffect` do componente):

```typescript
const [stages, setStages] = useState<LeadStage[]>([]);
useEffect(() => {
  fetch("/api/lead-stages")
    .then((res) => res.json())
    .then((json) => setStages(json.data || []))
    .catch(() => {}); // silencioso: o move é ação secundária do inbox
}, []);
```

(c) No header do thread selecionado (perto dos botões de ação em `whatsapp-inbox.tsx:339-372`), montar o controle quando houver lead vinculado. Usar `<Can permission="leads.edit">` (importar de `@/components/permissions/can` se ainda não estiver):

```tsx
{selectedConv?.leadId && stages.length > 0 && (
  <Can permission="leads.edit">
    <MoverColunaInbox
      leadId={selectedConv.leadId}
      stages={stages}
      onMoved={() => fetchConversations(false)}
    />
  </Can>
)}
```

> A função de recarregar a lista de conversas no inbox é `fetchConversations(false)` (`useCallback` que recebe um booleano `silent`) — já confirmada no componente. `Can` já está importado (`whatsapp-inbox.tsx:16`), não duplicar. `selectedConv.leadId` é `string | null` (definido em `whatsapp-inbox.tsx:32`).

- [ ] **Step 3: Verificar o typecheck**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: 0 erros. Confirmar que `selectedConv.leadId` existe no type da conversa (`whatsapp-inbox.tsx:33` tem `leadId: string | null`).

- [ ] **Step 4: Commit**

```bash
git add src/components/funil/mover-coluna-inbox.tsx src/components/funil/whatsapp-inbox.tsx
git commit -m "feat(funil): botão 'mover para coluna' no inbox de conversas"
```

---

## Task 7: Ligar `ensureOpticalStages` na ação de seed + Verificação Final (OBRIGATÓRIA)

Faz as óticas existentes ganharem as colunas de ótica quando o admin roda o seed, e verifica a feature inteira.

- [ ] **Step 1: Achar onde `ensureDefaultStages` é chamado e adicionar `ensureOpticalStages`**

Run: `cd .worktrees/funil-colunas-exame && grep -rn "ensureDefaultStages" src/`

Em cada ponto que chama `ensureDefaultStages(companyId)` para uma ótica JÁ existente (ex.: rota de seed, onboarding), adicionar logo depois:

```typescript
await ensureOpticalStages(companyId);
```

E importar `ensureOpticalStages` junto do import de `ensureDefaultStages` no arquivo. (Idempotente: cobre óticas antigas que passem por ali; óticas novas já nascem com as 8 via `DEFAULT_LEAD_STAGES`.)

- [ ] **Step 2: Commit da amarração**

```bash
git add -A
git commit -m "feat(funil): seed adiciona colunas de ótica às óticas existentes (aditivo)"
```

- [ ] **Step 3: Typecheck do projeto inteiro**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Suíte de testes completa**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/vitest run`
Expected: todos passam (incl. novos de `lead-stage-keys`, `lead-stage-optical` e os casos de exame em `sale-lead-link`).

- [ ] **Step 5: Build de produção**

Run: `cd .worktrees/funil-colunas-exame && ./node_modules/.bin/next build`
Expected: build conclui com sucesso.

- [ ] **Step 6: Commit final (se sobrou algo)**

```bash
git add -A && git commit -m "chore(funil): verificação final colunas de exame" --allow-empty
```

---

## Pós-implementação (fora do plano de código — dono/deploy)

1. **Migração em prod (MANUAL, antes do deploy):** `./node_modules/.bin/prisma migrate deploy`.
2. **Deploy (MANUAL):** `vercel deploy --prod --yes` (o merge não deploya).
3. **Seed das colunas nas óticas existentes:** após o deploy, o admin roda a ação de seed que agora chama `ensureOpticalStages` (Task 7). Verificar que Atacadão (ótica ativa com IA) ganhou "Exame agendado / Exame feito / Aguardando OS/lab".
4. **Smoke test:** vender só um exame (`Product.isEyeExam`) p/ um cliente com lead aberto → card vai p/ "Exame feito". Vender exame + armação → "Fechado".


