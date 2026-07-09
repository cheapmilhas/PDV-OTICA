# Sinal de Saúde "IA parou de qualificar" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um 6º sinal de saúde (`key: "ai"`) em "O Pulso" que detecta quando a IA de qualificação de conversas parou de produzir leads (silêncio > 24h com IA ligada) e dispara e-mail de alerta pelo mecanismo existente.

**Architecture:** Uma função `summarizeAiQualification()` no padrão dos 5 sinais existentes de `system-health.service.ts` (mede idade da última qualificação via `AiTokenUsage` + se alguma ótica tem `iaEnabled`). Encaixa no snapshot (`signals.ai`, `worstState`, `buildBusinessAreas` área `whatsapp`), renderiza um `SignalCard`, e ganha a entrada na allowlist `SOURCE_BY_SIGNAL` do cron `health-alert` para o critical virar e-mail.

**Tech Stack:** Next.js 16, TypeScript, Prisma/Neon, Vitest.

**Environment notes:** Sem migração (`SystemEvent.source` é `String` livre). Tests: `./node_modules/.bin/vitest` (NÃO npx — rtk quebra npx). Typecheck: `./node_modules/.bin/tsc --noEmit`. `next lint` NÃO existe no Next 16.2.6. Path com parênteses precisa aspas no shell. **Contexto:** este monitor existe porque a IA parou em prod em 02/07 por chave Anthropic ausente e ninguém viu por 6 dias — o valor real é o e-mail do critical (Task 4).

---

## File Structure

- **Modify** `src/services/system-health.service.ts` — add `summarizeAiQualification()`; add `ai` ao `SystemHealthSnapshot.signals`, ao `getSystemHealthSnapshot` (Promise.all/worstState/signals), e ao `signalArea` de `buildBusinessAreas`.
- **Create** `src/services/system-health-ai-signal.test.ts` — testes dos 4 estados do sinal.
- **Modify** `src/services/system-event.service.ts` — add `"ai"` ao union `SystemEventSource`.
- **Modify** `src/app/api/cron/health-alert/route.ts` — add `ai: "ai"` ao `SOURCE_BY_SIGNAL`.
- **Modify** `src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx` — importar `BrainCircuit`, add ao `SIGNAL_ICONS` e ao array `signals` renderizado.

---

## Task 1: `summarizeAiQualification()` + estado no tipo

**Files:**
- Modify: `src/services/system-health.service.ts`
- Test: `src/services/system-health-ai-signal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/system-health-ai-signal.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const aiTokenUsageFindFirst = vi.fn();
const companySettingsFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiTokenUsage: { findFirst: (...a: unknown[]) => aiTokenUsageFindFirst(...a) },
    companySettings: { findFirst: (...a: unknown[]) => companySettingsFindFirst(...a) },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));

import { summarizeAiQualification } from "./system-health.service";

const NOW = new Date("2026-07-08T12:00:00.000Z");

describe("summarizeAiQualification", () => {
  beforeEach(() => {
    aiTokenUsageFindFirst.mockReset();
    companySettingsFindFirst.mockReset();
  });

  it("sem nenhuma ótica com IA ligada → unknown (cinza), sem alarme", async () => {
    companySettingsFindFirst.mockResolvedValue(null); // nenhuma iaEnabled=true
    aiTokenUsageFindFirst.mockResolvedValue(null);
    const s = await summarizeAiQualification(NOW);
    expect(s.key).toBe("ai");
    expect(s.state).toBe("unknown");
  });

  it("IA ligada + nunca qualificou (null) → critical", async () => {
    companySettingsFindFirst.mockResolvedValue({ companyId: "c1" });
    aiTokenUsageFindFirst.mockResolvedValue(null);
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("critical");
  });

  it("IA ligada + última há 30h → critical (menciona a data)", async () => {
    companySettingsFindFirst.mockResolvedValue({ companyId: "c1" });
    aiTokenUsageFindFirst.mockResolvedValue({ createdAt: new Date("2026-07-07T06:00:00.000Z") }); // 30h antes
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("critical");
    expect(s.detail).toMatch(/desde/);
  });

  it("IA ligada + última há 2h → healthy", async () => {
    companySettingsFindFirst.mockResolvedValue({ companyId: "c1" });
    aiTokenUsageFindFirst.mockResolvedValue({ createdAt: new Date("2026-07-08T10:00:00.000Z") }); // 2h antes
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("healthy");
  });

  it("fail-safe: erro de leitura → unknown (não derruba o snapshot)", async () => {
    companySettingsFindFirst.mockRejectedValue(new Error("db down"));
    const s = await summarizeAiQualification(NOW);
    expect(s.state).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/services/system-health-ai-signal.test.ts`
Expected: FAIL — `summarizeAiQualification` não exportado.

- [ ] **Step 3: Implement `summarizeAiQualification`**

Em `src/services/system-health.service.ts`, adicionar a função (perto de `checkSentry`/`summarizeIntegrations`). Usa `prisma` (já importado no arquivo) e `worstState` não é necessário aqui. Constante do limiar no topo do arquivo ou local:

```typescript
/** Silêncio máximo tolerado da IA de qualificação antes de acender o alarme. */
const AI_QUALIFY_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * "A IA parou de qualificar?" — mede RESULTADO (última qualificação com sucesso),
 * não execução do cron. O cron pode responder 200 e ainda assim a IA estar morta
 * (foi o incidente de 02/07: chave Anthropic ausente, falha por-conversa silenciosa).
 *
 * Regra (limiar chapado, por DELTA de tempo — nunca horário de parede, p/ não
 * repetir os bugs de fuso do repo):
 *  - nenhuma ótica com iaEnabled=true → unknown (cinza): está desligada por opção.
 *  - IA ligada + sem qualificação há > 24h (ou nunca) → critical.
 *  - IA ligada + última <= 24h → healthy.
 *
 * Fail-safe: erro de leitura → unknown (não derruba o snapshot inteiro).
 *
 * NOTA de índice: não há índice em `feature` sozinho; a query é um scan pequeno
 * (~900 linhas, N=1 ótica). findFirst(orderBy createdAt desc) em vez de aggregate.
 */
export async function summarizeAiQualification(now: Date = new Date()): Promise<HealthSignal> {
  const LABEL = "Inteligência do funil";
  try {
    const anyEnabled = await prisma.companySettings.findFirst({
      where: { iaEnabled: true },
      select: { companyId: true },
    });
    if (!anyEnabled) {
      return {
        key: "ai",
        label: LABEL,
        state: "unknown",
        detail: "A IA de qualificação está desligada em todas as óticas — isto é uma escolha, não um problema.",
        action: null,
      };
    }

    const last = await prisma.aiTokenUsage.findFirst({
      where: { feature: "lead_qualification" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const ageMs = last ? now.getTime() - last.createdAt.getTime() : Infinity;
    if (ageMs > AI_QUALIFY_STALE_MS) {
      const desde = last
        ? last.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : null;
      return {
        key: "ai",
        label: LABEL,
        state: "critical",
        detail: desde
          ? `A IA parou de transformar conversas em oportunidades — sem qualificações desde ${desde}.`
          : "A IA está ligada, mas nunca transformou uma conversa em oportunidade.",
        action: "Verifique a configuração de IA no super admin (a chave da Anthropic pode ter caído) ou avise o suporte técnico.",
      };
    }

    const horas = Math.max(1, Math.round(ageMs / (60 * 60 * 1000)));
    return {
      key: "ai",
      label: LABEL,
      state: "healthy",
      detail: `A IA está transformando conversas em oportunidades — última há ${horas}h.`,
      action: null,
    };
  } catch (err) {
    log.warn("summarizeAiQualification falhou (fail-safe → unknown)", { err });
    return {
      key: "ai",
      label: LABEL,
      state: "unknown",
      detail: "Não consegui verificar a IA de qualificação agora.",
      action: null,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/services/system-health-ai-signal.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/services/system-health.service.ts src/services/system-health-ai-signal.test.ts
git commit -m "feat(admin): summarizeAiQualification — sinal 'IA parou de qualificar'"
```

---

## Task 2: Encaixar o sinal `ai` no snapshot

**Files:**
- Modify: `src/services/system-health.service.ts`

- [ ] **Step 1: Add `ai` ao tipo `SystemHealthSnapshot.signals`**

Localizar a interface `SystemHealthSnapshot` e no objeto `signals` adicionar (após `integrations`):

```typescript
  signals: {
    database: HealthSignal;
    vercel: HealthSignal;
    sentry: HealthSignal;
    crons: HealthSignal;
    integrations: HealthSignal;
    ai: HealthSignal;
  };
```

- [ ] **Step 2: Chamar `summarizeAiQualification` em `getSystemHealthSnapshot`**

No corpo de `getSystemHealthSnapshot`, após `const integrations = summarizeIntegrations(...)`, adicionar:

```typescript
  const ai = await summarizeAiQualification(now);
```

(Pode também entrar no `Promise.all`, mas como `summarizeCrons`/`summarizeIntegrations` já rodam após o Promise.all de forma síncrona/derivada, um `await` sequencial aqui é consistente e simples. Ele faz 2 queries leves.)

- [ ] **Step 3: Incluir `ai.state` no `worstState` (overall)**

Trocar o array do `overall`:

```typescript
  const overall = worstState([
    database.state,
    vercel.state,
    sentry.state,
    crons.state,
    integrations.state,
    ai.state,
  ]);
```

- [ ] **Step 4: Incluir `ai` no objeto `signals` retornado**

```typescript
    signals: { database, vercel, sentry, crons, integrations, ai },
```

- [ ] **Step 5: Mapear `ai` → área `whatsapp` no `buildBusinessAreas`**

Passar `ai` para `buildBusinessAreas` e mapeá-lo. Na chamada:

```typescript
  const businessAreas = buildBusinessAreas(
    [database, vercel, sentry, integrations, ai],
    cronRows
  );
```

E dentro de `buildBusinessAreas`, no `signalArea`:

```typescript
  const signalArea: Record<string, BusinessArea> = {
    database: "sistema",
    vercel: "sistema",
    sentry: "sistema",
    integrations: "sistema",
    ai: "whatsapp",
  };
```

- [ ] **Step 6: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -i "system-health.service" || echo "ok"`
Expected: "ok". (Se algum consumidor do tipo `signals` reclamar de `ai` faltante, veja Task 5 — o pulso-view.)

- [ ] **Step 7: Commit**

```bash
git add src/services/system-health.service.ts
git commit -m "feat(admin): encaixa sinal 'ai' no snapshot (overall, signals, área whatsapp)"
```

---

## Task 3: `SystemEventSource` aceita `"ai"`

**Files:**
- Modify: `src/services/system-event.service.ts`

- [ ] **Step 1: Adicionar `"ai"` ao union**

```typescript
export type SystemEventSource =
  | "vercel"
  | "database"
  | "cron"
  | "integration"
  | "sentry"
  | "ai"
  | "manual";
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -i "system-event" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add src/services/system-event.service.ts
git commit -m "feat(admin): SystemEventSource aceita 'ai'"
```

---

## Task 4: E-mail — `SOURCE_BY_SIGNAL` reconhece `ai` (o ponto que fecha o laço)

**Files:**
- Modify: `src/app/api/cron/health-alert/route.ts`

- [ ] **Step 1: Adicionar `ai` ao `SOURCE_BY_SIGNAL`**

Sem esta linha, o `if (!severity || !source) continue;` (nesse cron) PULA o sinal `ai` → nunca vira SystemEvent → nunca e-maila. Adicionar:

```typescript
const SOURCE_BY_SIGNAL: Record<string, "vercel" | "database" | "cron" | "integration" | "sentry" | "ai"> = {
  database: "database",
  vercel: "vercel",
  crons: "cron",
  integrations: "integration",
  sentry: "sentry",
  ai: "ai",
};
```

(O tipo do Record precisa incluir `"ai"` no union do valor. `dedupeFor(source)` já é genérico — produz `ai:auto` na criação e na reconciliação, sem mudança.)

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -i "health-alert" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Verificar teste existente do cron**

Run: `grep -n "SOURCE_BY_SIGNAL\|signals\|ai" src/app/api/cron/health-alert/route.test.ts 2>/dev/null || echo "sem teste ou sem referência"`
Se o teste do cron monta um snapshot mockado e conta eventos por sinal, adicionar/ajustar um caso: um snapshot com `signals.ai` em `critical` gera um `SystemEvent` com `source: "ai"`. Se o teste não cobre isso, adicionar um caso mínimo seguindo o padrão do arquivo. Se o mock do snapshot não tiver o campo `ai`, adicioná-lo como `healthy` nos casos existentes para não quebrar o tipo.

- [ ] **Step 4: Rodar o teste do cron**

Run: `./node_modules/.bin/vitest run src/app/api/cron/health-alert/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/health-alert/route.ts src/app/api/cron/health-alert/route.test.ts
git commit -m "feat(admin): health-alert e-maila o sinal 'ai' (SOURCE_BY_SIGNAL)"
```

---

## Task 5: Renderizar o card `ai` em "O Pulso"

**Files:**
- Modify: `src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx`

- [ ] **Step 1: Importar o ícone `BrainCircuit`**

No import de `lucide-react` (que já traz Database, Cloud, etc.), adicionar `BrainCircuit`:

```typescript
import {
  HeartPulse, Database, Cloud, Bug, Clock, PlugZap, CheckCircle2,
  EyeOff, Lightbulb, CreditCard, Mail, MessageCircle, Cog, BrainCircuit,
} from "lucide-react";
```

- [ ] **Step 2: Adicionar `ai` ao `SIGNAL_ICONS`**

```typescript
const SIGNAL_ICONS: Record<string, LucideIcon> = {
  database: Database,
  vercel: Cloud,
  sentry: Bug,
  crons: Clock,
  integrations: PlugZap,
  ai: BrainCircuit,
};
```

- [ ] **Step 3: Incluir `snapshot.signals.ai` no array renderizado**

Localizar o array `signals` dentro de `PulsoView` (o que lista os 5 sinais para `<SignalCard>`). Adicionar `snapshot.signals.ai`:

```typescript
  const signals = [
    snapshot.signals.database,
    snapshot.signals.vercel,
    snapshot.signals.crons,
    snapshot.signals.integrations,
    snapshot.signals.sentry,
    snapshot.signals.ai,
  ];
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -i "pulso-view" || echo "ok"`
Expected: "ok".

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx"
git commit -m "feat(admin): card do sinal 'IA parou de qualificar' em O Pulso"
```

---

## Task 6: Verificação completa (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 2: Testes do sinal + cron**

Run: `./node_modules/.bin/vitest run src/services/system-health-ai-signal.test.ts src/services/system-health.service.test.ts src/app/api/cron/health-alert/route.test.ts`
Expected: todos PASS.

- [ ] **Step 3: Suíte completa**

Run: `./node_modules/.bin/vitest run`
Expected: todos PASS (sem regressão).

- [ ] **Step 4: Build de produção**

Run: `./node_modules/.bin/next build`
Expected: sucesso (o log `Dynamic server usage` em `/api/dashboard/onboarding-status` é ruído pré-existente).

- [ ] **Step 5: Commit final (se sobrou algo)**

```bash
git add -A && git commit -m "chore(admin): finaliza sinal IA parou de qualificar" || echo "nada a commitar"
```
