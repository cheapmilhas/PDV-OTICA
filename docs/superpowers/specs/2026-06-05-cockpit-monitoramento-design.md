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
4. Health check com status detalhado → `/api/health` + pulso na aba.
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
- **Auditoria existente:** `model AuditLog` é **multi-tenant** (`companyId` obrigatório, relação com User/Branch) — auditoria DENTRO do PDV do cliente. **NÃO serve** para ações do super-admin. Precisamos de tabela separada `AdminActionLog` (chave `adminId`, não `userId` de empresa).
- **Prisma:** `src/lib/prisma.ts` com tenant-guard + audit middleware; `PRISMA_CONNECTION_LIMIT` para serverless.
- **Proxy/middleware Edge:** `src/proxy.ts` injeta `x-current-path`; ponto de injeção do Request ID.
- **Caches:** `src/lib/plan-features-cache.ts` (LRU 500/5min) e `src/lib/idempotency.ts`.
- **Crons existentes** (`vercel.json`): dunning, retry-finance-entries, mark-delayed, recalc-health, reconcile-billing. Plano Vercel Hobby → 1 cron/dia por slot; novo cron de métricas deve respeitar limites do plano.

## 3. Decisões de design (travadas no brainstorming)

| Decisão | Escolha |
|---|---|
| Escopo da aba | **Painel central unificado** Sistema + Clientes |
| Layout | **Cockpit**: faixa de status no topo + 2 colunas (Sistema \| Clientes) |
| Motor de ações | **Registry tipado** (blueprint declarativo: Zod schema + riskLevel + execute + auditoria) |
| Métricas de sistema | **Híbrido**: pulso ao vivo (on-demand) + tendências (tabela `MetricSample` via cron) |
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

**Alimentação de `MetricSample` (sem explodir o banco):** o wrapper acumula contadores in-memory; um **cron a cada 5 min** lê os contadores e grava 1 snapshot agregado por janela (não 1-row-por-request). Retenção: o mesmo cron apaga linhas >30 dias.

**UI honesta:** rótulo "pulso = instância atual · tendências = agregado" — deixa claro o que é ao-vivo vs. histórico em serverless.

**Request ID:** gerado em `proxy.ts`, propagado via `x-request-id`, presente em todo log JSON e na resposta de erro (unificado com `errorId`). Liga um erro visto na aba ao log/Sentry exato.

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
6. Grava `AdminActionLog` (quem/quando/ação/companyId/input sem segredos/result/reason/requestId).
7. Retorna resultado via `api-response`/`handleApiError`.

**UI gera o modal a partir do schema:** `number→stepper`, `enum→select`, `string→texto`; mostra campo "motivo" se `requireReason`; mostra "digite o nome da empresa" se `typeToConfirm`.

**Migração:** as 8 ações de `company-actions.tsx` viram blueprints; `prompt()`/`alert()` removidos; `/admin/clientes/[id]` passa a consumir os mesmos blueprints (fonte única).

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

**`AdminActionLog`** (auditoria de ações super-admin — separado do `AuditLog` multi-tenant existente):
```prisma
model AdminActionLog {
  id         String   @id @default(cuid())
  adminId    String
  actionId   String
  companyId  String?
  riskLevel  String
  input      Json
  result     Json
  reason     String?
  requestId  String?
  createdAt  DateTime @default(now())
  @@index([companyId])
  @@index([adminId, createdAt])
}
```

**Alertas (1ª entrega):** regras em arquivo versionado (`src/lib/monitoring/alert-rules.ts`), avaliadas por cron, disparo via `captureMessage` do Sentry. UI editável = fase opcional (tabela `AlertRule` só então).

## 9. Fluxo de erros

- **Coleta de sistema falha** (ex.: `SELECT 1` timeout) → card mostra "Degradado/Fora do ar"; a aba **sempre renderiza** (fail-soft).
- **Health do cliente falha** → bloco mostra erro localizado; resto do cockpit vive.
- **Ação falha** → `handleApiError` devolve `{ error: { code, message, requestId } }`; modal mostra mensagem + requestId; auditoria registra o resultado falho.
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
- **Fase 2 — Persistência de tendências.** Migration `MetricSample` + cron 5 min (snapshot + retenção 30d). Testes: agrega p95 certo; retenção apaga >30d.
- **Fase 3 — Motor de ações (registry).** `types.ts`, `registry.ts`, rota `/api/admin/actions/[id]`, `AdminActionLog`, migração das 8 ações. Testes (cobertura maior — toca produção): schema valida/rejeita; guarda de risco exige motivo+typeToConfirm; auditoria grava; roles barram.
- **Fase 4 — Agregação.** `getSystemPulse`, `getSystemTrends`, `getClientHealthSnapshot`. Testes com fixtures.
- **Fase 5 — Cockpit UI.** `/admin/monitoramento`, item no nav, faixa de status + 2 colunas, `<ActionModal>` por schema, polling. **Usar skill `frontend-design` na implementação** (dark, alinhado ao /admin, hierarquia de cockpit, micro-interações). Testes: rota exige sessão; modal renderiza campos do schema.
- **Fase 6 — Alertas + deploy guard.** Config de alertas + cron → Sentry. Smoke pós-deploy (`/api/health?deep=1` + rotas-chave) + runbook `vercel rollback`. UI de alertas = fase opcional 7.

**Ordem de valor:** Fases 1+3+4+5 entregam o cockpit funcional com ações reais; 2/6/7 endurecem.

## 12. Não-objetivos (YAGNI)

- Persistir métrica por-request (descartado: snapshots periódicos bastam).
- UI editável de alertas na 1ª entrega (config-em-arquivo basta).
- Rollback automático por canary (requer Vercel Pro+ Rolling Releases — documentar caminho de upgrade, não implementar agora).
- CPU detalhado por núcleo (serverless não expõe de forma útil; usar `process.cpuUsage()` como proxy se necessário).
- Refatorar `health-score.ts` (apenas consumido, não alterado).
