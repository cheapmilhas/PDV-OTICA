# D-0 — Go-Live (★ momento crítico)

## Objetivo
Fazer o flip definitivo: Básico passa a ter 13 features `false`, preço sobe pra R$ 149,90, e o kill switch é desligado. A partir desse momento clientes no Básico perdem acesso às 13 funcionalidades.

## Janela recomendada
- **Horário:** terça a quinta, **14:00-16:00 (BRT)** — fora de picos de venda
- **Duração estimada:** 15-30 min de operação + 1h de smoke + 24h de plantão
- **NÃO fazer:** sexta à tarde, segunda de manhã, véspera de feriado

## Equipe de plantão durante e nas 4h seguintes
- 1 dev (você ou backup) — pra rollback se necessário
- 1 CS — pra responder tickets que entrarem

## Checklist pré-flip (10 min antes)

- [ ] Pre-deploy feito (kill switch ON em prod) ✅ deveria estar desde D-14
- [ ] D-7 análise feita
- [ ] D-3 emails enviados há pelo menos 72h
- [ ] D-1 seed paid-only rodado com sucesso
- [ ] Backup atualizado (`backup-plans-d-0-$(date +%Y%m%d-%H%M).sql`)
- [ ] Conta de teste no Básico criada e logada num browser separado (pra smoke imediato)
- [ ] Conta de teste no Pro logada em outro browser
- [ ] Console de logs/Sentry aberto

## Sequência do flip

### 1. Backup (30s)
```bash
pg_dump "$PROD_DATABASE_URL" \
  --table='"Plan"' --table='"PlanFeature"' --table='"Subscription"' \
  -f backup-plans-d-0-$(date +%Y%m%d-%H%M).sql
ls -lh backup-plans-d-0-*.sql
```

### 2. Rodar seed completo (1-2 min)
```bash
cd "/Users/matheusreboucas/PDV OTICA"
DATABASE_URL="$PROD_DATABASE_URL" npm run db:seed:plan-basico-features
```

Output esperado:
```
[seed] Iniciando seed do plano Básico + features gated…
[seed] Básico: priceMonthly=14990, priceYearly=149900
[seed] Básico: 13 features=false
[seed] profissional: 13 features=true
[seed] enterprise: 13 features=true
[seed] ✓ Concluído com sucesso.
```

### 3. Verificar no DB (30s)
```sql
-- Preço Básico
SELECT slug, "priceMonthly", "priceYearly" FROM "Plan" WHERE slug = 'basico';
-- Esperado: priceMonthly=14990, priceYearly=149900

-- 13 features Básico
SELECT pf.key, pf.value FROM "PlanFeature" pf
JOIN "Plan" p ON p.id = pf."planId"
WHERE p.slug = 'basico' AND pf.key IN (
  'lens_treatments','stock_transfers','branch_comparison','dre_report',
  'cash_flow','finance_entries','finance_accounts','chart_of_accounts',
  'sales_refunds','bank_reconciliation','bi_analytics','card_receivables',
  'recurring_expenses'
)
ORDER BY pf.key;
-- Esperado: 13 linhas, todas com value='false'
```

### 4. ★ Flip do kill switch (30s — momento crítico)

No painel Vercel:
- Settings → Environment Variables
- Editar `DISABLE_PLAN_FEATURE_GATING`
- Trocar valor `true` → `false` (ou DELETAR a variável, equivalente)
- Salvar

**A Vercel automaticamente faz redeploy.** Aguarde "Ready" (~30-60s).

### 5. Smoke imediato (5 min)

**Aba 1 — conta Básico:**
- Recarregar `/dashboard` (Cmd+Shift+R)
- Sidebar: confirmar que **NÃO** mostra DRE Dinâmico, Tratamentos, Devoluções, Conciliação, BI, Cartões, Despesas Fixas, etc
- Navegar direto pra `/dashboard/financeiro/dre` → deve redirecionar para `/dashboard?upgrade-required=dre_report` + banner amarelo aparecer
- Tentar uma API via DevTools console:
  ```js
  fetch('/api/finance/entries').then(r => r.json()).then(console.log)
  // Esperado: { error: { code: "PLAN_FEATURE_REQUIRED", feature: "finance_entries" } }
  ```

**Aba 2 — conta Pro:**
- Recarregar `/dashboard`
- Sidebar: **todos os 13 itens devem aparecer**
- Navegar pra `/dashboard/financeiro/dre` — deve abrir normal
- API check:
  ```js
  fetch('/api/finance/entries').then(r => console.log(r.status))
  // Esperado: 200 (ou 401 se sessão expirou)
  ```

### 6. Se tudo OK
- [ ] Atualizar status no Slack: "Flip do plano Básico concluído com sucesso às HH:MM"
- [ ] CS confirma macro de resposta no ar
- [ ] Monitorar Sentry/logs nas próximas 4h

### 7. Se ALGO der errado
→ **Imediatamente** seguir [rollback.md](./rollback.md). Sem hesitar. O rollback é rápido e seguro.

## Smoke estendido (após 1h)

Ainda no plantão:
- Dashboard de Sentry: alguma anomalia? Spike de 500s?
- `/api/plan-features` retornando 13 features com valor correto?
- Login de cliente real Básico (não conta de teste) — ele consegue navegar sem ver tela quebrada?
- Logs estruturados de `plan_features_lookup_failed` (warn) — quantos por minuto?

## Critério de sucesso D-0

- Conta de teste Básico não acessa 13 telas ✅
- Conta de teste Pro acessa 13 telas ✅
- Zero erro 500 na primeira hora ✅
- Tickets de suporte < N (definir com CS antes) ✅

Se tudo positivo, marcar D-0 como **concluído** e prosseguir para [d-plus-7-monitoring.md](./d-plus-7-monitoring.md).
