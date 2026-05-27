# D-1 — Seed dos Planos Pagos

## Objetivo
Garantir que `profissional` e `enterprise` tenham TODAS as 13 `PlanFeature` = `"true"` no banco ANTES do flip do Básico. Sem isso, há janela de risco onde um cliente Pro pode acabar com feature indefinida (que, por default, bloqueia).

## Pré-requisitos
- Pre-deploy (kill switch ON) já feito
- D-7 análise feita
- D-3 emails enviados

## Backup primeiro

```bash
# Substitua $PROD_DATABASE_URL pela connection string com PERMISSÃO DE ESCRITA
pg_dump "$PROD_DATABASE_URL" \
  --table='"Plan"' --table='"PlanFeature"' --table='"Subscription"' \
  -f backup-plans-d-minus-1-$(date +%Y%m%d).sql
```

Salve esse arquivo em local seguro (não no repo).

## Rodar o seed

```bash
cd "/Users/matheusreboucas/PDV OTICA"

# Sanidade: confirme que está apontando pra prod
echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/'

# Rodar o seed (sem afetar Básico)
DATABASE_URL="$PROD_DATABASE_URL" npm run db:seed:plan-basico-features:paid-only
```

Output esperado:
```
[seed-paid-only] Atualizando apenas planos pagos…
[seed-paid-only] profissional: 13 features=true
[seed-paid-only] enterprise: 13 features=true
[seed-paid-only] ✓ Concluído.
```

## Verificar

```sql
SELECT p.slug, pf.key, pf.value
FROM "Plan" p
JOIN "PlanFeature" pf ON pf."planId" = p.id
WHERE pf.key IN ('lens_treatments', 'dre_report', 'sales_refunds', 'recurring_expenses')
  AND p.slug IN ('profissional', 'enterprise')
ORDER BY p.slug, pf.key;
```

Esperado: 8 linhas (2 planos × 4 keys), todas com `value = 'true'`.

## Smoke

Logar com conta Pro em produção. Sidebar deve continuar mostrando todos os itens (nada muda visualmente — kill switch ainda ON; features já marcadas como true).

## Se algo falhar

- Erro no seed: o `$transaction` reverte tudo. Estado intocado. Investigar.
- Plano não encontrado: warning no log, sem efeito. Confirme `Plan.slug` antes de prosseguir.

## Confirmação

- [ ] Backup salvo
- [ ] Seed rodou sem erro
- [ ] Query de verificação retorna 8 linhas `true`
- [ ] Smoke da conta Pro passou
- [ ] Pronto pra D-0
