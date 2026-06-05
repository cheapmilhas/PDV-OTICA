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
@@index([planSlug])
@@index([createdAt])
```

*(Trial: NENHUM campo novo. `Plan.trialDays` e `Subscription.trialStartedAt/trialEndsAt` já existem e já funcionam.)*

### 6.2 API

**`GET /api/public/plans` (já existe — estender):**
- Retorna campos atuais **+** `status` + `highlightFeatures` (`trialDays` já retornado).
- **Cache:** reduzir de 3600s para ~60s **+** usar `revalidateTag('public-plans')`.
- Ao salvar plano no admin (`POST/PATCH /api/admin/plans`), chamar `revalidateTag('public-plans')` → reflexo em segundos.

**`POST /api/public/plan-interest` (nova):**
- Body validado por Zod: `{ planSlug, name, email, phone?, companyName? }`.
- Grava `PlanInterest`. Rate-limit básico para evitar spam. Resposta `{ success: true }`.

**`GET /api/admin/plan-interests` (nova):**
- Auth `getAdminSession()` (SUPER_ADMIN/ADMIN). Lista `PlanInterest` com filtro por `planSlug` + paginação. Suporta export CSV.

**`POST/PATCH /api/admin/plans` (já existe — estender):**
- Aceitar e persistir `status` e `highlightFeatures`. Disparar `revalidateTag('public-plans')` após gravar.

### 6.3 Consumidores — migrar hardcoded → ler da API

| Local | Arquivo | Hoje | Depois |
|---|---|---|---|
| Página /precos | `src/app/(landing)/precos/page.tsx` | já dinâmico | mantém |
| Registro/trial | `src/app/registro/page.tsx` | já dinâmico | mantém (remover fallback `\|\| 14` desnecessário) |
| **Home — seção preços** | `src/components/home/pricing-section.tsx` ← `src/content/pricing.ts` | HARDCODED | ler de `/api/public/plans` |
| **Tabela comparativa** | `src/components/pages/pricing-page.tsx` | HARDCODED | ler de `/api/public/plans` |
| **JSON-LD SEO** | `src/components/seo/json-ld.tsx` | preço 149.90 fixo | preço do plano em destaque, dinâmico |
| Admin edição planos | `src/app/admin/configuracoes/planos/planos-client.tsx` | dinâmico | + campos `status`/`highlightFeatures` |

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
- **Corrigir os 3 seeds desalinhados** (`src/content/pricing.ts`, `src/app/api/admin/seed/route.ts`, `prisma/seed-plans.ts`) para o conjunto único — ou deprecar os que não são mais a fonte.

---

## 7. Fora de escopo

- Integração Focus NFe / emissão real de NF (projeto separado, aguarda credenciais).
- Implementar features novas (só comercializamos o que já existe).
- Habilitar WhatsApp automático (Evolution API).
- Alterar o motor de *gating* de features (já funciona).
- Alterar o fluxo de pagamento/Asaas existente.

## 8. Validação / critérios de aceite

1. `tsc` limpo + `build` ok + testes verdes.
2. **Teste de sincronização (manual):** editar preço e `status` de um plano no admin → confirmar reflexo (em até ~1 min ou imediato via revalidate) na **home**, em **/precos**, na **tabela comparativa**, no **/registro** e no **JSON-LD**.
3. **Trial:** alterar `Plan.trialDays` no admin → o número aparece atualizado na FAQ de preço, na tela de trial expirado e na página de funcionalidades, e o cálculo de `trialEndsAt` no registro usa o novo valor.
4. **Em breve:** os 3 planos `COMING_SOON` aparecem com selo, sem botão de compra ativo, com "Quero ser avisado" funcional.
5. **Interessados:** um envio de "Quero ser avisado" aparece em `/admin/interessados` e no export CSV.
6. Não há mais preço de plano hardcoded em consumidor de UI (home, comparativo, JSON-LD).

## 9. Riscos / observações

- **Cache/revalidate:** garantir que `revalidateTag` seja chamado em todos os caminhos de escrita de plano, senão o site mostra valor velho até o TTL.
- **Landing depende do banco:** se a API falhar, a home/preços ficam sem planos. Mitigação: tratamento de erro com estado de carregamento/fallback visual (não dado falso).
- **`AVAILABLE_FEATURES` legado** no admin (6 keys: crm/goals/campaigns/cashback/multi_branch/reports_advanced) **não** corresponde às 15 features do `FEATURE_REGISTRY`. Isto **não** é alterado aqui (fora de escopo), mas registrado como dívida — o `highlightFeatures` (copy) é independente do gating real.
- **Honestidade:** alinhado com a limpeza de honestidade da v2 do site (sem NF-e prometida, sem WhatsApp automático, sem features inventadas).
