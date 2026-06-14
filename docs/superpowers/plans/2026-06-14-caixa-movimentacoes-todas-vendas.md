# Caixa — Movimentações mostram TODAS as vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** A tabela "Movimentações do caixa" (nas 3 telas: dia, histórico, fechamento) lista TODAS as vendas do turno — à vista (CashMovement, com sinal) + a prazo/convênio/outro (SalePayment, "→ a receber" sem sinal) + canceladas a prazo (riscadas "Cancelada") + recebimentos de crediário (rotulados "Recebimento"). Saldo da gaveta intocado.

**Architecture:** 2 serviços novos em `cash.service.ts` (`getShiftSalePayments` = a prazo ativas; `getShiftVoidedReceivables` = a prazo canceladas). 2 endpoints retornam ambos. Um componente compartilhado `<MovimentacoesTable>` renderiza a tabela combinada nas 3 telas (DRY). Discriminação recebimento×venda via `originType === "AccountReceivable"` (já vem do backend). `salesByMethod` (só vendas) alimenta o rodapé "total vendido" — recebimentos não inflam.

**Tech Stack:** Next.js 16, Prisma, TypeScript (strict), Vitest, React, Shadcn.

**Spec:** `docs/superpowers/specs/2026-06-14-caixa-movimentacoes-todas-vendas-design.md` (aprovado, 3 rodadas: formal + adversarial + correções).

**Worktree:** `/Users/matheusreboucas/PDV OTICA/.worktrees/integra-caixa-admin` (branch `feat/integra-caixa-admin`). `CLAUDE_CODE_TMPDIR="/Users/matheusreboucas/PDV OTICA/.worktrees/.tmp"` se ENOSPC.

---

## Convenções
- Testes: `npx vitest run <arq>`. Suíte: `npm test`. tsc: `npx tsc --noEmit`. Build: `npm run build`.
- Serviço singleton `cashService`, prisma via `import { prisma }`. Teste estilo `shift-sales-by-method.test.ts` (vi.mock do prisma, import depois do mock, asserts via `.mock.calls[0][0]`).
- Commits conventional `--no-verify`. Sem migration.
- **Ordem:** D1 (2 serviços+teste) → D2 (endpoint dia) → D3 (componente `<MovimentacoesTable>` + page) → D4 (endpoint histórico) → D5 (modal histórico) → D6 (modal fechamento) → F (suíte+build+review).

## Fatos do código (confirmados)
- Recebimento de AR cria `CashMovement {type:"SALE_PAYMENT", direction:"IN", originType:"AccountReceivable", note:"Recebimento:…"}` SEM salePaymentId (`accounts-receivable/route.ts:625`, `receive-multiple/route.ts:236`). **Discriminador: `originType === "AccountReceivable"`.**
- Cancelamento: `sale.status="CANCELED"`; TODOS SalePayment→`VOIDED`; REFUND OUT só p/ METHODS_IN_CASH (`sale.service.ts:932,1010,1016`). Devolução = `refundFull` reusa cancel + seta `sale.status="REFUNDED"` (`:1215,1221`).
- `getCurrentShift` já retorna `originType`/`note` (escalares, sem select — `cash.service.ts:294`). Front type `CashMovement` (`page.tsx:59`) tem `note` mas **falta `originType`** → adicionar.
- Modal fechamento (`modal-fechamento-caixa.tsx`) já recebe `movements`/`resumoPagamentos`/`salesByMethod`; `movements` type é pobre (só method/direction/amount) → ampliar p/ tabela rica.

## File Structure
- **Criar:** `src/components/caixa/movimentacoes-table.tsx` (componente compartilhado), `src/services/__tests__/shift-sale-payments.test.ts`
- **Modificar:** `cash.service.ts`, `api/cash/shift/route.ts`, `caixa/page.tsx`, `api/cash-registers/[id]/transactions/route.ts`, `modal-detalhes-caixa.tsx`, `modal-fechamento-caixa.tsx`

---

### Task D1: 2 serviços (getShiftSalePayments + getShiftVoidedReceivables) (TDD)

**Files:** Test `src/services/__tests__/shift-sale-payments.test.ts` (criar); Modify `src/services/cash.service.ts`.

- [ ] **Step 1: Teste que falha**

Criar `shift-sale-payments.test.ts` (mocka `findMany`):
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { salePayment: { findMany: (...a: any) => findMany(...a) } } }));
import { cashService } from "@/services/cash.service";
beforeEach(() => vi.clearAllMocks());

function row(method: string, amount: number, n: number, seller = "Ana") {
  return { id: `p_${n}`, method, amount, sale: { id: `s_${n}`, number: n,
    createdAt: new Date("2026-06-12T09:00:00Z"), sellerUser: { name: seller } } };
}

describe("getShiftSalePayments (a prazo ativas)", () => {
  it("filtra notIn METHODS_IN_CASH + COMPLETED + not VOIDED; normaliza", async () => {
    findMany.mockResolvedValue([row("CREDIT_CARD", 1850, 580), row("AGREEMENT", 300, 581)]);
    const shift = { id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt: null };
    const res = await cashService.getShiftSalePayments(shift, "co1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ not: "VOIDED" });
    expect(arg.where.method).toEqual({ notIn: ["CASH", "PIX", "DEBIT_CARD"] });
    expect(arg.where.sale).toMatchObject({ companyId: "co1", branchId: "br1", status: "COMPLETED" });
    expect(arg.where.sale.createdAt).toMatchObject({ gte: shift.openedAt });
    expect(res[0]).toMatchObject({ kind: "RECEIVABLE", method: "CREDIT_CARD", amount: 1850, saleNumber: 580, sellerName: "Ana" });
    expect(typeof res[0].createdAt).toBe("string");
  });
  it("convênio e outro aparecem (C1)", async () => {
    findMany.mockResolvedValue([row("AGREEMENT", 100, 1), row("OTHER", 50, 2)]);
    const res = await cashService.getShiftSalePayments({ id: "s", branchId: "b", openedAt: new Date(), closedAt: null }, "co1");
    expect(res.map((r: any) => r.method).sort()).toEqual(["AGREEMENT", "OTHER"]);
  });
  it("turno fechado aplica lte closedAt", async () => {
    findMany.mockResolvedValue([]);
    const closedAt = new Date("2026-06-12T18:00:00Z");
    await cashService.getShiftSalePayments({ id: "s", branchId: "b", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt }, "co1");
    expect(findMany.mock.calls[0][0].where.sale.createdAt).toMatchObject({ lte: closedAt });
  });
});

describe("getShiftVoidedReceivables (a prazo canceladas)", () => {
  it("filtra status VOIDED + sale CANCELED/REFUNDED + notIn METHODS_IN_CASH; flag voided", async () => {
    findMany.mockResolvedValue([row("CREDIT_CARD", 1850, 590)]);
    const res = await cashService.getShiftVoidedReceivables({ id: "s", branchId: "b", openedAt: new Date(), closedAt: null }, "co1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.status).toEqual("VOIDED");
    expect(arg.where.method).toEqual({ notIn: ["CASH", "PIX", "DEBIT_CARD"] });
    expect(arg.where.sale.status).toEqual({ in: ["CANCELED", "REFUNDED"] });
    expect(res[0]).toMatchObject({ kind: "VOIDED", voided: true, method: "CREDIT_CARD", saleNumber: 590 });
  });
});
```

- [ ] **Step 2: Rodar, FALHA**

Run: `npx vitest run src/services/__tests__/shift-sale-payments.test.ts 2>&1 | tail -20` → FAIL.

- [ ] **Step 3: Implementar (2 métodos + helper)**

Em `cash.service.ts`, **adicionar import** no topo: `import { METHODS_IN_CASH } from "@/lib/payment-methods";` (hoje ausente — sem isso tsc erra). Adicionar após `getShiftSalesByMethod`:
```ts
  private async queryShiftReceivableRows(
    shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null },
    companyId: string,
    opts: { voided: boolean }
  ) {
    const rows = await prisma.salePayment.findMany({
      where: {
        status: opts.voided ? "VOIDED" : { not: "VOIDED" },
        method: { notIn: [...METHODS_IN_CASH] },
        sale: {
          companyId,
          branchId: shift.branchId,
          status: opts.voided ? { in: ["CANCELED", "REFUNDED"] } : "COMPLETED",
          createdAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) },
        },
      },
      select: { id: true, method: true, amount: true,
        sale: { select: { id: true, number: true, createdAt: true, sellerUser: { select: { name: true } } } } },
      orderBy: { sale: { createdAt: "asc" } },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: opts.voided ? ("VOIDED" as const) : ("RECEIVABLE" as const),
      voided: opts.voided,
      createdAt: r.sale.createdAt.toISOString(),
      method: r.method,
      amount: Number(r.amount),
      saleId: r.sale.id,
      saleNumber: r.sale.number,
      sellerName: r.sale.sellerUser?.name ?? "—",
    }));
  }

  /** Vendas a prazo ATIVAS do turno (linha-a-linha). method notIn METHODS_IN_CASH → a prazo + convênio + outro. */
  async getShiftSalePayments(shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null }, companyId: string) {
    return this.queryShiftReceivableRows(shift, companyId, { voided: false });
  }

  /** Vendas a prazo CANCELADAS do turno (riscadas na tabela). */
  async getShiftVoidedReceivables(shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null }, companyId: string) {
    return this.queryShiftReceivableRows(shift, companyId, { voided: true });
  }
```

- [ ] **Step 4: Rodar, PASSA**

Run: `npx vitest run src/services/__tests__/shift-sale-payments.test.ts 2>&1 | tail -15` → PASS (4).

- [ ] **Step 5: Regressão + tsc**

Run: `npx vitest run src/services/__tests__/ 2>&1 | tail -8` e `npx tsc --noEmit 2>&1 | head -10`.

- [ ] **Step 6: Commit**
```bash
cd "/Users/matheusreboucas/PDV OTICA/.worktrees/integra-caixa-admin"
git add src/services/cash.service.ts src/services/__tests__/shift-sale-payments.test.ts
git commit -m "feat(caixa): getShiftSalePayments + getShiftVoidedReceivables (a prazo ativas/canceladas)" --no-verify
```

---

### Task D2: /api/cash/shift retorna receivableRows + voidedReceivableRows

**Files:** Modify `src/app/api/cash/shift/route.ts` (GET).

- [ ] **Step 1: Editar GET**

Após o `salesByMethod`:
```ts
const receivableRows = await cashService.getShiftSalePayments({ id: shift.id, branchId, openedAt: shift.openedAt, closedAt: shift.closedAt }, companyId);
const voidedReceivableRows = await cashService.getShiftVoidedReceivables({ id: shift.id, branchId, openedAt: shift.openedAt, closedAt: shift.closedAt }, companyId);
return NextResponse.json({ shift: serializedShift, salesByMethod, receivableRows, voidedReceivableRows }, { status: 200 });
```
Modo `?branch=all` inalterado.

- [ ] **Step 2: tsc + commit**
```bash
npx tsc --noEmit 2>&1 | head -10
git add src/app/api/cash/shift/route.ts
git commit -m "feat(caixa): /api/cash/shift retorna receivableRows + voidedReceivableRows" --no-verify
```

---

### Task D3: Componente <MovimentacoesTable> compartilhado + tela do dia

**Files:** Create `src/components/caixa/movimentacoes-table.tsx`; Modify `caixa/page.tsx`.

- [ ] **Step 1: Criar `<MovimentacoesTable>`**

Componente que recebe `rows: MovRow[]` (união discriminada) e renderiza a tabela completa (cabeçalho Horário/Tipo/Descrição/Forma/Operador/Valor + corpo). Tipos:
```ts
export type MovRow =
  | { kind: "MOVEMENT"; id: string; type: string; direction: "IN" | "OUT"; method: string;
      amount: number; note?: string; originType?: string; createdAt: string; createdByUser?: { name: string }; salePayment?: unknown }
  | { kind: "RECEIVABLE"; id: string; method: string; amount: number; saleNumber: number; sellerName: string; createdAt: string }
  | { kind: "VOIDED"; id: string; method: string; amount: number; saleNumber: number; sellerName: string; createdAt: string };
```
Render por `kind`:
- `MOVEMENT` + `originType === "AccountReceivable"` → Tipo "Recebimento" (ícone/badge próprios), valor com sinal +/− (dinheiro real). Descrição vem da `note`.
- `MOVEMENT` (resto) → igual hoje: `getTipoLabel(type)`, sinal por `direction`, operador `createdByUser?.name`.
- `RECEIVABLE` → Tipo "Venda" + sub-badge amber "→ a receber"; Descrição `Venda #{saleNumber}`; Forma `getMethodLabel(method)`; Operador `sellerName`; valor amber **sem sinal**.
- `VOIDED` → linha `line-through text-slate-400`, tag "Cancelada"; valor sem sinal; resto igual receivable.
Mover os helpers `getTipoLabel/getTipoIcon/getTipoBadgeVariant/getFormaPagamentoIcon/getMethodLabel/getMovementDescription` para dentro deste componente (ou um `mov-helpers.ts`), pra serem reusados pelas 3 telas. Empty-state quando `rows.length === 0`. < 200 linhas.

- [ ] **Step 2: page.tsx — consumir + montar allRows + usar o componente**

1. Adicionar `originType?: string` ao type `CashMovement` (`page.tsx:59`).
2. Estados `receivableRows`, `voidedReceivableRows`; no `fetchCashShift` setar de `data.receivableRows`/`data.voidedReceivableRows`.
3. Montar `allRows` (união discriminada, **sem `any`** — usar inferência):
```ts
const allRows: MovRow[] = [
  ...movements.map((m) => ({ ...m, kind: "MOVEMENT" as const })),
  ...receivableRows.map((r) => ({ ...r, kind: "RECEIVABLE" as const })),
  ...voidedReceivableRows.map((r) => ({ ...r, kind: "VOIDED" as const })),
].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // dia = asc
```
4. Substituir a seção JSX "Movimentações do caixa" (~l.656-742) por `<MovimentacoesTable rows={allRows} />` + o rodapé (passo 3).
5. **NÃO** tocar o `reduce` de `valorAtual` (`page.tsx:182`).

- [ ] **Step 3: Rodapé "gaveta vs total vendido" + microcopy**

Após a tabela (dentro do Card):
```tsx
<div className="flex flex-col gap-1 border-t px-4 py-3 text-sm sm:flex-row sm:justify-end sm:gap-8">
  <div className="sm:text-right"><span className="text-muted-foreground">Saldo em gaveta</span>
    <span className="ml-2 font-semibold tabular-nums">{formatCurrency(valorAtual)}</span></div>
  <div className="sm:text-right"><span className="text-muted-foreground">Total vendido no turno</span>
    <span className="ml-2 font-semibold tabular-nums">{formatCurrency(salesByMethod.reduce((s, r) => s + r.amount, 0))}</span></div>
</div>
<p className="px-4 pb-3 text-[11px] text-muted-foreground">Recebimentos de crediário entram no caixa mas não contam como venda do turno.</p>
```

- [ ] **Step 4: Remover "Resumo por forma" + card "Total de vendas"**

- Deletar o JSX `{/* Resumo por Forma de Pagamento */}` (localizar pelo comentário, ~l.602-654).
- Card "Total de vendas" (~l.535-550): trocar `totalVendas`→`salesByMethod.reduce((s,r)=>s+r.amount,0)` e `totalTransacoes`→`salesByMethod.reduce((s,r)=>s+r.count,0)`.
- Remover `totalVendas`/`totalTransacoes` se tsc/lint acusar não-uso. **MANTER** `resumoPagamentos`/`calculatePaymentSummary`/`getFormaPagamentoIcon` (usados pelo modal de fechamento e pela tabela).

- [ ] **Step 5: tsc + visual + commit**
```bash
npx tsc --noEmit 2>&1 | head -15
git add src/components/caixa/movimentacoes-table.tsx "src/app/(dashboard)/dashboard/caixa/page.tsx"
git commit -m "feat(caixa): tabela compartilhada com todas as vendas (recebimento/a-receber/cancelada) + rodapé + remove Resumo por forma" --no-verify
```
Visual: crédito aparece "→ a receber"; recebimento de crediário aparece "Recebimento"; cancelada riscada; saldo gaveta inalterado; rodapé com 2 totais.

---

### Task D4: /api/cash-registers/[id]/transactions — receivable + voided + payload rico

**Files:** Modify `src/app/api/cash-registers/[id]/transactions/route.ts`.

- [ ] **Step 1: Ampliar map + adicionar as 2 listas**
```ts
const data = movements.map((mov) => ({
  id: mov.id, type: mov.type, direction: mov.direction, method: mov.method,
  amount: Number(mov.amount), originType: mov.originType,
  description: mov.note || getMovementDescription(mov.type),
  operador: mov.createdByUser?.name ?? null, createdAt: mov.createdAt,
}));
const salesByMethod = await cashService.getShiftSalesByMethod({ id: shift.id, branchId: shift.branchId, openedAt: shift.openedAt, closedAt: shift.closedAt }, companyId);
const receivableRows = await cashService.getShiftSalePayments({ id: shift.id, branchId: shift.branchId, openedAt: shift.openedAt, closedAt: shift.closedAt }, companyId);
const voidedReceivableRows = await cashService.getShiftVoidedReceivables({ id: shift.id, branchId: shift.branchId, openedAt: shift.openedAt, closedAt: shift.closedAt }, companyId);
return successResponse({ movements: data, salesByMethod, receivableRows, voidedReceivableRows });
```
Confirmar que o `findMany` de movements (route.ts) inclui `createdByUser` (já inclui).

- [ ] **Step 2: tsc + commit**
```bash
npx tsc --noEmit 2>&1 | head -10
git add "src/app/api/cash-registers/[id]/transactions/route.ts"
git commit -m "feat(caixa): transactions route inclui receivable/voided + method/direction/originType/operador" --no-verify
```

---

### Task D5: Modal de histórico — usar <MovimentacoesTable>

**Files:** Modify `src/components/caixa/modal-detalhes-caixa.tsx`.

- [ ] **Step 1: Substituir a tabela própria pelo componente compartilhado**

No `loadTransactions`, montar `allRows` (MovRow[]) a partir de `result.data.movements` (kind MOVEMENT) + `receivableRows` (RECEIVABLE) + `voidedReceivableRows` (VOIDED), **sort desc** (histórico = mais recente primeiro). Como o modal só tem 4 colunas e o `<MovimentacoesTable>` tem 6, usar uma prop `compact` no componente que **embute forma+operador na Descrição** (`Venda #N · Crédito · Ana`, "Recebimento · Dinheiro") e omite as colunas Forma/Operador. Substituir o JSX da tabela atual (~l.294-346) por `<MovimentacoesTable rows={allRows} compact />`.

- [ ] **Step 2: tsc + visual + commit**

Visual: histórico de caixa fechado mostra vendas a prazo, recebimentos, canceladas; labels de tipo corretos (não mais undefined).
```bash
npx tsc --noEmit 2>&1 | head -15
git add src/components/caixa/modal-detalhes-caixa.tsx
git commit -m "feat(caixa): histórico usa tabela compartilhada (a prazo/recebimento/cancelada, compact)" --no-verify
```

---

### Task D6: Modal de fechamento — paridade (tabela rica)

**Files:** Modify `src/components/caixa/modal-fechamento-caixa.tsx` + `caixa/page.tsx` (threading).

- [ ] **Step 1: Props + render**

- Em `modal-fechamento-caixa.tsx`: adicionar props `receivableRows`/`voidedReceivableRows` (tipos do MovRow) e ampliar o type de `movements` para incluir `id`/`type`/`originType`/`note`/`createdAt`/`createdByUser` (hoje só method/direction/amount). Montar `allRows` igual ao dia (asc) e renderizar `<MovimentacoesTable rows={allRows} />` após o `ConferenciaFormas` (~l.382), antes do "Total geral". Read-only — não altera `handleSubmit`.
- Em `caixa/page.tsx`: passar `receivableRows={receivableRows}` e `voidedReceivableRows={voidedReceivableRows}` ao `<ModalFechamentoCaixa>`. (Atenção: a page hoje passa `movements={movements}` com type pobre; garantir que passa os movements completos.)

- [ ] **Step 2: tsc + visual + commit**

Visual: ao fechar caixa, a tabela rica aparece (mesmas linhas do dia); `closeShift` (dinheiro) inalterado.
```bash
npx tsc --noEmit 2>&1 | head -15
git add src/components/caixa/modal-fechamento-caixa.tsx "src/app/(dashboard)/dashboard/caixa/page.tsx"
git commit -m "feat(caixa): fechamento mostra tabela rica (paridade com dia/histórico)" --no-verify
```

---

### Task F: Fechamento — suíte + build + review + smoke

- [ ] **Step 1: Suíte** — `npm test 2>&1 | tail -8` (≥697 + 4 novos).
- [ ] **Step 2: Build** — `npm run build > /tmp/mov-build.log 2>&1; echo EXIT=$?; grep -iE "Compiled successfully|Failed|Type error" /tmp/mov-build.log | head -3`. EXIT=0.
- [ ] **Step 3: Lint** — `npx next lint 2>&1 | tail -15` — confirmar sem ERROS (warnings de var não-usada são aceitáveis mas limpar `totalVendas`/`totalTransacoes` se sobraram).
- [ ] **Step 4: Code review** no diff. Endereçar CRITICAL/HIGH.
- [ ] **Step 5: Smoke checklist (dono)**
- [ ] Dia: venda crédito "→ a receber" sem sinal; recebimento de crediário "Recebimento" com sinal; cancelada a prazo riscada.
- [ ] Convênio/Outro aparecem.
- [ ] Saldo gaveta inalterado; rodapé gaveta ≠ total vendido; total vendido NÃO inclui recebimentos.
- [ ] "Resumo por forma" sumiu; "Total de vendas" bate com Conferência.
- [ ] Histórico: mesmas linhas (compact, forma/operador na descrição).
- [ ] Fechamento: tabela rica aparece; dinheiro confere igual (sem regressão).

---

## Notas
- Sem migration. Deploy manual `vercel deploy --prod` do worktree (email `cheapmilhas@users.noreply.github.com`).
- Saldo da gaveta (`valorAtual`) e `closeShift` (só CASH) NÃO mudam — receivable/voided vêm de arrays separados.
- `<MovimentacoesTable>` compartilhado = 1 fonte de render para 3 telas (DRY). `compact` para o modal de 4 colunas.
- Discriminador recebimento = `originType === "AccountReceivable"` (confiável; `type` é sempre SALE_PAYMENT).
- Manter `resumoPagamentos`/`calculatePaymentSummary` (modal de fechamento ainda consome).
