# Rotina de Testes Óticas Ultra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir ~15 bugs/faltas da rotina de testes (caixa, financeiro, cancelados, cadastros, PDFs) sem regressão em criação de venda, saldos, recibos ou multi-tenant.

**Architecture:** 5 fases independentes (F1→F5), cada uma entrega software funcionando e termina num checkpoint de teste obrigatório antes da próxima (regra do dono). Correções priorizam reusar código já existente (endpoints, modais, helpers) e seguem os padrões do repo.

**Tech Stack:** Next.js 14 (App Router), Prisma + PostgreSQL (Neon), TypeScript, Vitest (`npm test`), Shadcn UI. Migrations são MANUAIS (`npm run migrate:deploy`), NÃO rodam no build.

**Spec:** `docs/superpowers/specs/2026-06-03-rotina-testes-otica-ultra-design.md`

**REGRA DO DONO:** ao fim de CADA fase, rodar `npx tsc --noEmit` + `npm test` + `npm run build` e fazer smoke manual antes de seguir. Só avança com tudo verde.

---

## File Structure

### F1 — Críticos baratos (UI wiring + layout)
- Modify: `src/components/caixa/modal-reforco.tsx` — plugar POST real, remover mock + "Carlos Vendedor"
- Modify: `src/components/caixa/modal-sangria.tsx` — idem (type WITHDRAWAL)
- Modify: `src/components/caixa/modal-abertura-caixa.tsx` — remover "Carlos Vendedor" + cap de altura
- Modify: `src/components/estoque/modal-saida-estoque.tsx` — cap de altura
- Modify: `src/app/(dashboard)/dashboard/fornecedores/page.tsx` — plugar ModalFornecedorRapido
- Reuse (não tocar): `src/app/api/cash/movements/route.ts`, `src/components/estoque/modal-fornecedor-rapido.tsx`, `src/components/caixa/modal-fechamento-caixa.tsx`

### F2 — Pagar conta debita caixa
- Modify: `src/services/finance-entry.service.ts` — entry grava financeAccountId; reversão re-credita condicional
- Modify: `src/app/api/accounts-payable/route.ts` — transição atômica + decrement guardado
- Modify: `src/app/(dashboard)/dashboard/financeiro/page.tsx` — seletor de conta no pagamento
- Create: `scripts/reconcile-finance-balance.ts` — rede de segurança (recompute balance from entries)
- Test: `src/services/finance-entry.service.test.ts` (se viável unitar a lógica condicional)

### F3 — Cancelados por papel
- Modify: `src/app/api/laboratories/[id]/service-orders/route.ts` — filtra lista por papel
- Modify: `src/app/api/accounts-receivable/route.ts` — filtra status por papel (where.status escalar)
- Modify: UI badges "CANCELADO" + toggle (labs detail modal, AR listing)
- Reuse: `src/lib/auth-helpers.ts` (`isAdminOrManager`/`checkPermission`)

### F4 — Cadastros + Nº de venda
- Create: `src/app/api/brands/route.ts` (adicionar POST) / `src/app/api/categories/route.ts` (adicionar POST)
- Modify: `src/app/(dashboard)/dashboard/produtos/novo/page.tsx` — criação inline Marca/Categoria
- Create: `prisma/migrations/<ts>_sale_number/migration.sql` — coluna + backfill + counter + NOT NULL + unique
- Modify: `prisma/schema.prisma` — Sale.number
- Modify: `src/services/sale.service.ts` + `src/services/quote.service.ts` — getNextSequence nos DOIS caminhos
- Create: `src/lib/sale-number.ts` + `src/lib/sale-number.test.ts`
- Modify: ~10 sites de exibição de `sale.id.substring/slice`

### F5 — PDFs header único
- Create: `src/lib/pdf-header.ts` — fonte de dados + `drawPdfHeader(doc, company)` (jsPDF) + `companyHeaderHtml(company)` (HTML string)
- Modify: `src/components/print/print-header.tsx` — ativar (já existe, é React)
- Modify: rotas/páginas de PDF por fatia (F5a/F5b/F5c)
- Modify: `src/lib/report-export.ts` — header nos ~14 relatórios
- Modify: `src/lib/pdf-utils.ts` — consertar carnê jsPDF (logoUrl morto)

---

## FASE F1 — Críticos baratos

### Task F1.1: Reforço de caixa chama a API real

**Files:**
- Modify: `src/components/caixa/modal-reforco.tsx`
- Reference: `src/app/api/cash/movements/route.ts`, `src/lib/validations/cash.schema.ts:28`

- [ ] **Step 1: Ler o modal atual** para mapear `formData` (valor, motivo, observacoes) e o bloco `setTimeout` (linhas ~28-49) e a string "Carlos Vendedor" (~71).

- [ ] **Step 2: Substituir o mock pelo fetch real.** No `handleSubmit`, trocar o `setTimeout` por:

```typescript
const amount = Number(formData.valor);
if (!amount || amount <= 0) {
  toast.error("Informe um valor maior que zero");
  return;
}
const motivoLabel = MOTIVO_LABELS[formData.motivo] ?? formData.motivo;
const note = formData.observacoes
  ? `${motivoLabel} — ${formData.observacoes}`
  : motivoLabel;

setLoading(true);
try {
  const res = await fetch("/api/cash/movements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "SUPPLY", amount, method: "CASH", note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Falha ao registrar reforço");
  }
  toast.success(`Reforço registrado! R$ ${amount.toFixed(2)} adicionado ao caixa.`);
  onOpenChange(false); // a página refaz fetchCashShift no onOpenChange
} catch (e) {
  toast.error(e instanceof Error ? e.message : "Erro ao registrar reforço");
} finally {
  setLoading(false);
}
```

- [ ] **Step 3: Definir `MOTIVO_LABELS`** (map das chaves i18n do Select para texto legível) no topo do arquivo, cobrindo todas as opções do Select de motivo.

- [ ] **Step 4: Remover a string hardcoded "Carlos Vendedor"** — substituir pelo nome do usuário logado via `useSession()` (`session?.user?.name ?? "Operador"`). Importar `useSession` de `next-auth/react`.

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem novos erros no arquivo.

- [ ] **Step 6: Commit**

```bash
git add src/components/caixa/modal-reforco.tsx
git commit -m "fix(caixa): reforço chama POST /api/cash/movements (era mock) + operador da sessão"
```

### Task F1.2: Sangria de caixa chama a API real

**Files:**
- Modify: `src/components/caixa/modal-sangria.tsx`

- [ ] **Step 1: Aplicar o mesmo padrão da F1.1**, com `type: "WITHDRAWAL"` e mensagem "retirado do caixa". Reusar a mesma estrutura de `MOTIVO_LABELS` + `Number(formData.valor)` + compor `note`.

- [ ] **Step 2: Remover "Carlos Vendedor"** (linha ~71/73) → `useSession`.

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/caixa/modal-sangria.tsx
git commit -m "fix(caixa): sangria chama POST /api/cash/movements (era mock) + operador da sessão"
```

### Task F1.3: Cap de altura nos modais que estouram a tela

**Files:**
- Modify: `src/components/estoque/modal-saida-estoque.tsx:222`
- Modify: `src/components/caixa/modal-abertura-caixa.tsx:74`
- Reference: `src/components/caixa/modal-fechamento-caixa.tsx:238` (molde correto)

- [ ] **Step 1: modal-saida-estoque** — no `<DialogContent className="sm:max-w-[550px]">`, adicionar `max-h-[90vh] overflow-y-auto` → `className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto"`.

- [ ] **Step 2: modal-abertura-caixa** — no `<DialogContent className="sm:max-w-lg">`, adicionar `max-h-[90vh] overflow-y-auto`. Também remover "Carlos Vendedor" (linha ~92) → `useSession`.

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/estoque/modal-saida-estoque.tsx src/components/caixa/modal-abertura-caixa.tsx
git commit -m "fix(ui): cap max-h-[90vh] em modais saída-estoque e abertura-caixa (botões fora da tela)"
```

### Task F1.4: Botão "Novo Fornecedor" funcional

**Files:**
- Modify: `src/app/(dashboard)/dashboard/fornecedores/page.tsx:360-365`
- Reference: `src/components/estoque/modal-fornecedor-rapido.tsx` (já existe, POSTa /api/suppliers)

- [ ] **Step 1: Ler o ModalFornecedorRapido** para confirmar props (`open`, `onOpenChange`/`onClose`, `onSuccess`).

- [ ] **Step 2: Adicionar estado** `const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false)` na página.

- [ ] **Step 3: Trocar o stub** `onClick={() => toast("Em desenvolvimento")}` por `onClick={() => setNovoFornecedorOpen(true)}`.

- [ ] **Step 4: Renderizar o modal** no fim do JSX: `<ModalFornecedorRapido open={novoFornecedorOpen} onOpenChange={setNovoFornecedorOpen} onSuccess={fetchSuppliers} />` (ajustar nomes de props ao componente real).

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/fornecedores/page.tsx
git commit -m "fix(fornecedores): botão Novo Fornecedor abre ModalFornecedorRapido (era stub)"
```

### ✅ CHECKPOINT F1 (obrigatório antes de F2)

- [ ] `npx tsc --noEmit` limpo
- [ ] `npm test` verde
- [ ] `npm run build` verde
- [ ] **Smoke manual:** caixa aberto → reforço R$100 sobe saldo e aparece no histórico; sangria R$50 desce; "operador" mostra usuário logado; abrir modais em janela curta e alcançar o botão; criar fornecedor pela página de Fornecedores.
- [ ] Avisar o dono para aprovar antes de F2.

---

## FASE F2 — Pagar conta debita o caixa

> ⚠️ Frente que mexe com saldo. Seguir os 3 riscos críticos da spec à risca.

### Task F2.1: Entry de despesa grava financeAccountId (sem decrementar dentro da função)

**Files:**
- Modify: `src/services/finance-entry.service.ts:635-675` (`generateAccountPayableExpenseEntry`)

- [ ] **Step 1: Ler `generateAccountPayableExpenseEntry` e `generateManualExpenseEntry`** (812-853) para comparar assinaturas.

- [ ] **Step 2: Adicionar param opcional `financeAccountId`** à `generateAccountPayableExpenseEntry` e gravá-lo no entry (campo `financeAccountId`). **NÃO** decrementar saldo aqui (o backfill chama essa função; decrement fica no call site da rota). Manter o upsert idempotente existente.

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem erros (param opcional não quebra callers).

- [ ] **Step 4: Commit**

```bash
git add src/services/finance-entry.service.ts
git commit -m "feat(finance): entry de conta a pagar grava financeAccountId (decrement fica na rota)"
```

### Task F2.2: Reversão re-credita só quando há financeAccountId

**Files:**
- Modify: `src/services/finance-entry.service.ts:680-693` (`deleteAccountPayableExpenseEntry`)

- [ ] **Step 1: Reescrever `deleteAccountPayableExpenseEntry`** de `deleteMany` cego para: `findFirst` do entry → se `entry.financeAccountId != null`, `financeAccount.update({ where: { id }, data: { balance: { increment: entry.amount } } })` → então deletar. Receber `tx` para rodar na transação da rota.

```typescript
// pseudocódigo da nova lógica
const entry = await tx.financeEntry.findFirst({ where: { /* chave única do entry de despesa */ } });
if (entry) {
  if (entry.financeAccountId) {
    await tx.financeAccount.update({
      where: { id: entry.financeAccountId },
      data: { balance: { increment: entry.amount } },
    });
  }
  await tx.financeEntry.delete({ where: { id: entry.id } });
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/services/finance-entry.service.ts
git commit -m "fix(finance): reversão de conta paga re-credita saldo só se foi paga no código novo (financeAccountId set)"
```

### Task F2.3: PATCH com transição atômica + decrement exatamente-uma-vez

**Files:**
- Modify: `src/app/api/accounts-payable/route.ts:298-426`

- [ ] **Step 1: Trocar a detecção de transição** para `updateMany` condicional no status:

```typescript
// dentro da $transaction, no branch de pagamento (status === PAID):
const flipped = await tx.accountPayable.updateMany({
  where: { id, companyId, status: { in: ["PENDING", "OVERDUE"] } },
  data: { status: "PAID", paidAmount, paidDate, paidByUserId },
});
const didTransition = flipped.count === 1;
```

- [ ] **Step 2: Decrementar saldo só se `didTransition` e houver `financeAccountId` válido** (validar que pertence à companyId):

```typescript
if (didTransition && financeAccountId) {
  const acc = await tx.financeAccount.findFirst({ where: { id: financeAccountId, companyId } });
  if (!acc) throw new Error("Conta financeira inválida");
  await generateAccountPayableExpenseEntry(tx, /* ...,*/ financeAccountId);
  await tx.financeAccount.update({
    where: { id: financeAccountId },
    data: { balance: { decrement: amount } },
  });
}
```

- [ ] **Step 3: Remover AMBOS os `catch {}` silenciosos** — o do pagamento (~392-394) E o da reversão (~405-407). Os dois engolem falha de saldo (corrupção). Deixar o erro propagar (rollback da transação).

- [ ] **Step 4: Na reversão (PAID→PENDING)**, chamar a `deleteAccountPayableExpenseEntry(tx, ...)` reescrita na F2.2 (que re-credita condicional).

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/accounts-payable/route.ts
git commit -m "fix(contas-a-pagar): pagamento debita saldo da conta (transição atômica, exatamente-1x, validação de tenant)"
```

### Task F2.4: Seletor de conta pagadora na UI

**Files:**
- Modify: `src/app/(dashboard)/dashboard/financeiro/page.tsx:320-341` (`handleMarkAsPaid`)

- [ ] **Step 1: Adicionar um seletor de conta** (Caixa/Banco/PIX, carregado de `/api/finance/accounts`) no fluxo de pagamento — pode ser um pequeno dialog/confirm antes do PATCH.

- [ ] **Step 2: Enviar `financeAccountId`** no body do PATCH junto com `{ id, status: "PAID", paidDate }`.

- [ ] **Step 3: Verificar tsc** + **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/financeiro/page.tsx
git commit -m "feat(contas-a-pagar): UI escolhe conta pagadora ao dar baixa"
```

### Task F2.5: Script de reconciliação de saldo (rede de segurança)

**Files:**
- Create: `scripts/reconcile-finance-balance.ts`

- [ ] **Step 1: Escrever script** que, por empresa, recompute `FinanceAccount.balance` a partir da soma dos `FinanceEntry` com `financeAccountId` (entradas − saídas) e compare/atualize. Rodável via `npx tsx scripts/reconcile-finance-balance.ts [--apply]` (dry-run por padrão, `--apply` grava).

- [ ] **Step 2: Commit**

```bash
git add scripts/reconcile-finance-balance.ts
git commit -m "chore(finance): script de reconciliação de saldo (dry-run/--apply) como rede de segurança"
```

### ✅ CHECKPOINT F2 (obrigatório)

- [ ] `npx tsc --noEmit` + `npm test` + `npm run build` verdes
- [ ] **Smoke manual:** pagar a conta de água R$15 escolhendo "Caixa" → saldo cai R$15, aparece no extrato, status PAID. Repetir PATCH (não debita 2×). Reverter (PAID→PENDING) → saldo volta. Conta paga ANTES do deploy (legado) revertida NÃO infla saldo.
- [ ] `npx tsx scripts/reconcile-finance-balance.ts` (dry-run) sem divergências inesperadas.
- [ ] Aprovação do dono antes de F3.

---

## FASE F3 — Cancelados por papel

### Task F3.1: Helper de papel privilegiado

**Files:**
- Reference: `src/lib/auth-helpers.ts:197` (`isAdminOrManager`)

- [ ] **Step 1: Confirmar `isAdminOrManager()`** retorna true para `ADMIN`/`GERENTE` (valores Prisma). Se não existir um helper conveniente que devolva o boolean a partir da sessão na rota, criar `canSeeCanceled(session): boolean` em `auth-helpers.ts` baseado em `["ADMIN","GERENTE"]`. **NUNCA** comparar com `"SELLER"`/`"MANAGER"`.

- [ ] **Step 2: Commit** (se criou helper)

```bash
git add src/lib/auth-helpers.ts
git commit -m "feat(auth): helper canSeeCanceled (ADMIN/GERENTE) para filtro de cancelados"
```

### Task F3.2: Laboratórios — filtrar lista de pedidos por papel

**Files:**
- Modify: `src/app/api/laboratories/[id]/service-orders/route.ts:28-51`

- [ ] **Step 1: Aplicar filtro de status na LISTA** (não no `_count` do outro route): se `!canSeeCanceled`, `where.status = { not: "CANCELED" }`. Manter `companyId` no where (objeto literal seedado com companyId primeiro).

- [ ] **Step 2: NÃO tocar** `laboratories/route.ts` `_count`/`totalOrders` (quebraria taxa de sucesso). Adicionar comentário explicando o porquê.

- [ ] **Step 3: tsc** + **Commit**

```bash
git add src/app/api/laboratories/\[id\]/service-orders/route.ts
git commit -m "fix(laboratorios): lista de pedidos esconde cancelados para vendedor (admin/gerente vê)"
```

### Task F3.3: Contas a Receber — filtrar status por papel

**Files:**
- Modify: `src/app/api/accounts-receivable/route.ts:88-196`

- [ ] **Step 1: Se `!canSeeCanceled` e não houver status explícito**, aplicar `where.status = { not: "CANCELED" }` (ESCALAR, não um segundo `where.OR` — já existe `OR` de busca em :115). Para admin/gerente, manter comportamento atual (mostra tudo).

- [ ] **Step 2: Enforçar o toggle "mostrar cancelados" no server** — ignorar o param para vendedor.

- [ ] **Step 3: tsc** + **Commit**

```bash
git add src/app/api/accounts-receivable/route.ts
git commit -m "fix(contas-a-receber): esconde parcelas de venda cancelada para vendedor; admin vê (where.status escalar)"
```

### Task F3.4: Badges "CANCELADO" + toggle na UI

**Files:**
- Modify: páginas do modal de detalhe do lab e da listagem de AR

- [ ] **Step 1: Badge "CANCELADO"** (vermelho) nos itens com `status === "CANCELED"`.
- [ ] **Step 2: Toggle "Mostrar cancelados"** visível só para admin/gerente, ligado por padrão.
- [ ] **Step 3: tsc** + **Commit**

```bash
git commit -am "feat(ui): badge CANCELADO + toggle mostrar cancelados (admin/gerente)"
```

### Task F3.5: Verificar lista de vendas + métricas

- [ ] **Step 1: Conferir** se `vendas/` listing e métricas financeiras já filtram CANCELED. Se não, aplicar mesmo critério. Documentar o que foi encontrado.

### ✅ CHECKPOINT F3 (obrigatório)

- [ ] tsc + test + build verdes
- [ ] **Smoke:** logar como VENDEDOR → labs e AR sem cancelados; logar como ADMIN → vê com badge + toggle funciona. Sem vazamento entre empresas.
- [ ] Aprovação do dono antes de F4.

---

## FASE F4 — Cadastros + Número de venda

### Task F4.1: POST em /api/brands e /api/categories

**Files:**
- Modify: `src/app/api/brands/route.ts`, `src/app/api/categories/route.ts`

- [ ] **Step 1: Adicionar handler POST** em cada: validar `{ name }` com Zod, scoped `companyId` (via `auth()` + `getCompanyId()`), anti-duplicado (checar existência por nome+companyId), retornar `createdResponse`. Seguir padrão POST do repo (ver `/api/suppliers/route.ts`).

- [ ] **Step 2: tsc** + **Commit**

```bash
git add src/app/api/brands/route.ts src/app/api/categories/route.ts
git commit -m "feat(produtos): POST /api/brands e /api/categories (criar por nome, scoped companyId)"
```

### Task F4.2: Criação inline de Marca/Categoria no form de produto

**Files:**
- Modify: `src/app/(dashboard)/dashboard/produtos/novo/page.tsx:251-286`
- Reference: `src/components/supplier-select.tsx` (padrão "+ Novo" inline)

- [ ] **Step 1: Adicionar botão "+ Nova"** em cada Select (Marca/Categoria) que abre mini-dialog, cria via POST, e seleciona o novo id. Espelhar o `SupplierSelect`.

- [ ] **Step 2: tsc** + **Commit**

```bash
git add src/app/\(dashboard\)/dashboard/produtos/novo/page.tsx
git commit -m "feat(produtos): criar Marca/Categoria inline no formulário (padrão SupplierSelect)"
```

### Task F4.3: Helper sale-number (TDD)

**Files:**
- Create: `src/lib/sale-number.ts`, `src/lib/sale-number.test.ts`
- Reference: `src/lib/os-number.ts` (molde)

- [ ] **Step 1: Escrever o teste primeiro** (`sale-number.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { saleDisplayNumber } from "./sale-number";

describe("saleDisplayNumber", () => {
  it("formata número sequencial com 6 dígitos", () => {
    expect(saleDisplayNumber({ id: "cuid1", number: 123 })).toBe("#000123");
  });
  it("cai no fallback (últimos 8 do id, maiúsculo) quando number é null", () => {
    expect(saleDisplayNumber({ id: "cmopsjhmXYZ", number: null })).toBe("#PSJHMXYZ");
  });
  it("fallback (#DEF12345) quando number é 0", () => {
    // "abcdef12345" (11 chars) → slice(-8) = "def12345" → maiúsculo → "#DEF12345"
    expect(saleDisplayNumber({ id: "abcdef12345", number: 0 })).toBe("#DEF12345");
  });
});
```
> Asserções com literais fixos (sem expressões auto-referentes). 2ª: `"cmopsjhmXYZ".slice(-8)` = `"psjhmXYZ"` → `"#PSJHMXYZ"`. 3ª: `"abcdef12345".slice(-8)` = `"def12345"` → `"#DEF12345"`. Cobrem: number>0 → `#000123`; number null/0 → fallback cuid maiúsculo.

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- sale-number`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `sale-number.ts`** (espelhar `os-number.ts`, versão simples):

```typescript
export interface SaleNumberInput {
  id: string;
  number?: number | null;
}

function pad(n: number): string {
  return String(n).padStart(6, "0");
}

export function saleDisplayNumber(sale: SaleNumberInput): string {
  return sale.number && sale.number > 0
    ? `#${pad(sale.number)}`
    : `#${sale.id.slice(-8).toUpperCase()}`;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- sale-number`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sale-number.ts src/lib/sale-number.test.ts
git commit -m "feat(lib): helper saleDisplayNumber (#000123 com fallback cuid) + testes"
```

> 🛑 **ORDEM DE DEPLOY (resolve o blocker da revisão).** Como migrations são MANUAIS e código+banco NÃO são atômicos, a sequência segura é em **DUAS migrations** com o código no meio. NÃO colapsar em uma só, NÃO deployar "juntos". A ordem real é:
> 1. **Migration A** (`sale_number_nullable`): só `ADD COLUMN number INTEGER` (nullable). Schema: `number Int?`. Aplicar em prod ANTES do código.
> 2. **Código F4.4** (numerar nos 2 caminhos): só escreve em coluna que já existe (nullable). Deployar.
> 3. **Migration B** (`sale_number_tighten`): backfill + seed counter + SET NOT NULL + unique. Schema: `number Int` + `@@unique`. Aplicar DEPOIS do código já estar numerando (não há mais inserts com number null).
> Assim nunca existe uma janela onde o código escreve numa coluna inexistente, nem onde o NOT NULL pega um insert sem número.

### Task F4.4a: Migration A — adicionar coluna nullable

**Files:**
- Modify: `prisma/schema.prisma` (Sale: `number Int?`, SEM unique ainda, SEM default)
- Create: `prisma/migrations/<timestamp>_sale_number_nullable/migration.sql`

- [ ] **Step 1: Editar schema** — adicionar `number Int?` ao model Sale (nullable, sem `@@unique`, sem default).

- [ ] **Step 2: Gerar migration only-create** e escrever o SQL mínimo:

Run: `npx prisma migrate dev --create-only --name sale_number_nullable`

```sql
ALTER TABLE "Sale" ADD COLUMN "number" INTEGER;
```

- [ ] **Step 3: Aplicar em banco de teste**, `prisma generate`, confirmar `tsc`.

Run: `npm run migrate:deploy` (banco de teste)
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): Sale.number nullable (migration A — coluna apenas, sem constraint)"
```

### Task F4.4b: Patchar os DOIS caminhos de criação de venda

**Files:**
- Modify: `src/services/sale.service.ts:625` (create)
- Modify: `src/services/quote.service.ts:905` (convertToSale)
- Reference: `src/lib/counter.ts:20` (`getNextSequence(companyId, key, tx?)` — assinatura confirmada)

- [ ] **Step 1: Em `sale.service.ts` create**, dentro da `$transaction` existente, antes do `tx.sale.create`, obter `const number = await getNextSequence(companyId, "sale", tx)` e passar `number` no `data` do create.

- [ ] **Step 2: Em `quote.service.ts` convertToSale** (linha ~905), idem: `getNextSequence(companyId, "sale", tx)` e incluir `number` no `tx.sale.create`.

- [ ] **Step 3: tsc** (passa porque a coluna é `number Int?` opcional no client) + **Commit**

```bash
git add src/services/sale.service.ts src/services/quote.service.ts
git commit -m "feat(vendas): numerar venda via getNextSequence nos DOIS caminhos (create + convertToSale)"
```

### Task F4.5: Migration B — backfill + counter + NOT NULL + unique

**Files:**
- Modify: `prisma/schema.prisma` (Sale: trocar `number Int?` → `number Int` + `@@unique([companyId, number])`, sem default)
- Create: `prisma/migrations/<timestamp>_sale_number_tighten/migration.sql`

- [ ] **Step 1: Editar schema** — `number Int` (não-nullable) + `@@unique([companyId, number])`.

- [ ] **Step 2: Gerar migration only-create** e escrever o SQL manual (Prisma não deve autogerar o NOT NULL sobre tabela populada):

Run: `npx prisma migrate dev --create-only --name sale_number_tighten`

```sql
-- RENUMERA TODAS as linhas por createdAt (cronologia correta: #1 = venda mais antiga).
-- Inclui as poucas vendas já numeradas pelo código entre as 2 migrations — elas são
-- reescritas para a posição cronológica certa. Como o unique ainda NÃO existe neste ponto,
-- a reescrita em massa não colide. Tiebreaker em id; inclui soft-deleted.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "companyId" ORDER BY "createdAt" ASC, "id" ASC
  ) AS rn
  FROM "Sale"
)
UPDATE "Sale" s SET "number" = ranked.rn FROM ranked WHERE s.id = ranked.id;

-- seed/atualiza Counter key 'sale' no MAX por empresa
INSERT INTO "Counter" ("id","companyId","key","value")
SELECT gen_random_uuid()::text, "companyId", 'sale', MAX("number")
FROM "Sale" GROUP BY "companyId"
ON CONFLICT ("companyId","key") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

-- NOT NULL
ALTER TABLE "Sale" ALTER COLUMN "number" SET NOT NULL;

-- unique (criado DEPOIS da renumeração em massa)
CREATE UNIQUE INDEX "Sale_companyId_number_key" ON "Sale"("companyId","number");
```
> Nota: renumera TODAS as linhas por `createdAt` (não só as NULL) para preservar a cronologia — venda #1 é a mais antiga da empresa. As pouquíssimas vendas numeradas pelo código na janela de deploy são reescritas para a posição certa; seguro porque o índice unique só é criado APÓS o UPDATE em massa. `GREATEST` no counter garante que o próximo número continue do topo.

- [ ] **Step 3: Aplicar em banco de teste**, validar backfill sem colisão e counter no MAX. `prisma generate` + `tsc`.

Run: `npm run migrate:deploy` (banco de teste)
Expected: sucesso, sem erro de NOT NULL/unique.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): Sale.number tighten (migration B — backfill+counter+notnull+unique, sem default)"
```

### Task F4.6: Trocar exibição do cuid pelo helper

**Files (todos `sale.id.substring/slice`):**
- `src/app/(dashboard)/dashboard/financeiro/devolucoes/page.tsx` (419,468,487,735)
- `src/app/(dashboard)/dashboard/relatorios/contas-receber/page.tsx:484`
- `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx`
- `src/components/quotes/convert-quote-button.tsx:138`
- `src/app/recibo/[token]/page.tsx:105`
- `src/app/api/accounts-receivable/[id]/receipt/route.ts:126`
- `src/app/api/accounts-receivable/sale/[saleId]/carne/route.ts` (59,101,178)
- `src/app/api/sales/[id]/pdf/route.ts:104` (remover `as any`)
- `src/services/sale-side-effects.service.ts` (253,276) — descrição de novas parcelas

- [ ] **Step 1: Garantir que cada `select`/`include` de Sale inclua `number`** nas APIs que alimentam esses sites (senão helper recebe undefined).

- [ ] **Step 2: Substituir** cada `sale.id.substring(0,8)` / `slice(-8)` por `saleDisplayNumber(sale)`. Em `sale-side-effects.service.ts` usar o `number` recém-gerado na descrição.

- [ ] **Step 3: Remover o `as any`** em `pdf/route.ts:104`.

- [ ] **Step 4: tsc** + **Commit**

```bash
git commit -am "refactor(vendas): exibir #000123 via saleDisplayNumber em listas/recibos/carnê (era cuid)"
```

### ✅ CHECKPOINT F4 (obrigatório — mais sensível do sprint)

- [ ] tsc + test + build verdes
- [ ] **Migration testada em cópia do banco** antes de prod (backfill sem colisão, counter no MAX).
- [ ] **Smoke:** criar venda nova → recebe `#000NNN`; converter orçamento com lente → cria venda SEM erro (P2002/NOT NULL) e numerada; venda legada exibe fallback sem quebrar. Criar Marca/Categoria inline. PDF não mostra mais "000000".
- [ ] **Ordem de deploy em prod (3 passos, NÃO juntos):** (1) `migrate:deploy` da Migration A (coluna nullable) → (2) deploy do código F4.4b/F4.6 (numera + exibe) → (3) `migrate:deploy` da Migration B (backfill+NOT NULL+unique). Validar cada passo em staging. Nunca aplicar B antes do código estar numerando.
- [ ] Aprovação do dono antes de F5.

---

## FASE F5 — PDFs header único

### Task F5.1: Fonte de dados + renderizadores (jsPDF + HTML)

**Files:**
- Create: `src/lib/pdf-header.ts`
- Reference: `src/app/api/sales/[id]/pdf/route.ts:70-83` (padrão defensivo de logo)

- [ ] **Step 1: Definir tipo** `CompanyHeaderData = { logoUrl?: string|null; companyName: string; cnpj?: string|null; address?: string|null; phone?: string|null; email?: string|null }`.

- [ ] **Step 2: `drawPdfHeader(doc, data)`** (jsPDF) — desenha logo+nome+cnpj. Logo SEMPRE com guard: validar prefixo `data:image/(png|jpe?g)`, `try/catch` com fallback para texto do nome, tamanho fixo. Copiar a lógica de `sales/[id]/pdf/route.ts:70-83`.

- [ ] **Step 3: `companyHeaderHtml(data)`** — retorna string HTML com `<img src>` (validar prefixo `data:image/`) + nome/cnpj, para os geradores HTML-string.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf-header.ts
git commit -m "feat(pdf): pdf-header.ts — fonte única + drawPdfHeader (jsPDF, com guard) + companyHeaderHtml"
```

### Task F5.2 (F5a): Relatório de Caixa + recibo de venda + OS

**Files:**
- Modify: `src/app/(dashboard)/dashboard/caixa/[id]/relatorio/page.tsx` (o pior — sem header)
- Modify: páginas client de recibo de venda / OS (usar `PrintHeader` React)
- Modify: `src/components/print/print-header.tsx` (ativar; já é React)

- [ ] **Step 1: Relatório de Caixa** — buscar `CompanySettings` (via hook client) e renderizar `PrintHeader` no topo; ajustar estilos de impressão (sair dos cinzas de tela).
- [ ] **Step 2:** garantir recibo de venda e OS usam o `PrintHeader` (alguns já têm logo próprio; padronizar tamanho).
- [ ] **Step 3: tsc + build** + **Commit**

```bash
git commit -am "feat(pdf/F5a): header padronizado em Relatório de Caixa + recibo venda + OS"
```

### Task F5.3 (F5b): Carnê (jsPDF + HTML) + comprovante de movimentação

**Files:**
- Modify: `src/lib/pdf-utils.ts` (carnê jsPDF — consertar logoUrl morto, usar `drawPdfHeader`)
- Modify: `src/app/api/accounts-receivable/sale/[saleId]/carne/route.ts` (HTML — usar `companyHeaderHtml`)
- Modify: `src/components/estoque/comprovante-movimentacao.tsx` (remover "PDV Ótica" hardcoded)

- [ ] **Step 1:** carnê jsPDF chama `drawPdfHeader` (resolve o `logoUrl` morto).
- [ ] **Step 2:** carnê HTML usa `companyHeaderHtml`.
- [ ] **Step 3:** comprovante de movimentação lê company real (não hardcoded).
- [ ] **Step 4: tsc + build** + **Commit**

```bash
git commit -am "feat(pdf/F5b): header em carnê (jsPDF+HTML) e comprovante de movimentação"
```

### Task F5.4 (F5c): ~14 relatórios via report-export

**Files:**
- Modify: `src/lib/report-export.ts` (`exportToPDF`)

- [ ] **Step 1: Adicionar `drawPdfHeader`** no início de `exportToPDF`, recebendo os dados da empresa (passar como param dos callers, ou buscar). Resolve os ~14 de uma vez.
- [ ] **Step 2: tsc + build** + **Commit**

```bash
git commit -am "feat(pdf/F5c): header padronizado nos ~14 relatórios (report-export)"
```

### ✅ CHECKPOINT F5 (obrigatório — final)

- [ ] tsc + test + build verdes
- [ ] **Smoke:** trocar logo em Configurações reflete em TODOS os docs; Relatório de Caixa com logo+nome+CNPJ; comprovante de movimentação sem "PDV Ótica"; logo inválido (WEBP) NÃO derruba recibo (cai no fallback de texto).
- [ ] Smoke manual final do dono em todas as frentes.

---

## Notas finais
- **Deploy de migration é MANUAL** (`npm run migrate:deploy`). A F4 exige janela de deploy controlada (migration + código juntos, testados em staging).
- Cada frente é independente e pode ser deployada sozinha após seu checkpoint.
- Itens fora de escopo (categoria custom, backfill de textos antigos, refatorar zerar-sistema) ficam para sprint futuro.
