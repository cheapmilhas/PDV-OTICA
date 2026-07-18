# Fase A "Preenchimento" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Destravar o preenchimento de receita/dinheiro no mobile do PDV Ótica (teclado ± na dioptria), unificar as grades de OS num único componente e blindar a validação de faixa no cliente E no servidor.

**Architecture:** 3 sub-fases incrementais com deploy independente. A1 = componente de teclado-calculadora (`DiopterKeypad`) + util puro de sinal. A2 = fonte única de faixas reusada cliente+servidor, unificação das grades de OS no `PrescriptionGradeForm`, submit bloqueante. A3 = `DecimalInput` sistêmico com dois parsers (dinheiro vs dioptria), migração incremental. Value permanece string em todo o fluxo; parse só na validação.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Tailwind, shadcn/ui (`Sheet`/`Dialog`), Zod, Vitest + Testing Library.

**Environment notes:**
- Worktree dedicado: `.worktrees/mobile-fase-a` (branch `feat/mobile-fase-a`, base `8b78da0d`). `node_modules` é symlink do repo pai.
- ⚠️ **Testes de COMPONENTE (que usam `render`/`screen` do Testing Library) DEVEM começar com `/** @vitest-environment jsdom */` na linha 1** — o env global do vitest é `node` (`vitest.config.ts`). Sem o pragma, o teste falha com "document is not defined" (não com a falha TDD pretendida). Vale para `diopter-keypad.test.tsx` e `decimal-input.test.tsx`. Testes de lógica pura (`diopter-input.test.ts`, `decimal-parse.test.ts`, `prescription-grade-ranges.test.ts`) NÃO precisam do pragma.
- Comandos: testes `./node_modules/.bin/vitest run <path>`; typecheck `./node_modules/.bin/tsc --noEmit`; build `npm run build`. `next lint` NÃO existe (usar `eslint src` se precisar).
- **ZERO migration de banco.** Nenhuma tabela muda. A2 mexe só em schema Zod de request.
- **Alto risco:** receita = lente errada. Após cada sub-fase, o Codex revisa o diff antes de qualquer deploy. Não declarar pronto sem a revisão.
- Faixas corretas (fonte da verdade): esf −30..+30, cil −10..+10, add +0,50..+4,00, eixo 0..180 (inteiro), dnp 20..80, altura 10..40.
- ⚠️ A OS `nova/page.tsx:350-389` valida com faixas ERRADAS (cil −10..0, dnp 20..40, altura 10..45). A `editar` não valida. Ambas serão substituídas pela fonte única.

---

## Estrutura de arquivos

**Criar:**
- `src/lib/diopter-input.ts` — utilitários puros de sinal/formatação da dioptria (`flipSign`, `sanitizeSign`, `formatDiopter`). [A1]
- `src/lib/diopter-input.test.ts` — testes puros. [A1]
- `src/components/prescriptions/diopter-keypad.tsx` — bottom-sheet teclado-calculadora. [A1]
- `src/components/prescriptions/diopter-keypad.test.tsx` — testes de interação. [A1]
- `src/lib/prescription-grade-ranges.ts` — fonte única de faixas + validador reutilizável cliente/servidor. [A2]
- `src/lib/prescription-grade-ranges.test.ts` — testes de faixa. [A2]
- `src/lib/decimal-parse.ts` — `parseMoneyPtBR` e `parseDiopter` (dois parsers). [A3]
- `src/lib/decimal-parse.test.ts` — testes table-driven. [A3]
- `src/components/ui/decimal-input.tsx` — input decimal string-first. [A3]
- `src/components/ui/decimal-input.test.tsx` — testes. [A3]

**Modificar:**
- `src/components/prescriptions/prescription-grade-form.tsx` — usar `DiopterKeypad` (esf/cil/adição) + expor validade; bloquear via prop. [A1/A2]
- `src/lib/prescription-grade-validation.ts` — reexportar a fonte única de faixas (evitar divergência). [A2]
- `src/lib/validations/service-order.schema.ts` — validar faixa da prescrição. [A2]
- `src/app/api/prescriptions/[id]/grau/route.ts` — validar faixa no eyeSchema. [A2]
- `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx` — consumir `PrescriptionGradeForm`, remover validação/sanitizer inline. [A2]
- `src/app/(dashboard)/dashboard/ordens-servico/[id]/editar/page.tsx` — idem. [A2]
- `src/components/prescriptions/prescription-grade-dialog.tsx` — submit bloqueante. [A2]
- Telas quentes de dinheiro (PDV, caixa) — trocar por `DecimalInput`. [A3]

---

# SUB-FASE A1 — Teclado-calculadora óptico

> Deploy independente. Destrava digitar miopia no celular/iPad. Não toca save path. Codex revisa o diff antes de prod.

### Task 1: Util puro de sinal/formatação (`diopter-input.ts`)

**Files:**
- Create: `src/lib/diopter-input.ts`
- Test: `src/lib/diopter-input.test.ts`

- [ ] **Step 1: Escrever o teste falho**

```typescript
// src/lib/diopter-input.test.ts
import { describe, it, expect } from "vitest";
import { flipSign, sanitizeSign, formatDiopter } from "./diopter-input";

describe("sanitizeSign", () => {
  it("colapsa sinais múltiplos e força posição 0", () => {
    expect(sanitizeSign("--2,25")).toBe("-2,25");
    expect(sanitizeSign("2-,25")).toBe("-2,25");
    expect(sanitizeSign("+-2,25")).toBe("-2,25");
    expect(sanitizeSign("2,25-")).toBe("-2,25");
    expect(sanitizeSign("++2,25")).toBe("2,25"); // + é redundante → sem sinal
    expect(sanitizeSign("2,25")).toBe("2,25");
    expect(sanitizeSign("")).toBe("");
  });
});

describe("flipSign", () => {
  it("alterna o sinal preservando o número", () => {
    expect(flipSign("2,25")).toBe("-2,25");
    expect(flipSign("-2,25")).toBe("2,25");
  });
  it("campo vazio permanece vazio (não vira '-' órfão)", () => {
    expect(flipSign("")).toBe("");
  });
  it("normaliza sinal sujo antes de alternar", () => {
    // "2,25-" normaliza para "-2,25" (negativo) → flip vira "2,25"
    expect(flipSign("2,25-")).toBe("2,25");
    // "--2,25" normaliza para "-2,25" (negativo) → flip vira "2,25"
    expect(flipSign("--2,25")).toBe("2,25");
  });
});

describe("formatDiopter", () => {
  it("formata com sufixo D e vírgula", () => {
    expect(formatDiopter("-2,25")).toBe("−2,25 D");
    expect(formatDiopter("2.25")).toBe("+2,25 D"); // ponto=decimal na dioptria
    expect(formatDiopter("")).toBe("—");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./node_modules/.bin/vitest run src/lib/diopter-input.test.ts`
Expected: FAIL — "flipSign is not a function" / módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/diopter-input.ts
/**
 * Utilitários PUROS de sinal/formatação para campos de dioptria.
 * Value é sempre string (aceita vírgula, ex. "-2,25"). Ponto = decimal aqui
 * (o placeholder da grade é "+0.00"); o parse de dioptria trata "2.25" = 2,25.
 */

const DIGITS_COMMA = /[^0-9.,]/g;

/** Colapsa sinais múltiplos e força "-" na posição 0. "+" é redundante (removido). */
export function sanitizeSign(raw: string): string {
  if (!raw) return "";
  const negative = raw.includes("-");
  const body = raw.replace(DIGITS_COMMA, ""); // tira todo sinal e lixo
  if (body === "") return negative ? "-" : "";
  return negative ? `-${body}` : body;
}

/** Alterna o sinal. Vazio permanece vazio (sem "-" órfão). */
export function flipSign(raw: string): string {
  const clean = sanitizeSign(raw);
  if (clean === "" || clean === "-") return "";
  return clean.startsWith("-") ? clean.slice(1) : `-${clean}`;
}

/** Exibição no visor do teclado. Aceita ponto ou vírgula na entrada. */
export function formatDiopter(raw: string): string {
  if (!raw || raw === "-" || raw === "+") return "—";
  const clean = sanitizeSign(raw).replace(".", ",");
  if (clean === "" || clean === "-") return "—";
  const sign = clean.startsWith("-") ? "−" : "+";
  const body = clean.replace("-", "");
  return `${sign}${body} D`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./node_modules/.bin/vitest run src/lib/diopter-input.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/diopter-input.ts src/lib/diopter-input.test.ts
git commit -m "feat(mobile-a1): util puro de sinal/formatação de dioptria"
```

### Task 2: Componente `DiopterKeypad`

**Files:**
- Create: `src/components/prescriptions/diopter-keypad.tsx`
- Test: `src/components/prescriptions/diopter-keypad.test.tsx`

- [ ] **Step 1: Escrever o teste falho**

```tsx
/** @vitest-environment jsdom */
// src/components/prescriptions/diopter-keypad.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiopterKeypad } from "./diopter-keypad";

describe("DiopterKeypad", () => {
  it("reflete o value controlado no visor (sem estado-espelho)", () => {
    const { rerender } = render(
      <DiopterKeypad open value="-3,00" field="esf" label="OD · Esférico" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByTestId("keypad-display")).toHaveTextContent("−3,00 D");
    // muda o value por fora → visor acompanha
    rerender(
      <DiopterKeypad open value="1,25" field="esf" label="OD · Esférico" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByTestId("keypad-display")).toHaveTextContent("+1,25 D");
  });

  it("botão ± alterna o sinal e emite string sanitizada", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="2,25" field="esf" label="OD · Esférico" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-sign"));
    expect(onChange).toHaveBeenLastCalledWith("-2,25");
  });

  it("campo adição NÃO mostra o botão ±", () => {
    render(
      <DiopterKeypad open value="" field="adicao" label="Adição" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByTestId("keypad-sign")).toBeNull();
  });

  it("dígito e vírgula anexam ao value via onChange", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="1" field="esf" label="OD · Esférico" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-comma"));
    expect(onChange).toHaveBeenLastCalledWith("1,");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./node_modules/.bin/vitest run src/components/prescriptions/diopter-keypad.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar o componente**

Usar o `Sheet` do shadcn (`src/components/ui/sheet.tsx` — confirmar que existe; senão usar `Dialog` com classe de rodapé). Layout A + chips (visor, teclado numérico, coluna ±0,25, botão ± exceto em `adicao`, chips de valores comuns, apagar/limpar/OK). Botões `min-h-11 min-w-11`. O componente é CONTROLADO: deriva tudo de `value` via `formatDiopter`, sem `useState` de magnitude/sinal. `onChange` sempre passa por `sanitizeSign`. `field="adicao"` esconde `keypad-sign` e não permite sinal.

Contrato:
```tsx
interface DiopterKeypadProps {
  open: boolean;
  value: string;                  // string controlada do form
  field: "esf" | "cil" | "adicao";
  label: string;                  // ex. "OD · Esférico"
  onChange: (raw: string) => void;
  onClose: () => void;
}
```

Regras: dígito/vírgula → `onChange(sanitizeSign(value + tecla))`; `keypad-sign` → `onChange(flipSign(value))`; `±0,25` → soma/subtrai 0,25 sobre o número parseado, re-string com vírgula; `⌫` → remove último char; `Limpar` → `onChange("")`; `OK` → `onClose()`. Visor lê `formatDiopter(value)` + feedback de faixa (usar a fonte única da A2 quando existir; em A1 pode ser sem cor de faixa e adicionar em A2).

- [ ] **Step 4: Rodar e ver passar**

Run: `./node_modules/.bin/vitest run src/components/prescriptions/diopter-keypad.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/prescriptions/diopter-keypad.tsx src/components/prescriptions/diopter-keypad.test.tsx
git commit -m "feat(mobile-a1): DiopterKeypad — teclado-calculadora controlado"
```

### Task 3: Integrar o keypad no `PrescriptionGradeForm`

**Files:**
- Modify: `src/components/prescriptions/prescription-grade-form.tsx`
- Test: `src/components/prescriptions/prescription-grade-form.test.tsx` (estender)

- [ ] **Step 1: Escrever o teste falho** — no toque (gate `pointer: coarse` mockado), tocar em esf abre o keypad e o valor confirmado volta pro form. Mock `window.matchMedia` para `(pointer: coarse)` → true. Assert que ao tocar no botão-visor de OD/esf, o `DiopterKeypad` abre (`getByTestId("keypad-display")`), e ao emitir onChange o `onChange` do form recebe o patch `{od:{esf:"-2,25"}...}`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `./node_modules/.bin/vitest run src/components/prescriptions/prescription-grade-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** — adicionar hook `usePointerCoarse()` (via `useMediaQuery("(pointer: coarse)")` do `src/hooks/use-media-query.ts` já existente e SSR-safe). Quando coarse: esf/cil/adição viram botão-visor (`role="button"`, ≥44px, mostra `value ?? placeholder`, mantém `aria-label`) que abre o `DiopterKeypad` para aquele campo; ao `onChange` do keypad, chamar `handleField(eye, col, raw)` (que já sanitiza). Quando fine (mouse): comportamento atual (Input direto) — NÃO regride desktop. Eixo/dnp/altura: sempre Input livre.

- [ ] **Step 4: Rodar e ver passar** — os 28 testes de prescriptions + os novos.

Run: `./node_modules/.bin/vitest run src/components/prescriptions/`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/components/prescriptions/prescription-grade-form.tsx src/components/prescriptions/prescription-grade-form.test.tsx
git commit -m "feat(mobile-a1): grade usa DiopterKeypad no toque (esf/cil/adição), inclui iPad"
```

### Task 4: Verificação A1 + revisão Codex

- [ ] Typecheck: `./node_modules/.bin/tsc --noEmit` → 0 erros.
- [ ] Testes de prescriptions: `./node_modules/.bin/vitest run src/components/prescriptions/ src/lib/diopter-input.test.ts` → todos passam.
- [ ] **Codex revisa o diff de A1:** `git diff main...feat/mobile-fase-a` → `codex exec` review; corrigir achados reais.
- [ ] Commit de quaisquer correções.

> **CHECKPOINT A1:** deploy independente possível aqui. Validar visual no dev (`TENANT_GUARD_MODE=warn ./node_modules/.bin/next dev`) no iPhone/iPad antes de prod.

---

# SUB-FASE A2 — Núcleo clínico (servidor + unificação + bloqueio)

> ALTO RISCO — toca o save da OS. Ordem obrigatória (Codex): caracterizar ANTES de refatorar; nunca apagar campo no merge; `prescription` continua string JSON no wire (validar conteúdo, não trocar o tipo). Codex revisa o diff a fundo antes de prod.

### Task 5: Fonte única de faixas (`prescription-grade-ranges.ts`)

**Files:**
- Create: `src/lib/prescription-grade-ranges.ts`
- Test: `src/lib/prescription-grade-ranges.test.ts`
- Modify: `src/lib/prescription-grade-validation.ts` (reexportar da fonte única — sem divergência)

- [ ] **Step 1: Teste falho** — tabela de faixas + `checkRange(field, raw)`:

```typescript
// src/lib/prescription-grade-ranges.test.ts
import { describe, it, expect } from "vitest";
import { GRADE_RANGES, checkRange } from "./prescription-grade-ranges";

describe("GRADE_RANGES", () => {
  it("faixas corretas (fonte única)", () => {
    expect(GRADE_RANGES.cil).toEqual([-10, 10]);   // NÃO -10..0 (bug antigo da OS)
    expect(GRADE_RANGES.dnp).toEqual([20, 80]);     // NÃO 20..40
    expect(GRADE_RANGES.altura).toEqual([10, 40]);  // NÃO 10..45
    expect(GRADE_RANGES.esf).toEqual([-30, 30]);
    expect(GRADE_RANGES.add).toEqual([0.5, 4]);
    expect(GRADE_RANGES.eixo).toEqual([0, 180]);
  });
});

describe("checkRange", () => {
  it("aceita vazio (campo opcional)", () => {
    expect(checkRange("cil", "")).toBe(true);
    expect(checkRange("cil", null)).toBe(true);
  });
  it("aceita cilíndrico positivo (astigmatismo transposto)", () => {
    expect(checkRange("cil", "+0,75")).toBe(true);
    expect(checkRange("cil", "0.75")).toBe(true);   // ponto=decimal
  });
  it("rejeita fora da faixa", () => {
    expect(checkRange("cil", "+11")).toBe(false);
    expect(checkRange("altura", "99")).toBe(false);
  });
  it("rejeita não-numérico", () => {
    expect(checkRange("esf", "--2,25")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** `./node_modules/.bin/vitest run src/lib/prescription-grade-ranges.test.ts` → FAIL.

- [ ] **Step 3: Implementar** `GRADE_RANGES` (tabela) + `checkRange(field, raw)` (parseia com `replace(",",".")`, `Number.isFinite`, checa min/max; vazio = true). Depois, em `src/lib/prescription-grade-validation.ts`, substituir a const `RANGES` interna por import de `GRADE_RANGES` (mantendo as mensagens), garantindo que `validateGrade` e o servidor usem a MESMA tabela.

- [ ] **Step 4: Rodar e ver passar** — os testes novos + os existentes de `prescription-grade-validation` (se houver). `./node_modules/.bin/vitest run src/lib/prescription-grade-ranges.test.ts` → PASS.

- [ ] **Step 5: Commit** — `feat(mobile-a2): fonte única de faixas de dioptria (cliente+servidor)`.

### Task 6: Teste de caracterização do save da OS (ANTES de refatorar)

**Files:**
- Test: `src/app/(dashboard)/dashboard/ordens-servico/__tests__/os-save-shape.test.ts` (ou local equivalente)

- [ ] **Step 1:** Ler `nova/page.tsx` e `editar/page.tsx` e listar o SHAPE COMPLETO do objeto de prescrição enviado no save (od/oe: esf,cil,eixo,dnp,altura,add,prisma,base; adicao; olhoDominante; dnpPerto; pantoscopicAngle; vertexDistance; frameCurvature; ceratometria; cálculo esf-perto). Escrever um teste que monta esse objeto e assere que a função de merge (a ser criada na Task 8) preserva TODOS os campos — começa como teste de caracterização documentando o contrato.

- [ ] **Step 2: Rodar** — nesta etapa o teste referencia a função de merge que ainda não existe → FAIL (esperado). Documenta o alvo.

- [ ] **Step 3:** (sem implementação ainda — a implementação vem na Task 8; este teste é o guarda-corpo.)

- [ ] **Step 4: Commit do teste** — `test(mobile-a2): caracteriza shape do save da OS (guarda anti-perda de campo)`.

### Task 7: Validação server-side (superRefine, string preservada)

**Files:**
- Modify: `src/lib/validations/service-order.schema.ts`
- Modify: `src/app/api/prescriptions/[id]/grau/route.ts`
- Test: `src/lib/validations/service-order.schema.test.ts` (criar), `src/app/api/prescriptions/[id]/grau/route.test.ts` (criar ou estender)

- [ ] **Step 1: Teste falho** — `createServiceOrderSchema.safeParse` com `prescription` = JSON string de uma grade com cil fora da faixa → `success: false`; com grade válida → `success: true`; com JSON malformado → `success: false` (erro Zod, NÃO throw). Aceita `prescription` ausente/vazio. Para `grau/route`: o `gradeSchema.safeParse` rejeita eye com esf fora da faixa e aceita vazio/vírgula/limites.

- [ ] **Step 2: Rodar e ver falhar** — `./node_modules/.bin/vitest run src/lib/validations/service-order.schema.test.ts` → FAIL (hoje aceita qualquer string).

- [ ] **Step 3: Implementar** — em `service-order.schema.ts`, manter `prescription: z.string().max(5000).optional()` MAS adicionar `.superRefine`: se presente e não-vazio, `JSON.parse` em try/catch (falha → `ctx.addIssue` "Prescrição inválida", NÃO deixa estourar); depois iterar od/oe/adicao e `checkRange` cada campo → `addIssue` no primeiro fora da faixa. **NÃO usar `.transform(JSON.parse)`** — o service continua recebendo a string. Em `grau/route.ts`, trocar cada `z.string().optional().nullable()` por um refinamento que valida faixa via `checkRange` (campo continua string, só ganha validação).

- [ ] **Step 4: Rodar e ver passar** — `./node_modules/.bin/vitest run src/lib/validations/ src/app/api/prescriptions` → PASS.

- [ ] **Step 5: Commit** — `feat(mobile-a2): valida faixa de dioptria no servidor (OS + grau), string preservada`.

### Task 8: Unificar a grade da OS no `PrescriptionGradeForm` (merge que preserva)

**Files:**
- Create: `src/lib/merge-prescription-grade.ts` (função pura de merge do patch `{od,oe,adicao}` no objeto amplo da OS, preservando os demais campos)
- Modify: `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/ordens-servico/[id]/editar/page.tsx`
- Test: o de caracterização da Task 6 agora deve passar

- [ ] **Step 1: Implementar `mergePrescriptionGrade`** — recebe `(estadoAtual, patch)`, devolve novo objeto com od/oe/adicao do patch e TODOS os outros campos intactos (spread do estado atual primeiro). Fazer o teste da Task 6 apontar pra essa função.

- [ ] **Step 2: Rodar o teste de caracterização** → agora PASS.

- [ ] **Step 3: Substituir a grade inline em `nova/page.tsx`** — trocar a tabela/inputs inline por `<PrescriptionGradeForm value={{od,oe,adicao}} onChange={patch => setPrescriptionData(prev => mergePrescriptionGrade(prev, patch))} />`. **Remover** o bloco de validação de faixa inline (linhas ~340-390) — a validação agora vem do form (bloqueante) + servidor. Remover `sanitizeNumericField`/`sanitizeIntegerField` duplicados (importar da lib se ainda usados por outros campos). Preservar o cálculo esf-perto e os campos extras via o merge.

- [ ] **Step 4: Substituir em `editar/page.tsx`** — idem. Aqui a `editar` HOJE não valida nada; passa a herdar bloqueio do form + servidor.

- [ ] **Step 5: Rodar** — `./node_modules/.bin/vitest run src/app/(dashboard)/dashboard/ordens-servico src/components/prescriptions` → PASS. Typecheck das duas páginas.

- [ ] **Step 6: Commit** — `feat(mobile-a2): unifica grade das OS no PrescriptionGradeForm (merge preserva campos)`.

### Task 9: Submit bloqueante nas 3 telas

**Files:**
- Modify: `src/components/prescriptions/prescription-grade-form.tsx` (expor `onValidityChange` ou similar)
- Modify: `src/components/prescriptions/prescription-grade-dialog.tsx`
- (OS já herdam via form na Task 8)

- [ ] **Step 1: Teste falho** — no `prescription-grade-dialog.test.tsx`: com grade inválida (cil "+11"), clicar Salvar NÃO chama o fetch/`onSaved`; mostra erro. Com válida, chama.

- [ ] **Step 2: Rodar e ver falhar** → FAIL (hoje `handleSave` ignora `validateGrade`).

- [ ] **Step 3: Implementar** — rota preferida: o `PrescriptionGradeForm` já roda `validateGrade`; expor o resultado via prop `onValidityChange(ok: boolean)` e o pai (dialog/OS) desabilita o Salvar / faz `toast.error` + return quando `!ok`. (Evita o import extra de `validateGrade` no dialog, que hoje só importa `PrescriptionGradeForm`.) As OS herdam a mesma trava via o form.

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit** — `feat(mobile-a2): submit bloqueado quando dioptria fora da faixa (Livro + OS)`.

### Task 10: Verificação A2 + revisão Codex (alto risco)

- [ ] Typecheck completo: `./node_modules/.bin/tsc --noEmit` → 0 erros.
- [ ] Testes: `./node_modules/.bin/vitest run src/components/prescriptions src/lib src/app/(dashboard)/dashboard/ordens-servico src/app/api/prescriptions` → todos passam.
- [ ] **Teste de regressão do save (o que trava o deploy):** confirmar que o teste de caracterização (Task 6) passa — nenhum campo (prisma/base/ceratometria/dnpPerto/cálculo-perto) some.
- [ ] **Codex revisa o diff A2 a fundo** (alto risco): `codex exec` review do `git diff`. Corrigir achados reais; rejeitar falso-positivo com justificativa.
- [ ] Commit de correções.

> **CHECKPOINT A2:** só deploya após a regressão passar E o Codex aprovar. Validar no dev: criar OS com miopia, editar OS com valor negativo salvo, tentar salvar valor absurdo (deve bloquear).

---

# SUB-FASE A3 — DecimalInput sistêmico

> Deploy independente. Migração incremental por telas quentes, NÃO big-bang nos 154. Codex revisa o diff.

### Task 11: Dois parsers (`decimal-parse.ts`)

**Files:**
- Create: `src/lib/decimal-parse.ts`
- Test: `src/lib/decimal-parse.test.ts`

- [ ] **Step 1: Teste falho (table-driven)**

```typescript
// src/lib/decimal-parse.test.ts
import { describe, it, expect } from "vitest";
import { parseMoneyPtBR, parseDiopter } from "./decimal-parse";

describe("parseMoneyPtBR (ponto = milhar)", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1.234", 1234],
    ["12,50", 12.5],
    ["", null],
    ["abc", null],
  ])("parse(%s) = %s", (input, expected) => {
    expect(parseMoneyPtBR(input as string)).toBe(expected);
  });
});

describe("parseDiopter (ponto = decimal)", () => {
  it.each([
    ["2.25", 2.25],   // placeholder da grade ensina ponto decimal
    ["-1,75", -1.75],
    ["+0,50", 0.5],
    ["", null],
    ["--2", null],
  ])("parse(%s) = %s", (input, expected) => {
    expect(parseDiopter(input as string)).toBe(expected);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** — `parseMoneyPtBR`: `raw.trim()` → remove `.` (milhar) → `,`→`.` → `Number`; NaN/vazio → null. `parseDiopter`: `raw.trim().replace(",",".")` (ponto já é decimal) → validar sinal único → `Number`; NaN/vazio/sinal-inválido → null.

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit** — `feat(mobile-a3): dois parsers decimais (dinheiro milhar vs dioptria decimal)`.

### Task 12: Componente `DecimalInput`

**Files:**
- Create: `src/components/ui/decimal-input.tsx`
- Test: `src/components/ui/decimal-input.test.tsx`

- [ ] **Step 1: Teste falho** — controlado, string-first: `type="text"`, `inputMode="decimal"`, digitar "12,50" mantém "12,50" (não descarta a vírgula como `type=number`); emite via `onValueChange(raw)`. Preset `money` mostra prefixo R$.

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** — wrapper de `src/components/ui/input.tsx` com `type="text"` + `inputMode="decimal"` + sanitização `[^0-9.,]` no onChange; `value: string`, `onValueChange: (raw) => void`. Preset `money`. NÃO faz parse (consumidor parseia via `parseMoneyPtBR` no envio).

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit** — `feat(mobile-a3): DecimalInput string-first (remove type=number)`.

### Task 13: Migrar telas quentes (uma por vez)

**Files (ordem):**
- Modify: `src/components/pdv/modal-finalizar-venda.tsx` (já tem o padrão inline → trocar pelo componente, vira referência)
- Modify: `src/components/financeiro/modal-receber-conta.tsx` (⚠️ hoje `type="number"` — o anti-padrão; trocar)
- Modify: modais de caixa (abertura/sangria/reforço/fechamento)

- [ ] Para CADA tela: trocar o input por `DecimalInput`, ajustar o parse no envio para `parseMoneyPtBR`, rodar o teste da tela (se houver) + typecheck, testar valor exibido/edição/payload, e **commit por tela** (`feat(mobile-a3): DecimalInput em <tela>`). NÃO migrar em lote — uma tela por commit. Deixar os ~140 campos restantes para migração oportunista futura (fora desta fase).

### Task 14: Verificação A3 + Codex

- [ ] Typecheck: `./node_modules/.bin/tsc --noEmit` → 0.
- [ ] Testes das telas migradas + `src/lib/decimal-parse.test.ts` + `src/components/ui/decimal-input.test.tsx` → passam.
- [ ] Codex revisa o diff A3.
- [ ] Commit.

---

# TASK FINAL — Verificação completa da Fase A (OBRIGATÓRIA)

- [ ] `./node_modules/.bin/tsc --noEmit` no projeto inteiro → **0 erros**.
- [ ] `npm test` (suíte COMPLETA, `vitest run`) → **todos passam**.
- [ ] `npm run build` → **sucesso** (se falhar em campo Prisma inexistente após rebase, rodar `./node_modules/.bin/prisma generate` — só tipos).
- [ ] Commitar quaisquer mudanças restantes.
- [ ] Confirmar: as 3 sub-fases têm deploy independente; cada uma foi revisada pelo Codex antes de prod (regra de alto risco).
