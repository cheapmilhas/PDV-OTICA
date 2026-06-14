# Caixa — Movimentações mostram TODAS as vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tabela "Movimentações do caixa" (tela ao vivo + histórico) passa a listar TODAS as vendas do turno — à vista (já vêm de CashMovement) + a prazo/convênio/outro (de SalePayment, marcadas "→ a receber" sem somar no saldo da gaveta).

**Architecture:** Novo serviço `getShiftSalePayments` (linha-a-linha, fonte SalePayment, `method notIn METHODS_IN_CASH`) exposto em 2 endpoints; a page e o modal de histórico mesclam essas linhas com os CashMovements, ordenadas por horário, marcando as a prazo. Saldo da gaveta intocado (vem só de CashMovement). Remove o bloco redundante "Resumo por forma".

**Tech Stack:** Next.js 16 (App Router), Prisma, TypeScript, Vitest (vi.mock do prisma), React, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-14-caixa-movimentacoes-todas-vendas-design.md` (aprovada, 2 rodadas de revisão).

**Worktree:** `/Users/matheusreboucas/PDV OTICA/.worktrees/integra-caixa-admin` (branch `feat/integra-caixa-admin`, já tem caixa+admin). node_modules é diretório real isolado (Prisma Client de 9 valores SaasEmailType — correto). Use `CLAUDE_CODE_TMPDIR="/Users/matheusreboucas/PDV OTICA/.worktrees/.tmp"` se der ENOSPC.

---

## Convenções
- Testes: `npx vitest run <arquivo>`. Suíte: `npm test`. tsc: `npx tsc --noEmit`. Build: `npm run build`.
- Serviço: classe singleton `cashService`, prisma via `import { prisma }`. Teste no estilo `shift-sales-by-method.test.ts` (vi.mock do prisma, import depois do mock, asserts via `.mock.calls[0][0]`).
- Commits conventional, `--no-verify`. Sem migration.
- Ordem: D1 (serviço+teste) → D2 (endpoint dia) → D3 (page: tabela+rodapé+remover Resumo) → D4 (endpoint histórico) → D5 (modal histórico) → F (suíte+build+review).

## File Structure
- **Criar:** `src/services/__tests__/shift-sale-payments.test.ts`
- **Modificar:** `src/services/cash.service.ts`, `src/app/api/cash/shift/route.ts`, `src/app/(dashboard)/dashboard/caixa/page.tsx`, `src/app/api/cash-registers/[id]/transactions/route.ts`, `src/components/caixa/modal-detalhes-caixa.tsx`

---

### Task D1: Serviço getShiftSalePayments (TDD)

**Files:**
- Test: `src/services/__tests__/shift-sale-payments.test.ts` (criar)
- Modify: `src/services/cash.service.ts` (novo método, irmão de `getShiftSalesByMethod` ~l.376-403)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/__tests__/shift-sale-payments.test.ts` (espelha `shift-sales-by-method.test.ts`, mas mocka `findMany`):
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { salePayment: { findMany: (...a: any) => findMany(...a) } } }));

import { cashService } from "@/services/cash.service";

beforeEach(() => vi.clearAllMocks());

function row(method: string, amount: number, saleNumber: number, seller = "Ana") {
  return {
    id: `p_${saleNumber}`, method, amount,
    sale: { id: `s_${saleNumber}`, number: saleNumber, createdAt: new Date("2026-06-12T09:00:00Z"),
      sellerUser: { name: seller } },
  };
}

describe("getShiftSalePayments", () => {
  it("filtra method notIn METHODS_IN_CASH + status/sale corretos", async () => {
    findMany.mockResolvedValue([row("CREDIT_CARD", 1850, 580), row("AGREEMENT", 300, 581)]);
    const shift = { id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt: null };
    const res = await cashService.getShiftSalePayments(shift, "co1");

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ not: "VOIDED" });
    expect(arg.where.method).toEqual({ notIn: ["CASH", "PIX", "DEBIT_CARD"] });
    expect(arg.where.sale).toMatchObject({ companyId: "co1", branchId: "br1", status: "COMPLETED" });
    expect(arg.where.sale.createdAt).toMatchObject({ gte: shift.openedAt });

    // shape normalizado: kind RECEIVABLE, amount number, saleNumber, sellerName, createdAt ISO string
    expect(res[0]).toMatchObject({
      kind: "RECEIVABLE", method: "CREDIT_CARD", amount: 1850, saleNumber: 580, sellerName: "Ana", saleId: "s_580",
    });
    expect(typeof res[0].createdAt).toBe("string"); // ISO p/ o cliente parsear
  });

  it("convênio (AGREEMENT) e outro (OTHER) aparecem — não ficam invisíveis (C1)", async () => {
    findMany.mockResolvedValue([row("AGREEMENT", 100, 1), row("OTHER", 50, 2)]);
    const res = await cashService.getShiftSalePayments({ id: "sh1", branchId: "br1", openedAt: new Date(), closedAt: null }, "co1");
    expect(res.map((r: any) => r.method).sort()).toEqual(["AGREEMENT", "OTHER"]);
  });

  it("turno fechado aplica lte closedAt", async () => {
    findMany.mockResolvedValue([]);
    const closedAt = new Date("2026-06-12T18:00:00Z");
    await cashService.getShiftSalePayments({ id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt }, "co1");
    expect(findMany.mock.calls[0][0].where.sale.createdAt).toMatchObject({ lte: closedAt });
  });
});
```

- [ ] **Step 2: Rodar, confirmar FALHA**

Run: `npx vitest run src/services/__tests__/shift-sale-payments.test.ts 2>&1 | tail -20`
Expected: FAIL — método não existe.

- [ ] **Step 3: Implementar**

Em `src/services/cash.service.ts`, após `getShiftSalesByMethod`, adicionar (importar `METHODS_IN_CASH` de `@/lib/payment-methods` no topo se ainda não estiver):
```ts
  /**
   * Vendas a prazo do turno, linha-a-linha (fonte: SalePayment).
   * method notIn METHODS_IN_CASH → captura crédito/crediário/boleto/cheque/saldo
   * + convênio + outro (tudo que NÃO gera CashMovement). À vista NÃO entra
   * (já está na tabela via CashMovement). Marca kind RECEIVABLE (não afeta gaveta).
   */
  async getShiftSalePayments(
    shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null },
    companyId: string
  ) {
    const rows = await prisma.salePayment.findMany({
      where: {
        status: { not: "VOIDED" },
        method: { notIn: [...METHODS_IN_CASH] },
        sale: {
          companyId,
          branchId: shift.branchId,
          status: "COMPLETED",
          createdAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) },
        },
      },
      select: {
        id: true, method: true, amount: true,
        sale: { select: { id: true, number: true, createdAt: true, sellerUser: { select: { name: true } } } },
      },
      orderBy: { sale: { createdAt: "asc" } },
    });

    return rows.map((r) => ({
      id: r.id,
      kind: "RECEIVABLE" as const,
      createdAt: r.sale.createdAt.toISOString(),
      method: r.method,
      amount: Number(r.amount),
      saleId: r.sale.id,
      saleNumber: r.sale.number,
      sellerName: r.sale.sellerUser?.name ?? "—",
    }));
  }
```
Nota: `[...METHODS_IN_CASH]` desreferencia o readonly tuple para array mutável que o Prisma aceita.

- [ ] **Step 4: Rodar, confirmar PASSA**

Run: `npx vitest run src/services/__tests__/shift-sale-payments.test.ts 2>&1 | tail -15`
Expected: PASS (3 testes).

- [ ] **Step 5: Regressão + tsc**

Run: `npx vitest run src/services/__tests__/ 2>&1 | tail -8` (sem novas falhas) e `npx tsc --noEmit 2>&1 | head -10` (limpo).

- [ ] **Step 6: Commit**
```bash
cd "/Users/matheusreboucas/PDV OTICA/.worktrees/integra-caixa-admin"
git add src/services/cash.service.ts src/services/__tests__/shift-sale-payments.test.ts
git commit -m "feat(caixa): getShiftSalePayments (vendas a prazo linha-a-linha, inclui convênio/outro)" --no-verify
```

---

### Task D2: /api/cash/shift retorna receivableRows

**Files:**
- Modify: `src/app/api/cash/shift/route.ts` (GET)

- [ ] **Step 1: Editar o GET**

No GET, onde já chama `getShiftSalesByMethod` (após resolver shift), adicionar a chamada irmã e incluir no retorno:
```ts
    const salesByMethod = await cashService.getShiftSalesByMethod(
      { id: shift.id, branchId, openedAt: shift.openedAt, closedAt: shift.closedAt },
      companyId
    );
    const receivableRows = await cashService.getShiftSalePayments(
      { id: shift.id, branchId, openedAt: shift.openedAt, closedAt: shift.closedAt },
      companyId
    );
    // ... serializedShift inalterado ...
    return NextResponse.json({ shift: serializedShift, salesByMethod, receivableRows }, { status: 200 });
```
Modo `?branch=all` continua retornando `{ shift: null, allBranches: true }` (sem receivableRows) — não mexer.

- [ ] **Step 2: tsc + smoke**

Run: `npx tsc --noEmit 2>&1 | head -10`. Smoke (dev logado): `/api/cash/shift` deve trazer `receivableRows: [...]`.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/cash/shift/route.ts
git commit -m "feat(caixa): /api/cash/shift retorna receivableRows (vendas a prazo do turno)" --no-verify
```

---

### Task D3: Tela do dia — tabela com todas as vendas + rodapé + remover "Resumo por forma"

**Files:**
- Modify: `src/app/(dashboard)/dashboard/caixa/page.tsx`

- [ ] **Step 1: Consumir receivableRows + montar allRows**

No componente:
1. Adicionar estado: `const [receivableRows, setReceivableRows] = useState<ReceivableRow[]>([]);` e definir o tipo:
```ts
type ReceivableRow = {
  id: string; kind: "RECEIVABLE"; createdAt: string; method: string;
  amount: number; saleId: string; saleNumber: number; sellerName: string;
};
```
2. No `fetchCashShift`, após `setSalesByMethod(...)`: `setReceivableRows(data.receivableRows || []);`
3. Montar o array combinado (perto de onde `movements` é usado), ordenado por horário (datas parseadas — M1):
```ts
const allRows = [
  ...movements.map((m: any) => ({ ...m, _kind: "MOVEMENT" as const, _ts: new Date(m.createdAt).getTime() })),
  ...receivableRows.map((r) => ({ ...r, _kind: "RECEIVABLE" as const, _ts: new Date(r.createdAt).getTime() })),
].sort((a, b) => a._ts - b._ts);
```

- [ ] **Step 2: Renderizar allRows na tabela (trocar `movements.map`)**

Na seção "Movimentações do caixa" (~l.656-742):
- Trocar o guard `movements.length === 0` por `allRows.length === 0` (M2).
- Trocar `movements.map((mov) => ...)` por `allRows.map((row) => ...)` com branch por `row._kind`:
  - `MOVEMENT`: renderiza igual hoje (tipo via `getTipoLabel(row.type)`, valor com sinal +/− por `direction`, operador `row.createdByUser?.name`). **Nota:** `getMovementDescription` recebe o **objeto inteiro** (`getMovementDescription(row)`, não `row.type`) — lê `.note`/`.type`/`.salePayment`; o spread `{...m}` preserva esses campos.
  - `RECEIVABLE`: Tipo = Badge "Venda" + sub-badge amber "→ a receber"; Descrição = `Venda #${row.saleNumber}`; Forma = `getMethodLabel(row.method)`; Operador = `row.sellerName`; Valor = `formatCurrency(row.amount)` **sem sinal**, em classe amber/slate (não emerald/red).

Exemplo da célula de valor:
```tsx
<TableCell className="text-right">
  {row._kind === "RECEIVABLE" ? (
    <span className="font-semibold tabular-nums text-amber-700">{formatCurrency(row.amount)}</span>
  ) : (
    <span className={`font-semibold tabular-nums ${row.direction === "IN" ? "text-emerald-700" : "text-red-600"}`}>
      {row.direction === "IN" ? "+" : "−"}{formatCurrency(row.amount)}
    </span>
  )}
</TableCell>
```

- [ ] **Step 3: Rodapé "gaveta vs total vendido"**

Após a `</Table>` (ainda dentro do CardContent), adicionar:
```tsx
<div className="flex flex-col gap-1 border-t px-4 py-3 text-sm sm:flex-row sm:justify-end sm:gap-8">
  <div className="flex justify-between gap-3 sm:block sm:text-right">
    <span className="text-muted-foreground">Saldo em gaveta</span>
    <span className="ml-2 font-semibold tabular-nums">{formatCurrency(valorAtual)}</span>
  </div>
  <div className="flex justify-between gap-3 sm:block sm:text-right">
    <span className="text-muted-foreground">Total vendido no turno</span>
    <span className="ml-2 font-semibold tabular-nums">
      {formatCurrency(salesByMethod.reduce((s, r) => s + r.amount, 0))}
    </span>
  </div>
</div>
```
(H3: total usa `salesByMethod`, NÃO `totalVendas`.)

- [ ] **Step 4: Remover bloco "Resumo por forma" + ajustar card "Total de vendas"**

- Deletar o JSX `{/* Resumo por Forma de Pagamento */}` inteiro (~l.602-654).
- No card "Total de vendas" (~l.535-550): trocar `{formatCurrency(totalVendas)}` por `{formatCurrency(salesByMethod.reduce((s, r) => s + r.amount, 0))}` e o subtexto `{totalTransacoes} transaç...` por `{salesByMethod.reduce((s, r) => s + r.count, 0)} transaç...`.
- Remover variáveis que ficarem mortas (`totalVendas`, `totalTransacoes`, `calculatePaymentSummary`, `resumoPagamentos`) **SE** não forem mais usadas. **ATENÇÃO:** `resumoPagamentos` ainda é passado como prop para `<ModalFechamentoCaixa resumoPagamentos={resumoPagamentos}>` (~l.318) — então **manter** `resumoPagamentos`/`calculatePaymentSummary`. Só remover `totalVendas`/`totalTransacoes` se o tsc/lint acusar não-uso após o passo.

- [ ] **Step 5: tsc + visual**

Run: `npx tsc --noEmit 2>&1 | head -15` (sem erros; se acusar var não usada, limpar). Visual: caixa do dia mostra venda de crédito na tabela com "→ a receber" sem sinal; saldo da gaveta inalterado; rodapé com 2 totais; "Resumo por forma" sumiu.

- [ ] **Step 6: Commit**
```bash
git add "src/app/(dashboard)/dashboard/caixa/page.tsx"
git commit -m "feat(caixa): tabela do dia mostra todas as vendas (a prazo marcada) + rodapé gaveta/total + remove Resumo por forma" --no-verify
```

---

### Task D4: /api/cash-registers/[id]/transactions — receivableRows + payload rico

**Files:**
- Modify: `src/app/api/cash-registers/[id]/transactions/route.ts`

- [ ] **Step 1: Ampliar o payload dos movements + adicionar receivableRows**

No `data = movements.map(...)`, **incluir `method`, `direction` e operador** (hoje descartados — H1/H2):
```ts
const data = movements.map((mov) => ({
  id: mov.id,
  type: mov.type,
  direction: mov.direction,
  method: mov.method,
  amount: Number(mov.amount),
  description: mov.note || getMovementDescription(mov.type),
  operador: mov.createdByUser?.name ?? null,
  createdAt: mov.createdAt,
}));

const salesByMethod = await cashService.getShiftSalesByMethod({ id: shift.id, branchId: shift.branchId, openedAt: shift.openedAt, closedAt: shift.closedAt }, companyId);
const receivableRows = await cashService.getShiftSalePayments({ id: shift.id, branchId: shift.branchId, openedAt: shift.openedAt, closedAt: shift.closedAt }, companyId);

return successResponse({ movements: data, salesByMethod, receivableRows });
```

- [ ] **Step 2: tsc + smoke**

Run: `npx tsc --noEmit 2>&1 | head -10`. Smoke: `/api/cash-registers/<id>/transactions` retorna `{ data: { movements:[...com method/direction], salesByMethod, receivableRows } }`.

- [ ] **Step 3: Commit**
```bash
git add "src/app/api/cash-registers/[id]/transactions/route.ts"
git commit -m "feat(caixa): transactions route inclui receivableRows + method/direction no histórico" --no-verify
```

---

### Task D5: Modal de histórico — alinhar tipos + mesclar a prazo

**Files:**
- Modify: `src/components/caixa/modal-detalhes-caixa.tsx`

- [ ] **Step 1: Corrigir o tipo/label/cor para os CashMovementType reais (H1)**

- Trocar a interface `CashTransaction.type` de `"SALE"|"EXPENSE"|"WITHDRAWAL"|"SUPPLY"` para incluir os valores reais + receivable:
```ts
interface CashTransaction {
  id: string;
  kind?: "MOVEMENT" | "RECEIVABLE";
  type: string;                 // CashMovementType cru (SALE_PAYMENT, REFUND, ...) ou "RECEIVABLE"
  direction?: "IN" | "OUT";
  method?: string;
  amount: number;
  description: string;
  operador?: string | null;
  createdAt: string;
}
```
- Substituir `transactionTypeLabels`/`transactionTypeColors` por mapas cobrindo os valores reais:
```ts
const transactionTypeLabels: Record<string, string> = {
  SALE_PAYMENT: "Venda", REFUND: "Reembolso", WITHDRAWAL: "Sangria",
  SUPPLY: "Reforço", OPENING_FLOAT: "Abertura", CLOSING: "Fechamento",
  ADJUSTMENT: "Ajuste", RECEIVABLE: "Venda",
};
```
(cor: pode simplificar — IN/OUT por direction, e RECEIVABLE amber.)

- [ ] **Step 2: Mesclar receivableRows + re-sort por horário (M1)**

No `loadTransactions`, após pegar `result.data?.movements`, montar a lista combinada:
```ts
const movs = (result.data?.movements || []).map((m: any) => ({ ...m, kind: "MOVEMENT" }));
const recs = (result.data?.receivableRows || []).map((r: any) => ({
  id: r.id, kind: "RECEIVABLE", type: "RECEIVABLE", method: r.method,
  amount: r.amount, description: `Venda #${r.saleNumber}`, operador: r.sellerName, createdAt: r.createdAt,
}));
const all = [...movs, ...recs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // desc
setTransactions(all);
setSalesByMethod(result.data?.salesByMethod || []);
```

- [ ] **Step 3: Render — sinal correto + branch a receber (H2)**

Na célula de valor da tabela do modal (~l.337), trocar a heurística por:
```tsx
<TableCell className={cn("text-right font-medium", transaction.kind === "RECEIVABLE" ? "text-amber-700" : transaction.direction === "OUT" ? "text-red-600" : "text-green-600")}>
  {transaction.kind === "RECEIVABLE"
    ? formatCurrency(transaction.amount)
    : `${transaction.direction === "OUT" ? "−" : "+"}${formatCurrency(Math.abs(transaction.amount))}`}
</TableCell>
```
E no Badge de tipo, adicionar sub-rótulo "→ a receber" quando `kind === "RECEIVABLE"`. (Opcional: adicionar colunas Forma/Operador se o layout do modal comportar; mínimo é tipo+descrição+valor corretos.)

- [ ] **Step 4: tsc + visual**

Run: `npx tsc --noEmit 2>&1 | head -15`. Visual: abrir um caixa fechado no histórico → vendas a prazo aparecem na lista com "→ a receber" sem sinal; labels dos tipos (Abertura/Venda/Sangria) corretos (não mais undefined).

- [ ] **Step 5: Commit**
```bash
git add src/components/caixa/modal-detalhes-caixa.tsx
git commit -m "feat(caixa): histórico mescla vendas a prazo + corrige labels de tipo (CashMovementType)" --no-verify
```

---

### Task F: Fechamento — suíte + build + review

- [ ] **Step 1: Suíte completa**

Run: `npm test 2>&1 | tail -8`
Expected: tudo verde (≥697 + 3 novos do D1).

- [ ] **Step 2: Build**

Run: `npm run build > /tmp/mov-build.log 2>&1; echo EXIT=$?; grep -iE "Compiled successfully|Failed|Type error" /tmp/mov-build.log | head -3`
Expected: EXIT=0, Compiled successfully.

- [ ] **Step 3: Verificar modal de fechamento (§3.5 do spec)**

Confirmar que `modal-fechamento-caixa.tsx` NÃO tem tabela linha-a-linha de movimentações (só `FORMAS.map` + `ConferenciaFormas`). Se confirmado, nada a fazer. Se tiver tabela, replicar o merge (mesma lógica do D5) e threading de `receivableRows` por `page.tsx`.

- [ ] **Step 4: Code review** no diff da branch (desde o spec). Endereçar CRITICAL/HIGH.

- [ ] **Step 5: Smoke checklist (dono)**
- [ ] Caixa do dia: venda crédito/crediário aparece na TABELA com "→ a receber" sem sinal.
- [ ] Convênio/Outro (se a loja usar) também aparecem.
- [ ] Saldo em gaveta inalterado; rodapé mostra gaveta ≠ total vendido.
- [ ] "Resumo por forma" sumiu; "Conferência por forma" e card "Total de vendas" batem.
- [ ] Histórico: caixa fechado mostra vendas a prazo na lista, labels de tipo corretos.
- [ ] Fechamento de caixa (dinheiro) confere igual (sem regressão).

---

## Notas
- Sem migration. Deploy é manual via `vercel deploy --prod` do worktree (email `cheapmilhas@users.noreply.github.com`).
- Saldo da gaveta (`valorAtual`) e `closeShift` (só CASH) **não podem** mudar — receivableRows vêm de array separado, nunca entram no reduce do saldo.
- Manter `resumoPagamentos`/`calculatePaymentSummary` na page (ainda usados pela prop do modal de fechamento).
