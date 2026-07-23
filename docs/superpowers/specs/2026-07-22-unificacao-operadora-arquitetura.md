# Plano Arquitetural Completo — Unificação VIS + VIS Medical sob uma Operadora Única

**Data:** 2026-07-22 · **Status:** APROVADO pelo dono · **Autor:** revisão arquitetural (papel CTO) com exploração dos 2 repos + painel de arquitetura
**Escopo:** documento arquitetural — a execução de cada fase segue o processo padrão do projeto (brainstorming→spec→plano→subagentes→Codex por fase→deploy fatiado→migrations aplicadas pelo dono com `!`).

> **Para a sessão que for executar:** este documento é auto-contido. Os repositórios são:
> - **Vis (operadora):** `/Users/matheusreboucas/PDV OTICA` — Next.js 16 App Router, Prisma + Neon (banco #1, ZERO PHI). `git push origin main` DISPARA auto-deploy de prod na Vercel. Migração manual pelo dono ANTES do código (`./node_modules/.bin/prisma migrate deploy` — NUNCA `migrate dev`/`db push`, o `.env` aponta pra PROD; lição do incidente 17/07 que zerou o banco).
> - **Domus (produto clínico):** `/Users/matheusreboucas/SISTEMACLINICADOMUS` — Next.js, Drizzle + Neon (banco #2, TODO o PHI), better-auth. Migrações via `apply-migration-NNNN.cjs` (não drizzle-kit).
> - Risco alto (billing/multi-tenant/DDL/funil público) → revisão adversarial do Codex por fase, máx 2 rodadas.

---

## 1. Contexto e objetivo

Hoje existem dois produtos: **VIS** (SaaS para óticas, com SuperAdmin completo: clientes, planos, trial, assinaturas, cobrança Asaas, métricas, dunning, e-mails de ciclo de vida, auditoria) e **VIS Medical / Domus** (SaaS clínico, app separado). O objetivo: **uma única plataforma administrando tudo** — SuperAdmin único, conceito de Produtos extensível (VIS Dental, Vet, Beauty…), cadastro com escolha de produto e provisionamento 100% automático, trial self-service de 14 dias idêntico nos dois, site único vendendo ambos, métricas centralizadas e segmentadas, escala a milhares de tenants, LGPD/segurança por construção.

## 2. Decisões do dono (RATIFICADAS — não reabrir sem motivo forte)

1. **FEDERAÇÃO, NÃO FUSÃO** (ratifica a decisão de 2026-07-16 "Domus é o produto, Vis é a operadora"). O Domus tem 116 pacientes / 109 prontuários REAIS em produção — CFM 1.821: prontuário não se apaga nem migra. Dois apps, dois bancos Neon. O Vis é o control plane (comercial); o Domus é o data plane (clínico). Fusão literal foi rejeitada: custo de meses, risco inaceitável sobre dados clínicos, e jogaria fora os canais de integração já provados em produção.
2. **Domínios:** o cliente Domus **existente** continua entrando por `app.domussaude.com.br` (zero disrupção). Clientes **novos** entram por **`medical.vis.app.br`** — ambos são domínios do MESMO projeto Vercel do Domus (config de domínio + DNS, quase zero código). Convites, e-mails e marketing apontam sempre para o canônico novo (`medical.vis.app.br`).
3. **Troca de produto "como quem muda de filial"** (cliente que contrata ótica E clínica): fase FUTURA já desenhada — SSO-leve por token assinado de curta duração sobre o canal HMAC existente (menu "Ir para Medical" no dashboard da ótica e vice-versa; o outro lado valida o token e abre a própria sessão). **Gatilho de construção: o 1º cliente dual real** (`Company.ownerGroupId` já modela a relação comercial).

## 3. Estado atual VERIFICADO (exploração de 2026-07-22 — a sessão executora NÃO precisa re-explorar)

### 3.1 O que JÁ EXISTE e está em produção (~60% da visão)

**Conceito de produto (Vis):**
- Enum `PlatformProduct { VIS_APP, VIS_MEDICAL }` — `prisma/schema.prisma:4019`.
- `Company.platformProduct` (default VIS_APP, `schema.prisma:135`), `Company.domusClinicId` (uuid `@unique`, o vínculo 1:1 com a clínica no Domus, `:139`), `Company.ownerGroupId` (`:140`), `@@index([platformProduct])` (`:237`).
- `Plan.platformProduct` (`:2625`), `Plan.tier` (`PlanTier: clinic_full|ophthalmology|specialist`, `:2628`), `Plan.selfServiceSelectable` (`:2631`).
- **Catálogo em prod:** ótica = `basico` R$149,90 ACTIVE (+ basico-nf/profissional/rede COMING_SOON) — todos `selfServiceSelectable=false`; medical = `medical-profissional` R$89,90 tier specialist e `medical-clinica` R$189,90 tier clinic_full — ambos ACTIVE `selfServiceSelectable=true`; `interno-domus` R$0 (não-comercial).

**SuperAdmin (Vis, `src/app/admin/(painel)/`):**
- Toggle global de produto VIS App / VIS Medical no nav (`admin-nav.tsx:62-115`), cookie `admin.product` via `/api/admin/product-context`.
- Lente central **pronta e bem desenhada**: `src/lib/admin-product-context.ts` — `getProductContext()`, `productWhereFilter()` (3 vias de aninhamento: Company direto, via `company`, via `subscription.company`), `notDeletedFilter()`.
- **Dashboard** (`page.tsx` + `dashboard-filters.ts`) e **Clientes** (`clientes/page.tsx` + `/api/admin/clientes/route.ts`) JÁ filtram por produto.
- **API de criação de cliente JÁ é product-aware**: `/api/admin/clientes/create/route.ts` + `provision-product.ts` — aceita `platformProduct`+`ownerGroupId`, valida, e PULA o finance setup ótico para VIS_MEDICAL. (Mas o FORM não envia — gap.)

**Canais de integração (ambos EM PROD, provados):**
- **② Entitlements Vis→Domus:** trigger de banco em Company/Subscription → `EntitlementRevision` (relógio monotônico, sequence) + `EntitlementOutbox` (por-company, token seq) → worker `entitlement-outbox-worker.ts` drena → `vis-domus-publisher.ts` publica payload HMAC (writeAllowed/tier/status/sourceRevision) → Domus espelha em `clinic_entitlements` (update condicional por revisão, `~/SISTEMACLINICADOMUS/src/lib/vis-entitlement-sync.ts`). + cron `reconcile-entitlements` horário + revogação de órfãos (`EntitlementRevocationOutbox`, reasons COMPANY_DELETED=terminal / UNLINKED=TTL). Guard de escrita no Domus: `assert-write-allowed.ts`, fail-open atrás de `ENFORCE_VIS_ENTITLEMENTS` (**OFF hoje** — ligar é a Fase 5).
- **③ Plan-change saga Domus→Vis:** outbox durável no Domus (`plan_change_requests`, eventId estável) → POST HMAC `/api/internal/domus/plan-change` no Vis → saga Asaas-first (charge→apply→publish) com lease/fencing, retry worker, estados terminais + alertas financeiros. **Self-service de troca de tier LIGADO e provado E2E com cobrança real.** Trial→pago ainda NÃO é caso aceito pela saga (verificar pré-condições — Fase 5).

**Funil comercial (Vis):**
- Site em `src/app/(landing)/` (home, `/precos`, `/funcionalidades`, `/contato`, blog) — copy 100% ótica (`src/lib/constants.ts`).
- Signup público: `/registro` (form 3 passos) → `POST /api/public/register` — cria Company+Branch+User(ADMIN)+Subscription TRIAL 14d (`trialEndsAt = now + plan.trialDays`)+CompanySettings+finance ótico, numa transação. Trial enforcement: `src/lib/subscription.ts` (`checkSubscription` TRIAL→TRIAL_EXPIRED idempotente; `LIVE_STATUSES`; `requireWriteAccess`).
- Checkout self-service: `/dashboard/upgrade` → `/api/billing/checkout` (Asaas boleto/pix/cartão, idempotente) — vive no dashboard ÓTICO.
- E-mails SaaS: `src/lib/emails/saas-email-catalog.ts` (WELCOME, TRIAL_ENDING, TRIAL_EXPIRED, INVOICE_*, PAYMENT_CONFIRMED, SUSPENDED, CANCELED) — genéricos "Vis".

**Domus (tenant lifecycle):**
- Tenant = `clinics` (uuid PK); usuário↔clínica = `users_to_clinics` (role admin|doctor|secretary); sessão better-auth injeta `user.clinic` = **`clinics[0]`** (sem switcher — limitação conhecida "1 clínica por conta").
- **Criação self-service DESLIGADA de propósito** (`src/actions/create-clinic/index.ts:25`, flag false — prevenção de buraco de receita). Clínica nasce SÓ por provisionamento do Vis. Hoje: scripts manuais (`scripts/sombra-e2e-3-domus-insert.ts` é o protótipo transacional exato: clinic + user + account scrypt + vínculo admin + clinic_entitlements, atômico).
- Auth: better-auth email/senha + Google (`src/lib/auth.ts`), login em `/authentication`; middleware só checa cookie de sessão. Sem lógica de host/subdomínio.
- Billing awareness: `clinic_entitlements` (espelho), página `/subscription` + `plan-picker.tsx` (dispara a saga). SEM conceito próprio de trial (correto — trial é do Vis).

### 3.2 GAPS confirmados (o trabalho real)

**Vis:**
1. ~~**P0: planos medical vazando no funil ótico**~~ — **JÁ CORRIGIDO** (branch `fix/fase0-product-filter`, Codex aprovado): `/api/public/plans` filtrava só `isActive` (os medical ACTIVE com preço>0 eram servidos à página de preços da ótica — e o medical R$89,90 é mais barato que o básico R$149,90); `/api/public/register` aceitava `planId` medical (ótica nasceria com plano de clínica). Fix: `platformProduct:"VIS_APP"` nas 3 wheres. **⚠️ NUNCA filtrar o funil por `selfServiceSelectable` — os planos de ótica estão TODOS `false` em prod (o flag só foi setado nos medical); filtrar quebraria o signup da ótica.**
2. Telas do admin que IGNORAM o toggle de produto: **Assinaturas** (`assinaturas/page.tsx`), **Financeiro** (`financeiro/page.tsx` + `faturas/` + `inadimplencia/`), **Relatórios** (`relatorios/page.tsx` — MRR/churn misturam produtos), **Saúde** (`saude/page.tsx`), **Usuários**, **Interessados**, **Suporte/Tickets**, **Configurações** (todas as subpáginas).
3. `src/lib/admin-metrics.ts` (computeMRR, computeMrrSeries, computeChurnRate…) não tem parâmetro de produto — só o Dashboard pré-filtra; Relatórios não.
4. Form de criação de cliente (`clientes/novo/new-client-form.tsx`) não envia `platformProduct`/`ownerGroupId` (a API aceita).
5. Signup público não é product-aware: hardcoda VIS_APP, roda finance ótico incondicionalmente, cria Branch/User de PDV (que o medical não usa).
6. Criação medical NÃO cria a clínica no Domus nem seta `domusClinicId` — o vínculo é out-of-band (scripts).
7. Descritor de checkout hardcoded "PDV Ótica" (`billing/checkout/route.ts:215`); e-mails SaaS sem branding por produto; landing 100% ótica.
8. `TenantDomain` (schema `:197`) é **pista falsa** — white-label por tenant, não roteamento por produto. Não usar.

**Domus:**
9. **NÃO existe API de provisionamento inbound** — o webhook de entitlement é update-only (422 `clinic_not_found` se a clínica não existe; `vis-entitlement-sync.ts:224`). A criação automatizada exige rota nova.
10. Sem onboarding por convite/magic-link para o primeiro admin (scripts setam senha temporária).
11. better-auth precisa aceitar as 2 origens (domínio legado + `medical.vis.app.br`) — `baseURL`/trustedOrigins/cookies.

## 4. Arquitetura-alvo (consolidada)

```
VIS = CONTROL PLANE (vis.app.br)              DOMUS = DATA PLANE
• site/funil dos 2 produtos                   (medical.vis.app.br NOVO canônico
• SuperAdmin multi-produto (lente + Grupo)     + app.domussaude.com.br legado)
• billing/trial/dunning/e-mails (fonte única) • app clínico + better-auth próprio
• Company/Plan = raiz do tenant comercial     • clinics = raiz do tenant clínico
• Neon #1 (ZERO PHI)                          • clinic_entitlements (espelho)
                                              • PHI SÓ AQUI (CFM/LGPD) · Neon #2
        └────────── 3 canais HMAC, idempotentes, versionados ──────────┘
   ① Provisioning API (NOVO, Vis→Domus)   — cria clínica+admin+espelho, atômico
   ② Entitlements    (EXISTE, em prod)    — writeAllowed/tier/status, revisão monotônica
   ③ Plan-change saga (EXISTE, em prod)   — cobrança Asaas-first, eventId estável

(futuro: VIS Dental = Neon #3 implementando os mesmos 3 canais = "Contrato de Data Plane")
```

**Princípios:**
- O Vis é a ÚNICA fonte de verdade comercial; cada data plane é a única fonte de verdade do domínio dele. Nada cruza a fronteira além dos 3 canais (+ futuro: agregados de uso anonimizados Domus→Vis).
- Toda comunicação inter-sistema: HMAC, idempotente por chave estável, retry via outbox, reconcile como rede de segurança. **Copiar o padrão existente** (`entitlement-outbox-worker.ts` / `vis-domus-hmac.ts`), nunca inventar outro.
- **Produto = enum Prisma + registro de configuração estático** no Vis (por produto: label, slug de marketing, loginUrl, branding de e-mail, descritor Asaas, estratégia de provisionamento, `selfServiceEnabled`, trialDays). Todos os `if VIS_MEDICAL` espalhados passam a consultar o registro. Tabela `Product` em banco: SÓ quando existir o 3º produto real (YAGNI).
- Nenhuma query de runtime cruza bancos (o Domus decide escrita pelo espelho local; o Vis mede pelo próprio banco). Um produto fora do ar não derruba o outro.

## 5. Fluxos-alvo detalhados

### 5.1 Signup medical self-service (o coração do projeto)

1. Site `vis.app.br/medical` → escolhe plano (via `/api/public/plans?product=VIS_MEDICAL`, filtrado também por `selfServiceSelectable=true` — os medical já estão true).
2. `/registro?produto=medical` — mesmo form adaptado: nome, e-mail, telefone, nome da clínica, documento. **SEM campo de senha** (onboarding por convite — ADR-06).
3. `POST /api/public/register` product-aware executa transação LOCAL no Vis: Company `VIS_MEDICAL` + Subscription TRIAL 14d + **`domusClinicId` PRÉ-ALOCADO pelo Vis** (uuid gerado — idempotência natural, o vínculo nasce no commit local) + **pula** finance ótico + **pula** Branch/User de PDV + enfileira job `PROVISION_DOMUS_CLINIC` num **outbox de provisionamento** (novo, cópia do padrão do entitlement outbox).
4. Worker de provisionamento (drain pós-commit + cron de retry) chama **`POST /api/internal/vis/provision`** no Domus — ROTA NOVA, HMAC igual à `internal/vis/entitlements`. Payload: `{clinicId (pré-alocado), visCompanyId, clinicName, admin:{name,email}, entitlement:{tier, status, writeAllowed:true, sourceRevision}}`.
5. **Domus provisiona atomicamente** (generalização direta do `sombra-e2e-3-domus-insert.ts`): `clinics` + `users` (sem senha) + `users_to_clinics` (admin) + **`clinic_entitlements` JÁ com o snapshot inicial e a revisão fornecida pelo Vis** — elimina a janela de 422 no onboarding; webhooks subsequentes com revisão maior aplicam normalmente (monotonicidade preservada). Gera **token de ativação** (uso único, TTL 72h) e devolve na resposta.
   - **Idempotência:** chave = `clinicId`. Replay mesmo `clinicId`+`visCompanyId` → 200 (novo token se não-ativado, senão no-op). `clinicId` existente com `visCompanyId` DIVERGENTE → 409 (nunca sobrescrever — anti cross-tenant).
6. Vis marca done e envia **e-mail de convite** (`medical.vis.app.br/activate?token=…`, template com branding medical — stack de e-mail é SÓ do Vis; o Domus não ganha stack de e-mail).
7. Usuário ativa (define senha no better-auth) e cai no dashboard clínico com trial rodando.

**Falhas:** Domus fora do ar → Company/trial criados, outbox retenta com backoff; UX do registro diz "enviamos um link de acesso para seu e-mail" (verdadeiro nos dois cenários). Provisionamento pendente > X min → alerta admin (mesmo canal SystemEvent dos alertas da saga). Reconcile: Company VIS_MEDICAL sem provisionamento confirmado após N horas → reemite/alerta. Convite expirado → rota de reenvio (rate-limited) + botão no SuperAdmin.

**Criação manual pelo SuperAdmin:** o form ganha seletor de produto e chama **o MESMO serviço** — um único caminho de código para self-service e manual (ADR-09). Scripts `link-domus-clinic.cjs`/`promote-company-to-medical.cjs` viram contingência.

### 5.2 Login
- Ótica: `vis.app.br` (NextAuth) — inalterado.
- Medical: `medical.vis.app.br` → projeto Vercel do Domus → better-auth (`/authentication`). **Zero proxy/host-routing no Vis** — é config de domínio. Revisar better-auth para as 2 origens (legado + novo); cookies com escopo estrito por host (NUNCA domain `.vis.app.br` — vazaria entre produtos).
- Site: "Entrar" vira menu com os 2 destinos. SuperAdmin: único, `vis.app.br/admin` (JWT próprio) — inalterado.
- SSO/switcher dual-produto: fase futura (seção 2.3).

### 5.3 Trial e conversão
- Trial: mecânica do Vis serve INTACTA. Expiração já propaga: TRIAL_EXPIRED → trigger → outbox → `writeAllowed:false` → Domus bloqueia ESCRITA (leitura preservada — CFM; validar que exportação também fica acessível). **Pré-requisito: ligar `ENFORCE_VIS_ENTITLEMENTS`** (sem enforcement, trial expirado medical não bloqueia nada).
- Conversão trial→pago: **pela saga existente**, acionada na `/subscription` do Domus. Ajustes no Vis: a saga aceitar origem TRIAL/TRIAL_EXPIRED (hoje presume assinatura paga — verificar `decideSagaAction`/pré-condições) + criar customer Asaas on-demand (no ótico isso acontece no checkout).
- UX: banner de contagem regressiva no Domus — adicionar `trialEndsAt` ao payload de entitlement (mudança ADITIVA no contrato, ADR-11). Trial expirado → parede de conversão com CTA para `/subscription`. Dunning/e-mails: CTA aponta para `medical.vis.app.br/subscription` quando VIS_MEDICAL.

### 5.4 Site/comercial
- Um repositório (o `(landing)` do Vis): home vira guarda-chuva dos 2 produtos; `/medical` com landing própria (copy clínica, sem promessas clínicas — cuidado publicitário CFM/CRM); `/precos` com abas por produto.
- Nome público ÚNICO por produto (ADR-12 — recomendação: "Vis Medical"; "Domus" permanece como marca da clínica-âncora e domínio legado). Descritor Asaas e e-mails por produto via registro de produtos.
- O repo `DOMUS CLINICA/domusclinica` (site institucional da clínica real) NÃO faz parte desta arquitetura — não confundir.
- Leads: `plan-interest`/`contato` ganham campo produto → tela Interessados (já filtrada pela lente na F1).

### 5.5 SuperAdmin
- **Completar a lente** nas 10+ telas (gap §3.2.2) com `productWhereFilter` — trabalho repetitivo, baixo risco.
- `admin-metrics.ts` ganha parâmetro `product: VIS_APP | VIS_MEDICAL | ALL`.
- **Dashboard "Grupo"** (fora do toggle): MRR total + por produto, clientes por produto, trials ativos, churn comparado — a tela que o dono olha de manhã.
- **Detalhe do cliente medical = painel da federação:** `domusClinicId`, revisão publicada × aplicada (via `GET /api/internal/domus/entitlements/[clinicId]` que já existe), status do provisionamento, botões "reenviar convite" / "republicar entitlement". Suporte deixa de rodar script.
- Health score medical: HOJE É CEGO (sinais só do banco ótico) — na F1 mostrar "score indisponível" para medical, NUNCA score errado. Feed real vem na F6.

## 6. Roadmap (8 fases, cada uma entregável e isolada)

**F0 — Hotfix + fundações (FEITA em 2026-07-22, aguarda deploy):** ✅ filtro `platformProduct` no plans/register públicos (P0) + teste; branch `fix/fase0-product-filter`, Codex aprovado. Restante da F0: criar o registro de produtos (config pura, sem migração) e ratificar o nome público.

**F1 — SuperAdmin 100% product-aware (só leitura, risco baixíssimo):** lente nas 10+ telas; `admin-metrics.ts` parametrizado; dashboard "Grupo"; "score indisponível" para medical; form de criação com seletor de produto (a API já aceita — mas SEM provisionamento Domus ainda: criar medical manual continua exigindo vínculo por script até a F2). Valor: o dono opera os 2 produtos com números segregados.

**F2 — Provisionamento (o núcleo, admin-first):**
- Vis: extrair **serviço único de provisionamento** (hoje duplicado entre register e admin-create); outbox de provisionamento + worker + cron de retry + reconcile + alerta; e-mail de convite (template medical); painel da federação no detalhe do cliente.
- Domus: **`POST /api/internal/vis/provision`** (HMAC no padrão `vis-domus-hmac.ts`, idempotente por `clinicId`, transação atômica dos 5 registros do padrão sombra, espelho inicial com revisão do Vis, token de ativação TTL 72h) + rota `/activate` no better-auth.
- Validação: criar clientes medical reais SÓ via SuperAdmin por 1-2 semanas antes de abrir o público. Aposentar scripts.
- Risco: médio (escrita cross-system) — mitigado por admin-first + padrão copiado dos canais provados.

**F3 — Domínio `medical.vis.app.br` (config, quase zero código):** domínio no projeto Vercel do Domus; better-auth `baseURL`/trustedOrigins/cookies para 2 origens; `noindex` nas rotas de app; redirect da raiz para `/authentication`; smoke completo de login/sessão/CSRF nos 2 domínios.

**F4 — Funil público medical (exposição externa):** landing `/medical` + `/precos` por produto; `/api/public/plans?product=` (aí sim com `selfServiceSelectable` — e é o momento de setar o flag corretamente nos planos de ótica); `/registro?produto=medical` usando o serviço da F2 (fluxo de convite); branding por produto em e-mails/checkout; leads com produto. **Go-live do trial self-service medical.** Anti-abuso: rate limit existente + e-mail verificado de graça pelo convite + revisão manual opcional nos primeiros meses.

**F5 — Conversão e enforcement (dinheiro):** ligar `ENFORCE_VIS_ENTITLEMENTS` (pós-observação do canal; medir de novo quantas clínicas seriam bloqueadas — última medição: 0); saga aceita origem TRIAL/TRIAL_EXPIRED; customer Asaas on-demand; `trialEndsAt` no contrato de entitlement (aditivo); banner + parede de conversão no Domus; dunning com CTA medical. **E2E com cobrança real (método clínica-sombra, já provado).**

**F6 — Métricas avançadas + telemetria:** trial-conversion/churn/MRR-bridge por produto; cross-sell via `ownerGroupId`; **canal de agregados de uso Domus→Vis** (SÓ contagens LGPD-safe: consultas/mês, usuários ativos — zero PHI) alimentando o health score medical.

**F7 — Hardening e operação:** painel "Saúde da Federação" no admin (lag de revisão publicada×aplicada por clínica, filas dos outboxes, provisionamentos pendentes); runbooks; teste de DR por banco; itens residuais do registro de riscos.

**F-futura (gatilho: 1º cliente dual):** switcher cross-produto por token assinado (SSO-leve sobre o canal HMAC); consolidação opcional de identidade (`id.vis.app.br`) só com dezenas de casos reais.

**Ordem justificada:** F1 antes de F2 (operar às cegas um funil novo é o maior risco real) · F2 antes de F4 (o caminho admin valida a integração sem exposição pública) · F3 antes de F4 (o convite aponta para o domínio) · F5 depois de F4 (conversão sem funil não tem tráfego; enforcement antes de trials expirados públicos evita constrangimento com clientes reais).

## 7. ADRs (decisões arquiteturais a manter)

| # | Decisão |
|---|---|
| ADR-01 | Federação, não fusão. Vis=operadora; produtos=data planes com banco e auth próprios. |
| ADR-02 | Domínio medical = domínio do projeto Vercel do Domus (legado + canônico novo). ZERO proxy/host-routing no Vis. `TenantDomain` fora do escopo. |
| ADR-03 | Produto = enum Prisma + registro de config estático. Tabela em banco só no 3º produto. |
| ADR-04 | O Vis ALOCA o `clinicId` (uuid) antes da chamada e orquestra o provisionamento via outbox próprio + API idempotente no Domus. |
| ADR-05 | O provisionamento grava `clinic_entitlements` ATOMICAMENTE com a clínica, com revisão alocada pelo Vis — sem janela de 422 no onboarding. |
| ADR-06 | Onboarding por convite (token de ativação better-auth, TTL 72h). Senha NUNCA transita entre sistemas. O Vis envia TODOS os e-mails. |
| ADR-07 | Sem SSO entre produtos nesta geração. Cookies com escopo estrito por host. `ownerGroupId` modela o dono multi-produto. Switcher = F-futura por token. |
| ADR-08 | Conversão trial→pago do medical pela saga de plan-change existente, acionada na `/subscription` do Domus. NÃO construir portal de billing no Vis para o tenant medical. |
| ADR-09 | Serviço de provisionamento ÚNICO no Vis para admin e self-service (fim da duplicação register × create). |
| ADR-10 | PHI JAMAIS no Vis; payloads inter-sistema = operacional + PII mínima do admin (nome, e-mail); agregados de uso só como contagens. |
| ADR-11 | Contratos de canal versionados ADITIVAMENTE (campos novos opcionais; nunca mudar semântica de campo existente). |
| ADR-12 | Um nome público por produto, aplicado uniformemente em site, e-mails, checkout e faturas. |

## 8. Registro de riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | ~~Planos medical vazando no funil ótico~~ | — | — | ✅ CORRIGIDO (F0, aguarda deploy) |
| R2 | Provisionamento parcial (Company sem clínica) | Média | Alto | UUID pré-alocado + outbox retry + reconcile + alerta + painel admin |
| R3 | Corrida provisionamento × entitlement (422) | Média | Médio | ADR-05 (espelho atômico com revisão do Vis) |
| R4 | Regressão da revisão monotônica pelo espelho inicial | Baixa | Alto | Revisão alocada da MESMA sequence `entitlement_revision_seq`; teste adversarial dedicado |
| R5 | Saga não aceita origem TRIAL / sem customer Asaas | Alta | Alto | F5 com E2E de cobrança real (método sombra) |
| R6 | better-auth quebrado no domínio novo (cookies/CSRF/origins) | Média | Alto | F3 isolada com smoke completo antes do funil |
| R7 | Ligar enforce bloqueando a clínica real (116 pacientes) | Baixa | Crítico | Observação prolongada + kill-switch + verificar o entitlement da clínica âncora antes |
| R8 | Abuso de trial medical | Média | Médio | Rate limit + e-mail verificado pelo convite + revisão manual inicial |
| R9 | Branding errado (fatura "PDV Ótica" para médico) | Alta | Médio | Registro de produtos como fonte única; auditoria de templates na F4 |
| R10 | Preview/dev do Vis provisionando no Domus de prod | Média | Alto | Secret ausente em preview = canal desativado fail-closed (padrão já usado) |
| R11 | Preview do DOMUS apontando pro Neon de prod | Média | Crítico | PHI em preview = incidente LGPD — auditar envs de preview do Domus |
| R12 | Offboarding medical (churn) | Certa (eventual) | Alto | CFM: retenção ~20 anos — revogar entitlement, reter dados, oferecer exportação; NUNCA delete físico |

## 9. O que o dono provavelmente não pensou (decidir cedo)

1. **Impersonation/suporte no medical:** o impersonate do SuperAdmin só entra no app ótico. Suportar clínicas exigirá acesso break-glass AUDITADO e consentido no Domus (implicação LGPD forte — suporte vendo PHI) — ou aceitar suporte "às cegas". Decidir antes da F4.
2. **Health score medical cego** — mostrar "indisponível" até a F6; nunca score errado (falso churn-risk).
3. **Offboarding ≠ delete** + papel formal de OPERADOR (LGPD): a clínica é a controladora do PHI; formalizar DPA/termos do medical.
4. **NFS-e do SaaS:** código de serviço/descrição por produto na emissão fiscal (Focus).
5. **Mesmo e-mail em duas bases:** o painel do cliente no admin deve mostrar EM QUAL produto o e-mail existe ("resetei sua senha" é ambíguo).
6. **`clinics[0]` fixo na sessão do Domus:** dono com 2 clínicas = bomba conhecida; limitação comercial "1 clínica por conta de usuário" até o switcher.
7. **Monitoramento da federação como produto interno** (painel Saúde da Federação, F7) — paga-se na primeira incidência.
8. **Copy medical:** sem promessas clínicas (cuidado publicitário CFM/CRM).

## 10. Visão de longo prazo

- **Ano 1:** consolidar a operadora — os 3 canais viram o **"Vis Platform Contract"** documentado; VIS Dental/Vet nascem implementando o contrato, não copiando código.
- **SSO/conta unificada** quando houver demanda real de donos multi-produto (dezenas de `ownerGroupId` ativos).
- **BI/warehouse leve** quando as métricas cruzadas crescerem (extração analítica dos 2 Neons, sem PHI).
- **Catálogo de produtos em banco** com 4+ produtos ou gestão self-service de produto.
- **O ativo estratégico é o control plane:** cada produto novo custa marginalmente menos. A tese "Vis = operadora" transforma a empresa de "dois SaaS" em "plataforma que lança verticais" — proteger a disciplina dos contratos entre sistemas é proteger essa tese.

## 11. Arquivos-âncora (para a execução)

**Vis:**
- `src/lib/admin-product-context.ts` — a lente (pronta; propagar na F1)
- `src/lib/admin-metrics.ts` — parametrizar por produto (F1)
- `src/app/admin/(painel)/` — as telas do gap §3.2.2 (F1)
- `src/app/api/admin/clientes/create/route.ts` + `provision-product.ts` — base do serviço único (F2)
- `src/app/api/public/register/route.ts` + `src/app/api/public/plans/route.ts` — funil (F0 feita; F4)
- `src/lib/entitlement-outbox-worker.ts` + `prisma/migrations/20260722120000_entitlement_outbox/` — padrão de outbox a replicar no provisionamento (F2)
- `src/lib/vis-domus-publisher.ts` — publisher + payload de entitlement (F5: adicionar trialEndsAt)
- `src/app/api/internal/domus/plan-change/route.ts` + `src/lib/domus-plan-change/` — a saga (F5: aceitar TRIAL)
- `src/lib/emails/saas-email-catalog.ts` — branding por produto (F4)
- `src/app/(landing)/` + `src/lib/constants.ts` — site (F4)

**Domus:**
- `scripts/sombra-e2e-3-domus-insert.ts` — protótipo transacional EXATO da `POST /api/internal/vis/provision` (F2)
- `src/app/api/internal/vis/entitlements/route.ts` + `src/lib/vis-domus-hmac.ts` — referência de HMAC/idempotência (F2)
- `src/lib/vis-entitlement-sync.ts` — espelho/revisão (F2: entender a monotonicidade antes de gravar o espelho inicial)
- `src/lib/auth.ts` + `src/middleware.ts` — better-auth 2 origens (F3)
- `src/app/(protected)/subscription/` + `src/actions/request-plan-change/` — conversão (F5)
- `src/lib/entitlement/assert-write-allowed.ts` — o guard do enforce (F5)
