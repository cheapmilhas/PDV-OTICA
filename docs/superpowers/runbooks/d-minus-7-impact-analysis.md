# D-7 — Análise de Impacto

## Objetivo
Identificar quais empresas no plano Básico USAM ativamente as 13 funcionalidades que serão removidas, para decidir o tom da comunicação D-3 e (se necessário) ofertas de trial do Pro.

## Como rodar a query

A query abaixo lê o `AuditLog` para mapear quem fez ações relacionadas a cada feature nos últimos 30 dias.

**Conecte ao banco de PRODUÇÃO em modo leitura** (recomendado: usar Neon Console em Read Replica, ou `psql` com usuário read-only).

```sql
-- 1. Empresas no Básico que tocaram em qualquer das 13 features nos últimos 30 dias
WITH basico_companies AS (
  SELECT c.id, c.name, c.email, c."billingEmail"
  FROM "Company" c
  JOIN "Subscription" s ON s."companyId" = c.id
  JOIN "Plan" p ON p.id = s."planId"
  WHERE p.slug = 'basico'
    AND s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
),
feature_usage AS (
  SELECT
    bc.id,
    bc.name,
    bc.email,
    bc."billingEmail",
    -- contagens por feature
    COUNT(*) FILTER (WHERE al."entityType" = 'LensTreatment') AS lens_treatments,
    COUNT(*) FILTER (WHERE al."entityType" = 'StockTransfer') AS stock_transfers,
    COUNT(*) FILTER (WHERE al."entityType" = 'DREReport') AS dre_reports,
    COUNT(*) FILTER (WHERE al."entityType" = 'FinanceEntry') AS finance_entries,
    COUNT(*) FILTER (WHERE al."entityType" = 'FinanceAccount') AS finance_accounts,
    COUNT(*) FILTER (WHERE al."entityType" = 'ChartOfAccounts') AS chart_of_accounts,
    COUNT(*) FILTER (WHERE al."entityType" = 'Refund') AS refunds,
    COUNT(*) FILTER (WHERE al."entityType" = 'ReconciliationBatch') AS reconciliations,
    COUNT(*) FILTER (WHERE al."entityType" = 'CardReceivable') AS card_receivables,
    COUNT(*) FILTER (WHERE al."entityType" = 'RecurringExpense') AS recurring_expenses,
    MAX(al."createdAt") AS last_action_at
  FROM basico_companies bc
  LEFT JOIN "AuditLog" al
    ON al."companyId" = bc.id
   AND al."createdAt" > NOW() - INTERVAL '30 days'
  GROUP BY bc.id, bc.name, bc.email, bc."billingEmail"
)
SELECT *
FROM feature_usage
WHERE (
  lens_treatments + stock_transfers + dre_reports + finance_entries +
  finance_accounts + chart_of_accounts + refunds + reconciliations +
  card_receivables + recurring_expenses
) > 0
ORDER BY last_action_at DESC NULLS LAST;
```

**Salvar resultado:**
```bash
psql "$PROD_READ_REPLICA_URL" -f impact-query.sql -o impact-d7.csv --csv
```

## Como interpretar

### Cliente sem uso (0 em todas as colunas)
- Pode receber comunicação **genérica** (mudança de plano sem foco em features perdidas)
- Sem urgência

### Cliente com uso leve (1-10 ações em 1-2 features)
- Email **informativo** + tutorial de upgrade
- Sem oferta especial

### Cliente com uso pesado (10+ ações, múltiplas features)
- Email **personalizado** com a lista exata do que ele usa
- **Oferta de trial Pro 30 dias gratuito**
- Eventual ligação do CS para fechar upgrade

### Outliers (>100 ações em uma feature)
- Análise manual caso a caso
- Pode justificar **grandfathering individual** via [admin override](#grandfathering-individual)

## Grandfathering individual (se necessário)

Se identificar uma conta crítica que NÃO pode perder acesso e o Pro é caro demais pra ela, opções:

**Opção A:** Manter no Básico mas marcar `accessEnabled = true` na Company. Isso desliga o gate inteiro pra essa empresa (mas também afasta enforcement de limits — usar com cuidado).
```sql
UPDATE "Company" SET "accessEnabled" = true WHERE id = '<companyId>';
```

**Opção B:** Trocar plano específico via admin SaaS (`/admin/clientes/<id>` → ação "Trocar plano").
**Cuidado:** isso vai consumir slot do Pro (impacto financeiro).

**Opção C** (mais limpo): criar `basico-legacy` plan com todas features=true e fazer changePlan via SQL:
```sql
-- Criar plano legacy (uma vez)
INSERT INTO "Plan" (id, slug, name, "priceMonthly", "priceYearly", "maxUsers", "maxBranches", "maxProducts", "maxStorageMB", "isActive", "trialDays", "sortOrder", "isFeatured")
VALUES (cuid(), 'basico-legacy', 'Básico Legacy', 14900, 149000, 3, 1, 500, 1000, false, 0, 0, false);

-- Marcar 13 features como true nele
INSERT INTO "PlanFeature" ("planId", key, value)
SELECT p.id, fk.key, 'true'
FROM "Plan" p
CROSS JOIN (VALUES ('lens_treatments'),('stock_transfers'),('branch_comparison'),('dre_report'),('cash_flow'),('finance_entries'),('finance_accounts'),('chart_of_accounts'),('sales_refunds'),('bank_reconciliation'),('bi_analytics'),('card_receivables'),('recurring_expenses')) fk(key)
WHERE p.slug = 'basico-legacy';

-- Trocar Subscription dessas empresas pro plano legacy
UPDATE "Subscription"
SET "planId" = (SELECT id FROM "Plan" WHERE slug = 'basico-legacy')
WHERE "companyId" IN ('co1', 'co2', ...);
```

## Output esperado da análise

Documento `impact-d7-summary.md` com:
- Total de empresas no Básico hoje
- Quantas usam alguma das 13 features
- Distribuição por feature (qual mais usada)
- Lista filtrada por bucket (sem uso / leve / pesado / outliers)

Esse documento é insumo para o **D-3**.
