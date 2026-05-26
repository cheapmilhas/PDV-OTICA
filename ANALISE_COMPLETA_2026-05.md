# 📊 Análise Completa — PDV ÓTICA
**Data**: 2026-05-25
**Escopo**: Arquitetura, Segurança, UX/UI, Performance, Negócio
**Metodologia**: 5 agentes em paralelo + cruzamento com documentação existente (CRUZAMENTO-PDV-OTICA-VS-SSOTICA.md, AUDITORIA_*, RAIO-X-SISTEMA.md)

---

## TL;DR Executivo

Produto técnico forte (130 modelos Prisma, 255 rotas API, ~67% de paridade com ssOtica). Três bloqueios urgentes:

1. **2 vulnerabilidades CRÍTICAS de auth** (impersonate-session sem validar JWT + middleware sem validar assinatura)
2. **Billing 100% manual** — schema preparado para Stripe/Asaas, mas zero código de integração
3. **Emissão fiscal NFC-e ausente** — deal-breaker comercial vs ssOtica

Tech debt **8/10** — recuperável com 4-6 semanas de hardening focado. Zero testes automatizados num sistema que processa dinheiro real.

---

## 1. SEGURANÇA — Ação imediata

### 🔴 Críticos (corrigir esta semana)

| # | Risco | Arquivo | Tempo |
|---|---|---|---|
| C1 | **JWT não validado em impersonate-session** → qualquer um com `sessionId` válido vira ADMIN | `src/app/api/auth/impersonate-session/route.ts:11-33` | 1h |
| C2 | **Middleware só checa existência do cookie, não a assinatura** → cookie forjado acessa qualquer empresa | `src/middleware.ts:83-99` | 2h |
| C3 | **jsPDF com 4 CVEs críticos** (PDF Object Injection, JS execution via AcroForm, DoS via GIF, HTML injection) | `package.json` — `npm audit fix` | 30min |

### 🟠 Altos (corrigir em 1 semana)

| # | Risco | Arquivo | Tempo |
|---|---|---|---|
| A1 | **OCR sem rate limit** → custo Anthropic ilimitado | `src/app/api/ocr/prescription/route.ts` | 30min |
| A2 | **Upload valida MIME pelo header HTTP** (controlável pelo cliente) → SVG XSS, executável renomeado | `src/app/api/upload/prescription-image/route.ts:24` | 2h |
| A3 | **xlsx com CVEs sem fix** (Prototype Pollution + ReDoS) | Migrar para `exceljs` | 4h |
| A4 | **CSP ausente** + HSTS ausente | `next.config.ts` | 4h |
| A5 | **Log de session.user completo em erros** (PII em logs Vercel) | `src/lib/auth-helpers.ts:76,95,114` | 30min |
| A6 | **Admin login sem rate limit** → bruteforce | `src/app/api/admin/auth/login/route.ts` | 30min |

### 🟡 Médios (corrigir em 1 mês)

| # | Risco | Arquivo |
|---|---|---|
| M1 | Rate limiter em Map in-memory não funciona em serverless multi-instância | `src/lib/rate-limit.ts` → migrar para `@upstash/ratelimit` |
| M2 | `innerHTML` em modal de impressão de caixa | `src/components/caixa/modal-detalhes-caixa.tsx:135` |
| M3 | `branchId` em GET /accounts-receivable não valida ownership | `src/app/api/accounts-receivable/route.ts:97-98` |
| M4 | OCR aceita base64 sem limite de tamanho → DoS por custo | `src/app/api/ocr/prescription/route.ts:71` |

### ✅ O que está bem feito

- Multi-tenancy consistente (`companyId` em TODAS as queries auditadas)
- `$queryRaw` 100% parametrizado (template literals do Prisma)
- Impersonation com auditoria completa (`GlobalAudit` registra IP, UA, motivo)
- Validação Zod em todos os endpoints auditados
- bcrypt no login admin
- Segredos via `process.env` (sem hardcode)
- `validateBranchOwnership` no POST de accounts-receivable
- `data-management/delete` restrito a ADMIN com confirmation token

---

## 2. ARQUITETURA — Dívida estrutural

### Top 10 problemas

1. **Páginas client com 1.000-1.500 linhas** — `clientes/[id]/page.tsx` (1476), `financeiro/page.tsx` (1426), `pdv/page.tsx` (1122), `ordens-servico/nova/page.tsx` (1338)
2. **100% client-side** (113 `"use client"`, **zero RSC**) anulando os ganhos do App Router
3. **Zero testes automatizados** em sistema financeiro com dinheiro real
4. **Services obesos** (>900 linhas): `product-campaign.service.ts` (1135), `sale.service.ts` (1008), `quote.service.ts` (924)
5. **312 `Number(...)` manuais** + 25 `JSON.parse(JSON.stringify())` para Decimal — falta um `serializePrisma()` central
6. **28 `onDelete` para 130 modelos** — risco real de órfãos em deleções (Sale→SaleItem, Quote→QuoteItem)
7. **Dois hooks de permissão** coexistindo (`use-permission.ts` + `usePermissions.ts`) — documentado no MEMORY, nunca resolvido
8. **Sem camada de data-fetching client** — 58 páginas com `fetch()` direto + 77 com `useState/useEffect`. Zero React Query/SWR
9. **Auth duplicado** — `src/auth.ts` + `src/auth-admin.ts` (dois sistemas NextAuth paralelos com risco de drift)
10. **`src/lib/` virou catch-all** — 38 arquivos misturando utils puras, regras de negócio, infra e auth
11. **Product polimórfica frágil** — 5 detalhes opcionais 1-1 discriminados por `type` sem CHECK constraints

### Quick wins arquiteturais (< 2h cada)

| # | Ação | Tempo |
|---|---|---|
| 1 | Helper `serializeDecimals()` em `api-response.ts` — remove ~50% das conversões manuais | 1h |
| 2 | Deletar `use-permission.ts` + find/replace para `usePermissions` | 30min |
| 3 | `@@index([companyId, status, createdAt])` em Sale/OS/AR/Quote | 1h |

### Iniciativas estratégicas

1. **Refatoração PDV/OS (4-6 sem)** — extrair `pdv/page.tsx` e `ordens-servico/nova/page.tsx` em hooks de orquestração + componentes apresentacionais + Server Actions
2. **Hardening do schema financeiro + testes (3-4 sem)** — auditoria de FKs, CHECK constraints PostgreSQL, suite de integração cobrindo venda parcelada, devolução, conciliação, FIFO, cashback
3. **Migração para RSC + Server Actions + TanStack Query (8-10 sem)** — elimina 58 fetches clientes, reduz bundle, habilita streaming

---

## 3. PERFORMANCE & TECH DEBT

### Números do raio-X

- **130.653 linhas** em `src/` | **77 páginas dashboard** (100% client) | **255 rotas API**
- **52 .md na raiz** (27 são FIX/DEBUG/SPRINT/RELATORIO) + 35 em `docs/`
- **44 scripts** soltos em `scripts/` (vários one-off de fix/debug)
- **80 `console.log`** | **9 TODO/FIXME** | **0 testes**
- `node_modules` 1.0 GB | `.next` 1.1 GB

### N+1 confirmados

| Local | Problema |
|---|---|
| `sale.service.ts:282-291` | `findUnique` em loop dentro de criação de venda |
| `service-order.service.ts:675-681` | `updateDelayedOrders()` atualiza OS uma a uma |
| `product-campaign.service.ts:819-829` | `upsert` sequencial por item |
| `branch-comparison/route.ts:32` | `branches.map(async)` com queries dentro |

### Bundle inflado

- `@remotion/*` (~56MB) usado **apenas em `live-sales-ticker.tsx`** da landing
- `html2canvas` (4MB) + `jspdf` (29MB) sem `dynamic()`
- `xlsx`, `recharts`, `framer-motion` todos no bundle inicial
- **Deps zumbi** (sem uso em `src/`): `@anthropic-ai/sdk`, `agent-browser`, `bwip-js`, `@supabase/supabase-js`

### Cache zero

- Apenas **1 ocorrência** de `Cache-Control` no projeto inteiro
- Nenhum `unstable_cache`, `React.cache`, nem `revalidate` em route handlers
- Dashboards refazem queries a cada navegação

### Quick wins de performance (< 1h cada)

1. **Bulk fetch em `sale.service.ts`** (15min) — `findMany({ where: { id: { in: ids }}})` substitui loop
2. **`updateMany` em `updateDelayedOrders`** (20min) — agrupar por `delayDays`
3. **Remover deps zumbis** (30min) — economia de ~60MB em `node_modules`
4. **`dynamic()` para libs pesadas** (45min) — `html2canvas`/`jspdf`/`recharts` com `ssr: false`
5. **`Cache-Control` + `revalidate: 60`** (60min) em GETs estáticos (brands, categories, labs, lens-treatments, shapes, colors)

---

## 4. UX/UI — Mapa de completude

### Matriz de módulos (47 páginas)

| Status | Módulos |
|---|---|
| ✅ **Pronto** | PDV, Vendas, Orçamentos (com conversão), Cashback, BI, DRE, Plano de Contas, Devoluções, Caixa, Comissões/Metas, Conciliação bancária, Import/Export XLSX, Lançamentos, Despesas recorrentes, Relatórios (vendas, produtos vendidos, sem giro, posição estoque, contas) |
| 🚧 **Parcial** | Clientes (faltam fotos, múltiplos telefones, abas extras), Produtos (sem preço/filial, sem unidade, sem clone), OS (form 25 campos vs 187 do ssOtica; sem kanban; sem adiantamento), Crediário (sem juros/multa), Contas a Receber (sem multa/juros/estorno), Fluxo de Caixa (sem coluna Previsto), WhatsApp (manual), Tratamentos/Labs (sem sync fornecedor), Campanhas (CRM 1-a-1, sem broadcast) |
| ❌ **Fake/raso** | Onboarding (519 linhas mas wizard pouco integrado), Comparativo Lojas (raso), Métricas Lentes (dados parciais) |
| 🔲 **Faltando** | **Emissão Fiscal NFC-e/NF-e/MF-e**, **OS→Venda** (botão finalizar), **Adiantamento na OS**, Receitas Vencidas, Livro de Receitas, Renegociação, Cheques, Agenda, Vitrine Online, Pupilômetro, TEF maquininha, Análise de Crédito |

### Gaps competitivos vs ssOtica (TOP 5)

1. **Emissão Fiscal NFC-e** — bloqueante legal. Schema preparado, falta integração SEFAZ + CFOP/ICMS/CSOSN
2. **Conversão OS→Venda** — fluxo core. Campo `serviceOrderId` existe em `Sale`, falta endpoint+botão
3. **Receita Oftalmológica completa** — `PrescriptionValues` tem 22 campos, form expõe só 11
4. **Crediário com juros/multa automáticos** — dominante no segmento popular
5. **Adiantamento/Sinal na OS** — fluxo comum (cliente paga 50% ao abrir, 50% na retirada)

### Problemas UX que pioram conversão (TOP 5)

1. **Responsividade quebrada** — 195 tabelas sem wrapper, 8 grids fixos, viewport meta não configurada
2. **OS sem kanban visual** — lista plana com 7 status; ssOtica tem drag-and-drop
3. **PDV sem autorização de desconto** — `SystemRule` tem regra mas falta modal pedindo senha do gerente
4. **Detalhe do cliente truncado** — falta aba Receitas (apesar do model existir), Devoluções, Arquivos
5. **Recibos só por download manual** — sem envio automático de PDF por WhatsApp

### Quick wins visuais

1. `ResponsiveTable` em todas as 195 tabelas (2h)
2. Badges de status padronizadas (cores consistentes)
3. Skeleton loaders (substitui spinners centralizados)

### Diferenciais para explorar

1. **OCR de Receita Oftalmológica** (já tem `src/app/api/ocr/` untracked) — reduz tempo de OS de 5min para 30s
2. **CRM com WhatsApp via Evolution API** — ssOtica cobra R$164-199/mês pelo "Ótica Zap"; entregar gratuitamente
3. **Dashboard BI com IA** — insights gerados por LLM ("vendeu 30% menos solares vs ano passado, estoque alto → sugestão de campanha 15% off")

---

## 5. NEGÓCIO — Diagnóstico de monetização

### Diagnóstico

Produto técnico forte, **máquina comercial amadora**. Landing rica (14 seções, Hero + ROI Calculator + testimonials) mas funil termina em registro 3-step **sem cobrar cartão**, sem onboarding guiado, sem tour, sem dados demo, **sem hand-off de sucesso**. Resultado provável: alta taxa de "registrei mas nunca usei" e impossibilidade de medir porque **não há analytics instrumentado** (zero PostHog/GA4/Mixpanel em `src/`).

Monetização é o gargalo crítico. Schema preparado para Stripe e Asaas (`Plan.stripePriceMonthlyId`, `Subscription.asaasSubscriptionId`, `BillingEvent`), mas **não existe código de integração**. Toda cobrança hoje é manual via `src/app/admin/financeiro/faturas/`. Cada cliente exige toque humano, sem dunning automático, sem autoatendimento de upgrade/downgrade. Trial expira para `SUSPENDED` sem CTA real de checkout.

### TOP 5 features que fecham venda

| # | Feature | Esforço |
|---|---|---|
| 1 | **Emissão NFC-e** (Focus NFe ou Nuvem Fiscal) | 4-6 sem |
| 2 | **Conversão OS→Venda** | 3-5 dias |
| 3 | **Crediário com juros/multa + carnê** | 1-2 sem |
| 4 | **Kanban OS + SMS/WhatsApp automático** | 1-2 sem |
| 5 | **Receita oftalmológica completa** | 1 sem |

### Pricing sugerido (vs atual R$149/299/599)

| Plano | Preço/mês | Limites | Para quem |
|---|---|---|---|
| Starter | R$ 99 | 2 usuários, 1 filial, 500 produtos, 100 NFC-e/mês | Ótica solo |
| **Pro ⭐** | R$ 249 | 8 usuários, 2 filiais, 5k produtos, NFC-e ilimitada | Ótica estabelecida |
| Rede | R$ 499 + R$120/filial extra | 3 filiais, 20k produtos, BI consolidado | Redes 3-15 lojas |
| Enterprise | Sob consulta | Ilimitado + SLA + white-label + API + SSO | Redes 15+, franquias |

**Anual com 2 meses grátis (17%)** + **Trial 7 dias** (não 14 — encurta ciclo de decisão).

### 3 alavancas de monetização não exploradas

1. **Overage de NFC-e** — pacote incluso por plano + R$ 0,15 por nota excedente (custo Focus NFe ~R$ 0,04). Margem alta, expansão linear.
2. **Marketplace de Laboratórios** (revenue share) — R$ 0,50/pedido + take rate 1-2% dos labs. Infra já existe (`Lab`, `LabPriceRange`).
3. **Add-on Marketing** (WhatsApp Business + Campanhas) — R$ 79-149/mês separado, créditos inclusos + IA de copy.

**Bônus**: antecipação de recebíveis de cartão (parceria com adquirente, take rate 0,5%) explorando dados já capturados em `CardReceivable`.

### Roadmap comercial 90 dias

**Dias 1-30 — Destravar receita recorrente**
- Integração Asaas (PIX/cartão/boleto BR-first)
- OS→Venda (quick win competitivo)
- PostHog + eventos chave
- Página `/upgrade` real com checkout
- Onboarding wizard

**Dias 31-60 — Fechar gaps que travam venda**
- NFC-e via Focus NFe (1 estado piloto)
- Crediário com juros/multa
- Receita oftalmológica completa

**Dias 61-90 — Crescer ARPU**
- Kanban OS + SMS
- Add-on Marketing como SKU
- Multi-filial avançado (preço/estoque por loja)
- Programa de indicação

---

## 6. LIMPEZA DO REPO (4-6h)

- **52 .md na raiz** → mover 27 (FIX_*, DEBUG_*, DIAGNOSTICO_*, SPRINT_*, RELATORIO_*) para `docs/historico/`
- Consolidar 3 `DOCUMENTACAO_*` (230 KB) em 1 `docs/ARCHITECTURE.md`
- **44 scripts** → arquivar one-offs (fix-*, diagnose-*, analyze-*, compare-xlsx, test-single-sale, import-missing-sales) em `scripts/_archive/`
- Deletar: `prisma/schema.prisma.backup`, `Untitled`, `relatorio-vendas-*.xlsx`, `qa-artifacts/`, `.vercel-deploy-trigger`
- **Remover deps zumbi** (~60MB): `@remotion/*`, `@anthropic-ai/sdk` (não usado), `agent-browser`, `bwip-js`, `@supabase/supabase-js`
- **80 `console.log`** → `src/lib/logger.ts` + ESLint `no-console`
- **Bootstrap vitest** + 1 teste por service crítico (sale, service-order, finance-entry, cashback)

---

## Anexos: Arquivos-chave

- `prisma/schema.prisma` (3824 linhas, 130 modelos, 28 onDelete, 246 @@index)
- `src/services/sale.service.ts` (1008 linhas, N+1 em :282)
- `src/services/product-campaign.service.ts` (1135 linhas)
- `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx` (1476 linhas)
- `src/app/(dashboard)/dashboard/financeiro/page.tsx` (1426 linhas)
- `src/app/api/auth/impersonate-session/route.ts` (CRÍTICO C1)
- `src/middleware.ts` (CRÍTICO C2)
- `src/lib/auth-helpers.ts` (bom padrão a manter)
- `CRUZAMENTO-PDV-OTICA-VS-SSOTICA.md` (comparativo competitivo 98 features)
