# Design — Central de IA no Super Admin

**Data:** 2026-07-06 · **Status:** AGUARDANDO APROVAÇÃO DO PLANO. Nada implementado.
**Origem:** brainstorming sobre `/admin/configuracoes/ia`, ancorado no levantamento do código atual.
**Página alvo:** `src/app/admin/(painel)/configuracoes/ia/`

---

## 1. Problema e objetivo

O dono quer, nesta página: **controlar custo da IA**, **ver o gasto de cada cliente**, **ajustar o % de ganho (markup) por cliente**, **habilitar/desabilitar IA por cliente**, ajustar comportamento (modelos) e ter visibilidade — tratando a IA como produto vendável.

**Descoberta-chave do levantamento:** boa parte disso **já existe**, mas está fragmentada:
- Gasto/markup/lucro **por cliente** → já existe, mas só no painel de cada cliente (`clientes/[id]`, `company-ai-panel.tsx`). Ver 25 clientes = entrar em 25 telas.
- `markupPercentOverride` por empresa → já existe.
- Toggles `iaAvailable`/`iaEnabled` + cota mensal por empresa → já existem.
- A página de config de IA hoje só tem o **global** (chaves, câmbio, markup global, fator de crédito, modelo por funcionalidade), a Base de Conhecimento e o Playground de lentes.

O objetivo, então, é **menos construção e mais consolidação**: trazer a gestão por-cliente para uma visão central, preencher as lacunas reais de custo/visibilidade, e completar o controle de modelos.

## 2. Decisões (aprovadas no brainstorming)

| Tema | Decisão |
|---|---|
| Gestão por-cliente | **Painel central** — tabela de todas as óticas, editável na linha (não duplicar 25 telas) |
| Comportamento | **Só modelos** — adicionar modelo do copiloto/transcrição (hoje fixos); NÃO editar prompts agora |
| Custo global | **Dashboard + preview** — visão consolidada + calculadora de impacto; SEM alertas/teto automático nesta rodada |
| Entrega | Plano por fases, aprovação por fase |

## 3. Nova estrutura da página (5 abas)

Hoje: `Configuração · Base de Conhecimento · Playground`.
Proposta:

1. **Visão Geral** (nova, aba inicial) — dashboard de custo.
2. **Óticas** (nova) — painel central por cliente, editável.
3. **Configuração** (atual, melhorada) — global + modelos que faltam + preview.
4. **Base de Conhecimento** (mantida).
5. **Playground** (mantido).

O bloco "Ações globais de IA" (ligar/desligar todas) que hoje fica acima das abas permanece.

## 4. Fases de execução

### FASE 1 — Aba "Óticas" (painel central por cliente) — MAIOR VALOR
O que o dono mais pediu: ver e ajustar todas as óticas num lugar.

- Nova aba com **tabela de todas as óticas** que têm IA disponível/ativa. Colunas:
  - Ótica (link para o cliente), status (Disponível / Ativa — badges), **gasto do mês** (custo real R$), **markup efetivo %**, **preço cobrado R$**, **lucro R$**, cota/uso (créditos).
  - Ordenável por gasto (achar quem consome mais).
- **Edição na própria linha** (sem entrar no cliente):
  - Toggle Disponível / Ativa.
  - Ajustar `markupPercentOverride` (inline; null = usa global).
  - Definir cota mensal (`iaMonthlyTokenLimit`).
- Reusa a lógica que já existe: `getEffectiveMarkup()`, `priceForCompany()`, `getMonthlyUsage()`, `PATCH /api/admin/companies/[id]/ai-settings`. Nova rota de listagem agregada (uma query que traz todas as óticas + uso do mês, evitando N+1).
- **Sem migração** (campos já existem em `CompanySettings`).
- **Esforço:** médio (~1 sessão). O grosso é a query agregada eficiente + a UI de tabela editável.

### FASE 2 — Aba "Visão Geral" (dashboard de custo) — VISIBILIDADE
Onde o custo agregado do SaaS finalmente aparece.

- **Cards do topo:** gasto total do mês (custo real R$ / preço cobrado / **lucro**), variação vs mês anterior, nº de óticas com IA ativa, consumo interno/playground.
- **Gráfico de tendência** (6 meses) de custo × lucro — reusa o padrão do `MrrChart` (Recharts).
- **Custo por funcionalidade** (qualificação, lentes, OCR, copiloto, transcrição) — barra/tabela, para ver onde o dinheiro vai.
- **Aproveita a rota órfã `GET /api/admin/ai-usage-internal`** (existe, calcula custo interno, mas nenhuma tela consome) + agrega o uso de todas as óticas.
- ⚠️ **Fuso:** usar `startOfLocalMonth`/`endOfLocalMonth` (BRT) — o `ai-usage.service.ts` hoje usa fronteira de mês em UTC (mesma classe de bug que corrigimos no MRR). Corrigir de passagem.
- **Esforço:** médio (~1 sessão).

### FASE 3 — "Configuração" melhorada (modelos que faltam + preview) — CONTROLE
- **Modelo do Copiloto de WhatsApp** e **modelo/params da Transcrição** — hoje hardcoded (`COPILOT_MODEL`, `WHISPER_MODEL`). Adicionar campos na config global (`AiGlobalConfig`) + selects na aba, e fazer os call-sites lerem a config. **Migração pequena** (2 colunas em `AiGlobalConfig`).
- **Calculadora de preview:** ao mudar câmbio/markup/modelo, mostrar em tempo real (client-side) o impacto no preço/lucro sobre um consumo de exemplo (ex.: "1M tokens de qualificação custam X, você cobra Y, lucro Z") — sem salvar. Elimina o "salvar às cegas".
- Endurecer a validação da API (`ai-config` PUT hoje descarta valores inválidos silenciosamente e retorna 200) → Zod + 400 explícito.
- **Esforço:** médio (~1 sessão). Migração pequena.

### FASE 4 (opcional/futuro) — Histórico e robustez
- **Tela de histórico** de mudanças de config de IA (o `GlobalAudit` já grava `AI_CONFIG_CHANGED`; falta só exibir — quem mudou o quê e quando).
- Preços de modelo editáveis pela UI (hoje `TEXT_PRICING` é hardcoded; atualizar preço da Anthropic exige deploy).
- Estas ficam como backlog — decidir depois das 3 primeiras.

**Explicitamente FORA (YAGNI nesta rodada):** editar prompts pela UI, alertas/teto de custo global com kill-switch automático, A/B de modelos, ajuste de temperature/max_tokens por feature. Podem virar fases futuras se o dono pedir.

## 5. Ordem recomendada
**Fase 1 (Óticas) → Fase 2 (Visão Geral) → Fase 3 (Configuração+preview).** A Fase 1 primeiro porque é o que o dono mais pediu e não precisa de migração. Cada fase: implementação + testes + tsc + build + PR próprio.

## 6. Riscos e cuidados
- **Query agregada da aba Óticas** pode virar N+1 (uso por empresa). Fazer uma query batch (groupBy por companyId no mês) + join em memória — não 1 query por ótica.
- **Fuso horário** no cálculo mensal de custo (corrigir junto, como no MRR).
- **Segredos:** a página já trata chaves de API com cuidado (cifradas, nunca reexibidas) — manter esse padrão; nada de expor chave.
- **Multi-tenant:** a aba Óticas lista todas as empresas — respeitar `SUPER_ADMIN` (a página inteira já exige) e o padrão de escopo.
- **Decimal:** custos são `Decimal` no Prisma — serializar com `Number(x.toString())` (padrão já usado), não `JSON.stringify` cru.

## 7. O que já existe e será REUSADO (não reconstruir)
- `AiGlobalConfig` (config global), `AiTokenUsage` (consumo), `CompanySettings` (flags/cota/markup por ótica).
- `ai-usage.service.ts` (`getMonthlyUsage`, `getInternalMonthlyUsage`), `ai-pricing.ts` (`priceForCompany`, `computeCostUsd`), `ai-margin.service.ts` (`getEffectiveMarkup`).
- Rotas `companies/[id]/ai-usage`, `companies/[id]/ai-settings`, `ai-usage-internal` (órfã — ganha uso).
- Componentes de UI do admin: `KPICard`, `Table`/`ResponsiveTable`, `AlertCard`, `MrrChart` (padrão de gráfico).
