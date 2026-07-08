# Detalhe de Tarefa Automática (drawer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada linha da tabela "Tarefas automáticas" em `/admin/configuracoes/saude` fica clicável e abre um drawer lateral read-only com detalhes da tarefa em linguagem de dono, incluindo a sanitização do erro técnico (que hoje vaza cru ao client).

**Architecture:** 4 unidades: (1) helper puro `sanitizeCronError` no servidor; (2) rename de `CronHealthRow.lastError` → `lastErrorSafe` em `getCronHealth` para não expor texto cru ao client; (3) 2 campos novos em `CronMeta` (`ifStops`, `frequencyLabel`) + helper `frequencyLabelFor`; (4) componente client `CronDetailSheet` (shadcn Sheet) + `<tr>` clicável em `pulso-view.tsx`.

**Tech Stack:** Next.js 16 (App Router), React client components, TypeScript, shadcn `Sheet`, Vitest.

**Environment notes:** Sem migração (o campo do banco `CronHeartbeat.lastError` continua cru; a sanitização é só na fronteira de exibição). Sem endpoint/rota novos. Testes rodam com `./node_modules/.bin/vitest`; typecheck com `./node_modules/.bin/tsc --noEmit`; build com `./node_modules/.bin/next build`. NÃO tocar em `finishCronRun`/`beginCronRun` (gravam o cru no banco de propósito). O `rtk` hook pode quebrar `npx` → usar `./node_modules/.bin/`.

---

## File Structure

- **Create** `src/lib/cron-error-sanitizer.ts` — `sanitizeCronError(raw)`: redige PII + trunca. Puro, testável.
- **Create** `src/lib/cron-error-sanitizer.test.ts` — testes do sanitizer.
- **Modify** `src/services/system-health-labels.ts` — add `ifStops?`/`frequencyLabel?` a `CronMeta` + preencher os 13 crons; add helper `frequencyLabelFor`.
- **Create** `src/services/system-health-labels.test.ts` — testes de `frequencyLabelFor` + fallback de `cronMeta`.
- **Modify** `src/services/cron-heartbeat.service.ts` — em `CronHealthRow`, trocar `lastError` por `lastErrorSafe`; aplicar `sanitizeCronError` em `getCronHealth`.
- **Modify** `src/services/cron-heartbeat.service.test.ts` — ajustar asserção que dependa do shape (se houver).
- **Create** `src/app/admin/(painel)/configuracoes/saude/state-styles.ts` — extrair `STATE_STYLES` de `pulso-view.tsx` para módulo compartilhado.
- **Modify** `src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx` — importar `STATE_STYLES` do novo módulo; `<tr>` clicável + estado `selected` + render do `CronDetailSheet`.
- **Create** `src/app/admin/(painel)/configuracoes/saude/cron-detail-sheet.tsx` — o drawer.

---

## Task 1: Helper de sanitização de erro (`sanitizeCronError`)

**Files:**
- Create: `src/lib/cron-error-sanitizer.ts`
- Test: `src/lib/cron-error-sanitizer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/cron-error-sanitizer.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeCronError } from "./cron-error-sanitizer";

describe("sanitizeCronError", () => {
  it("retorna null para entrada null", () => {
    expect(sanitizeCronError(null)).toBeNull();
  });

  it("redige e-mail", () => {
    expect(sanitizeCronError("falha para joao@cliente.com ao enviar")).toBe(
      "falha para [redigido] ao enviar",
    );
  });

  it("redige CPF com e sem máscara", () => {
    expect(sanitizeCronError("cpf 123.456.789-09 inválido")).toBe("cpf [redigido] inválido");
    expect(sanitizeCronError("doc 12345678909 duplicado")).toBe("doc [redigido] duplicado");
  });

  it("redige CNPJ", () => {
    expect(sanitizeCronError("empresa 12.345.678/0001-90 sem plano")).toBe(
      "empresa [redigido] sem plano",
    );
  });

  it("redige telefone brasileiro", () => {
    expect(sanitizeCronError("contato (85) 99999-8888 recusado")).toBe(
      "contato [redigido] recusado",
    );
  });

  it("trunca acima de 300 caracteres", () => {
    const long = "x".repeat(400);
    const out = sanitizeCronError(long)!;
    expect(out.length).toBeLessThanOrEqual(303); // 300 + "…" tolerância
    expect(out.endsWith("…")).toBe(true);
  });

  it("mantém texto limpo intacto", () => {
    expect(sanitizeCronError("Timeout ao conectar no Asaas")).toBe("Timeout ao conectar no Asaas");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/lib/cron-error-sanitizer.test.ts`
Expected: FAIL — "Failed to resolve import ./cron-error-sanitizer" (arquivo não existe).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/cron-error-sanitizer.ts

/**
 * Sanitiza a mensagem de erro CRUA de um cron antes de exibi-la ao super admin.
 *
 * O `lastError` gravado por finishCronRun é `err.message` cru — erros de
 * Prisma/Asaas/Resend podem embutir PII de clientes das óticas (e-mail, CPF,
 * CNPJ, telefone). Esta função redige o que reconhece (best-effort) e trunca.
 *
 * A truncagem é o BACKSTOP real de contenção; a lista de regex não é exaustiva
 * (connection strings, tokens e UUIDs podem passar) — não sobre-invista nela.
 */
const MAX_LEN = 300;

const REDACTIONS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // e-mail
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, // CNPJ com máscara
  /\d{3}\.\d{3}\.\d{3}-\d{2}/g, // CPF com máscara
  /\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g, // telefone BR (com/sem parênteses e hífen)
  /\b\d{11}\b/g, // CPF sem máscara (11 dígitos soltos)
];

export function sanitizeCronError(raw: string | null): string | null {
  if (raw === null) return null;
  let out = raw;
  for (const re of REDACTIONS) {
    out = out.replace(re, "[redigido]");
  }
  if (out.length > MAX_LEN) {
    out = out.slice(0, MAX_LEN) + "…";
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/lib/cron-error-sanitizer.test.ts`
Expected: PASS (7 testes).

> Nota de ordem das regex: telefone BR roda ANTES de CPF-sem-máscara para o telefone `85999998888` (11 dígitos) casar como telefone, não como CPF. O CNPJ com máscara roda antes do CPF com máscara (padrões distintos, sem conflito). Se algum teste de telefone/CPF falhar, ajuste a ordem — os testes são a fonte de verdade.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cron-error-sanitizer.ts src/lib/cron-error-sanitizer.test.ts
git commit -m "feat(admin): sanitizeCronError — redige PII e trunca erro de cron"
```

---

## Task 2: Não expor `lastError` cru ao client (`lastErrorSafe`)

**Files:**
- Modify: `src/services/cron-heartbeat.service.ts:57` (campo da interface) e `:158` (montagem)
- Modify: `src/services/cron-heartbeat.service.test.ts` (só se alguma asserção depender de `lastError` no `CronHealthRow`)

- [ ] **Step 1: Verificar se o teste existente referencia o campo**

Run: `grep -n "lastError" src/services/cron-heartbeat.service.test.ts`
Expected: se aparecer asserção sobre `CronHealthRow.lastError` (o resultado de `getCronHealth`), ela precisará virar `lastErrorSafe` no Step 4. Se só aparecer sobre o write no banco (`finishCronRun`), não mexer — o banco continua cru.

- [ ] **Step 2: Renomear o campo na interface `CronHealthRow`**

Em `src/services/cron-heartbeat.service.ts`, trocar a linha 57:

```typescript
  lastStatus: string | null;
  lastErrorSafe: string | null; // sanitizado — NUNCA o err.message cru (PII/LGPD)
  lastDurationMs: number | null;
```

- [ ] **Step 3: Aplicar `sanitizeCronError` em `getCronHealth`**

No topo do arquivo, adicionar o import:

```typescript
import { sanitizeCronError } from "@/lib/cron-error-sanitizer";
```

Na montagem do `result.push({...})` dentro de `getCronHealth` (por volta da linha 158), trocar:

```typescript
      lastError: hb?.lastError ?? null,
```
por:
```typescript
      lastErrorSafe: sanitizeCronError(hb?.lastError ?? null),
```

- [ ] **Step 4: Ajustar teste se necessário**

Se o Step 1 encontrou asserção sobre o `CronHealthRow.lastError`, renomear para `lastErrorSafe` e ajustar o valor esperado ao texto sanitizado. Caso contrário, pular.

- [ ] **Step 5: Rodar os testes do serviço + typecheck local**

Run: `./node_modules/.bin/vitest run src/services/cron-heartbeat.service.test.ts src/services/system-health.service.test.ts`
Expected: PASS. Se falhar por `lastError` inexistente em algum consumidor, corrigir o consumidor para `lastErrorSafe` (o `pulso-view.tsx` só usa esse campo no drawer — Task 6).

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -i "lastError" || echo "sem referência pendente a lastError"`
Expected: "sem referência pendente a lastError" OU as linhas exatas a corrigir (todas viram `lastErrorSafe`).

- [ ] **Step 6: Commit**

```bash
git add src/services/cron-heartbeat.service.ts src/services/cron-heartbeat.service.test.ts
git commit -m "fix(admin): não expor lastError cru ao client — CronHealthRow.lastErrorSafe"
```

---

## Task 3: Metadados `ifStops` + `frequencyLabel` e helper `frequencyLabelFor`

**Files:**
- Modify: `src/services/system-health-labels.ts` (interface `CronMeta` + `CRON_META` + helper)
- Test: `src/services/system-health-labels.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/system-health-labels.test.ts
import { describe, it, expect } from "vitest";
import { cronMeta, frequencyLabelFor } from "./system-health-labels";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe("frequencyLabelFor", () => {
  it("usa o override quando presente", () => {
    expect(frequencyLabelFor(DAY, "1× por dia, de manhã")).toBe("1× por dia, de manhã");
  });
  it("deriva 1×/dia de DAY", () => {
    expect(frequencyLabelFor(DAY)).toMatch(/dia/);
  });
  it("deriva 'a cada hora' de HOUR", () => {
    expect(frequencyLabelFor(HOUR)).toMatch(/hora/);
  });
  it("deriva minutos de 5min", () => {
    expect(frequencyLabelFor(5 * MINUTE)).toMatch(/5 min/);
  });
});

describe("cronMeta — novos campos", () => {
  it("dunning tem ifStops preenchido", () => {
    expect(cronMeta("dunning").ifStops).toBeTruthy();
  });
  it("jobKey desconhecido: ifStops ausente (undefined), não quebra", () => {
    const m = cronMeta("inexistente-xyz");
    expect(m.label).toBe("inexistente-xyz");
    expect(m.ifStops).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/services/system-health-labels.test.ts`
Expected: FAIL — `frequencyLabelFor` não exportado / `ifStops` não existe.

- [ ] **Step 3: Estender a interface `CronMeta`**

Em `src/services/system-health-labels.ts`, dentro de `interface CronMeta` (após `external?`):

```typescript
  /** Efeito no negócio se esta tarefa parar. 1 frase de dono. Opcional. */
  ifStops?: string;
  /** Frequência em linguagem de dono ("1× por dia, de manhã"). Opcional — sem isso, derivada de expectedEveryMs. */
  frequencyLabel?: string;
```

- [ ] **Step 4: Preencher `ifStops` + `frequencyLabel` nos 13 crons**

Adicionar os campos a cada entrada de `CRON_META`. Valores (fiéis ao `does`/área de cada cron):

```typescript
  dunning: { /* ...existente... */ ifStops: "Clientes inadimplentes deixam de receber cobrança — dinheiro parado na rua.", frequencyLabel: "1× por dia, de manhã" },
  "invoice-reminders": { /* ... */ ifStops: "Assinantes deixam de receber o e-mail da fatura e podem esquecer de pagar.", frequencyLabel: "1× por dia" },
  "reconcile-billing": { /* ... */ ifStops: "Divergências entre o que você cobra e o que o Asaas registra passam despercebidas.", frequencyLabel: "1× por dia" },
  "subscription-watch": { /* ... */ ifStops: "Óticas em teste grátis podem virar inadimplentes sem aviso de fim de período.", frequencyLabel: "1× por dia" },
  "retry-finance-entries": { /* ... */ ifStops: "Lançamentos de caixa que falharam ficam sem ser refeitos — relatórios ficam furados.", frequencyLabel: "1× por dia" },
  "email-queue": { /* ... */ ifStops: "E-mails transacionais (cobrança, avisos) param de sair.", frequencyLabel: "1× por dia" },
  "whatsapp-messages": { /* ... */ ifStops: "As mensagens de WhatsApp param de ser processadas.", frequencyLabel: "1× por dia" },
  "whatsapp-dispatch": { /* ... */ ifStops: "As mensagens de WhatsApp param de ser enviadas.", frequencyLabel: "a cada 5 minutos" },
  "whatsapp-qualify": { /* ... */ ifStops: "Os leads do WhatsApp param de ser qualificados pela IA.", frequencyLabel: "a cada 5 minutos" },
  "whatsapp-retention": { /* ... */ ifStops: "As ações de retenção por WhatsApp param de rodar.", frequencyLabel: "1× por dia" },
  "mark-delayed": { /* ... */ ifStops: "Ordens de serviço atrasadas deixam de ser sinalizadas.", frequencyLabel: "1× por dia" },
  "recalc-health": { /* ... */ ifStops: "O score de saúde das óticas fica desatualizado — você perde o sinal de quem está em risco.", frequencyLabel: "1× por dia" },
  "sync-all-companies": { /* ... */ ifStops: "As configurações padrão param de se propagar entre as óticas.", frequencyLabel: "1× por dia" },
  "health-alert": { /* ... */ ifStops: "Você para de receber o e-mail de alerta quando algo cai — o vigia fica cego.", frequencyLabel: "a cada hora" },
```

> Preserve os campos `label`/`does`/`area`/`external` que já existem em cada entrada; só ADICIONE `ifStops` e `frequencyLabel`.

- [ ] **Step 5: Implementar `frequencyLabelFor` e exportá-lo**

No fim de `system-health-labels.ts` (unidades de tempo já podem existir — se não, defina localmente):

```typescript
/**
 * Frequência em linguagem de dono. Usa o override do meta se houver; senão
 * deriva de expectedEveryMs (aproximação amigável, sem jargão).
 */
export function frequencyLabelFor(expectedEveryMs: number, override?: string): string {
  if (override) return override;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (expectedEveryMs >= DAY) return "aproximadamente 1× por dia";
  if (expectedEveryMs >= HOUR) return "a cada hora";
  const mins = Math.max(1, Math.round(expectedEveryMs / MIN));
  return `a cada ${mins} min`;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/services/system-health-labels.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 7: Commit**

```bash
git add src/services/system-health-labels.ts src/services/system-health-labels.test.ts
git commit -m "feat(admin): cronMeta ganha ifStops + frequencyLabel + helper frequencyLabelFor"
```

---

## Task 4: Extrair `STATE_STYLES` para módulo compartilhado

**Files:**
- Create: `src/app/admin/(painel)/configuracoes/saude/state-styles.ts`
- Modify: `src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx` (remover a const local, importar)

- [ ] **Step 1: Criar o módulo com o `STATE_STYLES` movido**

```typescript
// src/app/admin/(painel)/configuracoes/saude/state-styles.ts
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { HealthState } from "@/services/system-health.service";

/** Paleta dos 4 estados, com rótulos em linguagem de dono. Compartilhada
 *  entre a tabela (pulso-view) e o drawer (cron-detail-sheet). */
export const STATE_STYLES: Record<
  HealthState,
  { label: string; dot: string; text: string; bg: string; border: string; Icon: LucideIcon }
> = {
  healthy: {
    label: "Tudo certo",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  warning: {
    label: "Atenção",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-900",
    Icon: AlertTriangle,
  },
  critical: {
    label: "Problema",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-900",
    Icon: XCircle,
  },
  unknown: {
    label: "Aguardando",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/40",
    border: "border-slate-200 dark:border-slate-800",
    Icon: HelpCircle,
  },
};
```

- [ ] **Step 2: Remover a const local de `pulso-view.tsx` e importar do módulo**

Em `src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx`, DELETAR o bloco `const STATE_STYLES = {...}` (linhas ~30-67) e adicionar o import perto dos outros:

```typescript
import { STATE_STYLES } from "./state-styles";
```

Ajustar os imports de `lucide-react`. Após deletar o `STATE_STYLES`:
- **MANTER `CheckCircle2`** — ainda é usado em `pulso-view.tsx:327` (check de incidentes resolvidos).
- **REMOVER `XCircle`, `HelpCircle`, `AlertTriangle`** — ficam sem uso.

⚠️ Antes de remover qualquer ícone, faça `grep -n "XCircle\|HelpCircle\|AlertTriangle\|CheckCircle2" src/app/admin/\(painel\)/configuracoes/saude/pulso-view.tsx` e remova apenas os que aparecem SÓ no import (0 usos no corpo). `noUnusedLocals` está OFF no tsconfig, então o `tsc` NÃO acusa import não usado — o `next lint`/build (Task 7) é quem pega. Não confie no typecheck para essa limpeza; confie no grep.

- [ ] **Step 3: Verificar typecheck**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -iE "state-styles|pulso-view" || echo "ok"`
Expected: "ok" (0 erros nesses arquivos).

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(painel)/configuracoes/saude/state-styles.ts" "src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx"
git commit -m "refactor(admin): extrair STATE_STYLES para módulo compartilhado da Saúde"
```

---

## Task 5: Componente `CronDetailSheet` (o drawer)

**Files:**
- Create: `src/app/admin/(painel)/configuracoes/saude/cron-detail-sheet.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/app/admin/(painel)/configuracoes/saude/cron-detail-sheet.tsx
"use client";

import { AlertTriangle, PlugZap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { CronHealthRow } from "@/services/cron-heartbeat.service";
import { cronMeta, frequencyLabelFor } from "@/services/system-health-labels";
import { STATE_STYLES } from "./state-styles";

function formatDateTime(iso: string | null): string {
  if (!iso) return "ainda não rodou";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Drawer read-only com o detalhe de uma tarefa automática (cron). Alimentado
 * pelo CronHealthRow que a linha já tem — zero fetch. O erro exibido é o
 * `lastErrorSafe` (já sanitizado no servidor); o cru nunca chega aqui.
 *
 * Gate de acesso: herdado da página /admin/configuracoes/saude (SUPER_ADMIN).
 * Se um dia afrouxar a role dessa tela, revalidar a sanitização de erro.
 */
export function CronDetailSheet({
  row,
  onOpenChange,
}: {
  row: CronHealthRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = row ? cronMeta(row.jobKey) : null;
  const s = row ? STATE_STYLES[row.state] : null;

  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        {row && meta && s && (
          <>
            <SheetHeader>
              <SheetTitle>{row.label}</SheetTitle>
              <SheetDescription>{row.does}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5 text-sm">
              {/* Situação */}
              <div className={`rounded-lg border ${s.border} ${s.bg} p-3`}>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              </div>

              {/* Se esta tarefa parar */}
              {meta.ifStops && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Se esta tarefa parar</p>
                  <p className="text-xs text-muted-foreground">{meta.ifStops}</p>
                </div>
              )}

              {/* Frequência */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Com que frequência roda</p>
                <p className="text-xs text-muted-foreground">
                  {frequencyLabelFor(row.expectedEveryMs, meta.frequencyLabel)}
                </p>
              </div>

              {/* Último ciclo */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground mb-1">Último ciclo</p>
                <p className="text-xs text-muted-foreground">
                  Começou: {formatDateTime(row.lastStartedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Terminou com sucesso: {formatDateTime(row.lastSucceededAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Duração: {formatDuration(row.lastDurationMs)}
                </p>
              </div>

              {/* Erro (já sanitizado) */}
              {row.lastErrorSafe && (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-xs font-medium text-foreground">
                    Ver detalhe técnico do último erro
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                    {row.lastErrorSafe}
                  </pre>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Se o problema persistir, avise o suporte técnico.
                  </p>
                </details>
              )}

              {/* Aviso de gatilho externo */}
              {row.external && (
                <div className="flex gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3">
                  <PlugZap className="h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p className="text-xs text-muted-foreground">
                    Esta tarefa é acionada por um serviço externo (cron-job.org). Se ficar muito
                    tempo sem rodar, reative o gatilho.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verificar typecheck do componente**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -i "cron-detail-sheet" || echo "ok"`
Expected: "ok". Se reclamar de `AlertTriangle` não usado, removê-lo do import (deixei só `PlugZap` em uso; ajuste conforme o typecheck).

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(painel)/configuracoes/saude/cron-detail-sheet.tsx"
git commit -m "feat(admin): CronDetailSheet — drawer read-only de detalhe de tarefa"
```

---

## Task 6: Linha clicável em `pulso-view.tsx`

**Files:**
- Modify: `src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx`

- [ ] **Step 1: Adicionar imports e estado**

No topo do arquivo, adicionar (após os imports existentes):

```typescript
import { useState } from "react";
import type { CronHealthRow } from "@/services/cron-heartbeat.service";
import { CronDetailSheet } from "./cron-detail-sheet";
```

Dentro de `export function PulsoView(...)`, no início do corpo (após `const overall = ...`), adicionar:

```typescript
  const [selectedCron, setSelectedCron] = useState<CronHealthRow | null>(null);
```

- [ ] **Step 2: Tornar o `<tr>` dos crons clicável**

Localizar o `<tr key={row.jobKey} className="border-t border-border">` (dentro de `snapshot.cronRows.map`) e substituir a abertura da tag por:

```tsx
                  <tr
                    key={row.jobKey}
                    onClick={() => setSelectedCron(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedCron(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ver detalhes de ${row.label}`}
                    className="border-t border-border cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40"
                  >
```

- [ ] **Step 3: Renderizar o drawer**

Logo após o fechamento da `</table>` (ou do `<div>` que a envolve) na seção "Tarefas automáticas", adicionar:

```tsx
        <CronDetailSheet row={selectedCron} onOpenChange={(open) => !open && setSelectedCron(null)} />
```

- [ ] **Step 4: Verificar typecheck**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -i "pulso-view" || echo "ok"`
Expected: "ok".

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx"
git commit -m "feat(admin): linha de tarefa automática clicável abre o drawer de detalhe"
```

---

## Task 7: Verificação completa (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros. Se houver erro por `lastError` remanescente em algum consumidor, trocá-lo por `lastErrorSafe` e recommitar.

- [ ] **Step 2: Suíte de testes relevante**

Run: `./node_modules/.bin/vitest run src/lib/cron-error-sanitizer.test.ts src/services/system-health-labels.test.ts src/services/cron-heartbeat.service.test.ts src/services/system-health.service.test.ts`
Expected: todos PASS.

- [ ] **Step 3: Suíte completa**

Run: `./node_modules/.bin/vitest run`
Expected: todos PASS (nenhuma regressão).

- [ ] **Step 4: Lint (pega imports não usados que o tsc não vê)**

Run: `./node_modules/.bin/next lint --file "src/app/admin/(painel)/configuracoes/saude/pulso-view.tsx" 2>&1 | tail -20 || ./node_modules/.bin/next lint 2>&1 | tail -20`
Expected: sem erro de `no-unused-vars` nos arquivos tocados (especialmente ícones de `pulso-view.tsx`). Se acusar, remover o import ocioso e recommitar.

- [ ] **Step 5: Build de produção**

Run: `./node_modules/.bin/next build`
Expected: sucesso (o log `Dynamic server usage` em `/api/dashboard/onboarding-status` é ruído pré-existente, não fatal).

- [ ] **Step 6: Commit final (se sobrou algo)**

```bash
git add -A
git commit -m "chore(admin): finaliza detalhe de tarefa automática (drawer)" || echo "nada a commitar"
```
