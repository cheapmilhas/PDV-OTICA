# Plano de Melhorias do Super Admin — 2026-07-06

**Status:** AGUARDANDO ANÁLISE E APROVAÇÃO DO DONO. Nada implementado.
**Origem:** investigação nova de 3 agentes (lógica/bugs nas APIs · integridade de dados/queries · UX/organização), lendo o código atual com evidência de linha. NÃO é re-verificação de auditorias antigas.
**Contexto:** a auditoria de segurança de 07-03 e os bugs financeiros de 07-02 já foram **corrigidos e deployados** (verificado). Este plano cobre o que **sobrou** — falhas de lógica, dados e UX ainda vivas no código.

---

## Resumo — o quadro geral

O super admin está **estruturalmente saudável**: segurança multi-tenant, transações financeiras, confirmações de ações destrutivas e feedback (toasts) estão corretos. Os problemas que restam são de **3 tipos**:

1. **Fuso horário** — dois cálculos ficaram para trás da migração UTC→BRT que o resto do admin já fez. Afetam números que o dono lê (MRR do gráfico, churn dos relatórios).
2. **Bugs de lógica pontuais** — um de estado compartilhado (notificações), o resto validação/edge-case.
3. **UX/organização** — vocabulário fraturado, truncamento silencioso de listas, MRR com fórmulas divergentes, padrões inconsistentes.

Nenhum é CRÍTICO de segurança ou perda de dinheiro. Os 2 "CRÍTICO" abaixo são de **corretude de número exibido** (fuso), não de integridade de banco.

---

## FASE 1 — Correção de fuso horário (números que o dono lê saem errados)

Alta prioridade porque são números que embasam decisão, e o fix é pequeno (o helper já existe: `startOfLocalMonth`/`endOfLocalMonth` de `@/lib/date-utils`).

| # | Sev | Achado | Arquivo | Fix |
|---|-----|--------|---------|-----|
| 1.1 | 🔴 | **Série "Evolução do MRR" com fronteira de mês em UTC** — na virada de mês, assinaturas caem no bucket errado; inconsistente com o KPI "MRR" ao lado | `src/lib/admin-metrics.ts:127-137` | usar `startOfLocalMonth`/`endOfLocalMonth` nos buckets |
| 1.2 | 🔴 | **Relatórios: mês em UTC contamina churn, tickets e base ativa** — cancelamentos/tickets das 21-24h do último dia caem no mês errado; afeta numerador E denominador do churn | `src/app/admin/(painel)/relatorios/page.tsx:15` | `startOfLocalMonth(now)` |

**Esforço:** ~1-2h. Baixo risco (troca de fronteira de data, com testes de virada de mês).

---

## FASE 2 — Bug de estado compartilhado (notificações do admin)

| # | Sev | Achado | Arquivo | Fix |
|---|-----|--------|---------|-----|
| 2.1 | 🟠 ALTO | **"Marcar todas como lidas" apaga notificações globais para TODOS os admins** — um admin lê, e as notificações `adminId:null` somem para os outros que nunca as viram | `src/app/api/admin/notifications/read-all/route.ts:10` + `notifications/route.ts` | estado de leitura por-admin (nova tabela `AdminNotificationRead (adminId, notificationId)`) **ou**, mais simples, o read-all só toca `adminId: admin.id` e nunca as `null` |

**Esforço:** o fix simples (não tocar as globais) é ~1h. O fix correto (tabela de leitura por-admin) é ~half-day + migração. **Decisão do dono:** simples (globais nunca "somem", mas também não ficam "lidas" por ninguém) ou completo (cada admin tem seu estado). Recomendo o **simples** agora, completo vira backlog.

---

## FASE 3 — Bugs de lógica pontuais (validação e edge cases)

| # | Sev | Achado | Arquivo | Fix |
|---|-----|--------|---------|-----|
| 3.1 | 🟡 MÉD | `nfeSeries` aceita string não-numérica → `NaN` → 500 genérico | `companies/[id]/branches/route.ts:105`, `branches/[branchId]/route.ts:68` | `z.coerce.number().int().positive().optional()` |
| 3.2 | 🟡 MÉD | **Reativar usuário não revalida limite de assentos do plano** — dá para estourar o limite desativando/reativando | `company-users/[id]/route.ts:44` + reactivate | recontar ativos e barrar se `>= maxUsers` no PATCH `active:true` |
| 3.3 | 🟡 MÉD | `branchId` do body não validado como da empresa — vincula usuário a filial de outro tenant (FK 500 ou `UserBranch` inconsistente) | `companies/[id]/users/route.ts:164` | `findFirst({ where: { id: branchId, companyId } })` + 400 |
| 3.4 | 🟡 MÉD | PUT de permissões: `role`+`permissions` juntos → overrides descartados silenciosamente, e a msg de sucesso mente | `companies/[id]/users/[userId]/permissions/route.ts:162` | aplicar permissões após troca de cargo, ou 400 explicando; validar body com zod |
| 3.5 | 🟡 MÉD | **Duas fontes de verdade para `maxUsers`/`maxBranches`** (Company vs plano da subscription) — rotas divergem em qual leem | `actions/route.ts:103` vs `users/route.ts:143` vs `branches/route.ts:78` | escolher fonte única (o plano efetivo) e ler do mesmo helper |
| 3.6 | 🔵 BAIXO | Criação de filial (branch + vínculos + audit) fora de transação → órfãos em falha parcial | `companies/[id]/branches/route.ts:95-130` | envolver em `$transaction` |
| 3.7 | 🔵 BAIXO | `close-stale-shifts` soma Decimal via `Number()` (precisão float) + `differenceCash:0` fixo | `cash/close-stale-shifts/route.ts:117` | somar com `Prisma.Decimal` |
| 3.8 | 🔵 BAIXO | `funnel-eval` divisão por zero se lista de casos vazia → `"NaN"` | `funnel-eval/route.ts:105` | guardar `results.length === 0` |

**Esforço:** 3.1-3.5 ~half-day no total; 3.6-3.8 ~2h. Todos com teste de regressão.

---

## FASE 4 — Performance de query (índices + ordenação estável)

Não quebram nada hoje, mas degradam conforme a base cresce (e a ordenação instável causa "empresas que somem entre refreshes").

| # | Sev | Achado | Arquivo | Fix |
|---|-----|--------|---------|-----|
| 4.1 | 🟠 ALTO | **`orderBy: createdAt desc` sem tiebreaker + take** → ordem indefinida em empates (seed/import), registros aparecem/somem entre refreshes e paginação pula/duplica | dashboard, clientes, assinaturas, faturas | `orderBy: [{ createdAt: "desc" }, { id: "desc" }]` |
| 4.2 | 🟠 ALTO | Sem índice em `Company.healthScore`/`healthCategory` → seq scan + sort na página Saúde e nos counts do dashboard | `saude/page.tsx:35` + `schema.prisma` Company | `@@index([healthCategory, healthScore])` |
| 4.3 | 🟠 ALTO | Sem índice em `Invoice.paidAt` → agregações "recebido no mês" fazem scan | `financeiro/page.tsx:32` + schema | `@@index([status, paidAt])` |
| 4.4 | 🔵 BAIXO | `Company.createdAt` sem índice (sort custoso nas listas) | schema Company | `@@index([createdAt])` |
| 4.5 | 🔵 BAIXO | AI usage interno agrega em JS em vez de `groupBy` no banco | `ai-usage.service.ts:93` | `groupBy` + `_sum` |

**Esforço:** índices = 1 migração pequena (~1h + deploy de migração). Tiebreakers = ~1h. **Migração de banco necessária** (fazer `prisma migrate` antes do deploy, como o runbook do projeto).

---

## FASE 5 — UX e organização (o que atrapalha o trabalho diário)

Priorizado pelo TOP 10 do agente de UX. Impacto no uso, baixo risco.

### 5A — Alto impacto
| # | Achado | Fix |
|---|--------|-----|
| 5.1 | **Vocabulário fraturado**: nav "Clientes" × página "Empresas" × botão "Nova Empresa" × form "Novo Cliente" × breadcrumb "Clientes" | escolher um termo canônico (sugiro "Clientes") e aplicar em nav + título + botão + breadcrumb |
| 5.2 | **`assinaturas` e `faturas` truncam em 100 sem avisar** (o header até diz "347 assinaturas" mas mostra 100) | replicar o padrão do `clientes` ("Mostrando X de N — refine") ou paginar como `usuarios` |
| 5.3 | **MRR com 3 rótulos e 2 fórmulas** — "MRR" (dashboard) vs "MRR Estimado" (relatórios); ClientesTable calcula à mão sem desconto, divergindo de `computeMRR` | rótulo idêntico em todo lugar + `computeMRR`/helper único também na linha da ClientesTable |

### 5B — Médio impacto
| # | Achado | Fix |
|---|--------|-----|
| 5.4 | Breadcrumb final vira "Detalhes" genérico em `/clientes/{id}` e `/tickets/{id}` | mostrar nome real da empresa/ticket no crumb |
| 5.5 | Contadores "N ativos (página)" em usuários contam só a página (inútil com paginação) | `count` por `active` no where → totais reais |
| 5.6 | 3 padrões de filtro coexistem (chip-link / form-GET+reload / fetch client) | padronizar no chip-link/searchParams (mais barato e consistente) |
| 5.7 | Filtro de `interessados` não vai pra URL (não compartilhável, back quebrado) | empurrar `?planSlug=` na URL |
| 5.8 | KPI grids `grid-cols-4` fixos quebram no mobile (Relatórios, Tickets) | `grid-cols-2 md:grid-cols-4` |
| 5.9 | 3 destinos para "inadimplência" (`/inadimplencia` vs `/clientes?status=PAST_DUE`) | unificar CTAs em `/financeiro/inadimplencia` |
| 5.10 | Sem atalho "Nova cobrança" na página do cliente (obriga re-selecionar empresa) | botão `/faturas/nova?companyId=...` no detalhe |

### 5C — Baixo / polimento
| # | Achado | Fix |
|---|--------|-----|
| 5.11 | Cores hardcoded + emojis remanescentes em telas não-migradas (`financeiro/page`, `relatorios/page`, `new-client-form`) | migrar para tokens/ícones (fecha o redesign 100%) |
| 5.12 | Hub `/configuracoes` semi-órfão (só via URL/breadcrumb) | adicionar ao sidebar ou remover |
| 5.13 | ViaCEP/CEP sem feedback de erro (`catch {}` silencioso) | hint "CEP não encontrado" |
| 5.14 | Wizard de novo cliente (5 etapas, ~25 campos) não persiste rascunho — F5 perde tudo | `sessionStorage` por etapa |
| 5.15 | Export só em Relatórios e não respeita filtros; sem export nas listas | botão "Exportar" na lista respeitando filtros |

**Esforço:** 5A ~1 sessão; 5B ~1 sessão; 5C backlog/oportunístico.

---

## Sequência recomendada

1. **Fase 1 (fuso)** — pequena, corrige números que embasam decisão. Faria primeiro.
2. **Fase 4 (índices + tiebreaker)** — junto da Fase 1 se houver migração, aproveita o deploy. Resolve o "registros que somem entre refreshes".
3. **Fase 2 + Fase 3** (bugs de lógica) — half-day cada, com testes.
4. **Fase 5A** (UX alto impacto) — vocabulário, truncamento, MRR único.
5. **Fase 5B/5C** — conforme prioridade do dono.

Cada fase: implementação + testes + tsc + build + revisão adversarial + (migração antes do deploy quando houver). PRs separados por fase, como fizemos no redesign.

## Itens que estão BONS (não mexer — verificado)
- Segurança multi-tenant (escopo/role) e transações financeiras (mark_paid, change_plan, cancel, refund).
- Ações destrutivas com AlertDialog + confirmação por texto digitado.
- Toaster montado; feedback funciona.
- `/admin/suporte` redireciona (não 404); `clientes` conta "X de N" ao truncar; `usuarios` tem paginação real.
- Serialização de Decimal (costUsd) correta; retry anti-colisão em manual-charge; reconcile idempotente.

## O que NÃO foi coberto nesta investigação (backlog de verificação)
- **LGPD — opt-out de WhatsApp** (matching de telefone) — citado na memória, não verificado aqui.
- **`ADMIN_JWT_SECRET` em produção** — se não setado, cai para `AUTH_SECRET` (segredo admin = tenant). Conferir env de prod (liga com "rotacionar segredos").
