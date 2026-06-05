# Cockpit Didático + Aba de Resolução — Design

**Data:** 2026-06-05
**Branch:** `feature/cockpit-monitoramento` (continuação)
**Status:** Em revisão

## Contexto

O cockpit `/admin/monitoramento` (Fases 1-5, já em prod em vis.app.br) entrega observabilidade real, mas com **linguagem de engenheiro**: "Latência p95", "Memória RSS", "Cache hit", "Slow queries". O dono do SaaS (usuário leigo em termos técnicos) não consegue interpretar nem agir sobre esses dados.

Dois problemas a resolver:
1. **Didática:** cada métrica técnica precisa virar uma frase clara em português com semáforo (🟢🟡🔴).
2. **Acionabilidade:** falta um lugar onde o dono *resolve* os problemas detectados — não só vê os números.

O sistema já detecta estados problemáticos (DB lento, taxa de erro, `billingSyncPending`, faturas `OVERDUE`, trials vencendo, empresas `SUSPENDED`, `healthCategory` crítica) e já tem um **motor de ações declarativo** (Fase 3: blueprints com auditoria tripla + ActionModal gerado por schema). Este design **conecta detecção → ação**, sem inventar ações novas.

## Decisões do dono (2026-06-05)

- **Layout:** Opção A — o cockpit ganha 2 abas: **Visão Geral** (cards didáticos) e **Resolução** (cartões acionáveis). Tudo num destino só.
- **Botão "Resolver":** sempre abre modal de confirmação (preserva auditoria; ações de risco pedem motivo). Sem ação de 1 clique.
- **Escopo:** todos os 7 tipos de problema detectáveis.

## Objetivos

1. Traduzir as métricas do cockpit para linguagem leiga, com semáforo + tooltip explicativo.
2. Adicionar a aba **Resolução**: lista de problemas detectados (ordenados por severidade) como cartões acionáveis.
3. Cada cartão "Resolver" abre o `ActionModal` existente (Fase 5), reusando o motor de ações com auditoria.
4. Resumo no topo do cockpit: "Tudo certo" vs. "N itens precisam de atenção".

## Não-objetivos (YAGNI)

- Resolver problemas de infraestrutura automaticamente (reiniciar servidor, escalar DB).
- UI editável de regras de detecção (limiares ficam em constantes no código).
- Notificações push / e-mail de alerta.
- Ações novas de banco — só reusar os blueprints existentes.
- Histórico de problemas resolvidos (timeline) — fica para depois.

---

## Arquitetura

Quatro camadas, seguindo o padrão já estabelecido no projeto (lógica pura em `src/lib/`, testável; async fino; UI client com tipos locais).

### 1. Detector de problemas (puro) — `src/lib/monitoring/issues.ts`

O coração. Função **pura e testável** que recebe os dados já coletados e retorna a lista de problemas.

```ts
export type IssueSeverity = "critical" | "warning" | "info";
export type IssueCategory = "system" | "client";

export interface Issue {
  id: string;                  // key React, único entre detectores (ex.: "billing_sync:<companyId>")
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;               // didático, pt-BR ("Cobrança não sincronizada")
  explanation: string;         // 1-2 frases: o que é + por que importa
  // empresa-alvo (quando aplicável) — alimenta o ActionModal
  companyId?: string;
  companyName?: string;
  // ação sugerida: id de blueprint do registry OU ação especial (ex.: "view_logs")
  action?: {
    kind: "blueprint" | "link" | "info";
    blueprintId?: string;      // quando kind="blueprint" (ex.: "extend_trial")
    href?: string;             // quando kind="link" (ex.: /admin/clientes/[id])
    label: string;             // texto do botão ("Estender trial", "Ver cliente")
  };
}
```

A lógica de detecção é **um conjunto de funções puras pequenas**, uma por tipo de problema, combinadas por `detectIssues(input)`. Cada uma recebe dados simples (não toca banco) e devolve `Issue[]`.

**Entrada de `detectIssues`** (montada pela camada async a partir do que já temos):

```ts
export interface IssueInput {
  pulse: SystemPulse;                    // já existe (Fase 4)
  trends: SystemTrends;                  // já existe
  problemCompanies: ProblemCompany[];    // NOVO: empresas em estado problemático
}

// ProblemCompany é uma PROJEÇÃO ACHATADA de Company + sua Subscription + contagem
// de faturas vencidas. ATENÇÃO aos donos dos campos no schema real:
//   - Company:       id, name, isBlocked, healthCategory
//   - Subscription:  status, trialEndsAt, pastDueSince, billingSyncPending
//   - Invoice:       overdueInvoiceCount/overdueTotalCents (agregado de OVERDUE)
// O achatamento é feito em getProblemCompanies (§3), não aqui. Os detectores
// consomem este DTO plano e NÃO sabem da origem (Company vs Subscription).
export interface ProblemCompany {
  id: string;                                  // Company.id
  name: string;                                // Company.name
  isBlocked: boolean;                          // Company.isBlocked
  healthCategory: HealthCategory | null;       // Company.healthCategory
  subscriptionStatus: SubscriptionStatus | null; // Subscription.status (da sub relevante)
  trialEndsAt: Date | null;                    // Subscription.trialEndsAt
  pastDueSince: Date | null;                   // Subscription.pastDueSince
  billingSyncPending: boolean;                 // Subscription.billingSyncPending
  overdueInvoiceCount: number;                 // count(Invoice WHERE status=OVERDUE)
  overdueTotalCents: number;                   // sum(Invoice.total WHERE status=OVERDUE)
}
```

### 2. Os detectores (7 tipos, 8 linhas — trial dividido em vencendo/vencido)

| # | Problema | Condição de detecção | Severidade | Ação ("Resolver") |
|---|---|---|---|---|
| 1 | **Sistema lento / fora do ar** | `pulse.db.status !== "ok"` ou `pulse.status === "down"` | down→critical, degraded→warning | `kind:"info"` — "Verificar novamente" (reexecuta o pulse) |
| 2 | **Muitos erros** | `pulse.errorRatePct >= 5` (e `reqCount` mínimo p/ evitar ruído) | critical | `kind:"link"` → painel de logs / Sentry |
| 3 | **Cobrança não sincronizada** | `company.billingSyncPending === true` | warning | `kind:"link"` → `/admin/clientes/[id]` (ver detalhes; reprocessamento manual) |
| 4 | **Empresa inadimplente** | `company.overdueInvoiceCount > 0` | critical | `kind:"link"` → `/admin/clientes/[id]` (decidir: reativar/cobrar/cancelar) |
| 5a | **Trial vencendo** | `status==="TRIAL"` e `trialEndsAt` entre agora e +3 dias | info | `kind:"blueprint"` → `extend_trial` |
| 5b | **Trial vencido** | `status==="TRIAL_EXPIRED"` (OU `status==="TRIAL"` e `trialEndsAt` já passou) | warning | `kind:"link"` → `/admin/clientes/[id]` (ver nota) |
| 6 | **Saúde crítica** | `healthCategory === "CRITICAL"` | warning | `kind:"link"` → `/admin/clientes/[id]` |
| 7 | **Empresa suspensa** | `status === "SUSPENDED"` | warning | `kind:"blueprint"` → `reactivate` |

> **Decisão (sync de cobrança):** não há blueprint `reprocess_billing_sync` no registry hoje. Em vez de criar uma ação nova (fora do escopo "reusar"), o problema #3 e #4 levam à **página do cliente** (`kind:"link"`), onde o dono usa as ações já existentes. Mantém o princípio de não inventar ações de banco. Um blueprint de reprocessamento pode entrar num sprint futuro.

> **Decisão (trial vencido vs vencendo):** o blueprint `extend_trial` só age sobre `status: "TRIAL"` (faz `findFirst({ where: { companyId, status: "TRIAL" } })`). Quando o trial **já venceu**, a subscription passa a `TRIAL_EXPIRED` — `extend_trial` não acharia nada. Por isso o detector 5b (vencido) é `kind:"link"` para a página do cliente, e só o 5a (ainda vencendo, status TRIAL) oferece o `extend_trial`. Isso evita um botão "Resolver" que falharia silenciosamente.

> **Decisão (limiares):** constantes no topo de `issues.ts` (`ERROR_RATE_PCT = 5`, `TRIAL_WARNING_DAYS = 3`, `MIN_REQ_FOR_ERROR_ALERT = 20`). Documentadas, não editáveis pela UI (YAGNI).

### 3. Camada async — `src/lib/monitoring/problem-companies.ts`

Função `getProblemCompanies()` que busca empresas em algum estado problemático e as **achata** em `ProblemCompany[]`. Detalhes do achatamento (corrige confusão Company×Subscription):

- Query em `Company` com `include` da **subscription relevante** e contagem de faturas vencidas.
- **Qual subscription:** a "relevante" é a mesma que os blueprints usam — `subscriptions` filtradas por status acionável, pegando a primeira (`findFirst`-equivalente via `include: { subscriptions: { where: { status: { in: [...] } }, take: 1, orderBy: { createdAt: "desc" } } }`). Uma empresa pode ter 0 subscriptions (campos de sub ficam `null`) ou várias (usa a mais recente acionável). Isso espelha `reactivate`/`extend_trial`, que fazem `findFirst({ where: { companyId, status } })`.
- **Faturas vencidas:** agregadas por empresa via contagem/soma de `Invoice WHERE status="OVERDUE"` ligadas às subscriptions da empresa (uma 2ª query agregada por companyId, ou `_count`/`aggregate` — o que for mais simples; não precisa ser uma query só, mas manter o nº de queries pequeno).
- **Filtro amplo (OR):** blocked OU healthCategory=CRITICAL OU sub TRIAL/TRIAL_EXPIRED/SUSPENDED/PAST_DUE OU pastDueSince≠null OU billingSyncPending OU com fatura OVERDUE. `take` de segurança (200).
- Multi-tenant N/A (visão super-admin, cross-tenant intencional, como o resto do cockpit).

`detectIssues` é chamado a partir do endpoint, combinando `pulse + trends + problemCompanies`.

### 4. Endpoint — estende `/api/admin/observability`

O payload ganha `issues: Issue[]` (já calculado server-side). O `getProblemCompanies()` entra no `Promise.all` existente. Best-effort: se a detecção falhar, retorna `issues: []` (não derruba o cockpit — mesmo princípio do `getSystemTrends`).

### 5. UI — cockpit com abas + IssueCard

- **`cockpit-client.tsx`**: ganha um seletor de abas (Visão Geral | Resolução). A aba Resolução mostra um badge com a contagem de problemas (`🔴 2`).
- **Visão Geral didática:** cada `MetricCard` ganha:
  - frase de status em pt-BR (derivada do tone good/warn/bad → "Tudo normal" / "Atenção" / "Problema");
  - tooltip "o que é isso?" (texto curto explicativo);
  - os números crus vão para um bloco recolhível "Ver detalhes técnicos".
  - Resumo no topo: frase única (`Tudo funcionando` vs `N itens precisam de atenção → [ir para Resolução]`).
- **`issue-card.tsx`** (NOVO): renderiza um `Issue`. Botão "Resolver":
  - `kind:"blueprint"` → abre o `ActionModal`. **Como obtém o descritor:** o `cockpit-client` busca o mapa de descritores **uma vez** via `GET /api/admin/actions` → `Record<id, BlueprintDescriptor>` (mesmo padrão já usado em `src/app/admin/clientes/[id]/company-actions.tsx` — replicar, não há wiring de ActionModal no cockpit hoje). O IssueCard resolve `action.blueprintId` nesse mapa e injeta `companyId`/`companyName`. **Se o blueprint não estiver no mapa** (filtrado por role — o endpoint só lista o que o admin pode rodar), o botão é **escondido/desabilitado** com tooltip "sem permissão".
  - `kind:"link"` → navega para o `href` (ex.: `/admin/clientes/[id]`).
  - `kind:"info"` → **puramente explicativo** (sem ação destrutiva). Para o problema #1 (sistema lento), o botão "Verificar novamente" dispara o refetch que o cockpit-client já tem (a página já faz polling a cada 10s; o botão só antecipa). Não é um no-op enganoso.
- **Wiring (importante):** o `ActionModal` ainda NÃO está integrado ao cockpit (só à página de cliente). Esta fase **replica** o padrão de fetch-de-descritores + abertura do modal de `company-actions.tsx` dentro do cockpit-client.
- Cartões ordenados: critical → warning → info; dentro da severidade, system antes de client.
- **Múltiplos cards por empresa = intencional:** uma empresa SUSPENDED e também com saúde CRÍTICA gera DOIS cards distintos (um por problema). O `Issue.id` (`<tipo>:<companyId>`) serve de key React e garante ids únicos entre detectores; não há dedupe entre problemas diferentes da mesma empresa.

---

## Fluxo de dados

```
getProblemCompanies() ─┐
getSystemPulse() ──────┼─→ detectIssues(input) → Issue[] ─→ /api/admin/observability
getSystemTrends() ─────┘                                          │
                                                                  ▼
                                          cockpit-client (aba Resolução)
                                                                  │
                                      IssueCard "Resolver" (blueprint) → ActionModal
                                                                  │
                                              POST /api/admin/actions/[id] (auditoria tripla)
```

## Tratamento de erro

- Detecção é best-effort no endpoint (`try/catch` → `issues: []`).
- `getProblemCompanies` tem `take` de segurança (ex.: 200) para não explodir com base grande.
- A ação "Resolver" reusa o caminho da Fase 5 (erro mostra `errorId`/`x-request-id`).

## Testes

- **`issues.test.ts`** (foco): cada detector puro com fixtures — dispara/não-dispara, severidade correta, ação correta, dedupe de id. É a maior cobertura (a lógica de negócio mora aqui).
- Ordenação de issues (critical primeiro).
- `aggregate`/mapeamento de `ProblemCompany` se houver lógica pura extraível.
- UI não tem teste unitário (padrão do projeto); validação por smoke.

## Esforço

Uma fase. Tasks: (1) detector + testes, (2) getProblemCompanies + integração no endpoint, (3) tradução didática dos cards + resumo, (4) abas + IssueCard + wiring no ActionModal. Ritual de fim de fase: tsc · build · test · review.

## Riscos

- **Falsos positivos** (ex.: erro alto com pouquíssimas requests): mitigado por `MIN_REQ_FOR_ERROR_ALERT`.
- **Performance** da query de problem-companies: filtro amplo com OR pode ser pesado em base grande — `take` + índices existentes (`billingSyncPending`, `healthCategory` via score) mitigam; aceito para o volume atual.
- **Texto didático** pode soar condescendente — calibrar tom (claro, não infantil).
