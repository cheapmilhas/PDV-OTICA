# Planos comercializáveis + sincronização site↔admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o banco (`Plan`) a fonte única de verdade para planos, comercializando Básico R$149,90 (ativo) + Básico+NF R$189,90 + Profissional + Rede (3 "Em breve"), com preço/status sincronizados em site, cadastro de trial, JSON-LD e admin, e captura de interessados.

**Architecture:** Migration aditiva adiciona `status` e `highlightFeatures` ao `Plan` + tabela `PlanInterest`. `GET /api/public/plans` passa a retornar os campos novos (TTL 60s). Consumidores client (home/`PricingSection`) leem da API e convertem centavos→reais na borda; JSON-LD vira Server-fetch taggeado (revalidate imediato). Nova aba `/admin/interessados`.

**Tech Stack:** Next.js 14 App Router, Prisma (PostgreSQL/Neon), TypeScript, Zod, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-05-planos-comercializaveis-sincronizacao-design.md`

**Convenções do repo (confirmadas):**
- Test runner: **Vitest** (`npx vitest run <arquivo>`). Testes de lib ficam ao lado (`*.test.ts`).
- Preço no banco = **Int centavos**. Conversão: `planValueForCycle` (`src/lib/plan-pricing.ts`, centavos→reais, **lança se ≤0**) + `formatCurrency` (`@/lib/utils`, recebe **reais**).
- Admin auth: `getAdminSession()` + checagem `["SUPER_ADMIN","ADMIN"]`.
- Commits: conventional commits, PT-BR. NÃO commitar nada não relacionado (working tree tem outros arquivos staged — usar `git add <paths exatos>`).

---

## File Structure

**Criar:**
- `prisma/migrations/<timestamp>_plan_status_interest/migration.sql` — campos `status`, `highlightFeatures` em `Plan`; tabela `PlanInterest` (via `prisma migrate dev`).
- `src/lib/plan-display.ts` — helpers puros de exibição: `formatPlanPrice(cents)`, `isComingSoon(plan)`, tipo `PublicPlan`. Testável isolado.
- `src/lib/plan-display.test.ts` — testes do helper.
- `src/app/api/public/plan-interest/route.ts` — POST captura de interesse (upsert).
- `src/app/api/public/plan-interest/route.test.ts` — teste do handler (validação/upsert).
- `src/app/api/admin/plan-interests/route.ts` — GET lista interessados (+ CSV).
- `src/app/admin/interessados/page.tsx` — server page (lista).
- `src/app/admin/interessados/interessados-client.tsx` — UI (filtro + export CSV).
- `src/components/plan/coming-soon-interest-modal.tsx` — modal "Quero ser avisado".

**Modificar:**
- `prisma/schema.prisma` — `Plan` + `model PlanInterest`.
- `src/app/api/public/plans/route.ts` — retornar `status`/`highlightFeatures`, TTL 60s.
- `src/app/api/admin/plans/[id]/route.ts` — aceitar `status`/`highlightFeatures` + `revalidateTag`.
- `src/app/api/admin/plans/route.ts` — idem no POST (criar) + `revalidateTag`.
- `src/components/home/pricing-section.tsx` — fetch da API, converter, render "Em breve".
- `src/app/(landing)/precos/page.tsx` — virar Server Component com fetch taggeado p/ JSON-LD.
- `src/app/layout.tsx` — `softwareApplicationJsonLd` dinâmico (preço do plano ativo).
- `src/components/seo/json-ld.tsx` — `softwareApplicationJsonLd` vira builder a partir de preço.
- `src/app/registro/page.tsx` — filtrar só `status==="ACTIVE"`; remover fallback `|| 14`.
- `src/app/admin/configuracoes/planos/planos-client.tsx` — campos `status`/`highlightFeatures` no form.
- `src/app/admin/admin-nav.tsx` — link "Interessados".
- `src/content/pricing.ts` — remover `plans` (dead data) + FAQ trial hardcoded; manter só o que for usado.
- `src/components/subscription/subscription-blocked.tsx` — "14 dias" → dinâmico/genérico.
- `src/components/pages/functionalities-page.tsx` — "14 dias" → genérico.
- `src/components/pages/pricing-page.tsx` — **remover** (órfão confirmado).
- Seed canônico: `prisma/seed-plans.ts` (os 4 planos).

---

## Task 1: Migration — `status`, `highlightFeatures`, `PlanInterest`

**Files:**
- Modify: `prisma/schema.prisma` (model `Plan`, + novo `model PlanInterest`)
- Create: `prisma/migrations/<timestamp>_plan_status_interest/migration.sql` (gerado)

- [ ] **Step 1: Editar o schema**

No `model Plan`, após `isFeatured  Boolean @default(false)`, adicionar:

```prisma
  status               String         @default("ACTIVE") // ACTIVE | COMING_SOON
  highlightFeatures    Json?          // string[] de bullets de copy
```

No fim do arquivo (ou junto aos models de billing), adicionar:

```prisma
model PlanInterest {
  id          String   @id @default(cuid())
  planSlug    String
  name        String
  email       String
  phone       String?
  companyName String?
  createdAt   DateTime @default(now())

  @@unique([email, planSlug])
  @@index([planSlug])
  @@index([createdAt])
}
```

- [ ] **Step 2: Gerar a migration**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && npx prisma migrate dev --name plan_status_interest`
Expected: cria a pasta de migration, aplica no banco de dev, regenera o client sem erro. (É aditiva — defaults garantem que planos existentes recebem `status="ACTIVE"`.)

- [ ] **Step 3: Verificar geração do client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` sem erro. `PlanInterest` disponível em `prisma.planInterest`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(planos): migration aditiva status/highlightFeatures + tabela PlanInterest"
```

---

## Task 2: Helper de exibição `plan-display.ts` (TDD)

Centraliza a conversão centavos→reais e a regra de "Em breve", para nenhum componente reinventar (DRY) e evitar o bug R$ 14.990,00.

**Files:**
- Create: `src/lib/plan-display.ts`
- Test: `src/lib/plan-display.test.ts`

- [ ] **Step 1: Escrever o teste falho**

> **ATENÇÃO (confirmado no ambiente):** `formatCurrency` usa `Intl.NumberFormat("pt-BR")`, que separa "R$" do número com **espaço não-quebrável** (U+00A0), NÃO espaço normal. Para o teste ser determinístico, `formatPlanPrice` **normaliza** o NBSP para espaço normal, e o teste compara com espaço normal.

```typescript
import { describe, it, expect } from "vitest";
import { formatPlanPrice, isComingSoon } from "./plan-display";

describe("formatPlanPrice", () => {
  it("converte centavos → reais formatado (espaço normal, não NBSP)", () => {
    expect(formatPlanPrice(14990)).toBe("R$ 149,90");
    expect(formatPlanPrice(18990)).toBe("R$ 189,90");
  });
  it("retorna null quando não há preço (0) — plano Em breve sem valor", () => {
    expect(formatPlanPrice(0)).toBeNull();
    expect(formatPlanPrice(null)).toBeNull();
  });
});

describe("isComingSoon", () => {
  it("true quando status COMING_SOON", () => {
    expect(isComingSoon({ status: "COMING_SOON" })).toBe(true);
  });
  it("false quando ACTIVE ou ausente", () => {
    expect(isComingSoon({ status: "ACTIVE" })).toBe(false);
    expect(isComingSoon({})).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/plan-display.test.ts`
Expected: FAIL ("Cannot find module './plan-display'").

- [ ] **Step 3: Implementar**

```typescript
import { formatCurrency } from "@/lib/utils";

export interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number; // centavos
  priceYearly: number;  // centavos
  trialDays: number;
  status: string;       // "ACTIVE" | "COMING_SOON"
  isFeatured: boolean;
  highlightFeatures: string[] | null;
}

const NBSP = String.fromCharCode(160); // U+00A0, inserido pelo Intl entre "R$" e o número

/** Centavos → "R$ x,yy" (NBSP normalizado p/ espaço comum). null se sem preço (0/null). */
export function formatPlanPrice(cents: number | null | undefined): string | null {
  if (!cents || cents <= 0) return null;
  return formatCurrency(cents / 100).split(NBSP).join(" ");
}

export function isComingSoon(plan: { status?: string }): boolean {
  return plan.status === "COMING_SOON";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/plan-display.test.ts`
Expected: PASS (4 testes). O helper já normaliza o NBSP, então o `expect` com espaço normal passa direto.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-display.ts src/lib/plan-display.test.ts
git commit -m "feat(planos): helper plan-display (formatPlanPrice centavos→reais, isComingSoon)"
```

---

## Task 3: API pública retorna `status`/`highlightFeatures` + TTL 60s

**Files:**
- Modify: `src/app/api/public/plans/route.ts`

- [ ] **Step 1: Atualizar o handler**

Substituir o conteúdo por:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/plans
 * Planos para landing/registro. Inclui ACTIVE e COMING_SOON (filtro isActive=true).
 * Sem auth. TTL curto (60s) para refletir alterações do admin.
 */
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, slug: true, description: true,
      priceMonthly: true, priceYearly: true, trialDays: true,
      status: true, isFeatured: true, highlightFeatures: true,
      maxUsers: true, maxBranches: true, maxProducts: true,
      features: { select: { key: true, value: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(
    { plans },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a este arquivo.

- [ ] **Step 3: Verificar resposta (manual, opcional)**

Run: `npm run dev` e em outro terminal `curl -s localhost:3000/api/public/plans | head -c 400`
Expected: JSON com `status` e `highlightFeatures` por plano. (Pode estar `null` até o Task 8 popular.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/public/plans/route.ts
git commit -m "feat(planos): /api/public/plans retorna status/highlightFeatures + TTL 60s"
```

---

## Task 4: Admin persiste `status`/`highlightFeatures` + `revalidateTag`

**Files:**
- Modify: `src/app/api/admin/plans/[id]/route.ts` (PATCH)
- Modify: `src/app/api/admin/plans/route.ts` (POST)

- [ ] **Step 1: Estender o Zod schema do PATCH**

Em `src/app/api/admin/plans/[id]/route.ts`, no `updatePlanSchema`, adicionar:

```typescript
  status: z.enum(["ACTIVE", "COMING_SOON"]).optional(),
  highlightFeatures: z.array(z.string()).optional().nullable(),
```

- [ ] **Step 2: Disparar revalidate após gravar (PATCH)**

No topo do arquivo, importar:

```typescript
import { revalidateTag } from "next/cache";
```

Após a transação que atualiza o plano (depois do `globalAudit.create`, antes do `return`), adicionar:

```typescript
    revalidateTag("public-plans");
```

> **IMPORTANTE (escopo do revalidate):** `revalidateTag("public-plans")` só invalida entradas do **Data Cache** taggeadas com `public-plans` — na prática, **apenas o `unstable_cache` do JSON-LD criado na Task 10**. Ele **NÃO** invalida a resposta de `GET /api/public/plans` (route handler cacheado por header `s-maxage`), cujo reflexo vem do **TTL de 60s** (Task 3). Ou seja: home/`PricingSection` refletem em ≤60s; JSON-LD reflete imediato — mas **só depois que a Task 10 existir**. Até a Task 10, esta chamada é um no-op inofensivo. Não é erro: é o comportamento esperado, documentado no spec §6.2.

- [ ] **Step 3: Mesmo tratamento no POST (criar)**

Em `src/app/api/admin/plans/route.ts`: adicionar `status` e `highlightFeatures` ao schema de criação (se houver) e ao `data` do `prisma.plan.create`; importar `revalidateTag` e chamar `revalidateTag("public-plans")` após criar. (Ler o arquivo antes para casar o padrão existente.)

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/plans/[id]/route.ts src/app/api/admin/plans/route.ts
git commit -m "feat(planos): admin persiste status/highlightFeatures e revalida cache público"
```

---

## Task 5: API de captura de interesse (POST, upsert) — TDD

**Files:**
- Create: `src/app/api/public/plan-interest/route.ts`
- Test: `src/app/api/public/plan-interest/route.test.ts`

- [ ] **Step 1: Escrever o teste falho**

Testar a função de validação + upsert com prisma mockado.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { planInterest: { upsert: (...a: unknown[]) => upsert(...a) } } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/public/plan-interest", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/public/plan-interest", () => {
  beforeEach(() => upsert.mockReset());

  it("rejeita email inválido com 400", async () => {
    const res = await POST(req({ planSlug: "profissional", name: "Ana", email: "x" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upsert por (email, planSlug) e responde 200", async () => {
    upsert.mockResolvedValue({ id: "1" });
    const res = await POST(req({ planSlug: "profissional", name: "Ana", email: "ana@x.com" }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ email_planSlug: { email: "ana@x.com", planSlug: "profissional" } });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/public/plan-interest/route.test.ts`
Expected: FAIL ("Cannot find module './route'").

- [ ] **Step 3: Implementar o handler**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  planSlug: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(160).optional(),
});

export async function POST(request: Request) {
  let data;
  try {
    data = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  await prisma.planInterest.upsert({
    where: { email_planSlug: { email: data.email, planSlug: data.planSlug } },
    update: { name: data.name, phone: data.phone, companyName: data.companyName },
    create: data,
  });

  return NextResponse.json({ success: true });
}
```

> Nota: o nome do índice composto no `where` é `email_planSlug` (convenção Prisma para `@@unique([email, planSlug])`). Confirmar no client gerado se diferir.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/public/plan-interest/route.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/public/plan-interest/route.ts src/app/api/public/plan-interest/route.test.ts
git commit -m "feat(planos): POST /api/public/plan-interest (upsert por email+plano)"
```

---

## Task 6: Modal "Quero ser avisado"

**Files:**
- Create: `src/components/plan/coming-soon-interest-modal.tsx`

- [ ] **Step 1: Implementar o modal**

Componente client controlado por props `open`/`onClose`/`planSlug`/`planName`. Campos: nome, e-mail (required), telefone (opcional). Submete `POST /api/public/plan-interest`; em sucesso mostra confirmação; em erro mostra mensagem. Seguir o estilo dos modais existentes (ver `manager-approval-modal.tsx` para padrão de overlay/estado). Sem libs novas.

```tsx
"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  planSlug: string;
  planName: string;
  onClose: () => void;
}

export function ComingSoonInterestModal({ open, planSlug, planName, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/public/plan-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug, name, email, phone: phone || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {state === "done" ? (
          <div className="text-center">
            <h3 className="text-lg font-semibold">Prontinho! 🎉</h3>
            <p className="mt-2 text-sm text-gray-600">
              Avisaremos você assim que o plano <strong>{planName}</strong> estiver disponível.
            </p>
            <button onClick={onClose} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Fechar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <h3 className="text-lg font-semibold">Quero ser avisado — {planName}</h3>
            <input required placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
            <input required type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
            <input placeholder="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
            {state === "error" && <p className="text-sm text-red-600">Algo deu errado. Tente de novo.</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button type="submit" disabled={state === "loading"}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {state === "loading" ? "Enviando..." : "Quero ser avisado"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/plan/coming-soon-interest-modal.tsx
git commit -m "feat(planos): modal Quero ser avisado para planos Em breve"
```

---

## Task 7: `PricingSection` lê da API + render "Em breve"

Maior tarefa de UI. O componente hoje importa `plans` estático e é usado por home e `/precos`.

**Files:**
- Modify: `src/components/home/pricing-section.tsx`

- [ ] **Step 1: Ler o componente atual por completo**

Run: leia `src/components/home/pricing-section.tsx` inteiro para preservar layout/animações. Só troca-se a **fonte de dados** e adiciona-se o estado "Em breve".

- [ ] **Step 2: Trocar fonte estática por fetch**

- Remover `import { plans } from "@/content/pricing"`.
- Adicionar estado e fetch client:

```tsx
import { useEffect, useState } from "react";
import { formatPlanPrice, isComingSoon, type PublicPlan } from "@/lib/plan-display";
import { ComingSoonInterestModal } from "@/components/plan/coming-soon-interest-modal";

const [plans, setPlans] = useState<PublicPlan[]>([]);
const [interest, setInterest] = useState<PublicPlan | null>(null);

useEffect(() => {
  fetch("/api/public/plans")
    .then((r) => r.json())
    .then((d) => setPlans(d.plans ?? []))
    .catch(() => setPlans([]));
}, []);
```

- [ ] **Step 3: Adaptar os campos internos (o componente usa vários campos do tipo estático antigo)**

O componente atual depende de campos que **não existem** no `PublicPlan` da API. Mapear cada um:

| Uso atual (estático) | Substituir por |
|---|---|
| `plan.id` como `"essencial"\|"profissional"\|"rede"` em `PLAN_ICONS[plan.id]` e no link `plan.id === "rede"` | usar `plan.slug` (`"basico"\|"basico-nf"\|"profissional"\|"rede"`). Reescrever `PLAN_ICONS` com as **novas chaves de slug**. O link especial de WhatsApp passa a ser `plan.slug === "rede"`. |
| `plan.highlight` (destaque visual) | `plan.isFeatured` |
| `plan.badge` ("Mais escolhido") | derivar: `plan.isFeatured ? "Mais escolhido" : undefined` (ou `isComingSoon(plan) ? "Em breve" : ...`) |
| `plan.monthlyPrice`/`plan.annualPrice` (reais, float) | `plan.priceMonthly`/`plan.priceYearly` (centavos) → `formatPlanPrice(...)` |
| `plan.notIncluded` (lista) | remover — não há esse dado na API; a copy nova só usa `highlightFeatures` |

- [ ] **Step 4: Tratar o toggle Mensal/Anual com preços em centavos e planos sem preço**

O componente tem um toggle `annual` (estado) e renderiza `formatCurrency(annual ? plan.annualPrice : plan.monthlyPrice)` + "Economize .../ano". Regras novas:
- Preço exibido: `const price = formatPlanPrice(annual ? plan.priceYearly : plan.priceMonthly);`
- Se `price === null` (plano `COMING_SOON` sem preço, ex. Profissional/Rede, ou anual=0 do Básico+NF): **não** renderizar valor nem o bloco "Economize/ano" — mostrar só o selo "Em breve". Nunca passar 0 ao `formatCurrency`.
- "Economize/ano" e "ou X/mês no anual": só quando **ambos** `priceMonthly>0` e `priceYearly>0`.

- [ ] **Step 5: Render do estado "Em breve" + CTA**

- Bullets: `plan.highlightFeatures ?? []`.
- Se `isComingSoon(plan)`: selo "Em breve", botão de compra **desabilitado**, e botão "Quero ser avisado" → `onClick={() => setInterest(plan)}`.
- Se `ACTIVE`: CTA normal (`REGISTER_URL`; manter o caso `plan.slug === "rede"` → `WHATSAPP_URL`, embora "rede" agora seja COMING_SOON — o ramo ACTIVE de "rede" fica inalcançável até lançar, sem problema).
- Renderizar `<ComingSoonInterestModal open={!!interest} planSlug={interest?.slug ?? ""} planName={interest?.name ?? ""} onClose={() => setInterest(null)} />`.
- Carregamento: enquanto `plans.length === 0`, skeleton/placeholder (NÃO preço falso).

- [ ] **Step 6: Verificar compilação + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros. Conferir que nenhum campo removido (`monthlyPrice`/`badge`/`highlight`/`notIncluded`/`plan.id`) ficou referenciado.

- [ ] **Step 7: Verificação visual (manual)**

Run: `npm run dev` → abrir `/` e `/precos`.
Expected: Básico mostra R$ 149,90 + CTA; os 3 "Em breve" com selo + "Quero ser avisado". Modal abre e envia. Toggle Anual não quebra (planos sem anual escondem o valor).

- [ ] **Step 8: Commit**

```bash
git add src/components/home/pricing-section.tsx
git commit -m "feat(planos): PricingSection lê /api/public/plans + estado Em breve com captura de interesse"
```

---

## Task 8: Seed canônico dos 4 planos

**Files:**
- Modify: `prisma/seed-plans.ts`

- [ ] **Step 1: Definir os 4 planos como fonte única**

Reescrever o seed para upsert (por `slug`) dos 4 planos. `highlightFeatures` = bullets da spec §5. Valores:

```typescript
// Básico — comprável
{ slug: "basico", name: "Básico", status: "ACTIVE", isActive: true, isFeatured: true,
  priceMonthly: 14990, priceYearly: 149900, trialDays: 14, sortOrder: 1,
  highlightFeatures: [
    "PDV completo (vendas, código de barras, descontos, aprovação de gerente)",
    "Orçamentos (criar, imprimir, converter em venda)",
    "Ordem de Serviço com Kanban (garantia, retrabalho, erro médico)",
    "Leitura de receita por IA (OCR automático)",
    "Clientes + lembretes (aniversário, pós-venda, troca de receita)",
    "Estoque (entrada, saída, ajuste, histórico)",
    "Caixa (abrir/fechar, sangria, reforço, histórico)",
    "Relatórios em tempo real (vendas, estoque, contas a pagar/receber, comissões)",
    "Cashback",
    "Laboratórios e fornecedores",
    "Links de WhatsApp para falar com o cliente",
    "Permissões por usuário",
    "Suporte via chamado",
    "Acesso mobile",
  ] },
// Básico + NF — em breve, com preço
{ slug: "basico-nf", name: "Básico + Emissão de NF", status: "COMING_SOON", isActive: true, isFeatured: false,
  priceMonthly: 18990, priceYearly: 0, trialDays: 14, sortOrder: 2,
  highlightFeatures: ["Tudo do Básico", "Emissão de NFC-e/NF-e integrada"] },
// Profissional — em breve, sem preço
{ slug: "profissional", name: "Profissional", status: "COMING_SOON", isActive: true, isFeatured: false,
  priceMonthly: 0, priceYearly: 0, trialDays: 14, sortOrder: 3,
  highlightFeatures: ["Tudo do Básico + NF", "Módulo financeiro avançado: DRE, Fluxo de Caixa, Conciliação Bancária, BI, Cartões/Recebíveis, Metas, Lotes FIFO e mais"] },
// Rede — em breve, sem preço
{ slug: "rede", name: "Rede / Multi-loja", status: "COMING_SOON", isActive: true, isFeatured: false,
  priceMonthly: 0, priceYearly: 0, trialDays: 14, sortOrder: 4,
  highlightFeatures: ["Tudo do Profissional", "Múltiplas filiais, transferências entre lojas, comparativo de lojas, usuários ilimitados"] },
```

Implementar como `for (const p of plans) await prisma.plan.upsert({ where: { slug: p.slug }, update: p, create: p })`. `highlightFeatures` é `Json` — passar o array direto.

> **Plano legado `enterprise`:** o seed atual cria um plano `slug:"enterprise"` (R$599) que **não** está na nova lista. Como `/api/public/plans` filtra `isActive:true`, ele **vazaria** para a landing. Após o upsert dos 4, desativar quaisquer slugs legados:
> ```typescript
> const keep = ["basico", "basico-nf", "profissional", "rede"];
> await prisma.plan.updateMany({ where: { slug: { notIn: keep } }, data: { isActive: false } });
> ```
> O slug `profissional` já existia (R$299) — o upsert o **sobrescreve** para COMING_SOON sem preço (correto). Empresas que já assinam um plano legado mantêm a `Subscription` (a desativação não apaga o `Plan`, só o tira da vitrine).

- [ ] **Step 2: Rodar o seed**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && npx tsx prisma/seed-plans.ts` (ou o runner usado pelo projeto — checar `package.json` por `seed`)
Expected: 4 planos upsertados sem erro.

- [ ] **Step 3: Conferir no banco**

Run: `npx prisma studio` (ou `curl -s localhost:3000/api/public/plans`)
Expected: 4 planos; Básico ACTIVE R$149,90; demais COMING_SOON; `highlightFeatures` preenchido.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-plans.ts
git commit -m "feat(planos): seed canônico dos 4 planos (Básico ativo + 3 Em breve) com copy honesta"
```

---

## Task 9: Registro filtra só `ACTIVE`

**Files:**
- Modify: `src/app/registro/page.tsx`
- Modify: `src/app/api/public/register/route.ts`

- [ ] **Step 1: Frontend só oferece ACTIVE**

Em `src/app/registro/page.tsx`, onde os planos do fetch são exibidos para seleção, filtrar `plans.filter((p) => p.status === "ACTIVE")`. Remover o fallback `{selectedPlan?.trialDays || 14}` → usar `selectedPlan?.trialDays` (sempre presente agora).

- [ ] **Step 2: Backend recusa COMING_SOON**

Em `src/app/api/public/register/route.ts`, no bloco que busca o plano (linhas ~78-90). **Atenção:** o código atual usa `prisma.plan.findUnique({ where: { id: planId, isActive: true } })` — isso é **inválido** no Prisma (`findUnique` só aceita campos `@id`/`@unique`; `isActive` não é) e quebra o `tsc`. **Trocar `findUnique` por `findFirst`** e adicionar `status: "ACTIVE"`:

```typescript
    if (planId) {
      plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true, status: "ACTIVE" } });
    }
    if (!plan) {
      plan = await prisma.plan.findFirst({ where: { isActive: true, status: "ACTIVE" }, orderBy: { sortOrder: "asc" } });
    }
```

Assim um `planId` de plano "Em breve" cai no fallback do Básico (nunca inicia trial de plano não lançado).

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/registro/page.tsx src/app/api/public/register/route.ts
git commit -m "feat(planos): registro/trial só oferece e aceita planos ACTIVE"
```

---

## Task 10: JSON-LD dinâmico (precos + layout global)

**Files:**
- Modify: `src/components/seo/json-ld.tsx`
- Modify: `src/app/(landing)/precos/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Tornar `softwareApplicationJsonLd` um builder**

Em `src/components/seo/json-ld.tsx`, trocar a constante `softwareApplicationJsonLd` por:

```typescript
export function buildSoftwareApplicationJsonLd(lowestPriceReais: number): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Vis",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Sistema de Gestão para Óticas",
    operatingSystem: "Web",
    url: SITE_URL,
    description:
      "Sistema de gestão para óticas com PDV, controle de estoque, ordem de serviço de lentes, financeiro e CRM.",
    offers: {
      "@type": "Offer",
      price: lowestPriceReais.toFixed(2),
      priceCurrency: "BRL",
      url: `${SITE_URL}/precos`,
      availability: "https://schema.org/InStock",
    },
  };
}
```

- [ ] **Step 2: Helper Server para buscar o menor preço ativo**

Criar **`src/lib/plan-pricing-server.ts`** (localização fixa — não pôr em `plan-display.ts`, que é client-safe e não deve importar `prisma`/`next/cache`):

```typescript
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

/** Menor priceMonthly (em reais) entre planos ACTIVE com preço > 0. Cacheado com tag public-plans. */
export const getLowestActivePriceReais = unstable_cache(
  async (): Promise<number> => {
    const p = await prisma.plan.findFirst({
      where: { isActive: true, status: "ACTIVE", priceMonthly: { gt: 0 } },
      orderBy: { priceMonthly: "asc" },
      select: { priceMonthly: true },
    });
    return p ? p.priceMonthly / 100 : 149.9;
  },
  ["lowest-active-price"],
  { tags: ["public-plans"], revalidate: 60 }
);
```

- [ ] **Step 3: Usar no layout global**

Em `src/app/layout.tsx`: trocar `import { softwareApplicationJsonLd }` por `buildSoftwareApplicationJsonLd` + `getLowestActivePriceReais`. O `RootLayout` é async server component — antes do `return`:

```tsx
const lowest = await getLowestActivePriceReais();
```

e `<JsonLd data={buildSoftwareApplicationJsonLd(lowest)} />`.

- [ ] **Step 4: `/precos` — JSON-LD de Product dinâmico**

Em `src/app/(landing)/precos/page.tsx`: remover `import { plans } from "@/content/pricing"`. Tornar a página async server e buscar planos ACTIVE com preço via prisma (ou reusar um helper taggeado) e montar os `offers` só dos que têm preço:

```tsx
const priced = await prisma.plan.findMany({
  where: { isActive: true, status: "ACTIVE", priceMonthly: { gt: 0 } },
  select: { name: true, priceMonthly: true },
});
// ...
<JsonLd data={buildProductJsonLd(priced.map((p) => ({ name: p.name, price: p.priceMonthly / 100 })))} />
```

(Manter o `<PricingSection />` client logo abaixo — ele continua buscando via API.)

- [ ] **Step 5: Verificar compilação + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros. Build não deve reclamar de `softwareApplicationJsonLd` removido (conferir nenhum outro import órfão: `grep -rn "softwareApplicationJsonLd" src/`).

- [ ] **Step 6: Commit**

```bash
git add src/components/seo/json-ld.tsx src/app/layout.tsx "src/app/(landing)/precos/page.tsx" src/lib/plan-pricing-server.ts
git commit -m "feat(planos): JSON-LD (precos + global) deriva preço do plano ativo (revalidate público)"
```

---

## Task 11: Trial "14 dias" hardcoded → dinâmico

**Files:**
- Modify: `src/content/pricing.ts` (FAQ)
- Modify: `src/components/subscription/subscription-blocked.tsx`
- Modify: `src/components/pages/functionalities-page.tsx`

- [ ] **Step 1: FAQ de trial**

Em `src/content/pricing.ts`, na `pricingFaq`, trocar a resposta "Sim, 14 dias grátis..." por texto sem número fixo: `"Sim, o teste é grátis e sem cartão de crédito. Sem compromisso de continuar."` (o número exato aparece dinâmico no `/registro`).

- [ ] **Step 2: Tela de trial expirado**

Em `src/components/subscription/subscription-blocked.tsx:19`, trocar "Seu período de teste de 14 dias chegou ao fim..." por "Seu período de teste chegou ao fim..." (sem número), OU receber `trialDays` por prop se já houver o dado no componente pai. Preferir a versão sem número (menor acoplamento).

- [ ] **Step 3: Página de funcionalidades**

Em `src/components/pages/functionalities-page.tsx:251`, trocar "14 dias grátis." por "Teste grátis. Todos os módulos incluídos..." (sem número).

- [ ] **Step 4: Verificar nenhum "14 dias" remanescente (exceto termos legais)**

Run: `grep -rn "14 dias" src/`
Expected: só `src/app/(landing)/termos/page.tsx` (contexto jurídico — manter).

- [ ] **Step 5: Commit**

```bash
git add src/content/pricing.ts src/components/subscription/subscription-blocked.tsx src/components/pages/functionalities-page.tsx
git commit -m "fix(planos): remove '14 dias' hardcoded da UI (trial vem de Plan.trialDays no registro)"
```

---

## Task 12: Limpar dead data (`content/pricing.ts` plans + `pricing-page.tsx`)

**Files:**
- Modify: `src/content/pricing.ts`
- Delete: `src/components/pages/pricing-page.tsx`

- [ ] **Step 1: Confirmar não-uso do array `plans`**

Run: `grep -rn "from \"@/content/pricing\"\|from '@/content/pricing'" src/`
Expected: após Tasks 7 e 10, nenhum import de `plans` (só talvez `pricingFaq`). Se algum restar, migrar antes.

- [ ] **Step 2: Remover o array `plans` e `GATED_FEATURE_LABELS`**

Em `src/content/pricing.ts`, apagar `export const plans` e o `GATED_FEATURE_LABELS`/imports do `FEATURE_REGISTRY` que só serviam a ele. Manter `pricingFaq` e tipos ainda usados.

- [ ] **Step 3: Remover componente órfão**

Run: `grep -rn "pricing-page\|PricingPage" src/ | grep -v "pages/pricing-page.tsx"`
Expected: vazio (órfão confirmado). Então:
Run: `git rm src/components/pages/pricing-page.tsx`

- [ ] **Step 4: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros / nenhum import quebrado.

- [ ] **Step 5: Commit**

```bash
git add src/content/pricing.ts
git commit -m "refactor(planos): remove dados estáticos de planos (pricing.ts) e componente órfão pricing-page"
```

---

## Task 13: Admin — campos `status`/`highlightFeatures` no form de planos

**Files:**
- Modify: `src/app/admin/configuracoes/planos/planos-client.tsx`

- [ ] **Step 1: Estender a interface e o form**

- Na `interface Plan`, adicionar `status: string;` e `highlightFeatures: string[] | null;`.
- No `emptyForm`, adicionar `status: "ACTIVE"` e `highlightFeatures: ""` (editado como textarea, 1 bullet por linha).
- No `openEdit`, popular `status: plan.status` e `highlightFeatures: (plan.highlightFeatures ?? []).join("\n")`.

- [ ] **Step 2: Inputs no modal do form**

Adicionar:
- Um `<select>` para `status` (Ativo / Em breve).
- Um `<textarea>` para `highlightFeatures` (placeholder "Um benefício por linha").

- [ ] **Step 3: Enviar no payload**

No `handleSubmit`, no `payload`, incluir:

```typescript
status: form.status,
highlightFeatures: form.highlightFeatures
  .split("\n").map((s) => s.trim()).filter(Boolean),
```

- [ ] **Step 4: Garantir que a server page passa os campos novos**

Conferir `src/app/admin/configuracoes/planos/page.tsx` (a que injeta `initialPlans`): o `select`/`include` do prisma precisa trazer `status` e `highlightFeatures`. Ajustar se necessário.

- [ ] **Step 5: Verificar build + teste manual**

Run: `npx tsc --noEmit`
Expected: sem erros.
Manual: editar um plano no admin, mudar status/bullets, salvar → recarregar `/` e ver refletir em ≤60s.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/configuracoes/planos/planos-client.tsx src/app/admin/configuracoes/planos/page.tsx
git commit -m "feat(planos): admin edita status (Ativo/Em breve) e bullets de copy (highlightFeatures)"
```

---

## Task 14: Aba admin `/admin/interessados`

**Files:**
- Create: `src/app/api/admin/plan-interests/route.ts`
- Create: `src/app/admin/interessados/page.tsx`
- Create: `src/app/admin/interessados/interessados-client.tsx`
- Modify: `src/app/admin/admin-nav.tsx`

- [ ] **Step 1: API GET (lista + CSV)**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const url = new URL(request.url);
  const planSlug = url.searchParams.get("planSlug") || undefined;
  const format = url.searchParams.get("format");

  const items = await prisma.planInterest.findMany({
    where: planSlug ? { planSlug } : undefined,
    orderBy: { createdAt: "desc" },
  });

  if (format === "csv") {
    const header = "nome,email,telefone,empresa,plano,data\n";
    const rows = items.map((i) =>
      [i.name, i.email, i.phone ?? "", i.companyName ?? "", i.planSlug, i.createdAt.toISOString()]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    return new NextResponse(header + rows, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="interessados.csv"` },
    });
  }

  return NextResponse.json({ items });
}
```

- [ ] **Step 2: Server page**

`src/app/admin/interessados/page.tsx` — busca inicial via prisma (mesmo padrão de `configuracoes/planos/page.tsx`: checar admin session no layout já existente) e renderiza `<InteressadosClient initial={items} />`.

- [ ] **Step 3: Client (tabela + filtro + export)**

`interessados-client.tsx` — tabela (nome, e-mail, telefone, empresa, plano, data), `<select>` de filtro por plano que refaz fetch `GET /api/admin/plan-interests?planSlug=`, e botão "Exportar CSV" que aponta para `?format=csv`.

- [ ] **Step 4: Link no admin-nav**

Em `src/app/admin/admin-nav.tsx`, na seção "Principal", adicionar após Clientes:

```tsx
{ href: "/admin/interessados", icon: UsersRound, label: "Interessados", exact: false },
```

(importar um ícone livre, ex. `Mail` ou reusar `UsersRound`).

- [ ] **Step 5: Verificar build + teste manual**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.
Manual: enviar "Quero ser avisado" na landing → ver a linha aparecer em `/admin/interessados` e no CSV.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/plan-interests src/app/admin/interessados src/app/admin/admin-nav.tsx
git commit -m "feat(planos): aba admin /interessados (lista, filtro por plano, export CSV)"
```

---

## Task 15: Verificação final (sincronização end-to-end)

**Files:** nenhum (validação).

- [ ] **Step 1: Suite de testes**

Run: `npx vitest run`
Expected: tudo verde (incl. novos `plan-display`, `plan-interest`). Corrigir regressões.

- [ ] **Step 2: tsc + build limpos**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 3: Caça a hardcoded remanescente**

Run: `grep -rn "149,90\|189,90\|monthlyPrice\|from \"@/content/pricing\"" src/ | grep -v test`
Expected: nenhum preço de plano literal em consumidor de UI; nenhum import de `plans` de `content/pricing`.

- [ ] **Step 4: Teste de sincronização manual (o critério do dono)**

Com `npm run dev`:
1. Editar no admin o `priceMonthly` do Básico (ex.: 15990) e salvar.
2. Aguardar ≤60s, recarregar `/`, `/precos`, `/registro` → preço novo (R$ 159,90) em todos.
3. Conferir JSON-LD: `curl -s localhost:3000/precos | grep -o 'price[^,]*'` reflete o novo valor.
4. Mudar `status` do Básico+NF para ACTIVE e voltar → some/aparece o selo "Em breve" e o botão de compra.
5. Editar `trialDays` do Básico → `/registro` mostra o novo número.

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A && git commit -m "test(planos): verificação end-to-end da sincronização site↔admin"
```

---

## Notas para o executor

- **Não** mexer no motor de gating (`plan-feature-catalog.ts`, `with-plan-feature.ts`) — fora de escopo. O `AVAILABLE_FEATURES` legado do admin permanece (dívida conhecida); `highlightFeatures` é só copy, independente do gating.
- **Não** tocar Focus NFe / emissão fiscal nem WhatsApp automático.
- Working tree pode conter mudanças de outras frentes — sempre `git add` por caminho explícito listado em cada Task, nunca `git add -A` (exceto Task 15 step 5, após conferir `git status`).
- Honestidade da copy é regra dura: nenhum item novo na lista de features sem confirmação no código.
