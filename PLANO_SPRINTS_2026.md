# 🎯 Plano de Sprints — PDV ÓTICA
**Data**: 2026-05-25
**Horizonte**: 16 semanas (8 sprints de 2 semanas)
**Capacity**: 1 dev + Claude = ~48h líquidas/sprint
**Síntese de**: 5 agentes paralelos (CEO, Architect, UX, Eng pragmático, Risk Officer) + ANALISE_COMPLETA_2026-05.md

---

## 📐 Princípios da decisão

Os 5 agentes convergiram em pontos não-óbvios:

1. **Sprint 0 dura 1 semana, não 2** — segurança + analytics são pré-requisito, não sprint cheio
2. **Roadmap 90d original era 2x super-alocado** — corte de 40% nas features para caber em capacity real
3. **NFC-e em 4 semanas é otimismo** — realista é 6-8 semanas; vamos quebrar em 2 sprints
4. **Asaas em 2 semanas só cobre happy path** — edge cases (chargeback, PIX expirado, mid-cycle change) ficam em sprint seguinte
5. **Refactor antes de feature** — features novas tocam exatamente as páginas de 1500 linhas; quebrar primeiro evita dobro de trabalho
6. **LGPD não é opcional** — receita médica é dado sensível (Art. 11), multa até 2% do faturamento
7. **Termos de uso urgentes** — sem cláusulas de limitação fiscal+LGPD, há risco jurídico mesmo sem incidente

---

## 🗓️ Visão geral (16 semanas)

| Sprint | Duração | Tema | Foco |
|---|---|---|---|
| **S0** | 1 sem | 🚨 Não morrer | Vulns críticas + analytics + termos legais |
| **S1** | 2 sem | 💰 Cobrar dinheiro | Asaas básico + checkout self-service |
| **S2** | 2 sem | 🧪 Rede de segurança | Vitest + testes financeiros + DR backup |
| **S3** | 2 sem | 🎯 OS→Venda + UX core | Conversão + receita oftalmológica + ResponsiveTable |
| **S4** | 2 sem | 📄 NFC-e (parte 1) | Focus NFe + 1 estado piloto |
| **S5** | 2 sem | 📄 NFC-e (parte 2) + Crediário | Rollout + juros/multa + carnê |
| **S6** | 2 sem | 🏥 LGPD + hardening | Consentimento + AccessLog + Asaas edge cases |
| **S7** | 2 sem | 🚀 ARPU + retenção | Kanban OS + WhatsApp + onboarding |

**Output esperado**: ao fim do S7, sistema com receita recorrente automatizada, NFC-e funcionando, conformidade LGPD básica, 8-10 quick wins de UX, suite de testes nos services financeiros, e bug crítico de auth corrigido há 16 semanas.

---

## 🚨 Sprint 0 — Não Morrer (1 semana)

**Objetivo**: Fechar os buracos que podem matar o negócio amanhã (segurança + analytics + cobertura legal).

### Entregas

#### 🔴 Segurança crítica (6h)
- [ ] **C1** — Validar JWT em `src/app/api/auth/impersonate-session/route.ts` antes de setar cookie (`jose.jwtVerify`)
- [ ] **C2** — Validar assinatura do cookie no `src/middleware.ts:83-99` para todas as rotas `/api/*` e `/dashboard/*`
- [ ] **C3** — `npm audit fix` (jsPDF 4 CVEs)
- [ ] **A6** — Rate limit no `/api/admin/auth/login` (lib já existe)

#### 📊 Analytics + observabilidade (8h)
- [ ] Instrumentar **PostHog** (free tier) em `src/instrumentation.ts`
- [ ] 10 eventos chave: `signup`, `trial_started`, `first_product_created`, `first_sale`, `first_os`, `checkout_view`, `upgrade_clicked`, `payment_succeeded`, `trial_expired`, `subscription_canceled`
- [ ] Dashboard PostHog com funil signup→first_sale→upgrade

#### ⚖️ Cobertura legal (4h)
- [ ] Termos de Uso atualizados com 3 cláusulas obrigatórias:
  - Limitação de responsabilidade (12 meses pagos)
  - Não-emissão fiscal (responsabilidade do contratante até NFC-e ir ao ar)
  - Operador LGPD (Art. 39) — controlador = ótica, operador = plataforma
- [ ] Remover claims de "fiscal/completo/regularização" da landing até NFC-e existir
- [ ] Política de Privacidade publicada
- [ ] Runbook de resposta a incidente (1 página)

#### 🧹 Limpeza rápida (4h)
- [ ] Deletar `prisma/schema.prisma.backup`, `Untitled`, `relatorio-vendas-*.xlsx`, `qa-artifacts/`
- [ ] Mover 27 .md FIX_/DEBUG_/SPRINT_/RELATORIO_ para `docs/historico/`
- [ ] Remover deps zumbi: `@remotion/*`, `agent-browser`, `bwip-js`, `@supabase/supabase-js` não usado
- [ ] Deletar `src/hooks/use-permission.ts` (find/replace para `usePermissions`)

### Critério de saída
- 0 CVEs CRÍTICOS abertos
- PostHog recebendo eventos em produção
- Termos atualizados e linkados no rodapé
- Sem `@remotion` no `node_modules`

---

## 💰 Sprint 1 — Cobrar Dinheiro de Verdade (2 sem)

**Objetivo**: Transformar trial em receita recorrente automatizada. Hoje cobrança é 100% manual.

### Entregas

#### Asaas integration MVP (32h)
- [ ] `src/lib/asaas.ts` — cliente HTTP tipado
- [ ] `POST /api/billing/checkout` — cria customer + subscription (PIX/cartão/boleto)
- [ ] `POST /api/webhooks/asaas` — recebe `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED` → grava `BillingEvent` + atualiza `Subscription.status`
- [ ] Idempotência (verificar `eventId` duplicado)
- [ ] Página `/dashboard/upgrade` com checkout embutido (não redirect externo)
- [ ] Trial 7 dias **com cartão capturado** (obrigatório no signup)
- [ ] Tela `/subscription-blocked` com CTA real de pagar (não link pra configurações)

#### Pricing tier ajuste (4h)
- [ ] Atualizar `prisma/seed-plans.ts`: Starter R$99 / Pro R$249 / Rede R$499+R$120 filial / Enterprise sob consulta
- [ ] Atualizar `src/app/precos/page.tsx`
- [ ] Anual com 2 meses grátis (17%) no toggle

#### Hardening contínuo (8h)
- [ ] A1 — Rate limit no `/api/ocr/prescription`
- [ ] A2 — Magic bytes no upload de imagem (lib `file-type`)
- [ ] A5 — Remover log de `session.user` completo em `auth-helpers.ts`

#### Quick wins (4h)
- [ ] Helper `serializeDecimals()` em `api-response.ts`
- [ ] `@@index([companyId, status, createdAt])` em Sale/OS/AccountReceivable/Quote

### Critério de saída
- 1 venda real processada via Asaas em produção (próprio time como cobaia)
- Webhooks idempotentes (testado com payload duplicado)
- `/dashboard/upgrade` funcional
- Trial captura cartão

---

## 🧪 Sprint 2 — Rede de Segurança (2 sem)

**Objetivo**: Antes de mexer em fluxo financeiro (S3+), criar suite mínima de testes + DR backup. Sem isso, qualquer mudança em `sale.service.ts` é roleta russa.

### Entregas

#### Test bootstrap (24h)
- [ ] `vitest` + `@vitest/coverage-v8` instalados
- [ ] `src/services/sale.service.test.ts` — cobertura: venda à vista, parcelada, com cashback, com desconto, devolução parcial
- [ ] `src/services/service-order.service.test.ts` — criar OS, atualizar status, update delayed orders (sem N+1)
- [ ] `src/services/finance-entry.service.ts` test — `generateSaleEntries()` em todos os cenários
- [ ] `src/services/cashback.service.test.ts` — acumular, expirar, usar no PDV
- [ ] CI no GitHub Actions: rodar `vitest run` em todo PR
- [ ] Meta: 60% coverage nos 4 services críticos

#### N+1 fixes (4h)
- [ ] `sale.service.ts:282` — bulk fetch `findMany({ where: { id: { in: ids }}})`
- [ ] `service-order.service.ts:675` — `updateMany` agrupado por `delayDays`
- [ ] `product-campaign.service.ts:819` — `createMany` + `updateMany` em transação

#### DR & observabilidade (12h)
- [ ] Backup diário do Neon para S3 (cron + script `pg_dump`)
- [ ] Logger estruturado `src/lib/logger.ts` (substitui 80 `console.log`)
- [ ] ESLint `no-console: error`
- [ ] Sentry instrumentado (free tier 5k erros/mês)

#### Quick wins (8h)
- [ ] Unificar `auth.ts` + `auth-admin.ts` — extrair config comum, manter sessões separadas
- [ ] `dynamic()` em `html2canvas`/`jspdf`/`recharts` nas páginas de impressão e BI
- [ ] `revalidate: 60` em GETs estáticos (brands, categories, labs, lens-treatments, shapes, colors)

### Critério de saída
- 60% coverage nos 4 services financeiros
- CI bloqueando PR com testes vermelhos
- Backup Neon→S3 rodando há 7 dias
- N+1 de venda eliminado (verificar com logs antes/depois)

---

## 🎯 Sprint 3 — OS→Venda + UX Core (2 sem)

**Objetivo**: Destravar o fluxo operacional core da ótica + corrigir responsividade que mata uso mobile do gerente.

### Entregas

#### Conversão OS→Venda (20h)
- [ ] `POST /api/service-orders/[id]/convert` (já existe untracked — finalizar)
- [ ] Botão "Finalizar OS" no detalhe e no kanban
- [ ] Unique constraint em `Sale.serviceOrderId` (prevenir duplicata)
- [ ] Tela de confirmação mostrando pré-visão da venda
- [ ] Teste de integração cobrindo: OS pronta → venda → AR gerada → estoque consumido

#### Receita oftalmológica completa (12h)
- [ ] Expor os 22 campos de `PrescriptionValues` no form (longe/perto, ceratometria, olho dominante, DNP, altura)
- [ ] Layout em 5 blocos organizados (já parcialmente feito)
- [ ] Validação Zod por bloco
- [ ] OCR de receita: finalizar `src/app/api/ocr/prescription/` + integrar no form com preview dos campos preenchidos

#### Responsividade (8h)
- [ ] Criar `src/components/ui/responsive-table.tsx` (atualmente vazio com 457B)
- [ ] Find/replace nas 195 tabelas (script automatizado quando possível)
- [ ] Viewport meta tag em `layout.tsx`
- [ ] Testar 6 telas mobile-crítica: Dashboard, Vendas do dia, Caixa atual, OS em atraso, Contas a receber, Aprovação de desconto

#### Skeleton loaders + badges padronizadas (8h)
- [ ] Substituir spinners centralizados por skeletons da estrutura
- [ ] Tokens de cor de status em `globals.css` (pago/pendente/cancelado/entregue)
- [ ] Componente `<StatusBadge variant>` aplicado globalmente

### Critério de saída
- 1 OS criada → convertida em venda → AR + estoque corretos (teste manual + automatizado)
- 22 campos de receita preenchíveis
- OCR funcionando em foto real de receita
- 6 telas mobile aprovadas em iPhone SE + iPhone 14 Pro

---

## 📄 Sprint 4 — NFC-e Parte 1 (2 sem)

**Objetivo**: MVP de emissão fiscal para 1 estado piloto (CE ou SP). Destrava deal-breaker comercial vs ssOtica.

### Entregas

#### Setup fiscal (20h)
- [ ] Integração Focus NFe (sandbox)
- [ ] Upload de certificado A1 (criptografado at-rest)
- [ ] Configuração por filial: CNPJ, IE, CFOP padrão, CSOSN/CST, regime tributário
- [ ] UI em `/dashboard/configuracoes/fiscal`

#### Emissão NFC-e (20h)
- [ ] `POST /api/fiscal/nfce/emit` — recebe `saleId`, monta XML, envia Focus NFe
- [ ] Estado `PENDING_FISCAL` em `Sale` (não trava finalização da venda)
- [ ] Webhook Focus NFe atualiza `Sale.fiscalStatus` e armazena chave de acesso, XML, DANFE PDF
- [ ] Botão "Emitir NFC-e" no detalhe da venda (após config completa)
- [ ] Fila com retry automático (3 tentativas em 5/30/120 min)
- [ ] Modal de erro com mensagem amigável SEFAZ (parser de códigos)

#### Overage de NFC-e (4h)
- [ ] Contador mensal de NFC-e emitidas por `companyId`
- [ ] Limite por plano (Starter 100/mês, Pro ilimitada)
- [ ] Cobrança de overage via Asaas (R$ 0,15/nota excedente no Starter)

#### Homologação (8h)
- [ ] Testar emissão em ambiente de homologação SEFAZ-CE (ou SP)
- [ ] Cenários: venda simples, venda parcelada, devolução (cancelamento NFC-e em <30min), contingência offline

### Critério de saída
- 1 NFC-e emitida em produção real (cliente piloto)
- Chave de acesso gravada no banco
- DANFE PDF gerado e enviável por WhatsApp
- Overage cobrado automaticamente no fim do mês

---

## 📄 Sprint 5 — NFC-e Parte 2 + Crediário (2 sem)

**Objetivo**: Rollout nacional NFC-e + crediário com juros/multa (forma de pagamento dominante no varejo popular de óticas).

### Entregas

#### NFC-e nacional (16h)
- [ ] Validar config para os 26 estados (CSOSN/CST por estado)
- [ ] Carta de correção (CC-e) — 1 endpoint adicional
- [ ] Cancelamento de NFC-e dentro de 30min
- [ ] Manifestação destinatário (recebimento de NF-e de fornecedor) — opcional, baixa prioridade
- [ ] Documentação para o usuário (1 página simples)

#### Crediário com juros/multa (20h)
- [ ] Schema: `interestPercent`, `lateFeePercent`, `gracePeriodDays` em `Subscription` global e override por venda
- [ ] `src/lib/penalty-utils.ts` (já existe untracked — finalizar)
- [ ] Recalculo automático ao receber pagamento atrasado
- [ ] UI em `/dashboard/financeiro/contas-receber` mostrando: principal, juros, multa, total
- [ ] Impressão de carnê com capa (jspdf + dynamic import)
- [ ] Renegociação: endpoint + tela (status `RENEGOTIATED` já existe no enum)

#### Estorno de pagamento (8h)
- [ ] `POST /api/accounts-receivable/[id]/reverse-payment`
- [ ] Histórico de movimentações
- [ ] Permissão obrigatória + log de auditoria

#### Polish (4h)
- [ ] Coluna "Previsto" em fluxo de caixa (já solicitado, falta UI)
- [ ] Filtro "Receitas vencidas" em receitas oftalmológicas (recall comercial)

### Critério de saída
- NFC-e funcional em 3+ estados (CE, SP, RJ no mínimo)
- 1 conta atrasada com juros calculado corretamente
- 1 carnê impresso e validado
- Estorno funcionando com auditoria

---

## 🏥 Sprint 6 — LGPD + Asaas Hardening (2 sem)

**Objetivo**: Conformidade LGPD obrigatória para dado de saúde + cobrir edge cases de billing que vão morder em produção.

### Entregas

#### LGPD compliance (24h)
- [ ] Schema: `ConsentRecord` (versão de termo, IP, timestamp, escopo)
- [ ] Modal de consentimento granular no cadastro do cliente
- [ ] `AccessLog` em Customer, PrescriptionValues, ServiceOrder (quem acessou, quando)
- [ ] Criptografia em coluna para CPF (pgcrypto)
- [ ] Endpoints LGPD: `GET /api/lgpd/portabilidade`, `POST /api/lgpd/exclusao`, `POST /api/lgpd/retificacao`
- [ ] Política de retenção: job mensal anonimizando clientes sem compra >5 anos
- [ ] DPO designado + e-mail `dpo@pdvotica.com.br` em rodapé

#### Asaas edge cases (16h)
- [ ] Chargeback handling (`PAYMENT_CHARGEBACK_REQUESTED`)
- [ ] PIX expirado → nova cobrança automática
- [ ] Boleto vencido → reenvio via WhatsApp/email
- [ ] Mudança de plano mid-cycle com proration
- [ ] Falha de webhook → replay manual + dashboard de eventos
- [ ] Dunning 3 tentativas (3, 7, 14 dias) → downgrade automático para Starter

#### CSP + HSTS (8h)
- [ ] CSP em `next.config.ts` (lista de origins permitidas)
- [ ] HSTS com preload
- [ ] Testar produção em modo report-only por 3 dias antes de enforce

### Critério de saída
- Consentimento gravado em todo novo cliente
- 1 solicitação LGPD respondida ponta a ponta (export JSON do cliente)
- Chargeback Asaas processado corretamente
- CSP em enforce sem quebrar nada

---

## 🚀 Sprint 7 — ARPU + Retenção (2 sem)

**Objetivo**: Crescer receita por cliente + melhorar ativação trial→paid via onboarding decente.

### Entregas

#### Kanban OS + WhatsApp (20h)
- [ ] Finalizar `src/components/ordens-servico/kanban-board.tsx` (untracked)
- [ ] Drag-and-drop entre 7 status com `@dnd-kit` (já instalado)
- [ ] Integração WhatsApp via Evolution API (open-source, self-hosted ou cloud)
- [ ] Mensagens automáticas: "Sua OS está pronta para retirada", "Lembrete: receita vencendo em 30 dias", "Parcela vence amanhã"
- [ ] Template de mensagens configurável por empresa

#### Onboarding wizard + dados demo (12h)
- [ ] Empresa-demo pré-populada: 50 produtos, 30 clientes, 10 OS em vários status, caixa aberto
- [ ] Checklist persistente lateral: ✅ Cadastrar 1 produto real ✅ Fazer 1 venda real ✅ Abrir 1 OS ✅ Convidar funcionário
- [ ] Tour interativo no primeiro login (lib `react-joyride` ou similar)
- [ ] Email D+1, D+3, D+6 (via Resend ou similar) com tutorial por etapa

#### Recibo automático no WhatsApp (8h)
- [ ] Botão "Enviar recibo no WhatsApp" no PDV pós-venda
- [ ] PDF gerado + link público (token assinado, expira em 7 dias)
- [ ] Configuração de template no `/dashboard/configuracoes/whatsapp`

#### Polish final (8h)
- [ ] Aprovação de desconto: modal pedindo senha do gerente acima de `SystemRule.sales.discount.approval_above`
- [ ] Aba "Receitas" no detalhe do cliente (model existe)
- [ ] Adiantamento/sinal na OS (campo `downPayment` + integração com AR)

### Critério de saída
- 1 OS movida via kanban com mensagem WhatsApp disparada
- 1 trial criado vê tour + checklist + dados demo
- 1 recibo enviado por WhatsApp pós-venda
- Desconto acima de R$X exige senha do gerente

---

## 📊 DORA Metrics — Monitorar por sprint

| Métrica | Meta |
|---|---|
| Deploy frequency | ≥ 3 deploys/semana |
| Change failure rate | < 15% |
| Lead time pra mudança | < 2 dias (commit → produção) |
| % sprint commitment entregue | ≥ 70% (2 sprints seguidos <70% → replanejar) |
| Tickets de suporte/semana | ↓ ou estável (alta = qualidade caindo) |

---

## ⚠️ O que NÃO entra nos 8 sprints (corte cruel)

- **Migração 100% para RSC + Server Actions** (8-10 sem de obra invisível ao cliente)
- **Refactor das páginas de 1.500 linhas** sem ser para adicionar feature (cirúrgico só quando feature toca)
- **TanStack Query global** (postergar até depois de RSC)
- **Marketplace de Laboratórios** (precisa de massa crítica de clientes antes)
- **Dashboard BI com IA** (vaidade até PMF validado)
- **Vitrine Online, Pupilômetro, TEF, Agenda, Cheques** (não aparecem em pedidos reais ainda)
- **Programa de indicação** (sem base de clientes, sem alavanca)
- **DS formal com Storybook** (8 primitivos sólidos resolvem 80%)
- **Multi-filial avançado** (preço/estoque por loja parcialmente feito; expansão fica para depois)

---

## 🎯 Resultado esperado no fim do S7 (16 semanas)

### Comercial
- Trial→paid mensurável (hoje impossível medir)
- MRR via Asaas funcionando 100% self-service
- NFC-e em 3+ estados
- Pricing tiers atualizados (Starter R$99 / Pro R$249 / Rede R$499+)
- Overage de NFC-e cobrando automaticamente

### Operacional
- 60% coverage nos 4 services financeiros
- 0 CVEs CRÍTICOS abertos
- Backup Neon→S3 rodando
- Logger estruturado + Sentry
- LGPD compliance básica (consentimento + AccessLog + endpoints titular)

### UX
- Responsividade real em 195 tabelas
- 6 telas mobile-crítica polidas
- OCR de receita funcionando
- Kanban OS + WhatsApp automático
- Onboarding com dados demo + checklist

### Tech debt reduzido
- Tech debt: 8/10 → 5/10
- ~60MB removidos do `node_modules`
- 27 .md de processo arquivados
- 80 `console.log` → logger estruturado

---

## 🚦 Status de aprovação

- [ ] **Plano aprovado pelo usuário** ← aguardando
- [ ] Sprint 0 iniciado
- [ ] Sprint 1 iniciado
- [ ] ...

---

**Versão**: 1.0
**Próxima revisão**: após Sprint 1 (replanejamento com dados reais de PostHog)
