# 01 — Arquitetura Geral

> Mapeamento estático e somente-leitura. Toda afirmação tem evidência (arquivo + linha) ou está marcada como "INCERTO" / "NÃO ENCONTRADO".

## 1. Métricas do projeto

| Métrica | Valor | Fonte |
|---|---|---|
| Arquivos `.ts`/`.tsx` em `src/` | **657** | `find src -name "*.ts*" \| wc -l` |
| LOC (todo `src/`) | **129.627** | `wc -l` agregado |
| Pages (`page.tsx`) | **105** | `find src/app -name page.tsx` |
| API Routes (`route.ts`) | **255** | `find src/app -name route.ts` |
| Layouts (`layout.tsx`) | **7** | `find src/app -name layout.tsx` |
| Models Prisma (linhas do schema) | schema com **3.820 linhas** | `wc -l prisma/schema.prisma` |
| Migrations | **5** | `ls prisma/migrations/` |
| Services em `src/services/` | **33** | `ls src/services` |
| Libs em `src/lib/` | **38** | `ls src/lib` |
| Hooks em `src/hooks/` | **11** | `ls src/hooks` |

## 2. Versões e stack (`package.json`)

### Core
- **Next.js**: `^16.1.6`
- **React**: `^19.2.4`
- **React DOM**: `^19.2.4`
- **TypeScript**: `^5.9.3`
- **Node types**: `^25.2.0`

### ORM / Auth
- **Prisma (CLI)**: `^5.22.0` (devDep)
- **@prisma/client**: `^5.22.0`
- **next-auth**: `^5.0.0-beta.30` (NextAuth v5 BETA — relevante: comentário em `src/auth.ts:14` indica que `PrismaAdapter` está desativado por "conflito de tipos no NextAuth v5 beta")
- **@auth/prisma-adapter**: `^2.11.1`
- **bcryptjs**: `^3.0.3`
- **jose**: `^6.1.3` (usada para JWT admin paralelo — ver `src/middleware.ts:4`)

### UI / Estilos
- **Tailwind**: `^3.3.0` + `tailwind-merge ^3.4.0`
- **shadcn/ui**: usa `@radix-ui/*` (15+ pacotes radix), `class-variance-authority ^0.7.1`, `clsx ^2.1.1`
- **lucide-react**: `^0.563.0`
- **framer-motion**: `^12.38.0`
- **react-hook-form**: `^7.71.1` + `@hookform/resolvers ^5.2.2`
- **zod**: `^4.3.6`
- **sonner**: `^2.0.7` (toast)
- **react-hot-toast**: `^2.6.0` (⚠️ duas libs de toast coexistindo — 🟡 SUSPEITA, ver relatório 14)
- **cmdk**: `^1.1.1`

### Estado / Dados
- **zustand**: `^5.0.11`
- **date-fns**: `^4.1.0` + `date-fns-tz ^3.2.0`
- **@dnd-kit/core**, **@dnd-kit/sortable**, **@dnd-kit/utilities**

### Funcionalidades específicas
- **@supabase/supabase-js**: `^2.103.0` (uso em `src/lib/supabase.ts`)
- **@anthropic-ai/sdk**: `^0.87.0` (provavelmente OCR de prescrição — ver `/api/ocr/prescription`)
- **bwip-js**: `^4.8.0`, **qrcode**: `^1.5.4` (códigos de barras / QR)
- **xlsx**: `^0.18.5`, **papaparse**: `^5.5.3` (importação/exportação)
- **jspdf**, **jspdf-autotable**, **html2canvas**, **pdf-utils** próprio
- **recharts**: `^3.7.0` (gráficos)
- **@remotion/***: `^4.0.441` (renderização de vídeo — INCERTO o uso real, precisa investigar)

### Dev
- **eslint**: `^9.39.2` + `eslint-config-next ^16.1.6`
- **prettier**: `^3.8.1`
- **tsx**: `^4.21.0`, **esbuild-register**: `^3.6.0` (para seeds)

## 3. Estrutura de pastas (até 3 níveis)

```
PDV OTICA/
├── prisma/
│   ├── migrations/          (5 migrations, ver §6)
│   ├── seeds/
│   └── schema.prisma        (3.820 linhas)
├── public/
│   └── uploads/logos/
├── scripts/
│   └── ralph/
├── src/
│   ├── app/
│   │   ├── (auth)/          → /login
│   │   ├── (dashboard)/     → 22 subdiretórios em /dashboard/*
│   │   ├── (landing)/
│   │   ├── activate/
│   │   ├── admin/           → painel SaaS (auth via JWT separado)
│   │   ├── api/             → 80+ subdiretórios de rotas API
│   │   ├── contato/, force-logout/, impersonate/, precos/, registro/
│   │   ├── auth.ts          → NextAuth v5 (jwt strategy)
│   │   ├── auth.config.ts   → config Edge-safe p/ middleware
│   │   └── middleware.ts    → roteamento dual: admin (jose) + dashboard (NextAuth)
│   ├── components/          → 27 subdirs (admin, auth, caixa, pdv, vendas, ...)
│   ├── content/
│   ├── hooks/               (11 hooks)
│   ├── lib/                 (38 utilitários — ver §7)
│   ├── middleware/          → require-permission.ts (helper p/ APIs)
│   ├── services/            (33 services — ver §8)
│   └── types/               → next-auth.d.ts
├── docs/
│   ├── assets/
│   └── audit/mapping/       (esta pasta — saída deste mapeamento)
├── docker-compose.yml
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── .env / .env.example
```

## 4. Configurações principais

### `next.config.ts`
- `reactStrictMode: true`
- `images.remotePatterns`: apenas `localhost` (http/https). 🟡 **SUSPEITA**: produção usa `public/uploads/logos` + Supabase, mas só `localhost` está liberado para `<Image>` remoto — ver relatório 14.
- **Headers globais (todas as rotas, `source: "/(.*)"`):**
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- ❌ **NÃO ENCONTRADO**: CSP (`Content-Security-Policy`), HSTS (`Strict-Transport-Security`).
- **Redirect**: `/dashboard/vendas/nova → /dashboard/pdv` (permanent).

### `src/middleware.ts`
- Matcher: `/((?!_next/static|_next/image|favicon.ico).*)` — roda em quase tudo.
- **Dual-auth:**
  1. `/admin/**` e `/api/admin/**` usam token próprio em cookie `admin.session-token`, validado com `jose.jwtVerify` (`AUTH_SECRET`/`NEXTAUTH_SECRET`).
  2. `/dashboard/**` e `/api/**` (não-admin, não-public) verificam apenas a **existência** do cookie `next-auth.session-token` ou `__Secure-next-auth.session-token` — **não decodifica o JWT no middleware** (linha 96–99: comentário explícito). 🟠 **RISCO**: middleware aceita qualquer cookie com nome certo, sem validar assinatura — ver relatório 06/15.
- **Rotas públicas hard-coded:** `/`, `/precos`, `/contato`, `/sobre`, `/login`, `/force-logout`, `/impersonate`, `/registro`, `/api/auth/*`, `/api/public/*`.

### `src/auth.ts` (NextAuth v5)
- Strategy: **JWT**, `maxAge: 30 dias`.
- `trustHost: true` (necessário para Vercel).
- **PrismaAdapter desativado** (linha 14, comentário): "conflito de tipos no NextAuth v5 beta". 🟡 **SUSPEITA**: pode haver consequências (sessões em DB, account linking).
- Provider único: **Credentials** (email/senha). Aceita login por nome (`login.includes("@") ? login : '${login}@login'`) — 🟡 padrão estranho de fallback.
- Callbacks `jwt` e `session` propagam: `id, name, email, role, branchId, companyId, networkId`.
- 🔴 **CONFIRMADO**: `console.log` em produção em `src/auth.ts:76, 84, 98, 126, 142, 150` (login/auth).

### `src/auth.config.ts` (Edge-safe)
- Versão sem Prisma/bcrypt para o middleware.
- Callback `authorized` redireciona logados em `/login → /dashboard` e bloqueia `/permissoes` se role != `ADMIN`.

## 5. Variáveis de ambiente

### Em `.env.example`
```
DATABASE_URL=***
NEXTAUTH_URL=***
NEXTAUTH_SECRET=***
NEXT_PUBLIC_APP_URL=***
VERCEL_URL=***
```

### Referenciadas em `src/`
```
process.env.AUTH_SECRET            (src/middleware.ts:9 — fallback de NEXTAUTH_SECRET)
process.env.NEXTAUTH_SECRET
process.env.NEXTAUTH_URL
process.env.NEXT_PUBLIC_APP_URL
process.env.NEXT_PUBLIC_SUPABASE_URL
process.env.NODE_ENV
process.env.SUPABASE_SERVICE_ROLE_KEY
```

🟠 **DIVERGÊNCIA**: `AUTH_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` estão referenciadas no código mas **não documentadas em `.env.example`** — ver relatório 14, item 13.

❌ **NÃO ENCONTRADO** (mas esperado para produção): `RESEND_API_KEY`/`SMTP_*` (envio de e-mail), `SENTRY_DSN`, `STRIPE_*`/`MERCADOPAGO_*` (pagamentos do SaaS), `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` (apesar de `@anthropic-ai/sdk` estar instalado — INCERTO).

## 6. Migrations Prisma (cronologia)

| # | Pasta | Tema |
|---|---|---|
| 1 | `20260216111301_add_laboratory_to_service_order` | OS ganha vínculo com laboratório |
| 2 | `20260326_sprint1_saas_admin_evolution` | Evolução do painel admin SaaS |
| 3 | `20260328_add_card_receivable` | Recebíveis de cartão |
| 4 | `20260328_add_recurring_expenses` | Despesas recorrentes |
| 5 | `20260331_add_impersonation_audit` | Auditoria de impersonation |

🟡 **SUSPEITA**: schema cresceu 3.820 linhas mas só há 5 migrations. Sugere uso intenso de `prisma db push` antes (ou consolidação manual). Auditoria de drift fica para o relatório 18.

## 7. Lib utilities (`src/lib/`)

```
admin-auth-helpers.ts       admin-session.ts
animations.ts               api-response.ts
auth-helpers.ts             auth-permissions.ts
constants.ts                counter.ts
customer-segments.ts        date-utils.ts            ⭐ relatório 13
default-messages.ts         error-handler.ts
excel-utils.ts              get-tenant.ts            ⭐ multi-tenant
health-score.ts             installment-utils.ts     ⭐ parcelamento
network-helpers.ts          payment-labels.ts        ⭐ relatório 13
payment-methods.ts          pdf-utils.ts
penalty-utils.ts            permissions.ts           ⭐ relatório 05
plan-features.ts            plan-limits.ts
prisma-audit-middleware.ts  prisma-tenant.ts         ⭐ relatório 06
prisma.ts                   product-price.ts
rate-limit.ts               report-export.ts
soft-delete.ts              stock-utils.ts           ⭐ relatório 13
subscription.ts             supabase.ts
utils-landing.ts            utils.ts
validate-branch.ts          ⭐ relatório 06
└── validations/            (Zod schemas)
```

## 8. Services (`src/services/`)

33 services organizados por domínio:

| Domínio | Services |
|---|---|
| Vendas / OS / Orçamentos | `sale.service.ts`, `service-order.service.ts`, `quote.service.ts`, `prescription.service.ts` |
| Financeiro / Caixa | `cash.service.ts`, `finance-entry.service.ts`, `finance-report.service.ts`, `finance-setup.service.ts`, `card-fee.service.ts`, `cashback.service.ts` |
| Estoque | `stock.service.ts`, `stock-movement.service.ts`, `stock-adjustment.service.ts` |
| Cadastros | `customer.service.ts`, `product.service.ts`, `supplier.service.ts`, `user.service.ts` |
| Conciliação bancária | `reconciliation-match.service.ts`, `reconciliation-parser.service.ts`, `reconciliation-resolution.service.ts`, `reconciliation-template.service.ts` |
| CRM / Marketing | `crm.service.ts`, `reminder.service.ts`, `goals.service.ts`, `product-campaign.service.ts` |
| Admin / Suporte | `admin-notification.service.ts`, `activity-log.service.ts`, `permission.service.ts`, `system-rule.service.ts`, `settings.service.ts`, `onboarding-checklist.service.ts` |
| Outros | `barcode.service.ts`, `reports.service.ts`, `reports/` |

## 9. Hooks (`src/hooks/`)

```
use-branch-context.tsx       use-counter-animation.ts
use-exit-intent.ts           use-media-query.ts
use-permission.ts            ⭐ relatório 05
use-scroll-progress.ts       use-toast.ts
useCompanySettings.ts        useCurrentUser.ts
usePermissions.ts            ⭐ relatório 05 (DUAS variantes: kebab e camel)
usePlanFeatures.ts
```

🟡 **SUSPEITA**: `use-permission.ts` (kebab) **e** `usePermissions.ts` (camel, plural) coexistem — possível duplicação. Ver relatório 05 e 14.

## 10. Pontos de atenção identificados nesta seção

| # | Achado | Classe | Onde |
|---|---|---|---|
| A1 | Middleware aceita cookie `next-auth.session-token` sem validar JWT | 🟠 RISCO | `src/middleware.ts:96-99` |
| A2 | `PrismaAdapter` desativado em NextAuth v5 beta | 🟡 | `src/auth.ts:14` |
| A3 | `console.log` com dados de auth em produção | 🔴 | `src/auth.ts:76,84,98,126,142,150` |
| A4 | `next.config.ts` libera `<Image>` apenas de `localhost` | 🟡 | `next.config.ts:6-15` |
| A5 | Sem CSP, sem HSTS configurados | 🟠 | `next.config.ts:17-29` |
| A6 | ENVs no código não estão em `.env.example` (`AUTH_SECRET`, Supabase) | 🟠 | `.env.example` vs grep |
| A7 | Duas libs de toast (`sonner` + `react-hot-toast`) | 🟡 | `package.json` |
| A8 | Hooks `use-permission` e `usePermissions` coexistem | 🟡 | `src/hooks/` |
| A9 | `@anthropic-ai/sdk` instalado, sem ENV em `.env.example` | 🟡 | `package.json` |
| A10 | Schema 3.820 linhas com apenas 5 migrations | 🟡 | `prisma/` |

> Detalhamento e classificação consolidados nos relatórios 14 e 17.
