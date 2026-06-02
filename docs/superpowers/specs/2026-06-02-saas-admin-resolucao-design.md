# Plano de Resolução — SaaS Admin (PDV Ótica)

**Data:** 2026-06-02
**Autor:** Brainstorming dirigido (9 agentes analistas + 3 líderes de triagem)
**Status:** Aguardando aprovação do dono
**Ordenação escolhida:** Líder 3 (equilibrado — segurança/testes curtos no começo, pedidos centrais cedo)

---

## 1. Contexto

O painel `/admin` (super-admin do SaaS) já está **largamente construído**: clientes, assinaturas,
financeiro (faturas/inadimplência), suporte/tickets, planos, health score, impersonate, audit logs,
exports e notificações. O trabalho **não é construir do zero** — é **corrigir buracos críticos que
sangram receita e segurança**, e **conectar peças prontas mas inativas**.

Stack: Next.js App Router + Prisma + Neon + Asaas (cobrança). Deploy Vercel **manual**.
Migrations seguem padrão da casa (raw SQL fora do schema quando destrutivo; SELECT+backup antes).

### Decisões do dono (fixas para este plano)
1. **Trocar plano no admin reflete TUDO no cliente específico, incluindo a cobrança no Asaas** (valor/ciclo sincronizados automaticamente).
2. **Suporte:** canal completo do cliente (a ótica abre/responde/acompanha ticket) + notificações (admin e cliente).
3. **Segurança (blindar o botão de impersonate, mantendo-o) + testes das áreas de dinheiro vêm LOGO NO COMEÇO.**

---

## 2. Diagnóstico consolidado (achados dos 9 analistas)

### 🔴 Receita / cobrança
- **Trocar plano não sincroniza o Asaas.** Acesso, limites e features do cliente mudam na hora
  (`actions/route.ts:75 case change_plan`), mas o valor cobrado no Asaas continua o antigo →
  perda de receita. **Pré-requisito:** `src/lib/asaas.ts` só tem `subscriptions.create/get/cancel`,
  **falta `update`**.
- **Checkout marca `ACTIVE` antes de o pagamento ser confirmado** (`billing/checkout/route.ts:228`)
  → libera acesso sem garantia de cobrança (pior em BOLETO/PIX).
- **Editar um Plan não propaga aos clientes existentes** (`admin/plans/[id]/route.ts`) — limites
  ficam congelados do momento da contratação.
- **Dunning silencioso** (`cron/dunning/route.ts`): inadimplente nunca é avisado; cancela aos 30d "no seco".
- **MRR e Churn estimados/errados** (`admin/relatorios/page.tsx`, `admin/page.tsx`): ignoram desconto;
  churn é contagem, não taxa.

### 🔴 Segurança
- **Impersonate (botão de entrar em cada ótica — MANTIDO):** sem validação de escopo (admin acessa
  empresa fora do seu escopo trocando o `companyId`), sem rate-limit, token 2h, sem revalidação de admin
  ativo. Risco real quando houver **equipe admin** (suporte/financeiro). `admin/impersonate/route.ts`.
- **Exports admin** sem limite (OOM/DoS), sem RBAC (SUPPORT/BILLING exportam tudo), CSV injection. `admin/export/*`.
- **audit-logs** sem checagem de role.

### 🟠 Suporte
- Admin-only. Cliente não tem canal para abrir/ver ticket. **Nenhuma notificação** (nem cliente nem admin).
- `createAdminNotification` é **dead code** (tabela + UI + polling prontos, nunca disparado).
- **Não existe nenhum sistema de notificação do lado do cliente hoje** (confirmado).

### 🟡 Confiabilidade
- `subscription.ts`, crons (dunning, recalc-health, mark-delayed, retry-finance) e webhooks (asaas, focus):
  **0% de teste** — justamente as áreas de dinheiro. Sem alertas de billing no Sentry. Sem reconciliação Asaas↔DB.

---

## 3. Plano em fases (ordenação Líder 3)

> Cada fase é **deployável isolada**. Workflow por fase: implementar → `tsc` + build →
> code-reviewer (caçar regressão) → commit → `vercel deploy --prod` → atualizar memória.
> Mudanças de cobrança exigem teste em **sandbox Asaas** antes do deploy manual.

### Fase 0 — Blindagem + rede de testes do dinheiro  · esforço M · **PRIMEIRO**
**Objetivo:** fechar vetores de risco e criar a malha de testes que protege as fases seguintes.
**Itens:**
- **Impersonate** (`admin/impersonate/route.ts`): validar escopo (admin só entra em empresa que pode
  gerenciar; SUPER_ADMIN = todas), token 30min, rate-limit por admin, revalidar admin ativo no banco,
  auditar **falha** (403) além do sucesso. **O botão permanece.**
- **Campo de escopo no `AdminUser`** (lista de companyIds ou flag "todas") + checagem reutilizável em
  `/api/admin/*` que recebe `companyId`. Backfill SUPER_ADMIN="todas" antes de ligar a checagem.
- **Exports** (`admin/export/*`, 6 rotas): `requireRole` (SUPPORT/BILLING não exportam auditoria/clientes),
  limite de linhas/streaming, sanitização anti-CSV-injection (novo `src/lib/csv-safe.ts`: prefixar células
  iniciando com `= + - @`), auditar cada export.
- **audit-logs** (`admin/audit-logs/route.ts`): exigir role ADMIN/SUPER_ADMIN.
- **Testes das áreas de dinheiro:** `subscription.ts` (checkSubscription/requireWriteAccess/LIVE_STATUSES),
  parsing+dedup de webhook Asaas (não duplicar FinanceEntry), guard fail-closed dos crons (200 com
  CRON_SECRET, 401 sem).

**O dono vê:** botão de entrar na ótica continua funcionando, agora auditado e seguro; exports seguros; CI verde.
**Pronto quando:** impersonate fora de escopo → 403 auditado; exports respeitam role+limite+escape; suite nova passa; tsc+build ok.
**NÃO entra:** MFA admin, E2E Playwright, refactor de `subscription.ts`, UI de gestão de escopo.

### Fase 1 — Trocar plano reflete na cobrança do Asaas · esforço M · **PEDIDO CENTRAL**
**Objetivo:** ao mexer no plano do cliente no admin, refletir valor/ciclo no Asaas (acesso/limites/features já refletem).
**Itens:**
- **Adicionar `asaas.subscriptions.update`** em `src/lib/asaas.ts` (PUT `/subscriptions/{id}` com `value`/`cycle`). **Bloqueante.**
- `actions/route.ts` (`case change_plan` e `change_billing_cycle`): após o `$transaction` local,
  sincronizar a subscription no Asaas com o novo valor/ciclo (idempotente, reusar key `company:X:plan:Y`).
  Empresa em trial / sem subscription Asaas → só muda local.
- **Fail-soft:** se o Asaas falhar, não reverter o acesso local; marcar `billingSyncPending=true` +
  `GlobalAudit`, e reconciliar depois (Fase 4). Auditar toda mudança.
- **Decisão de proration:** o novo valor vale na **próxima fatura** (sem crédito retroativo de dias) —
  evita disputa e simplifica. Mensagem clara ao admin.

**O dono vê:** troca o plano no admin → o valor da próxima cobrança no painel Asaas muda; tudo auditado.
**Pronto quando:** teste de integração (mock Asaas) cobre upgrade/downgrade/trial; verificável no Asaas sandbox.
**NÃO entra:** proration com crédito; propagar edição de Plan a empresas existentes (Fase 4).

### Fase 2 — Checkout só ativa após pagamento confirmado · esforço M
**Objetivo:** parar de marcar receita que não entrou.
**Itens:**
- `billing/checkout/route.ts`: BOLETO/PIX criam Subscription como `PENDING`/`TRIAL`; ativação fica a cargo
  do webhook `PAYMENT_CONFIRMED`/`RECEIVED` (já idempotente, H6). CREDIT_CARD (cobra na hora) pode seguir ACTIVE.
  Estado "processando" na UI do cliente. Reusar advisory lock (M14).

**O dono vê:** cliente que não pagou não vira ACTIVE; ao confirmar o pagamento, ativa sozinho.
**Pronto quando:** teste do fluxo checkout→webhook passa; smoke em sandbox Asaas.
**NÃO entra:** dunning com avisos (Fase 5).

### Fase 3 — Suporte completo do cliente + notificações · esforço G · **PEDIDO CENTRAL**
**Objetivo:** a ótica abre/responde/acompanha ticket; admin e cliente notificados. Ativa o dead code de notificações.
**Itens:**
- **Rotas do cliente** (novas, escopadas por `companyId`): criar/listar/responder ticket; filtrar
  `SupportMessage.isInternal=false` para o cliente. UI no app do cliente (espelho de `admin/suporte/*`).
- **Ativar `createAdminNotification`** (`src/services/admin-notification.service.ts`) nos eventos:
  ticket novo, resposta do cliente, SLA — sai de dead code (sino do admin acende).
- **Notificação do lado do cliente** (criar do zero — não existe hoje): in-app quando o admin responde / muda status.
- Calcular `slaDeadline` na criação (hoje campo existe e nunca é setado).

**O dono vê:** cliente abre ticket → sino do admin acende; admin responde → cliente vê. Fim a fim.
**Pronto quando:** integração de criar/responder + disparo de notificação (ambos os lados) testados.
**NÃO entra:** e-mail/push externos, base de conhecimento, atribuição automática/round-robin.

### Fase 4 — Propagar edição de Plan + MRR/Churn corretos · esforço M
**Objetivo:** editar um plano atualiza as óticas daquele plano; relatórios batem com o faturado.
**Itens:**
- `admin/plans/[id]/route.ts`: ao salvar, `updateMany` em `Company` do plano (maxUsers/maxBranches/maxProducts)
  + `invalidatePlanFeaturesCache` por empresa. Preço novo vale para novas cobranças (não retroativo).
- `admin/relatorios/page.tsx` + `admin/page.tsx`: **MRR** = soma do valor efetivo (com desconto, ciclo
  normalizado/mês); **Churn** = taxa (cancelados ÷ base inicial do período).
- **Reconciliação Asaas↔DB:** job que reconsulta subscriptions com `billingSyncPending`.

**O dono vê:** mudar limite de um plano reflete nas óticas; MRR/Churn confiáveis.
**Pronto quando:** teste do cálculo de MRR com desconto; reconciliação fecha divergências.
**NÃO entra:** cohort/LTV/CAC, versionamento de planos (grandfathering), Invoice→Decimal (dívida anotada).

### Fase 5 — Dunning comunicativo · esforço M
**Objetivo:** inadimplente é avisado em etapas, não some silenciosamente.
**Itens:**
- `cron/dunning/route.ts`: avisos escalonados (3/7/14d) via notificação in-app + alerta ao admin
  (reusar `createAdminNotification`); cancelar aos 30d só após avisos registrados; idempotente; auditado.

**O dono vê:** régua de inadimplência visível e comunicada.
**Pronto quando:** teste do cron cobre as etapas; idempotência garantida.
**NÃO entra:** WhatsApp/e-mail externo; régua configurável por empresa.

---

## 4. Despriorizado (e por quê)
- **E2E Playwright completo:** custo alto; testes de unidade/integração das áreas de dinheiro (Fases 0–4) dão ~80% do valor de segurança agora.
- **Refactor de `subscription.ts` / middleware global de gating:** funciona; refatorar atrasa os pedidos centrais sem valor visível.
- **MFA no login admin:** o vetor real (acesso indevido) é fechado pela Fase 0; MFA fica para depois.
- **Invoice Int→Decimal:** dívida anotada; risco de overflow só ~R$ 20M/fatura. Fase futura.
- **E-mail/push externos no suporte:** in-app fecha o loop; canal externo é incremento posterior.

## 5. Riscos & dependências
- **Fase 1 e 2 dependem de `asaas.subscriptions.update` (a criar) e de sandbox Asaas confiável** — mockar
  nos testes, smoke real antes do deploy.
- **Fase 2 depende do webhook promover ACTIVE** — sem isso, cliente paga e não libera (pior que o bug atual).
  Agrupar checkout + handler de webhook no mesmo deploy atômico.
- **Fase 1 e 0 compartilham o campo de escopo do `AdminUser`** — criar uma vez na Fase 0, com backfill
  SUPER_ADMIN antes de ligar a checagem (senão trava admins legítimos).
- Deploy manual na Vercel: cada fase deploya isolada; mudanças de cobrança sempre com `GlobalAudit`.

## 6. Arquivos-âncora
- `src/lib/asaas.ts` (add `subscriptions.update`)
- `src/app/api/admin/clientes/[id]/actions/route.ts` (change_plan / change_billing_cycle)
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/admin/impersonate/route.ts`
- `src/app/api/admin/export/*` + novo `src/lib/csv-safe.ts`
- `src/lib/subscription.ts` (testes)
- `src/services/admin-notification.service.ts` (ativar)
- `src/app/api/admin/plans/[id]/route.ts`
- `src/app/api/cron/dunning/route.ts`
- `src/app/admin/relatorios/page.tsx`, `src/app/admin/page.tsx`
