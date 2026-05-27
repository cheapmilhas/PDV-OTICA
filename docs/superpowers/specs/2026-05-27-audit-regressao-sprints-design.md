# Audit de Regressão — Sprints Q1–Q6 + Plan Gating

**Data:** 2026-05-27
**Tipo:** Spec de auditoria (não de feature)
**Branch:** main
**Solicitante:** cheapmilhas@gmail.com

---

## 1. Objetivo

Validar que as Sprints Q1–Q6 e o merge do plan-gating do BASIC (todas em produção em 26–27/05/2026) **não introduziram regressões** e que o sistema continua seguro para clientes pagantes do plano BASIC e Profissional.

Esta auditoria **NÃO refaz** o audit completo de 2026-05-26. Aquele continua sendo o baseline. Esta é uma **auditoria de diff** focada no que mudou desde então.

## 2. Janela auditada

| Commit | Sprint | Descrição |
|---|---|---|
| `63381d5` | (baseline) | fix(db): completa drift de schema introduzido pelos commits s0/s1 |
| `fdabe7e` | Q1 | race condition CashShift + logger estruturado + cron dunning |
| `0be78d9` | Q2 | timeout 30s em 25 $transaction críticas |
| `25a6959` | Q4.4 | rollback setupCompanyFinance + docs counter atomicidade |
| `41ad247` | Q4.1 | reverter commission + FIFO no cancel de venda |
| `9aa35c9` | Q5 | hardening — rate limit + HMAC webhook + CSP enforce + pool + sentry bridge |
| `ce834db` | Q6 | middleware→proxy + TODOs cashback/despesas + smoke recibo |
| `c951359` | gating-merge | Merge feature/plano-basico-gating into main (36 commits) |
| `9e6d299` | gating-fix | accessEnabled não deve bypassar feature gating |
| `016453a` | gating-extend | adiciona cashback e goals ao catalogo |
| `8670e11` | gating-extend | adiciona inventory_lots ao catalogo |

**Total:** 15 commits diretos no main + 36 commits do merge da branch de gating.

## 3. Pergunta a responder

> *"Os P0/P1 do AUDIT-2026-05-26 foram resolvidos pelas Sprints? Alguma sprint introduziu novo bug? O plan-gating bloqueia consistentemente em API + UI + middleware? Schemas/APIs/páginas continuam linkados sem buracos?"*

## 4. Não-objetivos (YAGNI)

- **Não** refazer o AUDIT-2026-05-26 (já temos 7 agentes + 3 reviewers desse audit, válido).
- **Não** testar E2E com browser (decisão consciente — outro audit, com escopo maior).
- **Não** auditar performance, escala, ou capacidade.
- **Não** revisar UX/design (audit anterior já cobriu).
- **Não** propor refatorações estruturais (escopo é regressão, não tech debt).

## 5. Estratégia: 3 agentes paralelos

### 5.1 Agente 1 — Sprint Regression Auditor
**Modelo:** Opus (general-purpose).

**Pergunta:** *"Os bugs P0/P1 do AUDIT-2026-05-26 foram resolvidos? Alguma sprint introduziu novo bug?"*

**Insumos:**
- `docs/AUDIT-2026-05-26.md` (síntese)
- `qa-artifacts/audit-2026-05-26/agent-{1..7}.md` (7 agentes originais)
- `qa-artifacts/audit-2026-05-26/reviewer-{A,B,C}.md` (3 revisores)
- `git log 63381d5..HEAD --stat`
- `git diff 63381d5..HEAD -- src/`

**Entrega:** `qa-artifacts/audit-2026-05-27/agent-1-regression.md`
- Tabela: bug-do-audit-antigo / status (resolvido / pendente / parcial) / commit-que-resolveu / severidade-residual.
- Lista de NOVOS bugs introduzidos pelas sprints (com evidência).

### 5.2 Agente 2 — Plan-Gating Verifier
**Modelo:** Opus (general-purpose ou code-reviewer).

**Pergunta:** *"As 16 features estão corretamente bloqueadas em TODOS os pontos (API, UI, middleware, seed)?"*

**Insumos:**
- `src/lib/plan-feature-catalog.ts` (16 features)
- `src/lib/with-plan-feature.ts` (wrapper)
- `src/lib/plan-features-cache.ts`
- `src/lib/plan-features.ts` (requirePlanFeature)
- `src/components/layout/sidebar.tsx`
- `src/components/layout/mobile-nav.tsx`
- `src/app/(dashboard)/layout.tsx` (gate por path)
- `src/middleware.ts` (x-current-path header)
- Todas as rotas em `src/app/api/{finance,reports,stock-transfers,lens-treatments,recurring-expenses,cashback,goals,inventory,sales}/**/*`
- `prisma/seed-plan-basico-features.ts` + variantes paid-only/rollback
- Testes em `src/lib/__tests__/`

**Entrega:** `qa-artifacts/audit-2026-05-27/agent-2-gating.md`
- Matriz 16×5: para cada feature key, ✅/❌ em [API-wrapped, sidebar-tem-feature-attr, mobile-nav-tem-feature-attr, layout-gate-cobre-path, seed-cria-entry].
- Lista de buracos (ex: "feature X tem API protegida mas sidebar esquece de esconder").
- Coerência com kill switch (`DISABLE_PLAN_FEATURE_GATING=true`).

### 5.3 Agente 3 — Integration Mapper
**Modelo:** Opus (general-purpose).

**Pergunta:** *"Schemas, APIs e páginas linkados sem buracos? Códigos órfãos? Drifts entre schema.prisma e migrations?"*

**Insumos:**
- `prisma/schema.prisma` (132 models, 75 enums)
- `prisma/migrations/`
- Todas `src/app/api/**/route.ts` (271 rotas)
- Todas `src/app/(dashboard)/**/page.tsx` (79 páginas)
- `src/components/layout/sidebar.tsx`

**Entrega:** `qa-artifacts/audit-2026-05-27/agent-3-integration.md`
- **Schemas:** drifts entre schema atual e migrations (foco em últimas 5 migrations).
- **APIs órfãs:** rotas que ninguém consome.
- **Links quebrados:** botões/`<Link>` que apontam pra rota inexistente.
- **Multi-tenant bugs:** queries Prisma sem `companyId` no filtro (bug recorrente conforme memory).

## 6. Síntese final

Eu (coordenador) consolido os 3 relatórios em `qa-artifacts/audit-2026-05-27/SYNTHESIS.md` com:

- **TL;DR (3 linhas):** quantos P0/P1/P2/P3 achados, veredito geral.
- **Tabela por severidade:**
  - P0 — crítico (parar de aceitar pagantes até resolver)
  - P1 — alto (resolver essa semana)
  - P2 — médio (backlog)
  - P3 — baixo (cosmético)
- **Tabela de aprovação** com ID, descrição, ação proposta, espaço pra ✅/❌.

## 7. Workflow pós-síntese

1. Apresento tabela ao usuário.
2. Usuário aprova/rejeita item a item via `AskUserQuestion` em lotes (3–4 por vez).
3. Itens aprovados: implemento + testes + commit + push (deploy automático Vercel).
4. Itens rejeitados: registro em memory como "decisão consciente" + razão.

## 8. Sucesso

A auditoria é considerada bem-sucedida se:

- [ ] Os 3 agentes entregam relatórios sem falha.
- [ ] Síntese identifica claramente o que mudou no risco residual desde 2026-05-26.
- [ ] Usuário consegue decidir ação para cada achado P0/P1.
- [ ] Nenhum P0 fica em estado ambíguo ("talvez resolvido, talvez não").

## 9. Riscos da própria auditoria

| Risco | Mitigação |
|---|---|
| Agentes hallucinarem bugs inexistentes | Cada achado deve citar arquivo:linha; síntese descarta achados sem evidência. |
| Agentes não cobrirem o diff inteiro | Disparados com prompt explícito do range de commits e arquivos. |
| Custo de tokens explodir | Limite: 3 agentes, 1 disparo, sem loops. |
| Síntese ficar muito longa pra revisar | Formato P0/P1/P2/P3 + tabela checkboxes força concisão. |

## 10. Artefatos a produzir

```
qa-artifacts/audit-2026-05-27/
  agent-1-regression.md
  agent-2-gating.md
  agent-3-integration.md
  SYNTHESIS.md
```

E memory:
- Atualizar `MEMORY.md` apontando para o novo audit.
- Anotar decisões conscientes de não-tratamento em memory dedicada se houver.
