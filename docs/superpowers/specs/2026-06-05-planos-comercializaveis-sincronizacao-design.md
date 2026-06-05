# Planos comercializáveis + sincronização site↔admin (fonte única de verdade)

**Data:** 2026-06-05
**Branch sugerida:** `feature/planos-sincronizados`
**Status:** Design aprovado pelo dono (aguardando spec review + plano de implementação)

---

## 1. Problema

Hoje há **descompasso** entre o que o sistema vende e o que mostra:

1. **Preços/planos desconectados.** A landing usa preços *hardcoded* (`src/content/pricing.ts`: Essencial R$149,90 / Profissional R$289 / Rede R$549), o admin SaaS salva no banco, e os seeds têm um terceiro conjunto de valores. Editar um preço no admin **não reflete** na home nem no JSON-LD. Existem **3 conjuntos de preços conflitantes** no código.
2. **Estratégia comercial mudou.** O dono quer comercializar agora **somente**:
   - **Básico — R$149,90/mês** (comprável)
   - **Básico + Emissão de NF — R$189,90/mês** ("Em breve")
   - **Profissional** ("Em breve")
   - **Rede / Multi-loja** ("Em breve")
3. **Copy desonesta/desatualizada.** A copy atual lista planos antigos (Essencial/Profissional/Rede) e mistura features que não correspondem ao que está realmente implementado.
4. **Trial cosmético hardcoded.** O *mecanismo* de trial já é dinâmico (lê `Plan.trialDays`), mas o número "14 dias" aparece *hardcoded* em 3 textos de UI.

## 2. Objetivo

Estabelecer o **banco (`Plan` + `PlanFeature`) como fonte única de verdade** para planos, de modo que **toda alteração feita no admin SaaS reflita automaticamente** em todos os lugares que exibem plano: home, página de preços, tabela comparativa, JSON-LD SEO, cadastro/trial, e dados de trial. Comercializar 4 planos (1 ativo + 3 "Em breve") com copy honesta e captura de interessados.

## 3. Princípio central

> **Fonte única:** tabela `Plan` (+ `PlanFeature`). Todo consumidor lê via `GET /api/public/plans` (público) ou via subscription do cliente. Nada de preço/plano hardcoded na UI.

---

## 4. Verificação de honestidade (base da copy)

Cada item da copy do Básico foi confirmado adversarialmente no código (service/API real, não placeholder):

**CONFIRMADO FUNCIONA (entra na copy do Básico):**
- PDV completo + finalizar venda (`sale.service.ts`)
- Aprovação de gerente por senha (`manager-override.ts`)
- Orçamentos criar/converter (`quote.service.ts`)
- O.S. com Kanban + máquina de estados (`service-order.service.ts`)
- Garantia/retrabalho/erro médico (`createWarranty`)
- **Leitura de receita por IA / OCR — Claude Vision REAL** (`/api/ocr/prescription/route.ts`) ← destaque
- Estoque entrada/saída/ajuste (`stock.service.ts`, `stock-movement.service.ts`)
- Caixa abrir/fechar/sangria/reforço (`cash.service.ts`)
- Relatórios com dados reais (vendas, posição estoque, produtos vendidos, sem giro, contas a pagar/receber, comissões, histórico de caixas)
- Cashback (`cashback.service.ts`)
- Laboratórios e fornecedores (CRUD real)
- Permissões por usuário (57 códigos, `permissions.ts`)
- Suporte via ticket (`support.service.ts`)
- Layout responsivo/mobile

**CUIDADO — descrever com precisão:**
- **WhatsApp:** é **link manual (wa.me)**, NÃO automático (Evolution API não configurada em prod). Copy: "Links de WhatsApp para falar com o cliente". Nunca "envio automático".

**NÃO LISTAR (não funciona):**
- **NF-e / emissão fiscal:** rota retorna `503 FISCAL_DISABLED` (Focus NFe não integrado). Vai como plano "Em breve".

## 5. Conteúdo dos 4 planos (copy)

### 🟢 Básico — R$149,90/mês — `status: ACTIVE`
**Limites:** 3 usuários · 1 loja · 500 produtos · trial = `Plan.trialDays`
**highlightFeatures:**
- PDV completo (vendas, código de barras, descontos, aprovação de gerente)
- Orçamentos (criar, imprimir, converter em venda)
- Ordem de Serviço com Kanban (garantia, retrabalho, erro médico)
- Leitura de receita por IA (OCR automático) — *destaque*
- Clientes + lembretes (aniversário, pós-venda, troca de receita)
- Estoque (entrada, saída, ajuste, histórico)
- Caixa (abrir/fechar, sangria, reforço, histórico)
- Relatórios em tempo real (vendas, estoque, contas a pagar/receber, comissões, produtos sem giro)
- Cashback
- Laboratórios e fornecedores
- Links de WhatsApp para falar com o cliente
- Permissões por usuário (Admin, Gerente, Vendedor, Caixa, Atendente)
- Suporte via chamado
- Acesso mobile

### 🔵 Básico + Emissão de NF — R$189,90/mês — `status: COMING_SOON`
- Tudo do Básico **+ emissão de NFC-e/NF-e integrada** (em integração)

### 🟣 Profissional — `status: COMING_SOON` (preço a definir)
- Tudo do Básico+NF **+** módulo financeiro avançado (as 15 features hoje *gated*): DRE, Fluxo de Caixa, Conciliação Bancária, BI, Cartões/Recebíveis, Lançamentos, Plano de Contas, Devoluções, Despesas Recorrentes, Metas/Comissões, Lotes FIFO, Tratamentos de Lente

### 🟠 Rede / Multi-loja — `status: COMING_SOON`
- Tudo do Profissional **+** múltiplas filiais, transferências entre lojas, comparativo de lojas, usuários ilimitados

---

## 6. Arquitetura

### 6.1 Modelo de dados (migration ADITIVA)

**`Plan` — campos novos:**
- `status` — enum/string: `ACTIVE` (comprável) | `COMING_SOON` (em breve). Default `ACTIVE` (não quebra planos existentes).
- `highlightFeatures` — JSON (array de strings) ou texto: bullets de copy exibidos no card. Editável no admin; valor inicial vem do seed.

**Tabela nova `PlanInterest`:**
```
id          String   @id @default(cuid())
planSlug    String              // qual plano o interessado quer
name        String
email       String
phone       String?
companyName String?
createdAt   DateTime @default(now())
@@unique([email, planSlug])   // upsert: 2º clique não duplica
@@index([planSlug])
@@index([createdAt])
```
> `POST /api/public/plan-interest` faz **upsert** em `(email, planSlug)` (atualiza `name/phone/companyName/createdAt`), evitando linhas duplicadas. Rate-limit reaproveita `src/lib/rate-limit.ts` (não inventar novo).

*(Trial: NENHUM campo novo. `Plan.trialDays` e `Subscription.trialStartedAt/trialEndsAt` já existem e já funcionam.)*

### 6.2 API

**Contrato de saída de `/api/public/plans` (fonte única — definido explicitamente):**
Cada plano retorna:
- `id`, `name`, `slug`, `description`
- `priceMonthly`, `priceYearly` — **Int em centavos** (como no banco; NUNCA reais)
- `status` — `"ACTIVE"` | `"COMING_SOON"`
- `highlightFeatures` — `string[]` (bullets de copy)
- `trialDays` — Int (já retornado)
- `maxUsers`, `maxBranches`, `maxProducts`, `isFeatured`, `features: {key,value}[]`

> **Regra de conversão (única):** o banco/contrato é sempre **centavos (Int)**. A conversão para reais acontece **só na borda de exibição**, via helper único `planValueForCycle`/`formatCurrency` em `src/lib/plan-pricing.ts`. Nenhum consumidor recebe reais da API. Isso elimina o bug de shape entre `content/pricing.ts` (float reais) e `Plan` (Int centavos).

**Regra `status` × `isActive` (decisão tomada — issue do review):**
- Planos `COMING_SOON` são criados com **`isActive: true`** (para não sumirem) e diferenciados pelo campo `status`.
- `GET /api/public/plans` passa a filtrar `isActive: true` **e retornar o `status`** — devolve ACTIVE e COMING_SOON (a landing decide o que renderizar).
- O **`/registro`** (criação de trial) filtra **apenas `status === "ACTIVE"`** na seleção de plano — um COMING_SOON nunca pode ser escolhido para iniciar assinatura/trial.
- O gating de features não muda (continua por `PlanFeature`).

**`GET /api/public/plans` (já existe — estender):**
- Adicionar `status` + `highlightFeatures` ao retorno.
- **Cache:** reduzir `s-maxage` de 3600s para **60s** (mantém `stale-while-revalidate`). Como os consumidores principais são **client components** (ver 6.3), o reflexo de uma mudança é governado pelo **TTL do route handler (≤60s)**, não por `revalidateTag`.
- `revalidateTag('public-plans')` só é útil para Server Components que busquem via `fetch(..., { next: { tags: ['public-plans'] } })`. Onde migrarmos para Server Component (JSON-LD), usaremos esse mecanismo para reflexo imediato. Ao salvar no admin, chamar `revalidateTag('public-plans')` para cobrir esses casos.

**`POST /api/public/plan-interest` (nova):**
- Body validado por Zod: `{ planSlug, name, email, phone?, companyName? }`.
- Grava `PlanInterest`. Rate-limit básico para evitar spam. Resposta `{ success: true }`.

**`GET /api/admin/plan-interests` (nova):**
- Auth `getAdminSession()` (SUPER_ADMIN/ADMIN). Lista `PlanInterest` com filtro por `planSlug` + paginação. Suporta export CSV.

**`POST/PATCH /api/admin/plans` (já existe — estender):**
- Aceitar e persistir `status` e `highlightFeatures`. Disparar `revalidateTag('public-plans')` após gravar.

### 6.3 Consumidores — migrar hardcoded → ler da API

**Correção factual (review):** o relatório inicial errou — `/precos` e a home **NÃO eram dinâmicos**. Estado real confirmado no código:
- `src/components/home/pricing-section.tsx` é **client component** (`"use client"`) que `import { plans } from "@/content/pricing"` (estático). É usado **tanto pela home quanto por `/precos`** (mesmo componente).
- `src/app/(landing)/precos/page.tsx` importa `plans` estático e o passa ao `buildProductJsonLd` (JSON-LD com preços hardcoded).
- **Dois** JSON-LD: `buildProductJsonLd` (em /precos) **e** `softwareApplicationJsonLd` (preço `"149.90"` fixo) renderizado no **root `src/app/layout.tsx:80`** em TODA página.
- Só `src/app/registro/page.tsx` já faz `fetch("/api/public/plans")`.

| Local | Arquivo | Hoje | Depois |
|---|---|---|---|
| **Home + /precos (seção preços)** | `src/components/home/pricing-section.tsx` ← `src/content/pricing.ts` | **HARDCODED (client)** | fetch `/api/public/plans` no client; converter centavos→reais via `plan-pricing.ts`; renderizar selo "Em breve" por `status` |
| **Tabela comparativa** | `src/components/pages/pricing-page.tsx` | HARDCODED | ler de `/api/public/plans` |
| **JSON-LD de /precos** | `src/app/(landing)/precos/page.tsx` + `src/components/seo/json-ld.tsx` (`buildProductJsonLd`) | HARDCODED (recebe `plans` estático) | tornar a página Server Component que busca via `fetch(... {next:{tags:['public-plans']}})`; só planos com preço viram `Offer` |
| **JSON-LD global** | `src/app/layout.tsx:80` (`softwareApplicationJsonLd`, preço `"149.90"`) | HARDCODED (estático, todas as páginas) | derivar preço do plano `ACTIVE` em destaque via Server fetch taggeado; se múltiplos, usar o menor preço ativo |
| Registro/trial | `src/app/registro/page.tsx` | já dinâmico | filtrar só `status === "ACTIVE"`; remover fallback `\|\| 14` |
| Admin edição planos | `src/app/admin/configuracoes/planos/planos-client.tsx` | dinâmico | + campos `status`/`highlightFeatures` |

> **Promessa de reflexo (corrigida):** nos consumidores **client** (home, /precos cards, comparativo) o reflexo de uma mudança no admin é **≤60s** (TTL do route handler + SWR) — `revalidateTag` não os afeta. Nos **JSON-LD** (Server Components após migração) o reflexo é **imediato** via `revalidateTag('public-plans')` no salvar do admin.

### 6.4 Trial consistente — trocar "14 dias" hardcoded por `Plan.trialDays`

- `src/content/pricing.ts:99` (FAQ "14 dias grátis")
- `src/components/subscription/subscription-blocked.tsx:19` ("período de teste de 14 dias")
- `src/components/pages/functionalities-page.tsx:251` ("14 dias grátis")
- **NÃO mexer:** `src/app/(landing)/termos/page.tsx:61` ("inadimplência superior a 14 dias") — contexto jurídico, decisão do dono.

### 6.5 "Em breve" + captura de interessados (landing)

- Card com `status === 'COMING_SOON'`: exibe selo **"Em breve"** + preço (se houver) + botão **"Quero ser avisado"** (botão de compra desabilitado).
- Botão abre modal simples (nome + e-mail + telefone opcional) → `POST /api/public/plan-interest`.

### 6.6 Aba admin de interessados

- **Nova rota `/admin/interessados`**: tabela (nome, e-mail, telefone, plano de interesse, data) + filtro por plano + **export CSV**. Lê de `GET /api/admin/plan-interests`.

### 6.7 Dados/Seed dos 4 planos

- Definir UM conjunto único de valores e aplicar via seed/migration de dados:
  - Básico R$149,90 (14990¢) `ACTIVE`
  - Básico+NF R$189,90 (18990¢) `COMING_SOON`
  - Profissional `COMING_SOON` (preço a definir com o dono)
  - Rede `COMING_SOON`
- Cada plano recebe `highlightFeatures` da seção 5.
- **Fonte de dados única (decisão — não "alinhar 3 seeds"):**
  - O **banco** é a fonte. O seed canônico passa a ser **um só** (`prisma/seed-plans.ts` OU `/api/admin/seed` — escolher um no plano e remover/deprecar o outro).
  - **`src/content/pricing.ts` deixa de ser fonte de dados de preço/planos.** Ele hoje acopla `GATED_FEATURE_LABELS` ao `FEATURE_REGISTRY`; manter como "espelho" recria o drift. Ação: remover o array `plans` (e a FAQ de trial hardcoded) de lá; o que sobreviver vira apenas tipos/labels se ainda for usado. Verificar nenhum import órfão após remoção.
  - Antes de fechar escopo: rodar `grep -rn "149\|189\|289\|549\|14 dias" src/` para caçar qualquer preço/trial hardcoded remanescente (emails, OG meta, sitemap, CTA de upgrade).

---

## 7. Fora de escopo

- Integração Focus NFe / emissão real de NF (projeto separado, aguarda credenciais).
- Implementar features novas (só comercializamos o que já existe).
- Habilitar WhatsApp automático (Evolution API).
- Alterar o motor de *gating* de features (já funciona).
- Alterar o fluxo de pagamento/Asaas existente.

## 8. Validação / critérios de aceite

1. `tsc` limpo + `build` ok + testes verdes.
2. **Teste de sincronização (manual):** editar preço e `status` de um plano no admin → confirmar reflexo na **home**, **/precos**, **tabela comparativa** e **/registro** em **≤60s** (TTL do route handler); e reflexo **imediato** nos **JSON-LD** (/precos + layout global) após o `revalidateTag` do salvar. Conferir conversão correta: 14990¢ exibido como **R$ 149,90** (não 14990,00).
3. **Trial:** alterar `Plan.trialDays` no admin → o número aparece atualizado na FAQ de preço, na tela de trial expirado e na página de funcionalidades, e o cálculo de `trialEndsAt` no registro usa o novo valor.
4. **Em breve:** os 3 planos `COMING_SOON` aparecem com selo, sem botão de compra ativo, com "Quero ser avisado" funcional.
5. **Interessados:** um envio de "Quero ser avisado" aparece em `/admin/interessados` e no export CSV.
6. Não há mais preço de plano hardcoded em consumidor de UI: confirmado por `grep -rn "149\|189\|289\|549\|14 dias" src/` retornando só termos legais (termos/page.tsx) e helpers de conversão — nenhum preço de plano literal em home/comparativo/JSON-LD/emails/OG/sitemap.

## 9. Riscos / observações

- **Conversão centavos↔reais:** risco #1 de bug. Banco/contrato sempre centavos (Int); converter só na exibição via `plan-pricing.ts`. Testar 14990 → "R$ 149,90".
- **`status` × `isActive`:** COMING_SOON = `isActive:true` + `status:"COMING_SOON"`; `/registro` filtra só `ACTIVE`. Errar isso faz plano "em breve" virar comprável OU sumir da landing.
- **Reflexo client vs server:** client components (home/precos/comparativo) refletem em ≤60s (TTL), não via `revalidateTag`. Só os JSON-LD (Server) refletem imediato. Não prometer "instantâneo" para a home.
- **JSON-LD global esquecido:** `app/layout.tsx:80` (`softwareApplicationJsonLd`) está em TODA página — não esquecer de torná-lo dinâmico.
- **`Offer` sem preço:** planos COMING_SOON sem preço (Profissional/Rede) NÃO devem gerar `Offer` no JSON-LD (evitar preço 0).
- **Cache/revalidate:** garantir que `revalidateTag('public-plans')` seja chamado em todos os caminhos de escrita de plano (POST e PATCH).
- **Landing depende do banco:** se a API falhar, a home/preços ficam sem planos. Mitigação: tratamento de erro com estado de carregamento/fallback visual (não dado falso).
- **`AVAILABLE_FEATURES` legado** no admin (6 keys: crm/goals/campaigns/cashback/multi_branch/reports_advanced) **não** corresponde às 15 features do `FEATURE_REGISTRY`. Isto **não** é alterado aqui (fora de escopo), mas registrado como dívida — o `highlightFeatures` (copy) é independente do gating real.
- **Honestidade:** alinhado com a limpeza de honestidade da v2 do site (sem NF-e prometida, sem WhatsApp automático, sem features inventadas).
