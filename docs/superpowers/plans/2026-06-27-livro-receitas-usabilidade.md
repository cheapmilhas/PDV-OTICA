# Livro de Receitas — Melhorias de Usabilidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Livro de Receitas (`/dashboard/livro-receitas`) ótimo para consulta clínica no balcão — busca por nome/CPF/telefone, filtros de filial/período/idade, nome do cliente clicável para a ficha, e um modo "Por cliente" que mostra a evolução do grau.

**Architecture:** Três fases independentes, cada uma deployável sozinha. Backend: ampliar `prescriptionService.list` + `prescriptionQuerySchema` + rota `/api/prescriptions` (busca ampliada + params `emitidaDe`/`emitidaAte`). Front: filtros novos na page, link na lista/detalhe, e um toggle Lista⇄Por-cliente com agrupamento feito no cliente sobre o mesmo payload. Datas calculadas no fuso fixo `America/Sao_Paulo` reutilizando `src/lib/date-utils.ts`. Agrupamento por cliente é page-scoped (sem paginação por cliente — fora de escopo).

**Tech Stack:** Next.js 16 (App Router), Prisma + Neon (PostgreSQL), TypeScript, Zod, vitest + React Testing Library, shadcn/ui, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-27-livro-receitas-usabilidade-design.md`

---

## Convenções deste plano

- **Rodar UM teste:** `npx vitest run <arquivo> -t "<nome do teste>"`
- **Rodar um arquivo:** `npx vitest run <arquivo>`
- **Typecheck:** `npx tsc --noEmit`
- **Build:** `npm run build` (faz `rm -rf .next` antes se houver cache suspeito)
- **NUNCA** deployar sem aprovação explícita do dono. O plano termina em "pronto para deploy", não em deploy.
- **Multi-tenant:** todo filtro Prisma SEMPRE inclui `companyId`. Nunca remover.
- Após cada Fase: `tsc` limpo + build verde + revisão (code-reviewer) → então pedir OK do dono para commitar/deployar.

## File Structure

**Fase 0 (investigação, sem código de produção):**
- Inspecionar formato real de `Customer.cpf` / `Customer.phone` no banco (com/sem pontuação). Decide a estratégia de busca da Fase 1.

**Fase 1 — Busca + filtros (backend + front):**
- Modify: `src/lib/validations/prescription.schema.ts` — `prescriptionQuerySchema` ganha `emitidaDe`/`emitidaAte`.
- Modify: `src/services/prescription.service.ts` — `list()` ganha busca ampliada (nome/CPF/telefone robusta a pontuação) + filtro de emissão.
- Modify: `src/app/api/prescriptions/route.ts` — repassar `emitidaDe`/`emitidaAte` ao service.
- Create: `src/lib/livro-receitas-filters.ts` — helper PURO que, dado um chip + "hoje" (no fuso fixo), devolve os params de data. Reutiliza `date-utils.ts`.
- Create: `src/lib/livro-receitas-filters.test.ts` — testes do helper.
- Modify: `src/services/prescription-list-filter.service.test.ts` — novos casos (busca ampliada, emissão).
- Modify: `src/app/(dashboard)/dashboard/livro-receitas/page.tsx` — UI dos filtros (chips, filial, período).

**Fase 2 — Link do cliente:**
- Modify: `src/components/prescriptions/prescription-list.tsx` — nome vira link p/ ficha (nova aba) + stopPropagation.
- Modify: `src/components/prescriptions/prescription-list.test.tsx` — teste do link.
- Modify: `src/components/prescriptions/prescription-detail-dialog.tsx` — nome do cliente vira link.
- Modify: `src/components/prescriptions/prescription-detail-dialog.test.tsx` — teste do link.

**Fase 3 — Modo "Por cliente":**
- Create: `src/lib/group-prescriptions-by-customer.ts` — função PURA de agrupamento + ordenação.
- Create: `src/lib/group-prescriptions-by-customer.test.ts` — testes do agrupamento.
- Create: `src/components/prescriptions/prescription-by-customer.tsx` — render do modo agrupado.
- Create: `src/components/prescriptions/prescription-by-customer.test.tsx` — testes RTL.
- Modify: `src/app/(dashboard)/dashboard/livro-receitas/page.tsx` — toggle Lista⇄Por-cliente.

---

# FASE 0 — Investigação (formato de CPF/telefone)

### Task 0: Descobrir como `cpf`/`phone` estão guardados

**Files:** nenhum (script descartável).

- [ ] **Step 1: Amostrar valores reais no banco**

Criar `/tmp/check-customer-format.ts`:

```typescript
import { prisma } from "@/lib/prisma";
async function main() {
  const rows = await prisma.customer.findMany({
    where: { OR: [{ cpf: { not: null } }, { phone: { not: null } }] },
    select: { cpf: true, phone: true },
    take: 20,
  });
  console.log(JSON.stringify(rows, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx /tmp/check-customer-format.ts 2>&1 | grep -vE "tenant-guard|module:|model:|action:|whereKeys|warn\]"`

- [ ] **Step 2: Registrar a decisão**

Observar se os valores têm pontuação (`123.456.789-00`, `(62) 9...`) ou só dígitos.
- **Se só dígitos:** a busca normaliza apenas a ENTRADA (tira não-dígitos) e usa `contains` Prisma normal. Estratégia A.
- **Se com pontuação:** `contains` Prisma não basta. Usar `$queryRaw` com `regexp_replace(cpf, '[^0-9]', '', 'g') ILIKE '%<digitos>%'` no ramo numérico. Estratégia B.

Anotar a estratégia escolhida (A ou B) num comentário no topo da Task 1 ao implementar. **Não prosseguir sem isso decidido.**

---

# FASE 1 — Busca ampliada + filtros

> Ao fim da fase: `tsc` limpo, build verde, todos os testes da fase verdes, revisão. Pedir OK do dono.

## Task 1: Schema — params `emitidaDe`/`emitidaAte`

**Files:**
- Modify: `src/lib/validations/prescription.schema.ts:43-51`
- Test: (coberto indiretamente pelos testes de service na Task 3; sem teste isolado de schema — segue o padrão atual do projeto, que não testa schemas isoladamente)

- [ ] **Step 1: Adicionar os campos ao `prescriptionQuerySchema`**

Em `src/lib/validations/prescription.schema.ts`, dentro de `prescriptionQuerySchema`, após `validadeAte`:

```typescript
export const prescriptionQuerySchema = z.object({
  customerId: z.string().cuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
  // Livro de Receitas: busca por nome/CPF/telefone do cliente + faixa de validade + faixa de emissão.
  search: z.string().trim().min(1).optional(),
  validadeDe: z.coerce.date().optional(),
  validadeAte: z.coerce.date().optional(),
  // Faixa de EMISSÃO (issuedAt). Usada pelos chips "1 a 2 anos" / "2+ anos" e pelo período manual.
  emitidaDe: z.coerce.date().optional(),
  emitidaAte: z.coerce.date().optional(),
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors found

- [ ] **Step 3: Commit**

```bash
git add src/lib/validations/prescription.schema.ts
git commit -m "feat(livro-receitas): params emitidaDe/emitidaAte no query schema"
```

## Task 2: Helper de chips de data (PURO, fuso fixo)

**Files:**
- Create: `src/lib/livro-receitas-filters.ts`
- Test: `src/lib/livro-receitas-filters.test.ts`

Este helper mapeia um chip → params de data, usando `America/Sao_Paulo`. Reutiliza `startOfLocalDay`/`endOfLocalDay` de `src/lib/date-utils.ts` (já existentes) para não reinventar fuso.

- [ ] **Step 1: Escrever os testes (RED)**

Criar `src/lib/livro-receitas-filters.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { chipToDateParams, type DateParams } from "./livro-receitas-filters";

// "hoje" fixo para teste determinístico: 2026-06-27 12:00 BRT.
const HOJE = new Date("2026-06-27T15:00:00.000Z"); // 12:00 em America/Sao_Paulo (UTC-3)

describe("chipToDateParams", () => {
  it("'todas' limpa todos os params de data", () => {
    const r = chipToDateParams("todas", HOJE);
    expect(r).toEqual({});
  });

  it("'vence30' seta validadeDe=hoje e validadeAte=hoje+30d", () => {
    const r = chipToDateParams("vence30", HOJE);
    expect(r.validadeDe).toBeInstanceOf(Date);
    expect(r.validadeAte).toBeInstanceOf(Date);
    // janela de ~30 dias
    const dias = (r.validadeAte!.getTime() - r.validadeDe!.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(dias)).toBe(30);
    expect(r.emitidaDe).toBeUndefined();
    expect(r.emitidaAte).toBeUndefined();
  });

  it("'vencidas' seta validadeAte=hoje (sem validadeDe)", () => {
    const r = chipToDateParams("vencidas", HOJE);
    expect(r.validadeAte).toBeInstanceOf(Date);
    expect(r.validadeDe).toBeUndefined();
  });

  it("'idade1a2' é faixa exclusiva: emitidaDe=hoje-2a, emitidaAte=hoje-1a", () => {
    const r = chipToDateParams("idade1a2", HOJE);
    expect(r.emitidaDe!.getUTCFullYear()).toBe(2024);
    expect(r.emitidaAte!.getUTCFullYear()).toBe(2025);
    expect(r.validadeDe).toBeUndefined();
    expect(r.validadeAte).toBeUndefined();
  });

  it("'idade2mais' seta apenas emitidaAte=hoje-2a", () => {
    const r = chipToDateParams("idade2mais", HOJE);
    expect(r.emitidaAte!.getUTCFullYear()).toBe(2024);
    expect(r.emitidaDe).toBeUndefined();
  });

  it("faixas 1a2 e 2mais não se sobrepõem (emitidaAte de 1a2 == emitidaDe ausente em 2mais; limite em hoje-2a)", () => {
    const a = chipToDateParams("idade1a2", HOJE);
    const b = chipToDateParams("idade2mais", HOJE);
    // 1a2 termina (exclusivo) em hoje-1a; 2mais termina em hoje-2a → sem interseção
    expect(a.emitidaDe!.getTime()).toBe(b.emitidaAte!.getTime());
  });
});
```

- [ ] **Step 2: Rodar para ver falhar (RED)**

Run: `npx vitest run src/lib/livro-receitas-filters.test.ts`
Expected: FAIL ("Cannot find module './livro-receitas-filters'")

- [ ] **Step 3: Implementar o helper (GREEN)**

Criar `src/lib/livro-receitas-filters.ts`:

```typescript
import { startOfLocalDay } from "@/lib/date-utils";
import { addDays, subYears } from "date-fns";

/** Atalhos de data do Livro de Receitas. Single-select. */
export type DateChip =
  | "todas"
  | "vence30"
  | "vencidas"
  | "idade1a2"
  | "idade2mais";

/** Params de data resolvidos a partir de um chip. Campos ausentes = não filtrar. */
export interface DateParams {
  validadeDe?: Date;
  validadeAte?: Date;
  emitidaDe?: Date;
  emitidaAte?: Date;
}

/**
 * Mapeia um chip → params de data, ancorado em "hoje" no fuso America/Sao_Paulo.
 * `now` é injetável para teste determinístico (default: agora).
 *
 * Regras (ver spec, tabela chip→param):
 *   todas      → {}
 *   vence30    → validade entre hoje e hoje+30d
 *   vencidas   → validadeAte = hoje (expiresAt < hoje)
 *   idade1a2   → emissão entre 2a atrás e 1a atrás (faixa exclusiva)
 *   idade2mais → emissão há mais de 2 anos (emitidaAte = hoje-2a)
 */
export function chipToDateParams(chip: DateChip, now: Date = new Date()): DateParams {
  const hoje = startOfLocalDay(now); // 00:00 BRT de hoje, em UTC

  switch (chip) {
    case "todas":
      return {};
    case "vence30":
      return { validadeDe: hoje, validadeAte: addDays(hoje, 30) };
    case "vencidas":
      return { validadeAte: hoje };
    case "idade1a2":
      return { emitidaDe: subYears(hoje, 2), emitidaAte: subYears(hoje, 1) };
    case "idade2mais":
      return { emitidaAte: subYears(hoje, 2) };
  }
}
```

> NOTA ao implementador: confirme que `startOfLocalDay` aceita um `Date` e retorna o início do dia em BRT como `Date` UTC (ver `src/lib/date-utils.ts:48`). Se a assinatura diferir, ajuste a chamada — o objetivo é "00:00 de hoje no fuso BRT". Os anos esperados nos testes assumem hoje=2026 → ajuste se rodar noutro ano (ou troque para asserts relativos).

- [ ] **Step 4: Rodar para ver passar (GREEN)**

Run: `npx vitest run src/lib/livro-receitas-filters.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/livro-receitas-filters.ts src/lib/livro-receitas-filters.test.ts
git commit -m "feat(livro-receitas): helper de chips de data com fuso fixo BRT"
```

## Task 3: Service — busca ampliada (nome/CPF/telefone) + filtro de emissão

**Files:**
- Modify: `src/services/prescription.service.ts` (método `list`, ~linha 112-168)
- Test: `src/services/prescription-list-filter.service.test.ts`

> ESTRATÉGIA DE BUSCA: use a Estratégia A ou B decidida na Task 0. O plano abaixo mostra a **Estratégia A** (dados só-dígitos → normaliza só a entrada, `contains` Prisma). Se a Task 0 indicou **Estratégia B** (dados com pontuação), veja a variação no fim desta task.

- [ ] **Step 1: Escrever os testes novos (RED)**

Em `src/services/prescription-list-filter.service.test.ts`, dentro do `describe("prescriptionService.list — filtros do Livro", ...)`, adicionar:

```typescript
  it("busca SÓ texto (sem dígitos) usa apenas o ramo name no OR", async () => {
    await prescriptionService.list("co-1", 1, 10, undefined, undefined, undefined, "maria");
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    // "maria" não tem dígitos → searchDigits="" → ramos cpf/phone omitidos.
    expect(whereArg.customer).toEqual({
      OR: [{ name: { contains: "maria", mode: "insensitive" } }],
    });
  });

  it("busca com dígitos casa nome OU cpf OU telefone (3 ramos)", async () => {
    await prescriptionService.list("co-1", 1, 10, undefined, undefined, undefined, "123.456");
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    const orArr = whereArg.customer.OR;
    // ramo cpf/phone usa a versão só-dígitos "123456"; ramo name usa o texto cru
    expect(orArr).toContainEqual({ cpf: { contains: "123456", mode: "insensitive" } });
    expect(orArr).toContainEqual({ phone: { contains: "123456", mode: "insensitive" } });
    expect(orArr).toContainEqual({ name: { contains: "123.456", mode: "insensitive" } });
  });

  it("filtro de emissão monta issuedAt gte/lte", async () => {
    const de = new Date("2024-06-27");
    const ate = new Date("2025-06-27");
    await prescriptionService.list(
      "co-1", 1, 10, undefined, undefined, undefined, undefined, undefined, undefined, de, ate
    );
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg.issuedAt).toEqual({ gte: de, lte: ate });
  });
```

> NOTA: o teste existente "busca por nome do cliente (contains insensitive)" (linha ~33) vai QUEBRAR porque o `where.customer` deixa de ser `{ name: ... }` e vira `{ OR: [...] }`. Atualize aquele teste para esperar o novo shape `OR` (mesmo do primeiro teste novo). Isso é esperado — é a mudança de comportamento.

- [ ] **Step 2: Rodar para ver falhar (RED)**

Run: `npx vitest run src/services/prescription-list-filter.service.test.ts`
Expected: FAIL (novos testes + o teste antigo de nome desatualizado)

- [ ] **Step 3: Atualizar a assinatura e o corpo de `list` (GREEN)**

Em `src/services/prescription.service.ts`, método `list`. Adicionar dois params ao FINAL da assinatura (mantém compatibilidade posicional com chamadas existentes):

```typescript
  async list(
    companyId: string,
    page = 1,
    pageSize = 10,
    customerId?: string,
    branchId?: string,
    status?: "AGUARDANDO_GRAU" | "COMPLETA",
    search?: string,
    validadeDe?: Date,
    validadeAte?: Date,
    emitidaDe?: Date,
    emitidaAte?: Date
  ) {
```

Trocar o bloco do `search` (hoje `customer: { name: { contains: search, ... } }`) por um OR sobre nome/cpf/telefone, e adicionar o bloco de emissão. O `where` fica:

```typescript
    // Busca ampliada: nome (texto cru) OU cpf/telefone (só dígitos da entrada).
    // Os 3 ramos são sempre avaliados (sem detecção de tipo de input) — ver spec.
    const searchDigits = search?.replace(/\D/g, "");
    const where = {
      companyId,
      ...(customerId && { customerId }),
      ...(branchId && { branchId }),
      ...(status && { status }),
      ...(search && {
        customer: {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            ...(searchDigits
              ? [
                  { cpf: { contains: searchDigits, mode: "insensitive" as const } },
                  { phone: { contains: searchDigits, mode: "insensitive" as const } },
                ]
              : []),
          ],
        },
      }),
      ...((validadeDe || validadeAte) && {
        expiresAt: {
          ...(validadeDe && { gte: validadeDe }),
          ...(validadeAte && { lte: validadeAte }),
        },
      }),
      ...((emitidaDe || emitidaAte) && {
        issuedAt: {
          ...(emitidaDe && { gte: emitidaDe }),
          ...(emitidaAte && { lte: emitidaAte }),
        },
      }),
    };
```

> Se `searchDigits` for `""` (busca puramente textual sem dígitos), os ramos cpf/phone são omitidos — evita `contains: ""` que casaria tudo. Por isso os testes do Step 1 são coerentes: "maria" (sem dígitos) → OR só com `name`; um termo com dígitos → os 3 ramos. Sem ajuste posterior necessário.

- [ ] **Step 4: Rodar para ver passar (GREEN)**

Run: `npx vitest run src/services/prescription-list-filter.service.test.ts`
Expected: PASS (todos, incluindo o de nome atualizado)

- [ ] **Step 5: Variação Estratégia B (SÓ se a Task 0 indicou dados com pontuação)**

Se os dados têm pontuação, `contains: searchDigits` no Prisma não casa `(62) 9...`. Substituir os ramos cpf/phone por `$queryRaw` que normaliza o lado do banco. Implementar `list` buscando IDs via raw e depois `findMany({ where: { id: { in } } })`, OU adicionar à query um filtro raw. Manter `companyId`. Escrever um teste adicional que prova o casamento com pontuação no banco (mock do `$queryRaw`). Documentar a escolha num comentário. **Não** implementar a Estratégia B se a Task 0 disse só-dígitos (YAGNI).

- [ ] **Step 6: Commit**

```bash
git add src/services/prescription.service.ts src/services/prescription-list-filter.service.test.ts
git commit -m "feat(livro-receitas): busca por nome/cpf/telefone + filtro de emissão no service"
```

## Task 4: Rota — repassar `emitidaDe`/`emitidaAte`

**Files:**
- Modify: `src/app/api/prescriptions/route.ts:16-44`
- Test: (coberto pelos testes de service; a rota é fina. Sem teste isolado de rota — segue o padrão do projeto.)

- [ ] **Step 1: Parsear e repassar os novos params**

Em `src/app/api/prescriptions/route.ts`, no objeto passado a `prescriptionQuerySchema.parse({...})`, adicionar:

```typescript
      emitidaDe: searchParams.get("emitidaDe") || undefined,
      emitidaAte: searchParams.get("emitidaAte") || undefined,
```

E na chamada `prescriptionService.list(...)`, adicionar os dois argumentos no fim (na mesma ordem da nova assinatura):

```typescript
    const result = await prescriptionService.list(
      companyId,
      query.page,
      query.pageSize,
      query.customerId,
      branchId,
      status,
      query.search,
      query.validadeDe,
      query.validadeAte,
      query.emitidaDe,
      query.emitidaAte
    );
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors found

- [ ] **Step 3: Commit**

```bash
git add src/app/api/prescriptions/route.ts
git commit -m "feat(livro-receitas): rota repassa filtros de emissão ao service"
```

## Task 5: UI dos filtros (chips, filial, período) na page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/livro-receitas/page.tsx`
- Test: (a page é client-component com fetch; cobertura RTL da page é frágil. Testamos o helper puro (Task 2) e o service (Task 3). A UI é validada por `tsc` + build + smoke manual.)

- [ ] **Step 1: Estado dos filtros**

Adicionar estados na page: `chip` (`DateChip`, default `"todas"`), `branchId` (`string`, default `"all"`), `emitidaDe`/`emitidaAte` (string ISO ou ""), e lista de `branches`. Importar `chipToDateParams` de `@/lib/livro-receitas-filters`.

- [ ] **Step 2: Buscar filiais (padrão DRE)**

No mount, `fetch("/api/branches?status=ativos&pageSize=100")` e guardar em `branches`. Só renderizar o dropdown de filial se `branches.length > 1` (ver spec: filial só aparece com +1 filial). Padrão de referência: `src/app/(dashboard)/dashboard/financeiro/dre/page.tsx:143-167`.

- [ ] **Step 3: Montar os params na função `load`**

Na função `load` (que monta `URLSearchParams`), aplicar:
- Se `chip !== "todas"`: `const dp = chipToDateParams(chip)` e setar `validadeDe/Ate` e `emitidaDe/Ate` presentes (como ISO) — limpando o período manual.
- Se `chip === "todas"` e período manual preenchido: setar `emitidaDe/Ate` do período manual.
- Se `branchId !== "all"`: `params.set("branchId", branchId)`.
- Manter `search` e `status` como já são.

Datas vão como `.toISOString()`.

- [ ] **Step 4: Renderizar chips + filial + período (recolhível)**

No Card de Filtros, acima/ao lado da busca:
- Chips como botões (single-select): `Todas` · `Vence em 30 dias` · `Vencidas` · `1 a 2 anos` · `2+ anos`. Clicar seta `chip` e limpa o período manual. O chip ativo fica destacado (variant). Reusar `Button` shadcn.
- Dropdown de filial (Select shadcn) só se `branches.length > 1`. Opção "Todas as filiais" = `"all"`.
- Período de emissão: dois inputs `type="date"` (de/até) num bloco recolhível (ex.: `<details>` ou um toggle "Período de emissão"). Preencher período seta `chip="todas"`.

- [ ] **Step 5: Estado de erro no fetch**

Hoje o `catch` zera a lista (vira "vazio"). Adicionar um estado `error` e, no `catch`, setar erro; renderizar mensagem "Não foi possível carregar. Tentar de novo" com botão que chama `load()`. Distinto do empty-state.

- [ ] **Step 6: Botão "Limpar filtros"**

Quando há qualquer filtro ativo (search/status/chip≠todas/branch≠all/período), mostrar "Limpar filtros" que reseta tudo aos defaults e recarrega.

- [ ] **Step 7: Typecheck + build**

Run: `npx tsc --noEmit` → No errors found
Run: `npm run build` → `✓ Compiled successfully`

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/dashboard/livro-receitas/page.tsx"
git commit -m "feat(livro-receitas): filtros de chip/filial/período na tela"
```

## Task 6: Fechamento da Fase 1

- [ ] **Step 1: Rodar toda a suíte do Livro**

Run: `npx vitest run src/lib/livro-receitas-filters.test.ts src/services/prescription-list-filter.service.test.ts src/services/prescription-from-sale.service.test.ts src/components/prescriptions`
Expected: tudo PASS

- [ ] **Step 2: Revisão**

Dispatch code-reviewer no diff da Fase 1. Endereçar CRITICAL/HIGH.

- [ ] **Step 3: Parar e pedir OK do dono para commitar/deployar a Fase 1.** Não deployar sem aprovação.

---

# FASE 2 — Nome do cliente clicável (link p/ ficha)

> Pequena e independente. Pode ir junto ou separada da Fase 1, a critério do dono.

## Task 7: Link na lista (modo Lista)

**Files:**
- Modify: `src/components/prescriptions/prescription-list.tsx:69-82` (bloco do nome)
- Test: `src/components/prescriptions/prescription-list.test.tsx`

- [ ] **Step 1: Escrever o teste (RED)**

Em `src/components/prescriptions/prescription-list.test.tsx`, adicionar:

```typescript
  it("nome do cliente é link para a ficha e NÃO dispara onVer (stopPropagation)", () => {
    const onVer = vi.fn();
    render(<PrescriptionList prescriptions={[base]} onVer={onVer} />);
    const link = screen.getByRole("link", { name: /Maria Silva/i });
    expect(link.getAttribute("href")).toBe("/dashboard/clientes/c1");
    expect(link.getAttribute("target")).toBe("_blank");
    fireEvent.click(link);
    expect(onVer).not.toHaveBeenCalled();
  });
```

> `base.customer = { id: "c1", name: "Maria Silva" }` (já existe no arquivo).

- [ ] **Step 2: Rodar para ver falhar (RED)**

Run: `npx vitest run src/components/prescriptions/prescription-list.test.tsx -t "nome do cliente é link"`
Expected: FAIL (não há role link / onVer dispara)

- [ ] **Step 3: Implementar (GREEN)**

Em `prescription-list.tsx`, o nome (`pacienteNome(p)` / `p.customer?.name`) deve virar um link **somente quando há `customer?.id`**. Importar `Link` de `next/link`. O paciente exibido pode ser dependente (`patientName`), mas o LINK é sempre para o titular (`customer.id`). Renderizar:

```tsx
{p.customer?.id ? (
  <Link
    href={`/dashboard/clientes/${p.customer.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="font-medium truncate underline-offset-2 hover:underline"
    onClick={(e) => e.stopPropagation()}
  >
    {pacienteNome(p)}
  </Link>
) : (
  <span className="font-medium truncate">{pacienteNome(p)}</span>
)}
```

> Mantém o badge "Dependente" ao lado, como hoje.

- [ ] **Step 4: Rodar para ver passar (GREEN)**

Run: `npx vitest run src/components/prescriptions/prescription-list.test.tsx`
Expected: PASS (todos, incluindo os antigos)

- [ ] **Step 5: Commit**

```bash
git add src/components/prescriptions/prescription-list.tsx src/components/prescriptions/prescription-list.test.tsx
git commit -m "feat(livro-receitas): nome do cliente vira link para a ficha na lista"
```

## Task 8: Link no detalhe (modal)

**Files:**
- Modify: `src/components/prescriptions/prescription-detail-dialog.tsx:52-78` (o `paciente`/título)
- Test: `src/components/prescriptions/prescription-detail-dialog.test.tsx`

- [ ] **Step 1: Escrever o teste (RED)**

Em `prescription-detail-dialog.test.tsx` (a fixture `rx` tem `customer: { id: "c1", name: "Lucas Conrado" }`):

```typescript
  it("nome do cliente no detalhe é link para a ficha (nova aba)", () => {
    render(<PrescriptionDetailDialog prescription={rx} open onClose={() => {}} />);
    const link = screen.getByRole("link", { name: /Lucas Conrado/i });
    expect(link.getAttribute("href")).toBe("/dashboard/clientes/c1");
    expect(link.getAttribute("target")).toBe("_blank");
  });
```

- [ ] **Step 2: Rodar para ver falhar (RED)**

Run: `npx vitest run src/components/prescriptions/prescription-detail-dialog.test.tsx -t "nome do cliente no detalhe é link"`
Expected: FAIL

- [ ] **Step 3: Implementar (GREEN)**

No `DialogTitle`, envolver o nome do titular num `Link` (next/link) para `/dashboard/clientes/${prescription.customer.id}` com `target="_blank"` + `rel="noopener noreferrer"`, somente se `prescription.customer?.id`. Manter os badges (Dependente/Status) ao lado. Para dependente, o título mostra `patientName` mas o link aponta ao titular `customer.id` — mesma regra da lista.

- [ ] **Step 4: Rodar para ver passar (GREEN)**

Run: `npx vitest run src/components/prescriptions/prescription-detail-dialog.test.tsx`
Expected: PASS (todos)

- [ ] **Step 5: Commit + fechamento Fase 2**

```bash
git add src/components/prescriptions/prescription-detail-dialog.tsx src/components/prescriptions/prescription-detail-dialog.test.tsx
git commit -m "feat(livro-receitas): nome do cliente vira link no detalhe da receita"
```

Run: `npx tsc --noEmit` → No errors found
Run: `npm run build` → `✓ Compiled successfully`
Dispatch code-reviewer. **Parar e pedir OK do dono.**

---

# FASE 3 — Modo dual Lista ⇄ Por cliente

## Task 9: Função PURA de agrupamento

**Files:**
- Create: `src/lib/group-prescriptions-by-customer.ts`
- Test: `src/lib/group-prescriptions-by-customer.test.ts`

- [ ] **Step 1: Escrever os testes (RED)**

Criar `src/lib/group-prescriptions-by-customer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { groupByCustomer } from "./group-prescriptions-by-customer";
import type { PrescriptionListItem } from "@/components/prescriptions/prescription-list";

const mk = (over: Partial<PrescriptionListItem>): PrescriptionListItem => ({
  id: "rx",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  status: "COMPLETA",
  customer: { id: "c1", name: "Maria" },
  values: null,
  ...over,
});

describe("groupByCustomer", () => {
  it("agrupa receitas do mesmo cliente", () => {
    const groups = groupByCustomer([
      mk({ id: "a", customer: { id: "c1", name: "Maria" } }),
      mk({ id: "b", customer: { id: "c1", name: "Maria" } }),
      mk({ id: "c", customer: { id: "c2", name: "Ana" } }),
    ]);
    expect(groups).toHaveLength(2);
    const maria = groups.find((g) => g.customerId === "c1")!;
    expect(maria.prescriptions.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("ordena receitas do grupo por issuedAt CRESCENTE (evolução)", () => {
    const groups = groupByCustomer([
      mk({ id: "novo", issuedAt: "2026-06-01T00:00:00.000Z" }),
      mk({ id: "velho", issuedAt: "2025-06-01T00:00:00.000Z" }),
    ]);
    expect(groups[0].prescriptions.map((p) => p.id)).toEqual(["velho", "novo"]);
  });

  it("grau mais recente do grupo = última receita após sort crescente", () => {
    const groups = groupByCustomer([
      mk({ id: "novo", issuedAt: "2026-06-01T00:00:00.000Z", values: { odSph: "-2.00" } }),
      mk({ id: "velho", issuedAt: "2025-06-01T00:00:00.000Z", values: { odSph: "-1.75" } }),
    ]);
    expect(groups[0].latest.id).toBe("novo");
  });

  it("ordena grupos pelo cliente com receita mais recente (desc); empate por nome A→Z", () => {
    const groups = groupByCustomer([
      mk({ id: "ana-velha", customer: { id: "c2", name: "Ana" }, issuedAt: "2025-01-01T00:00:00.000Z" }),
      mk({ id: "maria-nova", customer: { id: "c1", name: "Maria" }, issuedAt: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(groups.map((g) => g.customerId)).toEqual(["c1", "c2"]);
  });

  it("ignora receitas sem customer.id (defensivo)", () => {
    const groups = groupByCustomer([mk({ customer: null })]);
    expect(groups).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar (RED)**

Run: `npx vitest run src/lib/group-prescriptions-by-customer.test.ts`
Expected: FAIL ("Cannot find module")

- [ ] **Step 3: Implementar (GREEN)**

Criar `src/lib/group-prescriptions-by-customer.ts`:

```typescript
import type { PrescriptionListItem } from "@/components/prescriptions/prescription-list";

export interface CustomerGroup {
  customerId: string;
  customerName: string;
  prescriptions: PrescriptionListItem[]; // ordenadas por issuedAt ASC
  latest: PrescriptionListItem;          // a de issuedAt mais novo (última do array)
  count: number;                          // page-scoped (ver spec)
}

function ms(d: string | Date): number {
  return (typeof d === "string" ? new Date(d) : d).getTime();
}

/**
 * Agrupa receitas por cliente (page-scoped — opera só sobre o array recebido).
 * - Receitas de cada grupo ordenadas por issuedAt ASC (evolução do grau).
 * - `latest` = última do array (issuedAt mais novo).
 * - Grupos ordenados pelo issuedAt mais recente DESC; empate por nome A→Z.
 * - Receitas sem customer.id são ignoradas (defensivo).
 */
export function groupByCustomer(items: PrescriptionListItem[]): CustomerGroup[] {
  const byId = new Map<string, PrescriptionListItem[]>();
  for (const p of items) {
    const id = p.customer?.id;
    if (!id) continue;
    const arr = byId.get(id) ?? [];
    arr.push(p);
    byId.set(id, arr);
  }

  const groups: CustomerGroup[] = [];
  for (const [customerId, arr] of byId) {
    const sorted = [...arr].sort((a, b) => ms(a.issuedAt) - ms(b.issuedAt));
    const latest = sorted[sorted.length - 1];
    groups.push({
      customerId,
      customerName: latest.customer?.name ?? "—",
      prescriptions: sorted,
      latest,
      count: sorted.length,
    });
  }

  groups.sort((a, b) => {
    const diff = ms(b.latest.issuedAt) - ms(a.latest.issuedAt);
    if (diff !== 0) return diff;
    return a.customerName.localeCompare(b.customerName);
  });

  return groups;
}
```

- [ ] **Step 4: Rodar para ver passar (GREEN)**

Run: `npx vitest run src/lib/group-prescriptions-by-customer.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/group-prescriptions-by-customer.ts src/lib/group-prescriptions-by-customer.test.ts
git commit -m "feat(livro-receitas): agrupamento de receitas por cliente (puro)"
```

## Task 10: Componente "Por cliente"

**Files:**
- Create: `src/components/prescriptions/prescription-by-customer.tsx`
- Test: `src/components/prescriptions/prescription-by-customer.test.tsx`

- [ ] **Step 1: Escrever os testes (RED)**

Criar `src/components/prescriptions/prescription-by-customer.test.tsx`:

```typescript
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrescriptionByCustomer } from "./prescription-by-customer";
import type { PrescriptionListItem } from "./prescription-list";

const mk = (over: Partial<PrescriptionListItem>): PrescriptionListItem => ({
  id: "rx", issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z",
  status: "COMPLETA", customer: { id: "c1", name: "Maria" }, values: null, ...over,
});

describe("PrescriptionByCustomer", () => {
  it("mostra um grupo por cliente, com nome ligando à ficha (nova aba)", () => {
    render(<PrescriptionByCustomer prescriptions={[mk({})]} onVer={() => {}} />);
    const link = screen.getByRole("link", { name: /Maria/i });
    expect(link.getAttribute("href")).toBe("/dashboard/clientes/c1");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("lista as receitas do cliente em ordem cronológica crescente", () => {
    render(
      <PrescriptionByCustomer
        prescriptions={[
          mk({ id: "novo", issuedAt: "2026-06-01T00:00:00.000Z" }),
          mk({ id: "velho", issuedAt: "2025-06-01T00:00:00.000Z" }),
        ]}
        onVer={() => {}}
      />
    );
    const rows = screen.getAllByTestId("rx-row");
    expect(rows[0].textContent).toMatch(/2025/);
    expect(rows[1].textContent).toMatch(/2026/);
  });

  it("clicar numa receita chama onVer com a receita", () => {
    const onVer = vi.fn();
    render(<PrescriptionByCustomer prescriptions={[mk({ id: "x" })]} onVer={onVer} />);
    fireEvent.click(screen.getByTestId("rx-row"));
    expect(onVer).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("estado vazio", () => {
    render(<PrescriptionByCustomer prescriptions={[]} onVer={() => {}} />);
    expect(screen.getByText(/Nenhuma receita/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar (RED)**

Run: `npx vitest run src/components/prescriptions/prescription-by-customer.test.tsx`
Expected: FAIL ("Cannot find module")

- [ ] **Step 3: Implementar (GREEN)**

Criar `src/components/prescriptions/prescription-by-customer.tsx` (client component). Usa `groupByCustomer`. Para cada grupo: cabeçalho com `Link` (nome → ficha, nova aba, `stopPropagation`), `count` receitas, e o grau mais recente (`latest.values`, formatado curto, ex.: "OD -2,00"). Abaixo, as receitas em ordem crescente, cada uma num row clicável (`data-testid="rx-row"`) que chama `onVer(p)`. Reaproveitar a formatação de data/grau do `prescription-list.tsx` (extrair util se necessário — DRY). Estado vazio igual ao da lista.

Props:
```typescript
interface Props {
  prescriptions: PrescriptionListItem[];
  onVer: (p: PrescriptionListItem) => void;
  onDigitarGrau?: (id: string) => void; // mantém ação em AGUARDANDO_GRAU sem OS
}
```

> Mantém a regra: "Digitar grau" só em `AGUARDANDO_GRAU` && !hasServiceOrder.

- [ ] **Step 4: Rodar para ver passar (GREEN)**

Run: `npx vitest run src/components/prescriptions/prescription-by-customer.test.tsx`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/components/prescriptions/prescription-by-customer.tsx src/components/prescriptions/prescription-by-customer.test.tsx
git commit -m "feat(livro-receitas): componente Por cliente com evolução do grau"
```

## Task 11: Toggle Lista ⇄ Por cliente na page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/livro-receitas/page.tsx`
- Test: (validação por tsc+build+smoke; o agrupamento já tem teste unitário na Task 9 e o componente na Task 10)

- [ ] **Step 1: Estado do modo**

Adicionar `const [view, setView] = useState<"lista" | "cliente">("lista")`.

- [ ] **Step 2: Toggle na UI**

Ao lado dos filtros, dois botões/segmented: `Lista` | `Por cliente`. Destaca o ativo.

- [ ] **Step 3: Render condicional**

No Card de resultados: se `view === "lista"` renderiza `<PrescriptionList .../>` (como hoje); se `"cliente"` renderiza `<PrescriptionByCustomer prescriptions={prescriptions} onVer={setViewing} onDigitarGrau={canEdit ? setEditId : undefined} />`. O mesmo `prescriptions` (payload da página) alimenta os dois — sem novo fetch.

- [ ] **Step 4: Nota page-scoped (opcional, recomendado)**

Quando `view === "cliente"` e há mais de uma página de resultados (total > pageSize), mostrar um aviso discreto: "Mostrando a primeira página. Busque pelo cliente para ver todas as receitas dele." (alinha com a spec — contagem não é oficial).

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` → No errors found
Run: `npm run build` → `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/livro-receitas/page.tsx"
git commit -m "feat(livro-receitas): toggle Lista/Por cliente na tela"
```

## Task 12: Fechamento da Fase 3

- [ ] **Step 1: Suíte completa do Livro**

Run: `npx vitest run src/lib/livro-receitas-filters.test.ts src/lib/group-prescriptions-by-customer.test.ts src/services/prescription-list-filter.service.test.ts src/components/prescriptions`
Expected: tudo PASS

- [ ] **Step 2: tsc + build finais**

Run: `npx tsc --noEmit` → No errors found
Run: `npm run build` → `✓ Compiled successfully`

- [ ] **Step 3: Revisão final**

Dispatch code-reviewer no diff completo da Fase 3. Endereçar CRITICAL/HIGH.

- [ ] **Step 4: Parar. Pedir OK do dono para deployar.** Atualizar a memória do projeto com o resultado.

---

## Checklist de não-regressão (todas as fases)

- [ ] `companyId` presente em todos os filtros Prisma do `list`.
- [ ] Receita com OS continua só-leitura; "Digitar grau" só em `AGUARDANDO_GRAU` sem OS — nos DOIS modos.
- [ ] Busca vazia / filtros vazios → estado vazio com "Limpar filtros" (não erro).
- [ ] Falha de fetch → estado de erro com "Tentar de novo" (não vazio).
- [ ] Permissão `prescriptions.view` segue protegendo a rota; `prescriptions.edit` para "Digitar grau".
