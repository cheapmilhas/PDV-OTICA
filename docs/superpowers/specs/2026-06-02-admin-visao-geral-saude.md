# Admin SaaS — Visão Geral + Saúde (plano)

**Data:** 2026-06-02
**Objetivo:** tornar o admin do SaaS confiável o suficiente para uso diário, começando
pela tela que o dono abre para saber "como o SaaS vai" — dashboard + health score.
**Contexto:** usuário hoje "quase não usa / incompleto". Escolheu o fluxo **Visão geral
+ saúde** como ponto de entrada.

## Diagnóstico (estado real, verificado no código)

O admin é mais completo do que parecia — NÃO é construir do zero. O dashboard
(`src/app/admin/page.tsx`) já é um server component com dados REAIS via Prisma:
KPIs (empresas, ativas, MRR, trial, recebido), alertas de health, ações pendentes
(inadimplência, trials expirando, faturas a vencer), empresas recentes.

**O elo quebrado (o que mata a confiança na tela):**
- O dashboard lê `company.healthScore` / `company.healthCategory`.
- Existe `calculateHealthScore()` + `saveHealthScore()` (`src/lib/health-score.ts`) e
  `POST /api/admin/health-score` (recalcula 1 ou todas).
- **MAS: nenhum cron recalcula automaticamente** (crons existentes: dunning,
  mark-delayed, retry-finance — nenhum de health). E **nenhum botão na UI** chama o
  recalc (mesmo padrão "backend sem UI" do dogfood: T3/T8/T13).
- Resultado: o health fica DESATUALIZADO ou zerado → os alertas de saúde do
  dashboard não refletem a realidade → a tela perde valor → "quase não uso".

## Plano por fases (incremental, cada uma deixa algo útil)

### FASE A — Health score que se atualiza sozinho + sob demanda
**Por quê primeiro:** sem isso, o resto da "visão de saúde" é fachada.
1. **Cron de health** (`src/app/api/cron/recalc-health/route.ts`): recalcula o health
   de todas as empresas periodicamente (diário). Fail-closed com CRON_SECRET (padrão
   dos outros crons). Registrar no agendador (vercel cron / vercel.ts).
2. **Botão "Recalcular saúde"** no dashboard admin (e/ou na ficha do cliente) que
   chama `POST /api/admin/health-score` — porta de entrada para o backend já pronto.
3. **Mostrar a data do último cálculo** (`healthScoreUpdatedAt` ou similar) para o
   admin saber se o número é fresco.
4. Verificar/ajustar os pesos do `calculateHealthScore` se necessário (hoje usa
   updatedAt como proxy de "último acesso" — anotar como limitação se for o caso).

### FASE B — Dashboard mais confiável e acionável
1. **Tendência simples:** MRR e nº de clientes vs. período anterior (seta ↑/↓) —
   usar UsageSnapshot se existir histórico, senão começar a snapshotar.
2. **Ações pendentes completas:** já tem inadimplência/trials/faturas; adicionar
   "clientes críticos sem contato há X dias" (cruza health + CompanyNote/CrmContact).
3. **Empty states honestos:** quando não há dados (SaaS novo), a tela deve explicar,
   não parecer quebrada.
4. **Timezone:** garantir que "vence em 3 dias / 7 dias" usa America/Sao_Paulo (mesma
   lição do M2 do dogfood — date puro = UTC na Vercel).

### FASE C — Tela de Health Score dedicada (a UI que falta)
1. **`/admin/saude`** (ou aba): lista de empresas ordenada por health, com os
   subscores (uso/billing/engajamento/suporte) e fatores de risco — o
   `HealthScore`/`UsageSnapshot` já guardam isso, só falta exibir.
2. Filtro por categoria (CRITICAL/AT_RISK/HEALTHY), link para a ficha do cliente.
3. Botão de recalcular por empresa.

## Princípios (herdados do plano de prevenção de bugs)
- Lógica de cálculo (score) já é função pura testável → **adicionar testes** do
  `calculateHealthScore` (hoje sem teste) ao mexer nela.
- Toda query admin sobre empresas é cross-tenant POR DESIGN (admin vê todas) — o
  tenant-guard vai logar; isso é legítimo e deve entrar na allowlist do guard quando
  virar throw (admin opera fora do escopo de 1 companyId).
- Deploy manual após cada fase; smoke-test; memória.

## Ordem sugerida
1. **Fase A** (health vivo) — destrava a confiança na tela. Começar aqui.
2. **Fase B** (dashboard acionável).
3. **Fase C** (tela dedicada de saúde).

Depois deste fluxo, os próximos candidatos do admin (já mapeados): onboarding de
cliente, cobrança/inadimplência, segurança do admin (2FA, sessão que expira, papel
restringe telas), e as outras UIs faltantes (networks, notificações, saved filters).
