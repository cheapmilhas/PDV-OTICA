# PDV Ótica — Onboarding para Desenvolvedores

Guia rápido para subir o projeto local e entender o que foi feito nos sprints S0-S7.

## Stack

- **Next.js 16.2** (App Router, RSC parcial)
- **Prisma 5.22** + **PostgreSQL** (Neon)
- **NextAuth v5 beta** (JWT, multi-tenant)
- **TypeScript 5.9** strict
- **Tailwind 3** + **Shadcn UI** (Radix)
- **Vitest 4** (testes unitários, 60+ passing)
- **PostHog** (analytics)
- **Asaas** (cobrança recorrente)
- **Focus NFe** (emissão fiscal — desligado por padrão)
- **Evolution API** (WhatsApp — desligado por padrão)

## Setup local

```bash
# 1. Clone e instale
git clone <repo>
cd "PDV OTICA"
npm install

# 2. Configure .env (use .env.example como base)
cp .env.example .env
# Preencha: DATABASE_URL, NEXTAUTH_SECRET (mínimo)

# 3. Gere o Prisma Client
npx prisma generate

# 4. (Apenas para banco novo) Push schema
npx prisma db push

# 5. Seed básico (plans, permissions)
npm run db:seed:plans
npm run seed:permissions

# 6. Rodar dev server
npm run dev

# 7. Rodar testes
npm test
```

## Variáveis de ambiente

Todas estão documentadas em `.env.example`. Resumo do que cada feature precisa:

| Feature | Vars obrigatórias | Status default |
|---|---|---|
| **Banco** | `DATABASE_URL`, `DIRECT_URL` | ⚠️ Obrigatório |
| **Auth** | `NEXTAUTH_SECRET` ≥32 chars | ⚠️ Obrigatório |
| **PostHog** | `NEXT_PUBLIC_POSTHOG_KEY` | Opcional |
| **Asaas** | `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Opcional |
| **Focus NFe** | `FOCUS_NFE_TOKEN`, `FOCUS_NFE_ENV` | Desligado |
| **WhatsApp** | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME` | Desligado |
| **Anthropic** | `ANTHROPIC_API_KEY` | Para OCR de receita |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Para upload de imagem |

## Estrutura

```
src/
├── app/
│   ├── (landing)/           # site público
│   ├── (auth)/              # login
│   ├── (dashboard)/         # app autenticado (47+ páginas)
│   ├── admin/               # painel super-admin
│   └── api/                 # 255+ routes
│       ├── billing/         # Asaas checkout
│       ├── webhooks/        # Asaas, Focus NFe
│       ├── lgpd/            # portabilidade, exclusão, retificação
│       ├── fiscal/nfce/     # emissão NFC-e (desligado)
│       └── cron/dunning/    # cobrança automática
├── components/
│   ├── ui/                  # primitivos shadcn + StatusBadge + ResponsiveTable
│   ├── pdv/                 # NoFiscalBanner, DiscountApprovalModal
│   ├── clientes/            # LgpdConsentCheckbox
│   ├── dashboard/           # OnboardingChecklist
│   └── providers/           # PostHogProvider, PostHogIdentify, SessionProvider
├── lib/
│   ├── analytics.ts         # track(), identify() — client
│   ├── posthog-server.ts    # trackServer() — server
│   ├── logger.ts            # logger estruturado (substitui console.*)
│   ├── serialize.ts         # serializePrisma (Decimal→number)
│   ├── asaas.ts             # cliente Asaas
│   ├── focus-nfe.ts         # cliente Focus NFe (latente)
│   ├── whatsapp.ts          # Evolution API (latente)
│   ├── whatsapp-templates.ts # templates de mensagem
│   ├── lgpd.ts              # recordConsent, anonymizeCustomer
│   ├── penalty-utils.ts     # cálculo de juros/multa
│   ├── product-price.ts     # preço com override por filial
│   ├── rate-limit.ts        # rate limiter in-memory
│   └── auth-helpers.ts      # requireAuth, getCompanyId
└── services/                # services Prisma (sale, OS, finance, etc)
```

## Sprints concluídos

Plano original em `PLANO_SPRINTS_2026.md`. Sumário final:

| Sprint | Tema | Highlights |
|---|---|---|
| **S0** | Não morrer | C1/C2 auth fix, jsPDF audit, PostHog, Termos LGPD, runbook ANPD |
| **S1** | Cobrar dinheiro | Asaas (checkout + webhook idempotente), /upgrade, eventos PostHog |
| **S2** | Rede de segurança | Vitest + 47 testes iniciais, logger, N+1 fixes, CI GitHub Actions |
| **S3** | OS→Venda + UX | Convert endpoint, 22 campos prescrição, ResponsiveTable, StatusBadge |
| **S4** | NFC-e latente | Focus NFe completo mas desligado (FOCUS_NFE_TOKEN ausente = 503) |
| **S5** | Crediário | Renegociação, estorno, carnê HTML, penalty automático |
| **S6** | LGPD + hardening | Consent, AccessLog, anonimização, CSP, HSTS, dunning, DR backup |
| **S7** | ARPU + retenção | WhatsApp (latente), templates, share-link assinado, checklist, aprovação desconto |

Total: **8 commits**, **60+ testes verde**, **0 CVEs CRÍTICOS**, **type check verde**.

## Comandos úteis

```bash
npm run dev                  # dev server
npm run build                # build production
npm run start                # serve production
npm test                     # vitest run
npm run test:watch           # vitest watch mode
npm run test:coverage        # coverage report
npm run lint                 # eslint
npx tsc --noEmit             # type check
npx prisma generate          # regenera client após editar schema
npx prisma db push           # aplica schema no banco (dev)
npx prisma studio            # GUI do banco
```

## Decisões arquiteturais importantes

1. **NFC-e desligada por padrão** — Cliente decidiu não emitir NFC-e nesta versão.
   Toda a infraestrutura está pronta (cliente Focus NFe, endpoints, schema). Para
   ligar: criar conta Focus NFe, configurar `FOCUS_NFE_TOKEN`, pushar schema,
   habilitar `Branch.fiscalEnabled`. Banner "Esta venda não gera documento fiscal"
   disponível em `src/components/pdv/no-fiscal-banner.tsx`.

2. **WhatsApp via Evolution API** — Self-hosted recomendado (~R$30/mês VPS Hetzner)
   ou cloud. Templates em `src/lib/whatsapp-templates.ts`. Wrapper graceful: sem
   credenciais, retorna `{ sent: false }` sem quebrar.

3. **LGPD em camada de dados** — Anonimização não deleta linha (preserva FK das
   vendas para integridade financeira), apenas substitui campos pessoais por
   placeholders. AccessLog para auditoria opcional, registrar apenas em
   operações sensíveis (visualizar receita, exportar).

4. **PostHog identifica automaticamente** — `PostHogIdentify` component escuta
   sessão NextAuth e chama `identify` com userId+companyId+role. Reset no logout.

5. **Asaas é a única integração de billing** — Sem Stripe, sem Pagar.me. PIX/
   boleto/cartão. Webhook idempotente via `BillingEvent.externalEventId @unique`.

6. **Tests via Vitest, não Jest** — Cobertura focada em puro/sem-DB (penalty,
   serialize, product-price, asaas client, focus-nfe client). Integração com
   banco real fica para sprint dedicado de E2E.

7. **CSP em report-only** — Não bloqueia, apenas avisa no console. Trocar para
   `Content-Security-Policy` após validar logs por uns dias.

## Operações em produção

- **Deploy**: Vercel (auto-deploy do branch `main`).
- **Backup DB**: GitHub Actions cron (`.github/workflows/backup.yml`) diário às
  03:00 UTC → S3. Requer secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `BACKUP_S3_BUCKET`, `DATABASE_URL`.
- **Dunning Asaas**: cron Vercel (`vercel.json`):
  ```json
  { "crons": [{ "path": "/api/cron/dunning", "schedule": "0 8 * * *" }] }
  ```
  Requer `CRON_SECRET` em env.
- **Logs**: Vercel Logs (estruturado JSON em produção).
- **Incidente de segurança**: seguir `docs/RUNBOOK_INCIDENTE.md` (notificação
  ANPD em 3 dias úteis para dado sensível).

## Pendências conhecidas

- `xlsx` tem CVE sem fix (Prototype Pollution + ReDoS). Mitigação: endpoints
  autenticados + multi-tenant + serverless isolado. Migração para `exceljs`
  planejada em sprint dedicado. Ver `docs/KNOWN_VULNERABILITIES.md`.
- `@anthropic-ai/sdk` 0.87.0 tem CVE moderada no Local Filesystem Memory Tool
  (não usado no projeto). Update para 0.98.0 no próximo refresh de deps.
- Integração `PostHogIdentify` ainda usa anonymous ID em SSR (esperado — só
  funciona client-side).
- Página `/recibo/[token]` (rota pública para visualizar recibo via link
  WhatsApp) ainda não foi criada — basta validar JWT e renderizar HTML.
- `S7.5` (aprovação de desconto) tem componente e endpoint, falta integrar no
  fluxo do PDV (substituir `confirm()` por modal).
- Modal de consentimento LGPD criado como componente, falta plug no
  `modal-novo-cliente`.

## Links úteis

- Documentação completa: `docs/`
- Análise inicial: `ANALISE_COMPLETA_2026-05.md`
- Plano de sprints: `PLANO_SPRINTS_2026.md`
- Comparativo com ssOtica: `CRUZAMENTO-PDV-OTICA-VS-SSOTICA.md`
- Vulnerabilidades conhecidas: `docs/KNOWN_VULNERABILITIES.md`
- Runbook de incidente: `docs/RUNBOOK_INCIDENTE.md`
