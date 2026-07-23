# Plano Arquitetural — Unificação VIS + VIS Medical sob uma Operadora Única

## Contexto

O dono pediu uma revisão arquitetural completa (papel de CTO) para unificar os dois produtos — VIS (óticas) e VIS Medical/Domus (clínicas) — sob um único SuperAdmin, com conceito de Produtos extensível (Dental, Vet…), cadastro com escolha de produto e provisionamento automático, trial self-service de 14 dias idêntico ao da ótica, site único vendendo os dois, métricas centralizadas. **Sem escrever código nesta etapa — só o plano.**

A exploração dos dois repos revelou que **a espinha dorsal já existe e está em produção**: enum `PlatformProduct` em Company+Plan, toggle de produto no admin (Dashboard e Clientes já filtram), API de criação de cliente product-aware, catálogo de planos medical (R$89,90/R$189,90), canal de entitlements Vis→Domus (outbox+revisão monotônica+revogação, deployado hoje), saga de troca de plano Domus→Vis com cobrança Asaas provada E2E. O trabalho não é reconstruir — é **completar a operadora**.

## Decisões do dono (ratificadas nesta conversa)

1. **Federação, não fusão** — Domus segue app/banco separado (PHI/CFM lá, zero PHI no Vis); toda administração no SuperAdmin do Vis. Ratifica a decisão de 2026-07-16.
2. **Domínios:** cliente Domus existente continua em `app.domussaude.com.br` (nada muda); **novos clientes entram por `medical.vis.app.br`** — ambos domínios do MESMO projeto Vercel do Domus (config de domínio, quase zero código). Convites/marketing/e-mails apontam sempre pro canônico novo.
3. **Troca de produto "como mudar de filial"** (cliente que contrata os dois): fase futura desenhada — SSO-leve por token assinado sobre o canal HMAC existente (menu "Ir para Medical" na ótica e vice-versa). Constrói-se quando existir o 1º cliente dual (`ownerGroupId` já modela a relação).

## Revisão crítica — veredito

- **Arquitetura federada está correta** e é a melhor mesmo partindo do zero (LGPD por construção; canais provados; extensível por adição).
- **Descartar host-routing no `proxy.ts` do Vis** para o domínio medical — é config de domínio Vercel no projeto Domus, não engenharia. `TenantDomain` é pista falsa (white-label por tenant, não por produto).
- **🚨 BUG P0 LATENTE HOJE:** `/api/public/register` (fallback de plano por `sortOrder` sem filtrar `platformProduct`) e `/api/public/plans` (sem filtro) podem entregar plano medical a um cadastro de ótica — os planos medical JÁ existem no catálogo de prod. Hotfix imediato (Fase 0).
- **Duplicação de provisionamento:** registro público e admin-create reimplementam a mesma criação de tenant; só o admin é product-aware. Extrair serviço único antes de adicionar o caminho medical.
- **Conversão trial→pago do medical não tem dono:** a página de upgrade vive no dashboard ótico. Solução: a saga de plan-change existente, acionada pela `/subscription` do Domus (ajustar pré-condições para origem TRIAL + criar customer Asaas on-demand).

## Arquitetura (consolidada)

```
VIS = CONTROL PLANE (vis.app.br)          DOMUS = DATA PLANE (medical.vis.app.br
• site/funil dos 2 produtos                + app.domussaude.com.br legado)
• SuperAdmin multi-produto                • app clínico + better-auth próprio
• billing/trial/dunning/e-mails           • clinic_entitlements (espelho)
• Company/Plan (tenant root)              • PHI SÓ AQUI (CFM/LGPD)
• Neon #1 (zero PHI)                      • Neon #2
        └── 3 canais HMAC idempotentes ──────┘
   ① Provisioning API (NOVO, Vis→Domus)
   ② Entitlements Vis→Domus (EXISTE, prod)
   ③ Plan-change saga Domus→Vis (EXISTE, prod)
(futuro: VIS Dental = Neon #3, mesmos 3 canais = "Contrato de Data Plane")
```

**Produto = enum Prisma + registro de configuração estático** no Vis (label, loginUrl, branding de e-mail, descritor Asaas, estratégia de provisionamento, trialDays). Tabela `Product` só no 3º produto real (YAGNI).

## Fluxos-chave

**Signup medical (o coração):** site `/medical` → `/registro?produto=medical` (sem senha — onboarding por convite) → transação Vis: Company VIS_MEDICAL + Subscription TRIAL 14d + `domusClinicId` PRÉ-ALOCADO pelo Vis (idempotência natural) + job no outbox de provisionamento → worker chama `POST /api/internal/vis/provision` no Domus (NOVA rota HMAC, generaliza o script sombra: clinic+user+account+vínculo admin+espelho `clinic_entitlements` ATÔMICOS, com revisão fornecida pelo Vis — elimina a janela de 422) → Domus devolve token de ativação (TTL 72h) → Vis envia e-mail de convite (`medical.vis.app.br/activate?token=`) → usuário define senha no better-auth e cai no trial. Falhas: outbox retenta; reconcile + alerta admin para provisionamentos pendentes. O MESMO serviço atende a criação manual pelo SuperAdmin (form ganha seletor de produto).

**Login:** ótica em `vis.app.br` (NextAuth, inalterado); medical em `medical.vis.app.br` (better-auth do Domus — revisar `baseURL`/trustedOrigins/cookies para os 2 domínios). Site ganha "Entrar" com escolha de produto. Sem SSO nesta geração (ADR); switcher dual-produto = fase futura por token.

**Trial:** mecânica existente do Vis serve intacta; expiração já propaga via entitlement (`writeAllowed=false` → Domus bloqueia escrita, leitura preservada — CFM). **Pré-requisito: ligar `ENFORCE_VIS_ENTITLEMENTS`** (hoje OFF, pós-observação do canal recém-deployado).

**Conversão trial→pago:** saga de plan-change existente, acionada na `/subscription` do Domus. Ajustes: aceitar origem TRIAL/TRIAL_EXPIRED, customer Asaas on-demand, banner de contagem regressiva (adicionar `trialEndsAt` ao contrato de entitlement — mudança aditiva), parede de conversão pós-expiração, dunning com CTA medical.

**Site:** um repositório (o `(landing)` do Vis), seções por produto, `/precos` com abas consumindo `/api/public/plans?product=`. Descritor de checkout e e-mails SaaS por produto (hoje: "PDV Ótica" hardcoded e e-mails genéricos "Vis" — R9). Nome público único a ratificar.

**SuperAdmin:** completar a "lente" (`productWhereFilter` de `admin-product-context.ts`) nas 10+ telas que ignoram o toggle (Assinaturas, Financeiro, Faturas, Inadimplência, Relatórios, Saúde, Usuários, Interessados, Suporte, Configurações); `admin-metrics.ts` ganha parâmetro de produto + modo ALL; dashboard consolidado "Grupo" (MRR total/por produto, trials, churn comparado); detalhe do cliente medical mostra estado da federação (revisão publicada×aplicada, provisionamento, botões reenviar convite/republicar).

## Roadmap (cada fase entregável e isolada; disciplina do projeto: Codex por fase, migrations pelo dono)

- **Fase 0 — Hotfix + decisões (imediato):** filtrar `platformProduct`+`selfServiceSelectable` no register/plans públicos (fecha o P0); ratificar ADRs e nome público; criar o registro de produtos (config pura).
- **Fase 1 — SuperAdmin 100% product-aware (só leitura, risco baixíssimo):** lente em todas as telas + métricas parametrizadas + dashboard Grupo.
- **Fase 2 — Provisionamento (núcleo, admin-first):** serviço único no Vis; `POST /api/internal/vis/provision` no Domus (HMAC, idempotente por `clinicId`, atômico, espelho inicial); outbox+worker+reconcile; e-mail de convite; form admin com produto; painel de federação. Validar criando clientes reais só via admin por 1-2 semanas.
- **Fase 3 — Domínio `medical.vis.app.br` (config):** domínio no projeto Vercel do Domus; better-auth para os 2 domínios; noindex nas rotas de app; smoke de login/sessão/CSRF.
- **Fase 4 — Funil público medical:** landing + preços por produto + registro medical (fluxo de convite) + branding por produto em e-mails/checkout + leads com produto. Go-live do trial self-service.
- **Fase 5 — Conversão e enforcement (dinheiro):** ligar `ENFORCE_VIS_ENTITLEMENTS`; saga aceita TRIAL; customer Asaas on-demand; banner/parede de conversão; E2E com cobrança real (método sombra).
- **Fase 6 — Métricas avançadas:** trial-conversion/churn/MRR por produto; canal de agregados de uso Domus→Vis (contagens LGPD-safe) alimentando health score medical (hoje cego — mostrar "indisponível", nunca score errado).
- **Fase 7 — Hardening:** painel "Saúde da Federação" (lag de revisão, filas, provisionamentos pendentes), runbooks, DR por banco.
- **Fase futura (gatilho = 1º cliente dual):** switcher cross-produto por token assinado (SSO-leve sobre o canal HMAC).

## ADRs a ratificar (resumo)

Federação, não fusão · domínio medical = domínio Vercel do Domus (2 domínios: legado + canônico novo) · produto = enum + registro config · Vis aloca o `clinicId` e orquestra provisionamento via outbox · provisionamento grava espelho atomicamente com revisão do Vis · onboarding por convite (senha nunca transita) · sem SSO nesta geração · conversão pela saga existente · serviço de provisionamento único · PHI jamais no Vis · contratos versionados aditivamente · um nome público por produto.

## Riscos principais

P0 planos vazando no funil ótico HOJE (Fase 0) · provisionamento parcial (UUID pré-alocado+retry+reconcile+alerta) · saga não preparada para TRIAL/sem customer Asaas (Fase 5 + E2E real) · better-auth no domínio novo (Fase 3 isolada) · ligar enforce com clínica real de 116 pacientes (observação+kill-switch) · abuso de trial medical (convite = e-mail verificado + rate limit) · branding errado em e-mail/fatura ("PDV Ótica" pra médico) · preview do Domus apontando pra prod (PHI em preview = incidente LGPD) · offboarding CFM (retenção 20 anos — revogar entitlement, nunca delete físico).

## O que o dono provavelmente não pensou

Impersonation/suporte no medical (break-glass auditado — implicação LGPD forte, decidir cedo) · health score medical cego (mostrar "indisponível") · offboarding ≠ delete + DPA/papel de operador no termo medical · NFS-e do SaaS por produto · mesmo e-mail em duas bases (painel deve mostrar onde o e-mail existe) · `clinics[0]` fixo na sessão do Domus (limitação "1 clínica por conta" até o switcher) · copy medical sem promessas clínicas.

## Verificação (desta etapa)

Esta etapa entrega o documento arquitetural — sem código. Verificação = o dono lê e ratifica os ADRs e o roadmap. A execução começa pela **Fase 0** (hotfix do P0), que é a única urgência real: cada fase subsequente segue o processo padrão do projeto (brainstorming→spec→plano→subagentes→Codex por fase→deploy fatiado), como feito no Cadeado.

## Arquivos-âncora (referência para a execução futura)

- `src/lib/admin-product-context.ts` — a "lente" a propagar (pronta, bem desenhada)
- `src/app/api/public/register/route.ts` + `src/app/api/public/plans/route.ts` — hotfix P0 + funil product-aware
- `src/app/api/admin/clientes/create/route.ts` + `provision-product.ts` — base do serviço único de provisionamento
- `src/lib/admin-metrics.ts` — parametrizar por produto
- `src/lib/entitlement-outbox-worker.ts` — padrão de outbox a replicar no provisionamento
- `~/SISTEMACLINICADOMUS/scripts/sombra-e2e-3-domus-insert.ts` — protótipo transacional exato da futura `POST /api/internal/vis/provision`
- `~/SISTEMACLINICADOMUS/src/app/api/internal/vis/entitlements/route.ts` — referência de HMAC/idempotência
