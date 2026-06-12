# Caixa — Diagnóstico + Clareza + Conferência Completa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o caixa rastreável e auto-explicativo: rastrear em qual turno cada pagamento de uma venda caiu, mostrar TODAS as formas de pagamento (incl. crédito/crediário) com valores reais para conferência, e consertar boleto/cheque que hoje somem do controle financeiro.

**Architecture:** Cinco entregas independentes (A–E). A=novo serviço `getCashTrace` + endpoint; B=selos na tela de detalhe da venda; C=microcopy no caixa; D=novo serviço `getShiftSalesByMethod` (fonte `SalePayment`, não `CashMovement`) ligado ao caixa ao vivo + histórico + fechamento; E=boleto/cheque viram `AccountReceivable` (com ajuste do DRE para não contar em dobro) e exigem cliente. Nenhuma migration — só lógica e UI.

**Tech Stack:** Next.js 16 (App Router), Prisma (PostgreSQL/Neon), TypeScript, Vitest (runner de testes, `vi.mock` + mocks de objeto plano), Shadcn UI, React.

**Spec:** `docs/superpowers/specs/2026-06-12-caixa-diagnostico-clareza-design.md`

---

## Convenções deste projeto (ler antes de começar)

- **Testes:** Vitest. Rodar um arquivo: `npx vitest run <caminho>`. Toda a suíte: `npm test`. Testes ficam em `src/services/__tests__/*.test.ts`. Imports de `"vitest"` (`describe, it, expect, vi, beforeEach`), alias `@/...`, reset com `vi.clearAllMocks()` em `beforeEach`. **Não há testcontainers nem prisma-mock** — monta-se um objeto `tx`/`prisma` à mão com `vi.fn()`.
- **Serviços:** classes singleton (`export const xService = new XService()`), prisma via `import { prisma } from "@/lib/prisma"`. Erros via helpers de `@/lib/error-handler` (`notFoundError`, `AppError`, `ERROR_CODES`).
- **Rotas API:** `try { await requireAuth(); const companyId = await getCompanyId(); ... return successResponse(data) } catch (e) { return handleApiError(e) }`. Permissões via `requirePermission("...")` de `@/lib/auth-helpers`.
- **Envelope de resposta:** `successResponse(data)` → `{ data }`. Erros → `{ error: { code, message } }`.
- **TypeScript/build:** validar com `npx tsc --noEmit` quando mexer em tipos compartilhados. Build: `npm run build`.
- **Commits frequentes**, conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`). Sem atribuição (desabilitada globalmente).
- **Ordem recomendada:** E → A → D → B → C. **Por quê:** A (rastreador) e D (conferência) dependem de boleto/cheque já estarem classificados corretamente (Entrega E muda `METHODS_A_PRAZO` e a geração de recebível), então E vem primeiro para A/D refletirem o destino correto. B e C são UI e vêm por último.

---

## File Structure

**Criar:**
- `src/app/api/sales/[id]/cash-trace/route.ts` — endpoint do rastreador (A)
- `src/components/vendas/payment-destination-badge.tsx` — selo de destino por pagamento (B)
- `src/services/__tests__/cash-trace.test.ts` — testes do `getCashTrace` (A)
- `src/services/__tests__/shift-sales-by-method.test.ts` — testes do `getShiftSalesByMethod` (D)
- `src/services/__tests__/boleto-cheque-receivable.test.ts` — testes da geração de recebível boleto/cheque (E)
- `src/services/__tests__/finance-entry-boleto-cheque.test.ts` — testes do DRE boleto/cheque (E)

**Modificar:**
- `src/lib/payment-methods.ts` — reclassificar boleto/cheque (E)
- `src/services/sale-side-effects.service.ts` — boleto/cheque → AccountReceivable (E)
- `src/services/finance-entry.service.ts` — boleto/cheque → DRE como "a receber" (E)
- `src/services/sale.service.ts` — exigir cliente boleto/cheque (E) + `getCashTrace()` (A)
- `src/components/pdv/modal-finalizar-venda.tsx` — exigir cliente boleto/cheque na UI (E)
- `src/services/cash.service.ts` — `getShiftSalesByMethod()` (D)
- `src/app/api/cash/shift/route.ts` — retornar `salesByMethod` + tratar `?branch=all` (D)
- `src/app/api/cash-registers/[id]/transactions/route.ts` — retornar `salesByMethod` p/ histórico (D)
- `src/components/caixa/modal-detalhes-caixa.tsx` — quadro de conferência no histórico (D)
- `src/components/caixa/modal-fechamento-caixa.tsx` — quadro de conferência no fechamento (D)
- `src/app/(dashboard)/dashboard/caixa/page.tsx` — quadro 2-blocos, microcopy, filial (C, D)
- `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx` — chamar cash-trace + renderizar selos (B)

**Deletar:**
- `src/app/api/cash/debug/route.ts` — superseded por cash-trace (A)

---

# ENTREGA E — Consertar BOLETO e CHEQUE

> Vem primeiro porque A e D dependem da classificação correta de boleto/cheque.

### Task E1: Reclassificar boleto/cheque em payment-methods.ts

**Files:**
- Modify: `src/lib/payment-methods.ts:58-67`

- [ ] **Step 1: Editar as constantes**

Substituir o bloco (linhas 58-67):
```ts
/** Métodos que entram no caixa físico (à vista) */
export const METHODS_IN_CASH = ["CASH", "PIX", "DEBIT_CARD"] as const;

/** Métodos a prazo — NÃO entram como dinheiro imediato no caixa */
export const METHODS_A_PRAZO = ["STORE_CREDIT", "CREDIT_CARD", "BALANCE_DUE", "BOLETO", "CHEQUE"] as const;

/** Métodos que geram AccountReceivable */
export const METHODS_WITH_RECEIVABLE = ["STORE_CREDIT", "BALANCE_DUE", "BOLETO", "CHEQUE"] as const;

/** Métodos que exigem cliente vinculado */
export const METHODS_REQUIRE_CUSTOMER = ["STORE_CREDIT", "BALANCE_DUE", "BOLETO", "CHEQUE"] as const;
```

- [ ] **Step 2: Validar tipos**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: sem novos erros (essas constantes são `as const`; conferir que nenhum consumidor quebrou).

- [ ] **Step 3: Rodar testes que usam essas constantes**

Run: `npx vitest run src/lib 2>&1 | tail -20`
Expected: PASS (ou nenhum teste no caminho). Se houver teste que afirma `METHODS_A_PRAZO.length === 3`, atualizar para 5.

- [ ] **Step 4: Commit**

```bash
git add src/lib/payment-methods.ts
git commit -m "feat(caixa): reclassifica boleto/cheque como a prazo (com recebível + cliente)"
```

---

### Task E2: Boleto/cheque geram AccountReceivable (TDD)

**Files:**
- Test: `src/services/__tests__/boleto-cheque-receivable.test.ts` (criar)
- Modify: `src/services/sale-side-effects.service.ts` (após o bloco BALANCE_DUE ~linha 290)

> A criação de recebível em `applyPaymentsInTx` é um if-chain por método dentro de um loop, usando um `tx` transacional. O bloco BALANCE_DUE (linhas 273-290) é o modelo a clonar.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/__tests__/boleto-cheque-receivable.test.ts`. Primeiro, **ler** a assinatura exata de `applyPaymentsInTx` em `src/services/sale-side-effects.service.ts` (o agente que implementa deve confirmar o nome/args exatos do export — pode ser `applyPaymentsInTx(tx, {...})`). Modelar o teste no estilo de `src/services/__tests__/ar-reversal-entry.test.ts` (factory `makeTx()` com `vi.fn()`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyPaymentsInTx } from "@/services/sale-side-effects.service";

function makeTx() {
  const arCreate = vi.fn(async () => ({ id: "ar-1" }));
  const cmCreate = vi.fn(async () => ({ id: "cm-1" }));
  const spCreate = vi.fn(async (args: any) => ({ id: "sp-1", ...args.data }));
  return {
    tx: {
      accountReceivable: { create: arCreate },
      cashMovement: { create: cmCreate },
      salePayment: { create: spCreate },
    } as never,
    arCreate, cmCreate, spCreate,
  };
}

const baseSale = { id: "sale_1", companyId: "co_1", branchId: "br_1", number: 1234, completedAt: new Date("2026-06-12T12:00:00Z") };

beforeEach(() => vi.clearAllMocks());

describe("applyPaymentsInTx — boleto/cheque geram AccountReceivable", () => {
  it("BOLETO com cliente cria 1 AccountReceivable +30d e NENHUM CashMovement", async () => {
    const { tx, arCreate, cmCreate } = makeTx();
    await applyPaymentsInTx(tx, {
      sale: baseSale,
      payments: [{ method: "BOLETO", amount: 500 }],
      customerId: "cust_1",
      userId: "user_1",
      openShiftId: "shift_1",
    });
    expect(arCreate).toHaveBeenCalledTimes(1);
    expect(arCreate.mock.calls[0][0].data).toMatchObject({
      companyId: "co_1", customerId: "cust_1", saleId: "sale_1",
      amount: 500, installmentNumber: 1, totalInstallments: 1, status: "PENDING",
    });
    expect(cmCreate).not.toHaveBeenCalled();
  });

  it("CHEQUE com cliente cria 1 AccountReceivable e nenhum CashMovement", async () => {
    const { tx, arCreate, cmCreate } = makeTx();
    await applyPaymentsInTx(tx, {
      sale: baseSale,
      payments: [{ method: "CHEQUE", amount: 300 }],
      customerId: "cust_1", userId: "user_1", openShiftId: "shift_1",
    });
    expect(arCreate).toHaveBeenCalledTimes(1);
    expect(cmCreate).not.toHaveBeenCalled();
  });
});
```

> **Nota ao implementador:** os args exatos de `applyPaymentsInTx` (nomes de campos como `openShiftId`, formato de `payments`) devem ser confirmados lendo o arquivo. Ajustar o teste à assinatura real antes de rodar. O ponto é: BOLETO/CHEQUE → 1 AR, 0 CashMovement.

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/services/__tests__/boleto-cheque-receivable.test.ts`
Expected: FAIL — hoje boleto/cheque não criam AR (`arCreate` chamado 0 vezes).

- [ ] **Step 3: Implementar — clonar o bloco BALANCE_DUE para boleto/cheque**

Em `src/services/sale-side-effects.service.ts`, após o bloco BALANCE_DUE (linha ~290), adicionar:
```ts
    // 5b. AccountReceivable para BOLETO/CHEQUE (+30 dias, 1 parcela) — igual BALANCE_DUE
    if ((payment.method === "BOLETO" || payment.method === "CHEQUE") && customerId) {
      const dueDate = addDays(new Date(), 30);
      const metodoLabel = payment.method === "BOLETO" ? "Boleto" : "Cheque";
      await tx.accountReceivable.create({
        data: {
          companyId: sale.companyId,
          customerId,
          saleId: sale.id,
          description: `${metodoLabel} - Venda ${saleDisplayNumber(sale)}`,
          amount: payment.amount,
          dueDate,
          installmentNumber: 1,
          totalInstallments: 1,
          status: "PENDING",
          createdByUserId: userId,
        },
      });
    }
```
Confirmar que `addDays` e `saleDisplayNumber` já estão importados no arquivo (são usados no bloco BALANCE_DUE acima).

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx vitest run src/services/__tests__/boleto-cheque-receivable.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/sale-side-effects.service.ts src/services/__tests__/boleto-cheque-receivable.test.ts
git commit -m "feat(caixa): boleto/cheque geram conta a receber (+30d)"
```

---

### Task E3: Ajustar DRE para boleto/cheque (anti-double-count) (TDD)

**Files:**
- Test: `src/services/__tests__/finance-entry-boleto-cheque.test.ts` (criar)
- Modify: `src/services/finance-entry.service.ts` (3 funções: ~l.76, ~l.100, ~l.363)

> **CRÍTICO:** sem isto o DRE conta boleto/cheque em dobro (entra como "Bancos D+0" E como conta a receber). As 3 funções hoje jogam boleto/cheque no `default` (Bancos / "BANK" / cashDate D+0). Precisam tratar igual BALANCE_DUE (Contas a Receber / null / cashDate null).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/__tests__/finance-entry-boleto-cheque.test.ts`. O implementador deve **ler** `finance-entry.service.ts` para descobrir se as 3 funções (`getPaymentDebitAccountCode`, `getFinanceAccountType`, e a lógica de `cashDate`) são exportadas ou privadas. Se privadas, testar pelo comportamento observável da função pública que gera as entries (ex.: `generateSaleFinanceEntries` ou similar) verificando que boleto/cheque NÃO incrementam saldo de banco. Esqueleto (ajustar à API real):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
// importar a função pública que gera as finance entries de uma venda
// (confirmar nome lendo finance-entry.service.ts)

beforeEach(() => vi.clearAllMocks());

describe("DRE boleto/cheque — não conta em dobro", () => {
  it("BOLETO usa conta 1.1.03 (Contas a Receber), não 1.1.02 (Bancos)", async () => {
    // arrange: tx mock que captura o code da conta de débito
    // act: gerar entry para pagamento BOLETO
    // assert: debit account code === "1.1.03"
  });

  it("BOLETO não incrementa saldo de conta financeira (faType null)", async () => {
    // assert: nenhum upsert de FinanceAccount/balance para BOLETO
  });

  it("CHEQUE tem cashDate null (não recebido D+0)", async () => {
    // assert: cashDate === null
  });
});
```

> Se as 3 helpers forem privadas e difíceis de testar isoladamente, a alternativa pragmática é exportá-las (export nomeado) só para teste, ou testar via a função pública. Preferir testar comportamento. Espelhar o estilo de `src/services/__tests__/ar-reversal-entry.test.ts`.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run src/services/__tests__/finance-entry-boleto-cheque.test.ts`
Expected: FAIL — hoje boleto/cheque caem no default (Bancos / BANK / D+0).

- [ ] **Step 3: Implementar — adicionar boleto/cheque às 3 funções**

`getPaymentDebitAccountCode` (~l.76), agrupar com STORE_CREDIT/BALANCE_DUE:
```ts
    case "STORE_CREDIT":
    case "BALANCE_DUE":
    case "BOLETO":
    case "CHEQUE":
      return "1.1.03"; // Contas a Receber (dinheiro ainda não recebido)
```

`getFinanceAccountType` (~l.100):
```ts
    case "STORE_CREDIT":
    case "BALANCE_DUE":
    case "BOLETO":
    case "CHEQUE":
      return null; // não entra em conta financeira — recebido depois
```

`cashDate` (~l.363):
```ts
    if (
      payment.method === "STORE_CREDIT" ||
      payment.method === "BALANCE_DUE" ||
      payment.method === "BOLETO" ||
      payment.method === "CHEQUE"
    ) {
      cashDate = null; // a prazo não entra no caixa
    } else if (payment.method === "CREDIT_CARD") {
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run src/services/__tests__/finance-entry-boleto-cheque.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/finance-entry.service.ts src/services/__tests__/finance-entry-boleto-cheque.test.ts
git commit -m "fix(caixa): DRE trata boleto/cheque como a receber (anti double-count)"
```

---

### Task E4: Exigir cliente para boleto/cheque — backend (TDD)

**Files:**
- Modify: `src/services/sale.service.ts:467-481` (loop de validação por pagamento)
- Test: adicionar ao teste existente de `sale.service` se houver, ou cobrir via teste de integração do loop. (Se não houver teste do loop, criar um caso mínimo.)

- [ ] **Step 1: Localizar e ler o loop**

Ler `src/services/sale.service.ts:467-481`. Estrutura atual:
```ts
    for (const payment of payments) {
      if (payment.method === "STORE_CREDIT") {
        validateStoreCredit(payment, customerId);
      }
      if (payment.method === "BALANCE_DUE" && !customerId) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Saldo a Receber exige um cliente vinculado", 400);
      }
    }
```

- [ ] **Step 2: Escrever teste que falha (se houver harness de teste para o loop)**

Procurar teste existente de `sale.service.create`. Se existir um mock de `prisma.$transaction` utilizável, adicionar:
```ts
it("rejeita venda BOLETO sem cliente", async () => {
  await expect(saleService.create({ /* venda com payment BOLETO, customerId: null */ }, "co_1", "user_1"))
    .rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
});
it("rejeita venda mista dinheiro+boleto sem cliente", async () => { /* idem, payments: [CASH, BOLETO] */ });
```
Se **não houver** harness viável para `create()` (ele faz muita coisa), pular o teste automatizado aqui e marcar a validação para o teste manual/E2E — mas ainda assim implementar (Step 3). Documentar a decisão no commit.

- [ ] **Step 3: Implementar — estender a checagem**

Substituir a checagem `BALANCE_DUE` por uma que cobre os métodos que exigem cliente:
```ts
    for (const payment of payments) {
      if (payment.method === "STORE_CREDIT") {
        validateStoreCredit(payment, customerId);
      }
      // Métodos a prazo exigem cliente vinculado (pagam ao receber / cobrança futura)
      if (
        (payment.method === "BALANCE_DUE" ||
          payment.method === "BOLETO" ||
          payment.method === "CHEQUE") &&
        !customerId
      ) {
        const label =
          payment.method === "BALANCE_DUE" ? "Saldo a Receber"
          : payment.method === "BOLETO" ? "Boleto" : "Cheque";
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, `${label} exige um cliente vinculado`, 400);
      }
    }
```
(Mantém a checagem por-pagamento → venda mista com boleto também exige cliente.)

- [ ] **Step 4: Rodar testes (se criados) + tsc**

Run: `npx vitest run src/services/__tests__/ 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | head -10`
Expected: PASS / sem novos erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/services/sale.service.ts src/services/__tests__/
git commit -m "feat(caixa): backend exige cliente em boleto/cheque (inclui venda mista)"
```

---

### Task E5: Exigir cliente para boleto/cheque — frontend (UX)

**Files:**
- Modify: `src/components/pdv/modal-finalizar-venda.tsx:213-219`

> UI espelha a trava backend para dar feedback imediato (toast). É validação de UX, não a trava real.

- [ ] **Step 1: Estender a checagem no addPayment**

Substituir (linhas 213-219):
```tsx
      // A prazo (saldo/boleto/cheque): exige cliente vinculado
      if (
        selectedMethod === "BALANCE_DUE" ||
        selectedMethod === "BOLETO" ||
        selectedMethod === "CHEQUE"
      ) {
        if (!customerId) {
          const label =
            selectedMethod === "BALANCE_DUE" ? "Saldo a Receber"
            : selectedMethod === "BOLETO" ? "Boleto" : "Cheque";
          toast.error(`${label} exige um cliente vinculado`);
          return;
        }
      }
```

- [ ] **Step 2: Validar tipos**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/pdv/modal-finalizar-venda.tsx
git commit -m "feat(caixa): PDV alerta cliente obrigatório em boleto/cheque"
```

---

# ENTREGA A — Rastreador "Onde caiu esta venda?"

### Task A1: Serviço getCashTrace (TDD)

**Files:**
- Test: `src/services/__tests__/cash-trace.test.ts` (criar)
- Modify: `src/services/sale.service.ts` (novo método na classe, junto de getById)

> Regras de derivação (do spec §A): `shift` resolve só do CashMovement `SALE_PAYMENT/IN`; `reversed` se houver REFUND/OUT ou `SalePayment.status==="VOIDED"`; `enteredCashRegister` dos dados (existe IN); `destino` por método mas vira `"none"` se o método aponta recebível mas a linha não existe.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/__tests__/cash-trace.test.ts`. Mock de `prisma` via `vi.mock("@/lib/prisma", ...)`. O método busca a venda com payments + cashMovements + (no movimento) o shift com branch/openedByUser. Esqueleto:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { sale: { findFirst: (...a: any) => findFirst(...a) } } }));

import { saleService } from "@/services/sale.service";

beforeEach(() => vi.clearAllMocks());

function saleWith(payments: any[]) {
  return { id: "sale_1", companyId: "co_1", payments };
}

describe("getCashTrace", () => {
  it("pagamento CASH com movimento IN → entrou no caixa, com shift", async () => {
    findFirst.mockResolvedValue(saleWith([{
      id: "p1", method: "CASH", amount: 100, status: "PAID",
      cashMovements: [{ type: "SALE_PAYMENT", direction: "IN", amount: 100, cashShift: {
        id: "sh1", status: "CLOSED", openedAt: new Date(), branch: { name: "Loja 1" }, openedByUser: { name: "Ana" },
      }}],
    }]));
    const trace = await saleService.getCashTrace("sale_1", "co_1");
    expect(trace[0]).toMatchObject({
      method: "CASH", enteredCashRegister: true, reversed: false, destino: "cash_register",
      shift: { branchName: "Loja 1", operador: "Ana", status: "CLOSED" },
    });
  });

  it("pagamento CASH cancelado (REFUND/OUT) → reversed, netCashAmount 0, shift do IN original", async () => {
    findFirst.mockResolvedValue(saleWith([{
      id: "p1", method: "CASH", amount: 100, status: "VOIDED",
      cashMovements: [
        { type: "SALE_PAYMENT", direction: "IN", amount: 100, cashShift: { id: "sh1", status: "CLOSED", openedAt: new Date(), branch: { name: "Loja 1" }, openedByUser: { name: "Ana" } } },
        { type: "REFUND", direction: "OUT", amount: 100, cashShift: { id: "sh2", status: "OPEN", openedAt: new Date(), branch: { name: "Loja 1" }, openedByUser: { name: "Bia" } } },
      ],
    }]));
    const trace = await saleService.getCashTrace("sale_1", "co_1");
    expect(trace[0]).toMatchObject({ reversed: true, netCashAmount: 0, shift: { shiftId: "sh1" } });
  });

  it("crédito → destino card_receivable, sem shift", async () => {
    findFirst.mockResolvedValue(saleWith([{ id: "p1", method: "CREDIT_CARD", amount: 200, status: "PAID", cashMovements: [] }]));
    const trace = await saleService.getCashTrace("sale_1", "co_1");
    expect(trace[0]).toMatchObject({ method: "CREDIT_CARD", enteredCashRegister: false, destino: "card_receivable" });
    expect(trace[0].shift).toBeUndefined();
  });

  it("venda inexistente / outra company → lança notFound", async () => {
    findFirst.mockResolvedValue(null);
    await expect(saleService.getCashTrace("x", "co_1")).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run src/services/__tests__/cash-trace.test.ts`
Expected: FAIL — `getCashTrace` não existe.

- [ ] **Step 3: Implementar getCashTrace**

Em `src/services/sale.service.ts`, adicionar método na classe (perto de `getById`). Importar `METHODS_IN_CASH`, `METHODS_A_PRAZO` de `@/lib/payment-methods` se necessário:
```ts
  /**
   * Rastreia, por pagamento de uma venda, em qual turno de caixa caiu
   * (ou por que não entrou). Deriva dos dados, não só do método —
   * tratando estorno/cancelamento corretamente.
   */
  async getCashTrace(saleId: string, companyId: string) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId },
      include: {
        payments: {
          include: {
            cashMovements: {
              include: {
                cashShift: {
                  select: {
                    id: true, status: true, openedAt: true,
                    branch: { select: { name: true } },
                    openedByUser: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!sale) {
      throw notFoundError("Venda não encontrada");
    }

    const A_PRAZO_AR = ["STORE_CREDIT", "BALANCE_DUE", "BOLETO", "CHEQUE"];

    return sale.payments.map((p: any) => {
      const movIn = p.cashMovements.find(
        (m: any) => m.type === "SALE_PAYMENT" && m.direction === "IN"
      );
      const hasRefund = p.cashMovements.some(
        (m: any) => m.type === "REFUND" || m.direction === "OUT"
      );
      const enteredCashRegister = !!movIn;
      const reversed = hasRefund || p.status === "VOIDED";
      const netCashAmount = p.cashMovements.reduce(
        (sum: number, m: any) => sum + (m.direction === "IN" ? Number(m.amount) : -Number(m.amount)),
        0
      );

      let destino: "cash_register" | "accounts_receivable" | "card_receivable" | "none";
      if (enteredCashRegister) {
        destino = "cash_register";
      } else if (p.method === "CREDIT_CARD") {
        destino = "card_receivable";
      } else if (A_PRAZO_AR.includes(p.method)) {
        destino = "accounts_receivable";
      } else {
        destino = "none";
      }

      return {
        paymentId: p.id,
        method: p.method,
        amount: Number(p.amount),
        enteredCashRegister,
        reversed,
        netCashAmount,
        destino,
        shift: movIn?.cashShift
          ? {
              shiftId: movIn.cashShift.id,
              branchName: movIn.cashShift.branch?.name ?? "—",
              operador: movIn.cashShift.openedByUser?.name ?? "—",
              openedAt: movIn.cashShift.openedAt,
              status: movIn.cashShift.status,
            }
          : undefined,
      };
    });
  }
```

> **Nota:** confirmar que a relação `CashMovement.cashShift` existe com esse nome no schema (o spec cita `shift.branch`/`shift.openedByUser`). Se a relação tiver outro nome, ajustar o include. Para o caso `destino="none"` por método-aponta-recebível-mas-sem-linha (ex. STORE_CREDIT sem installmentConfig), uma versão simples mapeia por método; refinar só se um teste exigir checar a existência real da AR (pode ficar como melhoria, já que o caso comum é coberto).

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run src/services/__tests__/cash-trace.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/sale.service.ts src/services/__tests__/cash-trace.test.ts
git commit -m "feat(caixa): getCashTrace rastreia destino de cada pagamento (trata estorno)"
```

---

### Task A2: Endpoint GET /api/sales/[id]/cash-trace

**Files:**
- Create: `src/app/api/sales/[id]/cash-trace/route.ts`

- [ ] **Step 1: Criar a rota**

```ts
import { NextRequest } from "next/server";
import { saleService } from "@/services/sale.service";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("sales.view");
    const companyId = await getCompanyId();
    const { id } = await params;

    const trace = await saleService.getCashTrace(id, companyId);
    return successResponse({ trace });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Smoke manual (dev)**

Run (com dev server rodando e logado): abrir `/api/sales/<um-id-real>/cash-trace` no browser.
Expected: `{ data: { trace: [...] } }` com 200.

- [ ] **Step 3: Validar tipos**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sales/[id]/cash-trace/route.ts
git commit -m "feat(caixa): endpoint GET /api/sales/[id]/cash-trace (perm sales.view)"
```

---

### Task A3: Deletar /api/cash/debug

**Files:**
- Delete: `src/app/api/cash/debug/route.ts`

- [ ] **Step 1: Confirmar que nada referencia a rota**

Run: `grep -rn "cash/debug" src/ docs/ scripts/ 2>/dev/null`
Expected: nenhuma referência de código (só talvez menção no spec). Se houver runbook citando, remover/atualizar.

- [ ] **Step 2: Deletar**

```bash
git rm src/app/api/cash/debug/route.ts
```

- [ ] **Step 3: Build/tsc**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(caixa): remove rota dev-only cash/debug (superseded por cash-trace)"
```

---

# ENTREGA D — Conferência completa do dia

### Task D1: Serviço getShiftSalesByMethod (TDD)

**Files:**
- Test: `src/services/__tests__/shift-sales-by-method.test.ts` (criar)
- Modify: `src/services/cash.service.ts` (novo método sibling de getCurrentShift)

> **Fonte = `SalePayment` (não CashMovement)** — porque crédito/crediário não geram CashMovement. Semântica: "faturado no turno por método", não "saldo em aberto".

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/services/__tests__/shift-sales-by-method.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { salePayment: { groupBy: (...a: any) => groupBy(...a) } } }));

import { cashService } from "@/services/cash.service";

beforeEach(() => vi.clearAllMocks());

describe("getShiftSalesByMethod", () => {
  it("agrupa por método via SalePayment com filtros corretos", async () => {
    groupBy.mockResolvedValue([
      { method: "CREDIT_CARD", _sum: { amount: 5000 }, _count: 3 },
      { method: "CASH", _sum: { amount: 200 }, _count: 2 },
    ]);
    const shift = { id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt: null };
    const result = await cashService.getShiftSalesByMethod(shift, "co1");

    // valida o where enviado ao prisma
    const arg = groupBy.mock.calls[0][0];
    expect(arg.by).toEqual(["method"]);
    expect(arg.where.status).toEqual({ not: "VOIDED" });
    expect(arg.where.sale).toMatchObject({ companyId: "co1", branchId: "br1", status: "COMPLETED" });
    expect(arg.where.sale.createdAt).toMatchObject({ gte: shift.openedAt });

    // crédito não-zerado, normalizado para number
    const credito = result.find((r: any) => r.method === "CREDIT_CARD");
    expect(credito).toMatchObject({ amount: 5000, count: 3 });
  });

  it("turno fechado aplica limite superior closedAt", async () => {
    groupBy.mockResolvedValue([]);
    const closedAt = new Date("2026-06-12T18:00:00Z");
    await cashService.getShiftSalesByMethod({ id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt }, "co1");
    expect(groupBy.mock.calls[0][0].where.sale.createdAt).toMatchObject({ lte: closedAt });
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run src/services/__tests__/shift-sales-by-method.test.ts`
Expected: FAIL — método não existe.

- [ ] **Step 3: Implementar**

Em `src/services/cash.service.ts`, adicionar método na classe:
```ts
  /**
   * Vendas do turno agrupadas por forma de pagamento (fonte: SalePayment).
   * Usado para conferência: mostra crédito/crediário/boleto/cheque que NÃO
   * geram CashMovement. Semântica = "faturado no turno", não "a receber em aberto".
   */
  async getShiftSalesByMethod(
    shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null },
    companyId: string
  ) {
    const rows = await prisma.salePayment.groupBy({
      by: ["method"],
      where: {
        status: { not: "VOIDED" },
        sale: {
          companyId,
          branchId: shift.branchId,
          status: "COMPLETED",
          createdAt: {
            gte: shift.openedAt,
            ...(shift.closedAt ? { lte: shift.closedAt } : {}),
          },
        },
      },
      _sum: { amount: true },
      _count: true,
    });

    return rows.map((r) => ({
      method: r.method,
      amount: Number(r._sum.amount ?? 0),
      count: r._count,
    }));
  }
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run src/services/__tests__/shift-sales-by-method.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/cash.service.ts src/services/__tests__/shift-sales-by-method.test.ts
git commit -m "feat(caixa): getShiftSalesByMethod (fonte SalePayment, crédito não-zerado)"
```

---

### Task D2: /api/cash/shift retorna salesByMethod + trata ?branch=all

**Files:**
- Modify: `src/app/api/cash/shift/route.ts` (GET)

- [ ] **Step 1: Editar o GET**

No `GET`, após resolver `branchId`, tratar o modo ALL e anexar `salesByMethod`:
```ts
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const url = new URL(request.url);
    if (url.searchParams.get("branch") === "all") {
      return NextResponse.json({ shift: null, allBranches: true }, { status: 200 });
    }

    const branchId = await getBranchId();
    const shift = await cashService.getCurrentShift(branchId, companyId);

    if (!shift) {
      return NextResponse.json({ shift: null }, { status: 200 });
    }

    const salesByMethod = await cashService.getShiftSalesByMethod(
      { id: shift.id, branchId, openedAt: shift.openedAt, closedAt: shift.closedAt },
      companyId
    );

    // ... (serializedShift como já existe) ...

    return NextResponse.json({ shift: serializedShift, salesByMethod }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
```
Manter toda a serialização existente do `serializedShift` (staleness, Number()s, movements).

- [ ] **Step 2: Smoke manual**

Run: abrir `/api/cash/shift` (deve trazer `salesByMethod`) e `/api/cash/shift?branch=all` (deve trazer `{ shift: null, allBranches: true }`).
Expected: ambos 200 com o shape descrito.

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cash/shift/route.ts
git commit -m "feat(caixa): /api/cash/shift retorna salesByMethod e trata modo todas-as-filiais"
```

---

### Task D3: Histórico — /api/cash-registers/[id]/transactions retorna salesByMethod

**Files:**
- Modify: `src/app/api/cash-registers/[id]/transactions/route.ts`

- [ ] **Step 1: Editar o GET**

Após carregar `shift` e `movements`, computar `salesByMethod` (o `shift` já tem `openedAt`/`closedAt`/`branchId`) e mudar o envelope de array para objeto:
```ts
import { cashService } from "@/services/cash.service";
// ...
    const movements = await prisma.cashMovement.findMany({ /* ...como já é... */ });
    const data = movements.map((mov) => ({ /* ...como já é... */ }));

    const salesByMethod = await cashService.getShiftSalesByMethod(
      { id: shift.id, branchId: shift.branchId, openedAt: shift.openedAt, closedAt: shift.closedAt },
      companyId
    );

    return successResponse({ movements: data, salesByMethod });
```

> ⚠️ Isto muda o shape de `data` de `T[]` para `{ movements, salesByMethod }`. O consumidor (modal, Task D4) precisa ser ajustado na mesma leva. Marcar isso no commit.

- [ ] **Step 2: tsc + smoke**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem novos erros. Smoke: `/api/cash-registers/<id>/transactions` → `{ data: { movements: [...], salesByMethod: [...] } }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cash-registers/[id]/transactions/route.ts
git commit -m "feat(caixa): transactions route inclui salesByMethod p/ histórico"
```

---

### Task D4: Modal de detalhes do histórico — quadro de conferência

**Files:**
- Modify: `src/components/caixa/modal-detalhes-caixa.tsx` (fetch ~l.85, render ~l.277-279)

> Componente compartilhado de conferência: criar um `<ConferenciaFormas salesByMethod={...} />` reutilizável (será usado também no fechamento, Task D6). Decidir: criar `src/components/caixa/conferencia-formas.tsx`.

- [ ] **Step 1: Criar componente compartilhado `conferencia-formas.tsx`**

Criar `src/components/caixa/conferencia-formas.tsx` — recebe `salesByMethod: { method: string; amount: number; count: number }[]`, separa em 2 blocos via `METHODS_IN_CASH` (gaveta) vs resto (a prazo), e renderiza com `formatCurrency` + `getMethodLabel`. Mostra "Vendido no turno · a prazo" no bloco a prazo. Reusar `METHODS_IN_CASH` de `@/lib/payment-methods`. < 120 linhas.

- [ ] **Step 2: Ajustar o fetch do modal para o novo shape**

Em `modal-detalhes-caixa.tsx`, `loadTransactions` (~l.85): ler `result.data.movements` (era `result.data`) e `result.data.salesByMethod`. Guardar `salesByMethod` em estado. Atualizar a tipagem de `CashTransaction[]`.

- [ ] **Step 3: Renderizar o quadro só quando CLOSED**

Inserir `<ConferenciaFormas salesByMethod={salesByMethod} />` entre o resumo financeiro (após ~l.277) e o `<Separator />` das Movimentações (~l.279), condicionado a `caixa.status === "CLOSED"`.

- [ ] **Step 4: tsc + verificação visual**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem novos erros. Abrir o histórico, abrir um caixa fechado com venda no crédito → bloco "a prazo" mostra o crédito (não R$ 0).

- [ ] **Step 5: Commit**

```bash
git add src/components/caixa/conferencia-formas.tsx src/components/caixa/modal-detalhes-caixa.tsx
git commit -m "feat(caixa): histórico mostra conferência de todas as formas (crédito não-zerado)"
```

---

### Task D5: Tela do caixa do dia — quadro 2-blocos

**Files:**
- Modify: `src/app/(dashboard)/dashboard/caixa/page.tsx`

> O `fetchCashShift` já busca `/api/cash/shift`. Agora consumir `salesByMethod`. Substituir o card amber zerado (linhas ~490-503) pelo quadro 2-blocos. Reusar `<ConferenciaFormas />` da Task D4.

- [ ] **Step 1: Consumir salesByMethod + modo ALL no fetch**

No `fetchCashShift`: se `isAllBranches`, chamar `/api/cash/shift?branch=all`; senão `/api/cash/shift`. Guardar `data.salesByMethod` em estado.

- [ ] **Step 2: Renderizar bloco gaveta (com "vendas à vista no turno") + bloco a prazo**

Substituir o card amber (~490-503) pelo `<ConferenciaFormas salesByMethod={salesByMethod} cashDrawerBalance={valorAtual} />`. O bloco gaveta mostra: "saldo em gaveta" (do `valorAtual`, CashMovement) + linha auxiliar "vendas à vista no turno" (linhas CASH/PIX/DEBIT do `salesByMethod`). Bloco a prazo: crédito/crediário/saldo/boleto/cheque.

- [ ] **Step 3: tsc + visual**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem erros. Visual: caixa do dia mostra crédito real, gaveta separada.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/dashboard/caixa/page.tsx
git commit -m "feat(caixa): caixa do dia com conferência 2-blocos (gaveta vs a prazo)"
```

---

### Task D6: Modal de fechamento — quadro de conferência

**Files:**
- Modify: `src/components/caixa/modal-fechamento-caixa.tsx` (nova prop + render ~l.372)
- Modify: `src/app/(dashboard)/dashboard/caixa/page.tsx` (passar `salesByMethod` ao modal)

- [ ] **Step 1: Adicionar prop salesByMethod ao modal**

Em `modal-fechamento-caixa.tsx`, estender a interface de props com `salesByMethod?: { method: string; amount: number; count: number }[]`. Renderizar `<ConferenciaFormas salesByMethod={salesByMethod ?? []} />` read-only no Step 1 do modal (após o `FORMAS.map`, antes do "Total geral", ~l.372). Não alterar o que `handleSubmit` persiste (`closeShift` continua só dinheiro).

- [ ] **Step 2: Threading no caixa/page.tsx**

Onde o `<ModalFechamentoCaixa ... />` é renderizado, passar `salesByMethod={salesByMethod}`.

- [ ] **Step 3: tsc + visual**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem erros. Visual: abrir fechamento com venda no crédito → quadro mostra crédito real.

- [ ] **Step 4: Commit**

```bash
git add src/components/caixa/modal-fechamento-caixa.tsx src/app/(dashboard)/dashboard/caixa/page.tsx
git commit -m "feat(caixa): fechamento mostra conferência completa de formas"
```

---

# ENTREGA C — Microcopy + filial na tela do caixa

### Task C1: Microcopy e rótulo/aviso de filial

**Files:**
- Modify: `src/app/(dashboard)/dashboard/caixa/page.tsx`

> Pode ser combinado com D5 num só commit se for executado em sequência. Mantido separado para clareza.

- [ ] **Step 1: Microcopy no bloco "a prazo"**

Adicionar nota/tooltip: "Crédito, crediário e saldo a receber não entram no caixa físico — viram contas a receber e aparecem aqui só para conferência." (já parcialmente existe no card — alinhar texto.)

- [ ] **Step 2: Rótulo + aviso de filial**

No header do status do caixa: mostrar "Caixa da Loja {branchName}". Quando `isAllBranches`, exibir aviso "Selecione uma loja específica para ver a conferência do caixa" (consistente com o backend que retorna `shift: null` em modo all — Task D2).

- [ ] **Step 3: Visual + tsc**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem erros. Visual: trocar para "todas as filiais" → aparece o aviso, não números de uma loja só.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/dashboard/caixa/page.tsx
git commit -m "feat(caixa): microcopy da regra a prazo + rótulo/aviso de filial"
```

---

# ENTREGA B — Selos na tela de detalhe da venda

### Task B1: Componente PaymentDestinationBadge

**Files:**
- Create: `src/components/vendas/payment-destination-badge.tsx`

- [ ] **Step 1: Criar o componente**

Recebe um item de trace (`PaymentTrace`) e renderiza o selo correto:
- `reversed` → 🔴 "Estornado / cancelado" + "saiu do caixa no estorno".
- `enteredCashRegister && !reversed` → 🟢 "Entrou no caixa" + `Caixa {branchName} · {operador} · {data}` + badge turno aberto/fechado.
- `destino === "card_receivable"` → 🟡 "A prazo — recebível de cartão".
- `destino === "accounts_receivable"` → 🟡 "A prazo — vira conta a receber".
- `destino === "none"` → ⚪ "Sem destino registrado".
- Estado de loading próprio (skeleton) enquanto o trace não chegou. < 100 linhas. Usar `Badge` do shadcn + `formatCurrency`/data pt-BR já usados no projeto.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/vendas/payment-destination-badge.tsx
git commit -m "feat(caixa): componente de selo de destino do pagamento"
```

---

### Task B2: Ligar cash-trace na tela de detalhe da venda

**Files:**
- Modify: `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx`

- [ ] **Step 1: useEffect independente com dep [id]**

Adicionar estado `cashTrace` + `traceLoading`, e um `useEffect(() => { fetch(`/api/sales/${id}/cash-trace`)... }, [id])` — **dependência `[id]`, não `[sale?.id]`** (paralelo ao getById, não waterfall). Mapear o trace por `paymentId` para lookup rápido.

- [ ] **Step 2: Renderizar o selo em cada pagamento**

No card "Formas de Pagamento", para cada pagamento renderizar `<PaymentDestinationBadge trace={traceByPaymentId[payment.id]} loading={traceLoading} />`.

- [ ] **Step 3: Visual + tsc**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: sem erros. Visual: abrir uma venda no crédito → selo "a prazo"; venda em dinheiro → "entrou no caixa" com a loja/turno; venda cancelada → 🔴.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx"
git commit -m "feat(caixa): detalhe da venda mostra onde cada pagamento caiu"
```

---

# FECHAMENTO

### Task F1: Suíte completa + build + revisão

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test 2>&1 | tail -30`
Expected: tudo verde (≥663 testes + os novos). Corrigir qualquer teste que codificava o comportamento antigo de boleto/cheque.

- [ ] **Step 2: Build**

Run: `npm run build 2>&1 | tail -20`
Expected: build verde.

- [ ] **Step 3: Code review**

Rodar `/code-review` (ou dispatch code-reviewer) no diff da branch. Endereçar CRITICAL/HIGH.

- [ ] **Step 4: Smoke manual (checklist para o dono)**

- [ ] Venda no crédito → caixa do dia mostra o valor no bloco "a prazo" (não R$ 0).
- [ ] Detalhe da venda → cada pagamento mostra onde caiu.
- [ ] Venda cancelada → selo 🔴, não 🟢.
- [ ] Boleto/cheque sem cliente → bloqueado no PDV.
- [ ] Boleto com cliente → gera conta a receber, aparece em "a prazo".
- [ ] Histórico de caixa fechado → conferência mostra crédito real.
- [ ] Modo "todas as filiais" → aviso para escolher loja (não dados de 1 loja).
- [ ] Fechamento de caixa → dinheiro confere normal (sem regressão).

- [ ] **Step 5: Rodar o diagnóstico na venda real do PS VISION**

Com a Entrega A em prod (ou local apontando pro banco), chamar `/api/sales/<id-da-venda-do-PS-VISION>/cash-trace` e confirmar o que houve (a prazo vs shift/filial diferente). Reportar ao dono.

---

## Notas de execução

- **Sem migration** — não rodar `prisma migrate`. Se algum passo sugerir mudança de schema, parar e revisar (não estava no escopo).
- **Deploy é manual** via `vercel deploy --prod` do working tree (não por push). Email do commit deve bater com a conta Git (`cheapmilhas@users.noreply.github.com`) ou a Vercel bloqueia.
- Confirmar nomes exatos de relações Prisma (`CashMovement.cashShift`, `cashShift.branch`, `cashShift.openedByUser`) ao implementar A1 — ajustar includes se diferirem.
- A semântica de "Vendido no turno (a prazo)" ≠ "saldo em aberto" deve aparecer no rótulo da UI (não prometer o que a query não calcula).
