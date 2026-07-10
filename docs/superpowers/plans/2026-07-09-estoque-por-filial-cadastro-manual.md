# Estoque por Filial no Cadastro/Edição Manual de Produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o cadastro/edição manual de produto popular a linha `BranchStock` da filial correta em ótica multi-filial, eliminando o "estoque fantasma" (tela mostra estoque, venda acusa "Disponível: 0").

**Architecture:** Um helper server-side (`resolveStockBranchId`) resolve a filial-alvo com gate de papel (ADMIN/GERENTE trocam de filial; demais ficam na própria), espelhando `resolveReportBranchId`. O `syncBranchStock` deixa de abortar em multi-filial: faz upsert do `BranchStock` da filial-alvo com a **quantidade daquela filial** (não a soma) e recalcula `Product.stockQty = SUM(BranchStock)` via helper extraído `resyncProductStockCache` (com `FOR UPDATE`). `create`/`update` recebem um `actor: { role, userBranchId }` (do `session.user`) e um `branchId` opcional do body. O form mostra um seletor de filial só em multi-filial; a edição lê a quantidade por filial do `branchStocks` que `getById` já retorna.

**Tech Stack:** Next.js 16 (App Router), Prisma + Neon (Postgres), TypeScript, shadcn/ui, Vitest. Multi-tenant sempre com `companyId`.

**Environment notes:**
- Trabalhar no worktree `/Users/matheusreboucas/PDV OTICA/.worktrees/estoque-filial` (branch `feat/estoque-por-filial-cadastro`, base origin/main `57bde97`).
- **SEM migração de banco.** Não criar/rodar migração Prisma.
- O Prisma client pode estar stale no worktree novo. **Rodar `./node_modules/.bin/prisma generate` uma vez antes de começar** (o rtk hook quebra `npx` → usar `./node_modules/.bin/`).
- Pre-commit hook roda `tsc`. Se `tsc` acusar erro de `systemKey` em `lead-stage.service.ts`/`sale-side-effects.service.ts`, é **client stale** → rode `prisma generate`; não é código quebrado.
- NÃO tocar deploy nem env vars da Vercel.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/resolve-stock-branch.ts` | Resolve a filial-alvo de escrita de estoque com gate de papel + validação de empresa/active, dentro de uma `tx`. | Criar |
| `src/services/stock-recalc.ts` | `resyncProductStockCache(tx, productId)` — recalcula `stockQty = SUM(BranchStock)` com `FOR UPDATE`. | Criar |
| `src/services/product.service.ts` | `create`/`update`/`syncBranchStock` passam a receber `actor` + `branchId`, gravam na filial-alvo e recalculam. | Modificar |
| `src/services/stock-movement.service.ts` | Passa a consumir `resyncProductStockCache` (desduplicação + FOR UPDATE). | Modificar |
| `src/lib/validations/product.schema.ts` | `+ branchId: z.string().optional()` em create e update. | Modificar |
| `src/app/api/products/route.ts` | POST: extrai `session.user` (role/branchId) e passa `actor` + `data.branchId` ao service. | Modificar |
| `src/app/api/products/[id]/route.ts` | PUT: idem. | Modificar |
| `src/app/(dashboard)/dashboard/produtos/novo/page.tsx` | Seletor de filial (multi-filial) no cadastro. | Modificar |
| `src/app/(dashboard)/dashboard/produtos/[id]/editar/page.tsx` | Seletor de filial + campo lê quantidade por filial do `branchStocks`. | Modificar |
| `src/services/__tests__/product-branchstock-sync.test.ts` | Inverte o caso multi-filial + novos casos. | Modificar |
| `src/lib/__tests__/resolve-stock-branch.test.ts` | Testa o gate de papel/empresa. | Criar |

---

## Task 0: Preparação do worktree

- [ ] **Step 1: Regenerar o Prisma client**

Run: `cd "/Users/matheusreboucas/PDV OTICA/.worktrees/estoque-filial" && ./node_modules/.bin/prisma generate`
Expected: "Generated Prisma Client". (Warning de versão é ruído; ignorar.)

- [ ] **Step 2: Baseline — typecheck limpo antes de começar**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros. Se aparecer erro de `systemKey`, o Step 1 não surtiu efeito — rode de novo. Não prosseguir com baseline vermelho.

- [ ] **Step 3: Baseline — teste do service verde**

Run: `./node_modules/.bin/vitest run src/services/__tests__/product-branchstock-sync.test.ts`
Expected: PASS (comportamento atual, ainda com o abort multi-filial).

---

## Task 1: `resolveStockBranchId` helper (resolução segura da filial-alvo)

**Files:**
- Create: `src/lib/resolve-stock-branch.ts`
- Test: `src/lib/__tests__/resolve-stock-branch.test.ts`

Contexto de referência (não copiar, só espelhar o padrão): `src/lib/resolve-report-branch.ts:25` usa `CROSS_BRANCH_ROLES = ["ADMIN","GERENTE"]`, valida `branch.findFirst({ where: { id, companyId } })`, lança `forbiddenError`. A diferença: este helper roda **dentro de uma `tx`** e recebe o `actor` por parâmetro (não chama `requireAuth`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/resolve-stock-branch.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const txMock: any = {
  branch: { findFirst: vi.fn(), findMany: vi.fn() },
};

import { resolveStockBranchId } from "@/lib/resolve-stock-branch";

type Actor = { role: string; userBranchId: string | null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveStockBranchId", () => {
  const companyId = "company_1";

  it("sem branchId → filial da sessão do actor", async () => {
    const actor: Actor = { role: "VENDEDOR", userBranchId: "branch_user" };
    const result = await resolveStockBranchId(undefined, actor, companyId, txMock);
    expect(result).toBe("branch_user");
    expect(txMock.branch.findFirst).not.toHaveBeenCalled();
  });

  it("branchId == filial da sessão → filial da sessão (sem checar papel)", async () => {
    const actor: Actor = { role: "CAIXA", userBranchId: "branch_user" };
    const result = await resolveStockBranchId("branch_user", actor, companyId, txMock);
    expect(result).toBe("branch_user");
  });

  it("ADMIN pode escolher outra filial da empresa (active)", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: "branch_user" };
    txMock.branch.findFirst.mockResolvedValue({ id: "branch_2" });
    const result = await resolveStockBranchId("branch_2", actor, companyId, txMock);
    expect(result).toBe("branch_2");
    expect(txMock.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "branch_2", companyId, active: true },
      })
    );
  });

  it("VENDEDOR tentando outra filial → 403", async () => {
    const actor: Actor = { role: "VENDEDOR", userBranchId: "branch_user" };
    await expect(
      resolveStockBranchId("branch_2", actor, companyId, txMock)
    ).rejects.toThrow(/permissão/i);
  });

  it("ADMIN pedindo filial de outra empresa/inativa → 403", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: "branch_user" };
    txMock.branch.findFirst.mockResolvedValue(null);
    await expect(
      resolveStockBranchId("branch_alheia", actor, companyId, txMock)
    ).rejects.toThrow(/filial inválida/i);
  });

  it("ADMIN com userBranchId null e branchId 'ALL' → principal/mais antiga ativa", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: null };
    txMock.branch.findFirst.mockResolvedValue({ id: "branch_main" });
    const result = await resolveStockBranchId("ALL", actor, companyId, txMock);
    expect(result).toBe("branch_main");
    expect(txMock.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId, active: true },
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("empresa sem filial ativa → null", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: null };
    txMock.branch.findFirst.mockResolvedValue(null);
    const result = await resolveStockBranchId(undefined, actor, companyId, txMock);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/resolve-stock-branch.test.ts`
Expected: FAIL — "Cannot find module '@/lib/resolve-stock-branch'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/resolve-stock-branch.ts
import type { Prisma } from "@prisma/client";
import { forbiddenError } from "@/lib/error-handler";

/** Papéis que podem gravar estoque numa filial diferente da própria. */
const CROSS_BRANCH_ROLES = ["ADMIN", "GERENTE"];

export interface StockActor {
  role: string;
  /** Filial da sessão do usuário; pode ser null (ex.: ADMIN sem filial fixa). */
  userBranchId: string | null;
}

/**
 * Resolve a filial-alvo para gravar BranchStock no cadastro/edição manual de
 * produto. Espelha resolveReportBranchId, mas: (1) roda DENTRO da tx do
 * create/update (a leitura de validação e o fallback usam a mesma tx do upsert
 * seguinte); (2) recebe o `actor` por parâmetro — a camada de service não
 * re-autentica.
 *
 * Regras:
 *  - sem branchId / "ALL" / == filial da sessão → filial da sessão (se houver).
 *    Se não houver filial de sessão → principal/mais antiga ativa.
 *  - branchId diferente → só ADMIN/GERENTE; valida que a filial pertence à
 *    empresa E está active; senão 403.
 *  - empresa sem filial ativa → null (chamador não grava BranchStock).
 *
 * O branchId do cliente é sugestão validada, NUNCA autoridade.
 */
export async function resolveStockBranchId(
  requestedBranchId: string | null | undefined,
  actor: StockActor,
  companyId: string,
  tx: Prisma.TransactionClient
): Promise<string | null> {
  const isSameAsSession =
    requestedBranchId != null &&
    actor.userBranchId != null &&
    requestedBranchId === actor.userBranchId;

  // Sem seletor (ou "ALL") ou pedindo a própria filial → filial da sessão.
  if (!requestedBranchId || requestedBranchId === "ALL" || isSameAsSession) {
    if (actor.userBranchId) return actor.userBranchId;
    // Sem filial de sessão (ex.: ADMIN "ALL"): cai na principal/mais antiga ativa.
    const main = await tx.branch.findFirst({
      where: { companyId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return main?.id ?? null;
  }

  // Trocar de filial é privilégio de ADMIN/GERENTE.
  if (!CROSS_BRANCH_ROLES.includes(actor.role)) {
    throw forbiddenError("Sem permissão para gravar estoque em outra filial.");
  }

  // Valida que a filial pertence à empresa e está ativa (anti-leak multi-tenant).
  const branch = await tx.branch.findFirst({
    where: { id: requestedBranchId, companyId, active: true },
    select: { id: true },
  });
  if (!branch) {
    throw forbiddenError("Filial inválida para esta empresa.");
  }
  return branch.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/resolve-stock-branch.test.ts`
Expected: PASS (7 casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolve-stock-branch.ts src/lib/__tests__/resolve-stock-branch.test.ts
git commit -m "feat(estoque): helper resolveStockBranchId com gate de papel por filial"
```

---

## Task 2: `resyncProductStockCache` helper (recalc com FOR UPDATE)

**Files:**
- Create: `src/services/stock-recalc.ts`
- Modify: `src/services/stock-movement.service.ts:286-301`

Referência do SQL existente a extrair (`stock-movement.service.ts:292-301`): um `$executeRaw` que faz `UPDATE "Product" SET "stockQty" = (SELECT COALESCE(SUM("quantity"),0) FROM "branch_stocks" WHERE "product_id" = ...)`. O helper adiciona um `SELECT ... FOR UPDATE` na linha do produto antes do UPDATE.

- [ ] **Step 1: Write the implementation**

```typescript
// src/services/stock-recalc.ts
import type { Prisma } from "@prisma/client";

/**
 * Recalcula Product.stockQty como a SOMA das linhas BranchStock do produto.
 * Fonte de verdade do estoque é BranchStock (por filial); stockQty é cache.
 *
 * Trava a linha do Product com FOR UPDATE dentro da tx antes de recalcular,
 * evitando lost-update entre esta escrita e uma venda concorrente que também
 * mexe no cache. Chamar SEMPRE dentro de uma transação.
 */
export async function resyncProductStockCache(
  tx: Prisma.TransactionClient,
  productId: string
): Promise<void> {
  // Lock pessimista na linha do produto (serializa recalc vs venda concorrente).
  await tx.$executeRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  await tx.$executeRaw`
    UPDATE "Product"
    SET "stockQty" = (
      SELECT COALESCE(SUM("quantity"), 0)
      FROM "branch_stocks"
      WHERE "product_id" = ${productId}
    ),
    "updatedAt" = NOW()
    WHERE "id" = ${productId}
  `;
}
```

- [ ] **Step 2: Substituir o bloco inline em `stock-movement.service.ts` pela chamada ao helper**

Localize o bloco em `src/services/stock-movement.service.ts` (por volta de :286-301):

```typescript
        if (branchId) {
          await tx.branchStock.upsert({
            where: { branchId_productId: { branchId, productId: data.productId } },
            create: { branchId, productId: data.productId, quantity: data.quantity },
            update: { quantity: data.quantity },
          });
          await tx.$executeRaw`
            UPDATE "Product"
            SET "stockQty" = (
              SELECT COALESCE(SUM("quantity"), 0)
              FROM "branch_stocks"
              WHERE "product_id" = ${data.productId}
            ),
            "updatedAt" = NOW()
            WHERE "id" = ${data.productId}
          `;
        } else {
```

Troque **apenas** o `$executeRaw` (mantendo o `upsert`) por:

```typescript
        if (branchId) {
          await tx.branchStock.upsert({
            where: { branchId_productId: { branchId, productId: data.productId } },
            create: { branchId, productId: data.productId, quantity: data.quantity },
            update: { quantity: data.quantity },
          });
          await resyncProductStockCache(tx, data.productId);
        } else {
```

E adicione o import no topo do arquivo:

```typescript
import { resyncProductStockCache } from "@/services/stock-recalc";
```

- [ ] **Step 3: Run the stock-movement tests para garantir zero regressão**

Run: `./node_modules/.bin/vitest run src/services/product-import-stock.test.ts src/services/__tests__/stock-adjustment-branchstock-sync.test.ts`
Expected: PASS. (Se algum teste mockar `$executeRaw` e agora esperar 1 chamada onde há 2, ajuste o mock para aceitar as duas chamadas — o SELECT FOR UPDATE é a nova primeira chamada.)

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/services/stock-recalc.ts src/services/stock-movement.service.ts
git commit -m "refactor(estoque): extrai resyncProductStockCache com FOR UPDATE"
```

---

## Task 3: Inverter os testes de `syncBranchStock` (multi-filial agora grava)

**Files:**
- Modify: `src/services/__tests__/product-branchstock-sync.test.ts`

Este é o RED da correção do service: reescreve o teste para o novo comportamento antes de mexer no service. A assinatura de `create`/`update` muda para receber um `actor`; o mock precisa acompanhar.

- [ ] **Step 1: Reescrever o arquivo de teste**

Substitua **todo** o conteúdo de `src/services/__tests__/product-branchstock-sync.test.ts` por:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Prevenção do "estoque fantasma": ao criar/editar produto com estoque, o
 * serviço grava a linha BranchStock da filial-alvo e recalcula Product.stockQty
 * como SUM(BranchStock). Em multi-filial, grava na filial resolvida (não aborta).
 */

const prismaMock: any = vi.hoisted(() => ({
  product: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  branch: { findFirst: vi.fn(), findMany: vi.fn() },
  branchStock: { upsert: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ProductService } from "@/services/product.service";

const service = new ProductService();

// actor padrão: ADMIN sem filial fixa (força o fallback / escolha explícita).
const adminNoBranch = { role: "ADMIN", userBranchId: null };
const vendedorBranchMain = { role: "VENDEDOR", userBranchId: "branch_main" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.$executeRaw.mockResolvedValue(1);
  // Fallback "principal/mais antiga ativa" usado quando actor não tem filial.
  prismaMock.branch.findFirst.mockResolvedValue({ id: "branch_main" });
});

describe("ProductService.create — grava BranchStock na filial-alvo", () => {
  it("loja única / vendedor: grava na filial da sessão", async () => {
    prismaMock.product.create.mockResolvedValue({
      id: "prod_1",
      stockQty: 5,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU1", name: "Armação", stockQty: 5, stockControlled: true } as any,
      "company_1",
      vendedorBranchMain
    );

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId_productId: { branchId: "branch_main", productId: "prod_1" } },
        create: { branchId: "branch_main", productId: "prod_1", quantity: 5 },
        update: { quantity: 5 },
      })
    );
    // recalc rodou (SELECT FOR UPDATE + UPDATE = 2 execuções raw).
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
  });

  it("multi-filial: GRAVA na filial-alvo resolvida (não aborta)", async () => {
    // ADMIN sem filial fixa → cai na principal (branch.findFirst → branch_main).
    prismaMock.product.create.mockResolvedValue({
      id: "prod_3",
      stockQty: 10,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU3", name: "Armação", stockQty: 10, stockControlled: true } as any,
      "company_1",
      adminNoBranch
    );

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { branchId: "branch_main", productId: "prod_3", quantity: 10 },
        update: { quantity: 10 },
      })
    );
  });

  it("ADMIN escolhe filial explícita (branchId no DTO)", async () => {
    prismaMock.branch.findFirst.mockResolvedValue({ id: "branch_2" });
    prismaMock.product.create.mockResolvedValue({
      id: "prod_4",
      stockQty: 7,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU4", name: "Armação", stockQty: 7, stockControlled: true, branchId: "branch_2" } as any,
      "company_1",
      { role: "ADMIN", userBranchId: "branch_main" }
    );

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { branchId: "branch_2", productId: "prod_4", quantity: 7 },
      })
    );
  });

  it("NÃO grava BranchStock para produto sem controle de estoque", async () => {
    prismaMock.product.create.mockResolvedValue({
      id: "prod_2",
      stockQty: 0,
      stockControlled: false,
    });

    await service.create(
      { sku: "SKU2", name: "Serviço", stockQty: 0, stockControlled: false } as any,
      "company_1",
      vendedorBranchMain
    );

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });

  it("VENDEDOR tentando filial ≠ dele → 403 (não grava)", async () => {
    prismaMock.product.create.mockResolvedValue({
      id: "prod_5",
      stockQty: 3,
      stockControlled: true,
    });

    await expect(
      service.create(
        { sku: "SKU5", name: "Armação", stockQty: 3, stockControlled: true, branchId: "branch_2" } as any,
        "company_1",
        vendedorBranchMain
      )
    ).rejects.toThrow(/permissão/i);
  });

  it("empresa sem filial ativa → não grava, não quebra", async () => {
    prismaMock.branch.findFirst.mockResolvedValue(null); // sem filial ativa
    prismaMock.product.create.mockResolvedValue({
      id: "prod_6",
      stockQty: 4,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU6", name: "Armação", stockQty: 4, stockControlled: true } as any,
      "company_1",
      adminNoBranch
    );

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});

describe("ProductService.update — grava só quando estoque muda", () => {
  beforeEach(() => {
    prismaMock.product.findFirst.mockResolvedValue({ id: "prod_1", stockQty: 0 });
  });

  it("grava na filial-alvo quando stockQty está no payload", async () => {
    prismaMock.product.update.mockResolvedValue({
      id: "prod_1",
      stockQty: 8,
      stockControlled: true,
    });

    await service.update("prod_1", { stockQty: 8 } as any, "company_1", vendedorBranchMain);

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { branchId: "branch_main", productId: "prod_1", quantity: 8 },
        update: { quantity: 8 },
      })
    );
  });

  it("NÃO grava quando o estoque NÃO foi editado", async () => {
    prismaMock.product.update.mockResolvedValue({
      id: "prod_1",
      stockQty: 8,
      stockControlled: true,
    });

    await service.update("prod_1", { name: "Novo nome" } as any, "company_1", vendedorBranchMain);

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `./node_modules/.bin/vitest run src/services/__tests__/product-branchstock-sync.test.ts`
Expected: FAIL — `service.create`/`update` ainda não aceitam o 3º parâmetro `actor` e `syncBranchStock` ainda aborta em multi-filial. (Erros de tipo/asserção esperados.)

- [ ] **Step 3: Commit dos testes vermelhos**

```bash
git add src/services/__tests__/product-branchstock-sync.test.ts
git commit -m "test(estoque): inverte sync multi-filial + casos de gate (RED)"
```

---

## Task 4: Reescrever `syncBranchStock` + threading do `actor` em `create`/`update`

**Files:**
- Modify: `src/services/product.service.ts` (syncBranchStock ~284-303, create ~356-388, update ~441-482)

- [ ] **Step 1: Adicionar imports no topo de `product.service.ts`**

Logo abaixo dos imports existentes:

```typescript
import { resolveStockBranchId, type StockActor } from "@/lib/resolve-stock-branch";
import { resyncProductStockCache } from "@/services/stock-recalc";
```

- [ ] **Step 2: Reescrever `syncBranchStock` (linhas ~265-303)**

Substitua o método `syncBranchStock` inteiro (do comentário JSDoc até o fecha-chaves) por:

```typescript
  /**
   * Grava a linha BranchStock da filial-alvo com a quantidade informada e
   * recalcula Product.stockQty como SUM(BranchStock). A filial-alvo é resolvida
   * com gate de papel (resolveStockBranchId). Em multi-filial NÃO aborta mais:
   * a quantidade é o estoque DAQUELA filial (não a soma global).
   *
   * Produto sem controle de estoque é ignorado.
   */
  private async syncBranchStock(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      companyId: string;
      quantity: number;
      stockControlled: boolean;
      actor: StockActor;
      requestedBranchId?: string | null;
    }
  ): Promise<void> {
    if (!params.stockControlled) return;

    const targetBranchId = await resolveStockBranchId(
      params.requestedBranchId,
      params.actor,
      params.companyId,
      tx
    );
    // Empresa sem filial ativa: não grava (não quebra o cadastro).
    if (!targetBranchId) return;

    // Guard defensivo: BranchStock.quantity é Int sem CHECK; nunca negativo.
    const quantity = Math.max(0, params.quantity);

    await tx.branchStock.upsert({
      where: { branchId_productId: { branchId: targetBranchId, productId: params.productId } },
      create: { branchId: targetBranchId, productId: params.productId, quantity },
      update: { quantity },
    });

    await resyncProductStockCache(tx, params.productId);
  }
```

- [ ] **Step 3: Atualizar a assinatura e a chamada em `create`**

Mude a assinatura de `create` (linha ~308) de:

```typescript
  async create(data: CreateProductDTO, companyId: string): Promise<Product> {
```

para:

```typescript
  async create(data: CreateProductDTO, companyId: string, actor: StockActor): Promise<Product> {
```

E a chamada a `syncBranchStock` dentro da transação (linhas ~380-385) de:

```typescript
      await this.syncBranchStock(tx, {
        productId: created.id,
        companyId,
        stockQty: created.stockQty,
        stockControlled: created.stockControlled,
      });
```

para (passa a quantidade da filial-alvo = o número que o usuário digitou, disponível em `created.stockQty` no create; e o `branchId` do DTO):

```typescript
      await this.syncBranchStock(tx, {
        productId: created.id,
        companyId,
        quantity: created.stockQty,
        stockControlled: created.stockControlled,
        actor,
        requestedBranchId: (data as any).branchId ?? null,
      });
```

- [ ] **Step 4: Atualizar a assinatura e a chamada em `update`**

Mude a assinatura de `update` (linha ~396) de:

```typescript
  async update(id: string, data: UpdateProductDTO, companyId: string): Promise<Product> {
```

para:

```typescript
  async update(id: string, data: UpdateProductDTO, companyId: string, actor: StockActor): Promise<Product> {
```

E a chamada a `syncBranchStock` (linhas ~472-479) de:

```typescript
      if (stockEdited) {
        await this.syncBranchStock(tx, {
          productId: updated.id,
          companyId,
          stockQty: updated.stockQty,
          stockControlled: updated.stockControlled,
        });
      }
```

para:

```typescript
      if (stockEdited) {
        await this.syncBranchStock(tx, {
          productId: updated.id,
          companyId,
          quantity: updated.stockQty,
          stockControlled: updated.stockControlled,
          actor,
          requestedBranchId: (data as any).branchId ?? null,
        });
      }
```

> Nota: `updated.stockQty` aqui é o valor que veio do payload (o número que o form da filial selecionada enviou) — o form em multi-filial envia a quantidade DAQUELA filial (ver Task 7). O `product.update` grava esse número em `Product.stockQty` momentaneamente, mas o `resyncProductStockCache` logo em seguida corrige o cache para a SOMA real. O upsert usa esse número como a quantidade da filial-alvo. Correto por construção.

- [ ] **Step 5: Run the service tests to verify they PASS**

Run: `./node_modules/.bin/vitest run src/services/__tests__/product-branchstock-sync.test.ts`
Expected: PASS (todos os casos da Task 3).

- [ ] **Step 6: Typecheck (vai apontar os call-sites das rotas — esperado)**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: erros APENAS em `src/app/api/products/route.ts` e `src/app/api/products/[id]/route.ts` (faltando o argumento `actor`). Serão corrigidos na Task 5. Nenhum outro erro.

- [ ] **Step 7: Commit**

```bash
git add src/services/product.service.ts
git commit -m "feat(estoque): syncBranchStock grava na filial-alvo em multi-filial (GREEN)"
```

---

## Task 5: Threading do `actor` nas rotas + schema Zod

**Files:**
- Modify: `src/lib/validations/product.schema.ts` (createProductSchema e updateProductSchema)
- Modify: `src/app/api/products/route.ts` (POST ~94-112)
- Modify: `src/app/api/products/[id]/route.ts` (PUT ~42-65)

- [ ] **Step 1: Adicionar `branchId` opcional aos schemas**

Em `src/lib/validations/product.schema.ts`, dentro do objeto de `createProductSchema` (junto aos demais campos, ex.: perto de `stockQty`), adicione:

```typescript
  branchId: z.string().optional(),
```

Faça o mesmo no `updateProductSchema`. (Se `updateProductSchema` for derivado via `.partial()` de um base que já inclui `branchId`, ele já herda — confirme lendo o arquivo; se for um objeto separado, adicione a linha também.)

- [ ] **Step 2: POST route — passar o `actor`**

Em `src/app/api/products/route.ts`, no `POST`, a linha `await requireAuth();` (≈97) descarta a sessão. Capture-a e passe o actor:

```typescript
    const session = await requireAuth();
    const companyId = await getCompanyId();
```

E a chamada (≈112):

```typescript
    const product = await productService.create(sanitizedData, companyId, {
      role: session.user.role,
      userBranchId: session.user.branchId ?? null,
    });
```

- [ ] **Step 3: PUT route — passar o `actor`**

Em `src/app/api/products/[id]/route.ts`, no `PUT` (≈48):

```typescript
    const session = await requireAuth();
    const companyId = await getCompanyId();
```

E a chamada (≈61):

```typescript
    const product = await productService.update(id, sanitizedData, companyId, {
      role: session.user.role,
      userBranchId: session.user.branchId ?? null,
    });
```

- [ ] **Step 4: Typecheck limpo**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 5: Rodar todos os testes de estoque/produto**

Run: `./node_modules/.bin/vitest run src/services/__tests__/product-branchstock-sync.test.ts src/lib/__tests__/resolve-stock-branch.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/product.schema.ts src/app/api/products/route.ts "src/app/api/products/[id]/route.ts"
git commit -m "feat(estoque): rotas passam actor + schema aceita branchId"
```

---

## Task 6: Form de cadastro NOVO — seletor de filial (multi-filial)

**Files:**
- Modify: `src/app/(dashboard)/dashboard/produtos/novo/page.tsx`

Objetivo: renderizar um seletor "Estoque nesta filial" **apenas** quando a empresa tem ≥2 filiais ativas. ADMIN/GERENTE veem um `<Select>`; demais papéis veem um rótulo fixo. O `branchId` escolhido entra no body do POST.

> Antes de codar, LEIA o arquivo inteiro para conhecer: como o form monta o body do POST, se usa react-hook-form ou estado local, e como consome `useBranchContext`. Siga o padrão existente (não introduzir nova lib de form). Use os componentes shadcn já usados no projeto (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `Label`).

- [ ] **Step 1: Ler o form e o hook de contexto**

Run: `sed -n '1,60p' "src/app/(dashboard)/dashboard/produtos/novo/page.tsx"` e reveja `src/hooks/use-branch-context.tsx` (já expõe `branches`, `activeBranchId`, `isAdmin`).

- [ ] **Step 2: Adicionar estado do branchId selecionado**

No componente, derive a lista de filiais ativas do `useBranchContext()` e um estado inicial:

```typescript
const { branches, activeBranchId, isAdmin } = useBranchContext();
const isMultiBranch = branches.length >= 2;
// Default: filial ativa se for real; senão a primeira (principal/mais antiga vem primeiro da API).
const [stockBranchId, setStockBranchId] = useState<string>(
  activeBranchId !== "ALL" ? activeBranchId : branches[0]?.id ?? ""
);
```

O papel de "pode trocar" segue o mesmo gate do servidor: ADMIN/GERENTE. `isAdmin` cobre ADMIN; para incluir GERENTE, cheque o role da sessão (o form provavelmente já tem acesso via `useSession` ou similar — siga o padrão do arquivo; se só houver `isAdmin`, use-o e o servidor ainda barra o resto).

- [ ] **Step 3: Renderizar o bloco condicional (só multi-filial), antes do submit**

```tsx
{isMultiBranch && (
  <div className="space-y-2">
    <Label>Estoque nesta filial</Label>
    {isAdmin ? (
      <Select value={stockBranchId} onValueChange={setStockBranchId}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione a filial" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <p className="text-sm text-muted-foreground">
        Estoque entra em:{" "}
        <strong>{branches.find((b) => b.id === stockBranchId)?.name ?? "sua filial"}</strong>
      </p>
    )}
    <p className="text-xs text-muted-foreground">
      Para dividir entre filiais, use Transferências.
    </p>
  </div>
)}
```

- [ ] **Step 4: Incluir `branchId` no body do POST**

No objeto enviado ao `fetch("/api/products", { method: "POST", ... })`, adicione `branchId` **somente** em multi-filial:

```typescript
body: JSON.stringify({
  ...formData,
  ...(isMultiBranch ? { branchId: stockBranchId } : {}),
}),
```

- [ ] **Step 5: Typecheck + build da rota**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/produtos/novo/page.tsx"
git commit -m "feat(estoque): seletor de filial no cadastro de produto (multi-filial)"
```

---

## Task 7: Form de EDIÇÃO — seletor + campo lê quantidade por filial

**Files:**
- Modify: `src/app/(dashboard)/dashboard/produtos/[id]/editar/page.tsx`

Objetivo: em multi-filial, o campo de estoque mostra a quantidade da **filial selecionada** (lida do `branchStocks` que `getById` já retorna), não a soma. Trocar a filial re-preenche o campo. O POST/PUT envia esse número como o estoque daquela filial + o `branchId`.

> `GET /api/products/[id]` já retorna `branchStocks: [{ branchId, quantity, branch: { id, name } }, ...]` (via `getById`). Confirme o formato exato lendo a resposta / o serviço.

- [ ] **Step 1: Ler o form de edição**

Run: `sed -n '1,120p' "src/app/(dashboard)/dashboard/produtos/[id]/editar/page.tsx"` — identifique onde `stockQty` é lido do produto carregado e ligado ao campo.

- [ ] **Step 2: Adicionar estado do branchId + helper de leitura por filial**

```typescript
const { branches, activeBranchId, isAdmin } = useBranchContext();
const isMultiBranch = branches.length >= 2;
const [stockBranchId, setStockBranchId] = useState<string>(
  activeBranchId !== "ALL" ? activeBranchId : branches[0]?.id ?? ""
);

// product.branchStocks vem do GET; quantidade da filial selecionada.
function qtyForBranch(branchId: string): number {
  return product?.branchStocks?.find((bs: any) => bs.branchId === branchId)?.quantity ?? 0;
}
```

- [ ] **Step 3: Preencher o campo de estoque a partir da filial (multi-filial)**

Onde hoje o campo de estoque é inicializado com `product.stockQty`, em multi-filial use a quantidade da filial selecionada. Ao trocar a filial no `<Select>`, atualize o valor do campo:

```typescript
// Ao carregar o produto e quando trocar a filial:
useEffect(() => {
  if (isMultiBranch && product) {
    setFormStockQty(qtyForBranch(stockBranchId));
  }
}, [product, stockBranchId, isMultiBranch]);
```

(`setFormStockQty` = o setter que o form já usa para o campo de estoque; adapte ao mecanismo do arquivo — react-hook-form `setValue("stockQty", ...)` ou setState.)

- [ ] **Step 4: Renderizar o mesmo bloco condicional da Task 6** (Select para ADMIN, rótulo para os demais, copy "use Transferências"). Reaproveite o JSX da Task 6 Step 3.

- [ ] **Step 5: Enviar `branchId` no PUT (só multi-filial)**

No body do `fetch(.../api/products/${id}, { method: "PUT", ... })`:

```typescript
body: JSON.stringify({
  ...formData,
  ...(isMultiBranch ? { branchId: stockBranchId } : {}),
}),
```

Em multi-filial, `formData.stockQty` deve ser o número exibido (a quantidade DAQUELA filial), garantido pelo Step 3.

- [ ] **Step 6: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/dashboard/produtos/[id]/editar/page.tsx"
git commit -m "feat(estoque): edição lê/grava estoque por filial selecionada"
```

---

## Task 8: Verificação final (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros. (Se surgir `systemKey`, rode `./node_modules/.bin/prisma generate` e repita.)

- [ ] **Step 2: Suite de testes completa**

Run: `./node_modules/.bin/vitest run`
Expected: todos os testes PASS. Foco: `product-branchstock-sync`, `resolve-stock-branch`, `product-import-stock`, `stock-adjustment-branchstock-sync`.

- [ ] **Step 3: Build de produção**

Run: `./node_modules/.bin/next build`
Expected: "Compiled successfully". (Se falhar por falta de `DATABASE_URL` na validação Prisma em build sem `.env`, confirme que o `.env` do worktree existe — foi copiado no setup.)

- [ ] **Step 4: Commit de sobras (se houver)**

```bash
git add -A && git commit -m "chore(estoque): verificação final" || echo "nada a commitar"
```

- [ ] **Step 5: Resumo para o dono**

Confirme: (a) loja única inalterada; (b) multi-filial grava na filial-alvo; (c) edição não corrompe distribuição entre filiais; (d) IDOR fechado (non-admin → 403); (e) sem migração. Pronto para PR/deploy pela mão do dono (padrão da casa: merge → `vercel deploy --prod`).
