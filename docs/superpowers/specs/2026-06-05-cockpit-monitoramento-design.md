# Design: Cockpit de Monitoramento (Sistema + Clientes) — Super-Admin

**Data:** 2026-06-05
**Status:** Aprovado pelo dono (brainstorming) — pronto para plano de implementação
**Topic:** `cockpit-monitoramento`
**Autor:** sessão Claude Code + dono (cheapmilhas)

---

## 1. Objetivo

Criar uma aba **`/admin/monitoramento`** no painel super-admin que unifique, num único cockpit, a **saúde do sistema** (infraestrutura/observabilidade) e a **saúde dos clientes** (negócio/churn/receita), com **ações que funcionam de verdade** — executadas a partir de um registry tipado de "blueprints" (schema Zod + nível de risco + auditoria).

Isto atende as 10 regras de DevOps de monitoramento/debugging levantadas pelo dono, subordinando-as a uma interface operável em vez de só logs:

1. Request ID único por endpoint → espinha de rastreabilidade.
2. Stack trace completo + texto → já existe (logger + Sentry), mantido.
3. Log estruturado JSON → já existe (`src/lib/logger.ts`), mantido.
4. Health check com status detalhado → **novo** `/api/health` + pulso na aba. (Hoje só há a string `"api/health"` numa allowlist em `src/lib/with-plan-feature.ts` — a rota em si ainda não existe.)
5. Query logging com tempo → slow-query log + métrica.
6. Cache hit/miss tracking → contadores nos caches existentes.
7. Métricas de performance (tempo/memória/CPU) → pulso + tendências.
8. Testes de regressão de fluxos críticos → ampliados por fase.
9. Alertas configuráveis para anomalias → config + cron → Sentry.
10. Deploy com monitoramento + rollback → smoke pós-deploy + runbook.

## 2. Contexto existente (reaproveitado, não reescrito)

- **Logger JSON estruturado:** `src/lib/logger.ts` (JSON em prod, humano em dev, silencioso em test). `logger.child({...})` para contexto prefixado.
- **Sentry:** `src/lib/sentry.ts` com `captureException`, `captureMessage`, `setTenantContext`. Ativado via `instrumentation.ts`/`instrumentation-client.ts` quando `SENTRY_DSN` setado.
- **Error handler:** `src/lib/error-handler.ts` — `handleApiError`, `AppError`, `ERROR_CODES`, já gera `errorId` de correlação em 5xx e loga stack + Sentry.
- **Health-score de cliente:** `src/lib/health-score.ts` — 4 dimensões (usage 30% / billing 35% / engagement 25% / support 10%), `riskFactors`/`opportunities`, persistido em `HealthScore` + cache em `Company.healthScore/healthCategory/healthUpdatedAt`. Cron diário `recalc-health` + recálculo manual. **NÃO recalcular no cockpit — apenas ler.**
- **Página de saúde do cliente:** `src/app/admin/saude/page.tsx` (filtros por categoria) + `HealthBadge`.
- **Ações de cliente já implementadas:** `src/app/api/admin/clientes/[id]/actions` + `company-actions.tsx` — block/unblock, reactivate, extend_trial, change_plan, change_billing_cycle, cancel_subscription, impersonate, delete. **UX crua (`prompt()`/`alert()`) — será substituída.**
- **Auth admin:** `requireAdminAuth()`, `requireAdminRole(roles)`, `getAdminSession()` em `src/lib/admin-auth-helpers.ts` / `admin-session.ts`. Enum `AdminRole = { SUPER_ADMIN, ADMIN, SUPPORT, BILLING }`.
- **Auditoria existente (TRÊS sistemas — TODOS preservados):** a rota de ações atual hoje grava em DOIS deles por ação. Migrar para blueprints **NÃO pode dropar nenhum**.
  - `model AuditLog` — multi-tenant (`companyId` obrigatório, relação com User/Branch) — auditoria DENTRO do PDV do cliente. (Não é tocado pelas ações admin.)
  - `model ActivityLog` (`companyId` NOT NULL, `type: ActivityType`, `actorType: ActorType`, `actorName`) — alimenta o **timeline do cliente** em `/admin/clientes/[id]`. A rota atual chama `logActivity(...)` (`src/services/activity-log.service.ts`) **sempre com `actorId`, `actorType: ActorType.ADMIN`, `actorName`** (sem esses campos, cai em `SYSTEM` e mislabela a ação).
  - `model GlobalAudit` (`actorType`, `actorId`, `companyId`, `action`, `metadata`) — **é a trilha de auditoria admin-cêntrica que JÁ EXISTE**. A rota atual grava `prisma.globalAudit.create({ actorType: "ADMIN_USER", actorId, companyId, action, metadata })` em **todas as 8 ações**. Foi omitido na primeira versão desta spec — correção.
  - **Decisão revista sobre `AdminActionLog`:** como `GlobalAudit` já cobre a auditoria admin-cêntrica, `AdminActionLog` **não é estritamente necessário**. PORÉM `GlobalAudit` não tem os campos novos do motor de ações (`riskLevel`, `reason`, `requestId`, `result`, `input`). **Decisão:** manter `AdminActionLog` como trilha do *motor de ações* (captura risco/motivo/requestId/resultado — o "porquê" e o "como" da decisão), e **continuar gravando `GlobalAudit` + `ActivityLog` exatamente como hoje** (o "o quê" no formato que o resto do sistema já consome). Resultado por ação com empresa-alvo: grava `GlobalAudit` + `ActivityLog` + `AdminActionLog` (3 escritas). Ação de sistema (sem empresa): só `AdminActionLog`. **Nenhuma regressão de auditoria.**
- **Prisma:** `src/lib/prisma.ts` com tenant-guard + audit middleware; `PRISMA_CONNECTION_LIMIT` para serverless.
- **Proxy/middleware Edge:** `src/proxy.ts` injeta `x-current-path`; ponto de injeção do Request ID.
- **Caches:** `src/lib/plan-features-cache.ts` (LRU 500/5min) e `src/lib/idempotency.ts`.
- **Crons existentes** (`vercel.json`): dunning, retry-finance-entries, mark-delayed, recalc-health, reconcile-billing — **todos diários**. **Plano Vercel Hobby limita cron à frequência diária** (não permite `*/5`). Isso é uma restrição dura que molda a coleta de tendências (ver §5/§8 — NÃO usamos cron de 5 min).

## 3. Decisões de design (travadas no brainstorming)

| Decisão | Escolha |
|---|---|
| Escopo da aba | **Painel central unificado** Sistema + Clientes |
| Layout | **Cockpit**: faixa de status no topo + 2 colunas (Sistema \| Clientes) |
| Motor de ações | **Registry tipado** (blueprint declarativo: Zod schema + riskLevel + execute + auditoria) |
| Métricas de sistema | **Híbrido**: pulso ao vivo (on-demand) + tendências persistidas via **flush write-on-request** (NÃO cron de 5 min — ver §5/§8) |
| Conteúdo clientes | Risco prioritário + MRR em risco + Inadimplência + Engajamento/adoção |
| Fluxo de ação | **Modal gerado pelo schema**, dentro do cockpit |
| Guarda de risco | **Motivo obrigatório + digitar nome p/ confirmar (high) + auditoria sempre** |
| Alertas (1ª entrega) | **Config em arquivo versionado** avaliada por cron → Sentry. UI de alertas = fase opcional |

## 4. Arquitetura

Quatro camadas isoladas, cada uma com responsabilidade única:

```
┌─────────────────────────────────────────────────────────┐
│  FAIXA DE STATUS   ● Operacional · N ações urgentes      │
├──────────────────────────┬──────────────────────────────┤
│  ⚙ SAÚDE DO SISTEMA      │  👥 SAÚDE DOS CLIENTES        │
│  (infra, pulso ao vivo)  │  (negócio, radar de churn)    │
└──────────────────────────┴──────────────────────────────┘
```

1. **Coleta de sistema** — `src/lib/observability/`
   - `request-context.ts` — gera/lê `x-request-id` (`req_` + uuid curto), Edge-safe (`crypto.randomUUID`).
   - `with-observability.ts` — wrapper de route handler: marca início/fim, loga JSON `{ requestId, method, route, status, durationMs }`, alimenta contadores in-memory.
   - `health.ts` — `checkHealth(deep)`: status, DB `SELECT 1` cronometrado, memória/uptime, versão/commit, (opcional) ping Asaas/Sentry.
   - `metrics.ts` — singleton in-memory: contadores (requests por status, erros, slow queries, cache hits/misses), ring buffer de latências, `processMetrics()`.
   - slow-query log no `prisma.ts` (gated por `PRISMA_QUERY_LOG`, limiar `SLOW_QUERY_MS` default 200ms; **não loga parâmetros — PII**).

2. **Agregação** — `src/lib/monitoring/`
   - `getSystemPulse()` — on-demand, sempre real (não usa buffer fantasma serverless).
   - `getSystemTrends()` — lê `MetricSample` (24h, p50/p95, taxa erro, slow queries, cache rate).
   - `getClientHealthSnapshot()` — queries de negócio (Company + Subscription + Invoice + Sale count), sempre com `companyId` no filtro. MRR em risco, inadimplência, engajamento, distribuição de categorias. Cacheável (alguns min).

3. **Motor de ações** — `src/lib/admin-actions/`
   - `types.ts` — interface `AdminActionBlueprint<TInput>`.
   - `registry.ts` — `Record<string, AdminActionBlueprint>`.
   - blueprints: migração das 8 ações de cliente + (opcional) ações de sistema.
   - rota única `POST /api/admin/actions/[id]`.

4. **UI** — `src/app/admin/monitoramento/`
   - `page.tsx` (server component) + componentes client para polling do pulso e modais.
   - `<ActionModal blueprint>` — gera campos a partir do `schema` Zod. Zero campos hardcoded por ação.
   - item novo no `admin-nav.tsx` (ícone `Gauge`/`Activity`, label "Monitoramento" — distinto de "Saúde" que é health-score de cliente).
   - **Nota de naming:** a rota é `monitoramento` (PT). O matcher do `proxy.ts` exclui `monitoring` (EN) — esse é o **túnel do Sentry**, NÃO esta aba. São propositalmente distintos; não "corrigir" a grafia ou o túnel do Sentry quebra.

**Regra de isolamento:** UI nunca sabe *como* uma ação funciona (lê blueprint, chama rota). Registry nunca importa UI. Coleta de sistema nunca importa lógica de negócio.

## 5. Saúde do Sistema (coluna esquerda)

**A) Pulso ao vivo** (on-demand ao abrir/poll):
- Status geral: Operacional / Degradado / Fora do ar (derivado dos checks).
- Banco: `SELECT 1` cronometrado → ms (verde <100, amarelo <500, vermelho ≥500/timeout). Timeout curto (2s).
- Processo: `process.memoryUsage()`, uptime, versão/commit do deploy (via env `VERCEL_GIT_COMMIT_SHA`).
- Dependências externas (opcional por flag): Asaas/Sentry alcançáveis.

**B) Tendências** (de `MetricSample`):
- Latência p50/p95 (24h) + sparkline.
- Taxa de erro (% 5xx, 24h).
- Req/min aproximado.
- Queries lentas (contagem acima do limiar) com rota/model.
- Cache hit rate (`plan-features-cache` + `idempotency`).

**Alimentação de `MetricSample` — write-on-request com flush por tempo (resolve o problema serverless).**
Um cron que "lê contadores in-memory" NÃO funciona na Vercel: o cron roda numa lambda diferente das que atenderam requests, então leria contadores vazios. Além disso, o plano Hobby não permite cron sub-diário. Portanto:
- O wrapper `with-observability` acumula contadores **na própria instância** (in-memory) com um carimbo de janela (`Math.floor(now / WINDOW_MS)`, default 5 min) e um `instanceId` aleatório por lambda.
- Quando a instância detecta que **virou a janela** (a primeira request da janela seguinte), ela faz um **flush**: grava 1 row em `MetricSample` com os agregados da janela anterior (`reqCount`, `errorCount`, p50/p95, slowQueries, cache hits/misses) e zera o acumulador. O flush é `void` (não bloqueia a resposta; falha logada, não propaga).
- Resultado: cada lambda ativa grava ~1 row por janela enquanto recebe tráfego. `getSystemTrends()` **agrega no SQL** (soma/percentil sobre todas as rows da janela, somando as várias instâncias) — então as tendências refletem a frota inteira, não uma instância.
- **Sem cron de métricas.** A retenção (apagar >30 dias) pega carona num cron diário já existente (ex.: estende `mark-delayed` ou `reconcile-billing` com um `DELETE FROM MetricSample WHERE capturedAt < now()-30d`), respeitando o limite Hobby.
- Trade-off honesto: lambdas que recebem 1 request e morrem antes de virar a janela podem não fazer flush (perda marginal de tráfego de cauda). Aceitável para tendência agregada; documentado na UI.

**UI honesta:** rótulo "pulso = instância atual · tendências = agregado da frota (flush por janela)" — deixa claro o que é ao-vivo vs. histórico em serverless.

**Request ID:** gerado em `proxy.ts`, propagado via `x-request-id`, presente em todo log JSON e na resposta de erro (unificado com `errorId`). Liga um erro visto na aba ao log/Sentry exato. **Atenção de implementação:** `proxy.ts` tem vários `return` antecipados (401 de API não-autenticada, redirects de admin/dashboard) que retornam ANTES de `nextWithCurrentPath`. O `x-request-id` deve ser injetado em **todos** os caminhos de retorno (inclusive 401/redirect), senão respostas de erro de requests não-autenticadas saem sem ID.

## 6. Saúde dos Clientes (coluna direita)

Lê o cache de health-score (não recalcula). Quatro blocos, em ordem de prioridade:

1. **Ações prioritárias** — lista unificada de CRITICAL/AT_RISK ordenada por urgência; cada linha = cliente + `riskFactor` principal + ação pré-selecionada (vencida→cobrar, trial expirando→estender/converter, inativo→notificar/impersonar).
2. **Receita em risco (MRR ameaçado)** — soma do MRR em PAST_DUE + trials expirando + AT_RISK/CRITICAL pagantes, com breakdown.
3. **Inadimplência & cobrança** — nº faturas vencidas, total R$, PAST_DUE, trials ≤3 dias. Link para `/financeiro/inadimplencia` para detalhe.
4. **Engajamento & adoção** — inativos (sem login/venda há X dias), onboarding travado, e `opportunities` (qualificados p/ upgrade).

**Distribuição de saúde** (rodapé da coluna): contadores THRIVING/HEALTHY/AT_RISK/CRITICAL clicáveis → filtram a lista. Reusa `HealthBadge`.

## 7. Motor de Ações (blueprint)

```ts
// src/lib/admin-actions/types.ts
interface AdminActionBlueprint<TInput> {
  id: string;                       // "extend_trial", "block_company"...
  label: string;
  description: string;
  category: "client" | "system";
  icon: string;                     // nome lucide-react
  riskLevel: "low" | "medium" | "high";
  schema: z.ZodType<TInput>;        // ← campos do modal saem daqui
  confirm?: {
    requireReason: boolean;
    typeToConfirm?: "companyName";  // digitar nome p/ confirmar (high)
  };
  allowedRoles: AdminRole[];        // SUPER_ADMIN | ADMIN | SUPPORT | BILLING
  execute: (ctx: ActionContext, input: TInput) => Promise<ActionResult>;
}
```

**Rota única `POST /api/admin/actions/[id]`:**
1. `requireAdminAuth()` + checa `allowedRoles` (usa enum real, não inventar códigos).
2. Acha blueprint por `id` (404 se não existe).
3. **Valida input com `blueprint.schema`** (400 se inválido).
4. Se `riskLevel: "high"` → exige `reason` não-vazio e `typeToConfirm` bater com o nome da empresa.
5. Roda `execute()`.
5. Roda `execute()` — que **preserva fielmente toda a lógica do case atual**, incluindo os campos de dados (ex.: `block` seta `blockedReason:"ADMIN_ACTION"`, `blockedAt`), a gravação de `GlobalAudit` (`actorType:"ADMIN_USER"`, ...) E a `logActivity(...)` com `actorId/actorType:ActorType.ADMIN/actorName`. **Regra de migração: ler cada case do route atual e portar verbatim — não reescrever de memória.**
6. Grava `AdminActionLog` (a trilha do *motor de ações*: quem/quando/ação/companyId/input sem segredos/result/reason/requestId). Isto é **adicional** ao `GlobalAudit`+`ActivityLog` que o `execute()` já gravou — ver §2 (auditoria tripla, sem regressão).
7. Retorna resultado via `api-response`/`handleApiError`.

**UI gera o modal a partir do schema:** `number→stepper`, `enum→select`, `string→texto`; mostra campo "motivo" se `requireReason`; mostra "digite o nome da empresa" se `typeToConfirm`.

**Invariante de input:** todo blueprint `category:"client"` tem `companyId` no seu `schema` Zod, e a UI **sempre injeta `companyId` no input**. A rota nova `/api/admin/actions/[id]` usa `[id]` para o *id da ação* (não da empresa), então a empresa-alvo vem do input — usado por `targetCompanyId(input)` para a auditoria e para o lookup do nome no `typeToConfirm`.

**Inventário de migração (precisão):** a rota `/api/admin/clientes/[id]/actions` tem **8 cases**: block, unblock, reactivate, extend_trial, change_plan, cancel_subscription, change_billing_cycle, delete. Notas de fidelidade: **`extend_trial` é fixo +7 dias, SEM parâmetro `days`** (lê a subscription `status:"TRIAL"`, 400 se não houver) — não inventar um `days`. **`impersonate` NÃO está nessa rota** e NÃO se encaixa no shape `execute()→ActionResult`: são DUAS rotas (`POST /api/admin/impersonate` para iniciar → devolve `{token, sessionId}` que o **browser** usa para redirecionar a `/impersonate?token=...`; `DELETE /api/admin/impersonate/[id]` para encerrar). **Decisão: impersonate permanece como está (fluxo client-side de token+redirect), NÃO vira blueprint executável server-side.** No cockpit/modal ele é um botão especial que chama o endpoint existente e abre a aba — fora do registry genérico. Logo o registry tem **8 blueprints** (`category:"client"`); impersonate é tratado à parte na UI. `prompt()`/`alert()` removidos; `/admin/clientes/[id]` passa a consumir os mesmos blueprints (fonte única).

**Matriz de `allowedRoles` (mudança de comportamento — explicitar):** hoje a rota gata **apenas** `delete` (`role !== "SUPER_ADMIN"` inline) e usa `getAdminSession()`; as outras 7 ações não têm restrição de papel. O modelo de blueprint adiciona `allowedRoles` a TODAS — então é preciso definir a matriz por ação para não tirar acesso que SUPPORT/BILLING têm hoje. Proposta inicial (a confirmar no plano) para os **8 blueprints**: `delete`/`cancel_subscription` → `[SUPER_ADMIN]`; `block`/`unblock`/`change_plan`/`change_billing_cycle` → `[SUPER_ADMIN, ADMIN]`; `reactivate`/`extend_trial` → `[SUPER_ADMIN, ADMIN, SUPPORT]`. (Impersonate não é blueprint; seu gate de papel permanece onde está hoje, no endpoint de impersonação.)

**Ações de sistema (opcional, fase posterior):** recalcular health de todos, limpar `plan-features-cache`, reprocessar `FinanceEntryRetry`.

## 8. Dados / Schema (migrations aditivas)

**`MetricSample`** (tendências de sistema):
```prisma
model MetricSample {
  id          String   @id @default(cuid())
  capturedAt  DateTime @default(now())
  windowMin   Int
  route       String?
  reqCount    Int      @default(0)
  errorCount  Int      @default(0)
  p50Ms       Int?
  p95Ms       Int?
  slowQueries Int      @default(0)
  cacheHits   Int      @default(0)
  cacheMisses Int      @default(0)
  @@index([capturedAt])
}
```

**`AdminActionLog`** (trilha do *motor de ações*). **Distinto dos TRÊS sistemas existentes** (`AuditLog` multi-tenant; `ActivityLog` timeline do cliente; `GlobalAudit` auditoria admin-cêntrica já existente). Justificativa: nenhum dos três tem os campos novos do motor (`riskLevel`, `reason`, `requestId`, `result`, `input` estruturado) e ações de sistema não têm empresa-alvo. **Reconciliação (ver §2/§7): SUPLEMENTA, não substitui** — uma ação de cliente grava `GlobalAudit` + `ActivityLog` (verbatim, como hoje) **e** `AdminActionLog` (novo). Ação de sistema grava só `AdminActionLog`. **Zero regressão de auditoria.**
```prisma
model AdminActionLog {
  id         String   @id @default(cuid())
  adminId    String   // id do admin (NÃO userId de empresa)
  actionId   String   // "block_company", "extend_trial"...
  companyId  String?  // alvo, quando aplicável (sem FK p/ não acoplar a Company)
  riskLevel  String
  input      Json     // sem segredos
  result     Json
  reason     String?
  requestId  String?  // liga ao log/Sentry
  createdAt  DateTime @default(now())
  @@index([companyId])
  @@index([adminId, createdAt])
}
```

**Ambas as migrations são puramente aditivas** (tabelas novas, sem FK que altere linhas existentes) → rollback seguro: redeploy do build anterior deixa as tabelas presentes e não-usadas, sem corromper dados.

**Slow-query log (nota de implementação — não é trivial):** `src/lib/prisma.ts` hoje cria o `PrismaClient` com `log: ["error","warn"]` estático. Cronometrar query via `$on("query")` exigiria mudar esse array para `[{ emit: "event", level: "query" }]` (muda o ruído de log em dev). Como o projeto **já usa `$use(...)`** no `prisma-audit-middleware.ts`, o caminho preferido é cronometrar dentro de um middleware `$use`/`$extends` (sem mexer no array `log`), gated por `PRISMA_QUERY_LOG`, limiar `SLOW_QUERY_MS` (default 200ms), logando só `{ model, durationMs }` — **nunca parâmetros (PII)**.

**Alertas (1ª entrega):** regras em arquivo versionado (`src/lib/monitoring/alert-rules.ts`), avaliadas por um cron **diário já existente** (carona, respeitando Hobby) ou on-demand ao abrir a aba, disparo via `captureMessage` do Sentry. UI editável = fase opcional (tabela `AlertRule` só então).

## 9. Fluxo de erros

- **Coleta de sistema falha** (ex.: `SELECT 1` timeout) → card mostra "Degradado/Fora do ar"; a aba **sempre renderiza** (fail-soft).
- **Health do cliente falha** → bloco mostra erro localizado; resto do cockpit vive.
- **Ação falha** → `handleApiError` devolve `{ error: { code, message, errorId } }` no corpo (o `errorId` já é gerado hoje em 5xx) e o `x-request-id` vai no **header** da resposta. O modal mostra a mensagem + o `errorId` (corpo) e/ou o `x-request-id` (header) — ambos levam ao log/Sentry. Auditoria registra o resultado falho.
- **Tudo logado** via `logger` JSON + Sentry com `requestId`/`companyId` (`setTenantContext`).

## 10. Segurança

- `/api/health` público expõe só `{ status, uptime, version, timestamp }` — sem topologia, libs, env ou connection string. Detalhes profundos só no endpoint admin autenticado.
- `/api/admin/actions/[id]` sempre atrás de `requireAdminAuth()` + `allowedRoles`.
- Ações de alto risco: motivo obrigatório + digitar nome da empresa + (futuro) MFA admin já existente.
- Request ID opaco (uuid), não sequencial.
- Slow-query log não loga parâmetros (PII).
- Nenhum segredo em log ou em `AdminActionLog.input`.
- `getClientHealthSnapshot()` e toda query sempre com `companyId` no filtro (multi-tenant).

## 11. Fases de implementação

Cada fase: **tsc + build + testes + review** antes de seguir (regra do projeto).

- **Fase 1 — Espinha de observabilidade de sistema.** Request ID no `proxy.ts`; `with-observability`; `/api/health` (público enxuto + interno detalhado); slow-query log; contadores de cache. Aplicar wrapper nas rotas críticas (sales/finance/cash/service-orders) primeiro. *Sem migration.* Testes: request-id gera/reusa; wrapper loga e propaga requestId em erro; health shape; slow-query só acima do limiar.
- **Fase 2 — Persistência de tendências.** Migration `MetricSample` + **flush write-on-request por janela** no `with-observability` (NÃO cron de 5 min — ver §5) + retenção 30d pegando carona num cron diário existente. Testes: flush grava 1 row ao virar a janela; `getSystemTrends` agrega p95 sobre múltiplas instâncias; retenção apaga >30d.
- **Fase 3 — Motor de ações (registry).** `types.ts`, `registry.ts`, rota `/api/admin/actions/[id]`, `AdminActionLog`, migração dos **8 cases em blueprints** (impersonate fica à parte — fluxo client-side de token+redirect, NÃO é blueprint), gravação **tripla** `GlobalAudit`+`logActivity`+`AdminActionLog`, matriz `allowedRoles`. Testes (cobertura maior — toca produção): schema valida/rejeita; guarda de risco exige motivo+typeToConfirm; auditoria grava nos três logs; roles barram conforme matriz; impersonate preserva fluxo atual.
- **Fase 4 — Agregação.** `getSystemPulse`, `getSystemTrends`, `getClientHealthSnapshot`. Testes com fixtures.
- **Fase 5 — Cockpit UI.** `/admin/monitoramento`, item no nav, faixa de status + 2 colunas, `<ActionModal>` por schema, polling. **Usar skill `frontend-design` na implementação** (dark, alinhado ao /admin, hierarquia de cockpit, micro-interações). Testes: rota exige sessão; modal renderiza campos do schema.
- **Fase 6 — Alertas + deploy guard.** Config de alertas + cron → Sentry. Smoke pós-deploy (`/api/health?deep=1` + rotas-chave) + runbook `vercel rollback`. UI de alertas = fase opcional 7.

**Ordem de valor:** Fases 1+3+4+5 entregam o cockpit funcional com ações reais; 2/6/7 endurecem.

## 12. Não-objetivos (YAGNI)

- Persistir métrica por-request (descartado: flush agregado por janela basta).
- Cron de métricas sub-diário (descartado: Hobby não permite; usamos flush write-on-request — ver §5).
- UI editável de alertas na 1ª entrega (config-em-arquivo basta).
- Rollback automático por canary (requer Vercel Pro+ Rolling Releases — documentar caminho de upgrade, não implementar agora).
- CPU detalhado por núcleo (serverless não expõe de forma útil; usar `process.cpuUsage()` como proxy se necessário).
- Refatorar `health-score.ts` (apenas consumido, não alterado).
