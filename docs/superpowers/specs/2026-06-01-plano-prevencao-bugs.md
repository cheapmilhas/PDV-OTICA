# Plano de Prevenção de Bugs — PDV ÓTICA SaaS

**Data:** 2026-06-01
**Contexto:** Após o ciclo de auditoria dogfood (~40 bugs corrigidos A–H + M) e o QA visual em produção (13 testes, T1–T13). Objetivo: reduzir a taxa de novos bugs, acelerar o conserto dos que escaparem, e **garantir que toda correção funcione para TODOS os clientes do SaaS** (multi-tenant).

---

## Diagnóstico: por que os bugs aconteceram

Os ~40 bugs caem em 3 famílias. Cada uma tem uma defesa ausente hoje.

| Família | Exemplos | Causa de ter passado | Defesa ausente |
|---|---|---|---|
| **Lógica de serviço errada** | T7 (estoque assimétrico), refund incompleto, cashback negativo, crédito burlável (H2), preço abaixo do custo (D) | `sale.service` (49KB), `stock.service`, `cashback.service`, `cash.service`, `quote.service` têm **ZERO testes** | Testes de integração de serviço |
| **Backend sem UI (feature morta)** | T3/T4 (promoPrice), T8 (ajuste cashback), T13 (tela em branco) | Compila e passa no CI; ninguém percebe que falta a porta de entrada | Checklist de entrega + smoke E2E |
| **Vazamento entre clientes** | E2 (CRM leak cross-tenant) | `where: { companyId }` é **manual em ~145 rotas**; esquecer um = vazar dados de outro cliente | Guard automático de tenant |

### Estado atual da infra de qualidade (fatos)
- ✅ Vitest configurado (threshold 30%, escopo `src/lib` + `src/services`)
- ✅ CI GitHub Actions (typecheck + test + build) em PR e push
- ✅ Logger central (`src/lib/logger.ts`) + Sentry condicional + `handleApiError` central
- ✅ `tsconfig.strict: true`
- ❌ **Zero testes nos serviços críticos** (`src/services/*.test.ts` não existe)
- ❌ **CI lint não bloqueia** (`continue-on-error: true`)
- ❌ **Sem git hooks** (husky/lint-staged)
- ❌ **Isolamento multi-tenant 100% manual** (sem Prisma extension / RLS)
- ❌ **Sentry não anexa companyId/userId** ao erro → debug multi-tenant lento
- ⚠️ 605 ocorrências de `any` (ESLint warn, não error)

---

## Plano por fases (ordem = maior retorno + protege o resto)

### 🥇 FASE 1 — Guard automático de tenant (SEGURANÇA, inegociável)
**Por quê primeiro:** é o único bug irreversível (vazar dados entre clientes = LGPD + perda de confiança). Já vazou uma vez (E2). Cada cliente novo aumenta o risco. Hoje depende de disciplina humana em 145 rotas.

**O que fazer:**
1. **Prisma Client Extension** (`src/lib/prisma-tenant-guard.ts`) que, para os modelos com `companyId`:
   - Em `findMany/findFirst/count/updateMany/deleteMany/aggregate`: **exige** `where.companyId` — lança erro em dev/test se faltar (fail-loud), loga warning + Sentry em prod (fail-safe, não derruba).
   - Modo de adoção gradual: começa em **warn-only** (loga toda query sem companyId) por 1-2 semanas pra mapear os call-sites, depois vira **throw** em dev/test.
2. **Helper `tenantScoped(companyId)`** opcional para queries novas — retorna um client já amarrado ao companyId.
3. **Lista de exceções explícita** (modelos globais sem companyId: Plan, SystemRule global, etc.) — allowlist auditável.
4. **Teste do guard**: prova que uma query sem companyId é barrada.

**Esforço:** médio (1-2 dias). **Impacto:** fecha a classe inteira de cross-tenant leak.
**Risco:** o modo warn-only primeiro evita quebrar produção. Validar com a lista de 145 rotas.

---

### 🥈 FASE 2 — Testes de integração dos serviços críticos
**Por quê segundo:** protege TODO o trabalho do ciclo dogfood. As ~40 correções não têm teste — a próxima edição pode revertê-las em silêncio.

**O que fazer (ordem por risco financeiro):**
1. `sale.service.ts` — create (preço-guard, crédito, comissão, estoque), **cancel (T7 simetria de estoque)**, refundFull (reverte tudo), reactivate.
2. `stock.service.ts` + `stock-movement.service.ts` — débito/crédito atômico, **stockControlled simetria (T7/T9)**, transferência (credita destino), allowNegative (override G1).
3. `cashback.service.ts` — adjustCashback piso 0 (M9), expiração piso 0 (M5), uso/ganho.
4. `cash.service.ts` — reverseAccountReceivableCash idempotente (C2), ghost cash (C1/C3).
5. `quote.service.ts` — convertToSale (mesmos guards da venda + H5 OS).

**Setup:** banco de teste (SQLite em memória OU Postgres efêmero via testcontainers/docker). Cada teste roda numa transação revertida ao final (isolamento). Subir threshold do Vitest gradualmente (30% → 50% → 60%) à medida que cobre.

**Regra de ouro:** **todo bug corrigido daqui pra frente nasce com um teste que falha ANTES do fix** (TDD de regressão). Isso transforma cada conserto numa lei permanente.

**Esforço:** alto (contínuo). **Impacto:** elimina regressão na lógica que mais sangra.

---

### 🥉 FASE 3 — CI que bloqueia + checklist de entrega
**Por quê terceiro:** automatiza as fases 1 e 2 (sem isso, dá pra deployar com teste vermelho).

**O que fazer:**
1. **ESLint bloqueante**: remover `continue-on-error: true`; corrigir/silenciar violações reais primeiro (não estourar de uma vez).
2. **Git hooks** (husky + lint-staged): typecheck + lint + test dos arquivos tocados no `pre-commit`; impede commit quebrado.
3. **Smoke E2E obrigatório no CI** (Playwright): expandir os 6 e2e atuais para cobrir os fluxos que sangraram — finalizar venda, cancelar, ajustar cashback, cadastrar produto com promoção, entrada de estoque. Isso pega a família "backend sem UI" automaticamente.
4. **Quality gate antes do deploy**: script `predeploy` que roda typecheck + test + build + smoke; deploy só se verde. Documentar no fluxo (hoje é `vercel deploy --prod --yes` manual).
5. **Checklist de PR** (`.github/pull_request_template.md`): "Feature de backend nova tem UI? Tem teste? É multi-tenant (where companyId)? Precisa de migration?"

**Esforço:** médio. **Impacto:** rede de segurança que não depende de lembrar.

---

### FASE 4 — Logs com contexto (debug rápido)
**Por quê por último (mas barato, faço junto da Fase 1):** acelera o conserto dos bugs que escaparem.

**O que fazer:**
1. **Sentry com contexto de tenant**: em `handleApiError` e no middleware, anexar `companyId`, `userId`, `role`, rota e (quando houver) `saleId`/`customerId` ao escopo do Sentry. Erro em prod passa a dizer QUAL cliente, QUAL usuário, QUAL recurso.
2. **Request ID / correlação**: gerar um id por request, propagar no logger e na resposta de erro — o cliente reporta o id, você acha o log na hora.
3. **Catálogo "sintoma → causa"** (`docs/runbook-bugs.md`): tabela viva ligando mensagens de erro a causas conhecidas e fixes (semente: os ERROR_CODES já existentes + os achados da auditoria). Reduz tempo de diagnóstico de bugs recorrentes.
4. **Alertas**: configurar Sentry para alertar em picos de erro 5xx por companyId (um cliente quebrado isolado é detectado antes da reclamação).

**Esforço:** baixo. **Impacto:** corta o tempo de conserto pela metade.

---

## "Funcionar para todos os clientes do SaaS" — como garantir

Esta é a parte transversal. As correções já feitas são multi-tenant-safe **se** respeitarem `companyId`. O que falta é a GARANTIA:

1. **Fase 1 (guard)** transforma a garantia de manual em automática — é o item central dessa preocupação.
2. **System rules / defaults por empresa**: bugs como tetos de desconto (D) ou cashback dependem de `SystemRule` por companyId com defaults. Garantir que TODA empresa nova nasce com os defaults corretos (seed de onboarding). Auditar o fluxo de criação de empresa.
3. **Teste multi-tenant**: nos testes da Fase 2, sempre rodar com 2 empresas e provar que a operação de uma não afeta a outra (ex.: cancelar venda da empresa A não toca estoque da B).
4. **Migrations**: toda mudança de schema deve rodar pra todos (já é o caso — Postgres único multi-tenant). Documentar migrations destrutivas (já anotado no padrão de M7).

---

## Sequência sugerida de execução

1. **Sprint 1 (segurança):** Fase 1 guard (warn-only) + Fase 4.1 contexto Sentry (mesmo arquivo).
2. **Sprint 2 (rede):** Fase 2 testes de `sale` + `stock`/`stock-movement` (os do T7/T9) + Fase 1 vira throw em dev/test.
3. **Sprint 3 (automação):** Fase 3 CI bloqueante + git hooks + smoke E2E.
4. **Sprint 4 (resto):** Fase 2 cashback/cash/quote + Fase 4 runbook + alertas.

**Princípio permanente a partir de hoje:** todo bug corrigido nasce com um teste de regressão que falha antes do fix. Todo backend novo só fecha com UI + teste + checagem multi-tenant.
