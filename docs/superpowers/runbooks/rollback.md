# Rollback — Reverter o Flip

## Quando usar
- Spike inesperado de erros 500 após D-0
- Funcionalidade fora das 13 sendo bloqueada
- Cliente Pro perdendo acesso (regressão)
- Mais de N tickets críticos em 1h (definir N com CS)
- Bug que não foi pego no smoke

## 3 Níveis de Rollback

Escolha o mais leve que resolve o problema. Comece sempre pelo Nível 1.

---

### Nível 1 — Kill switch (instantâneo, ~30s)

**Use quando:** o gate está mal e quer voltar pro estado pré-D-0 IMEDIATAMENTE, sem mexer no banco.

No Vercel:
- Environment Variables → `DISABLE_PLAN_FEATURE_GATING` → trocar para `true`
- Redeploy automático (~30-60s)

Resultado: TODAS as 13 features voltam a ser acessíveis pra TODOS os clientes (Básico inclusive). Banco fica intocado (Básico ainda tem 13 features=false, mas é ignorado).

**Para volver depois:** trocar de novo pra `false` (precisa investigar/corrigir bug antes).

---

### Nível 2 — Rollback do seed do Básico (1-2 min)

**Use quando:** quer reverter o banco ALÉM do kill switch (ex: ficar idêntico ao estado pré-D-0). Comum se kill switch já está ON mas você quer cleanup definitivo.

```bash
cd "/Users/matheusreboucas/PDV OTICA"
DATABASE_URL="$PROD_DATABASE_URL" npm run db:seed:plan-basico-features:rollback
```

Output esperado:
```
[rollback] Revertendo plano Básico…
[rollback] Básico: priceMonthly=14900, priceYearly=149000
[rollback] Básico: 13 features=true (reverted)
[rollback] ✓ Concluído.
```

Resultado:
- Preço Básico volta pra 14900 / 149000
- 13 PlanFeature do Básico voltam pra `"true"`
- Planos pagos NÃO são tocados (continuam com 13 `"true"` — não tem porque reverter eles)

**Cache:** TTL de 5min em memória. Cliente vê a mudança em até 5min sem ação adicional. Se quiser força bruta, redeploy.

---

### Nível 3 — Restore do backup (15-30 min, último recurso)

**Use quando:** algo mais grave aconteceu além do Básico (ex: planos pagos corrompidos, dados perdidos).

```bash
# Localize o backup mais recente
ls -lt backup-plans-d-0-*.sql backup-plans-d-minus-1-*.sql

# Restore (DANGEROUS — só com OK do time)
psql "$PROD_DATABASE_URL" < backup-plans-d-0-YYYYMMDD-HHMM.sql
```

**Atenção:** `pg_dump` da Fase 6.1 / D-1 incluiu `Plan` + `PlanFeature` + `Subscription`. O restore desses tables vai sobrescrever mudanças feitas DEPOIS do backup. Se você fez `change_plan` de algum cliente entre o backup e o rollback, essa mudança se perde.

Por isso esse é último recurso.

---

## Comunicação durante rollback

1. **Slack interno:** "Iniciando rollback do plano Básico. ETA: 5 min."
2. **Status page** (se houver): atualizar
3. **CS:** preparar macro de resposta — "Detectamos um problema na atualização e estamos revertendo. Seu acesso voltou ao normal."
4. **Email aos clientes Básicos impactados** (se tickets foram massivos): pedir desculpas e avisar que voltarão a ter acesso.

## Pós-rollback

- [ ] Verificar conta Básico de teste: tudo acessível?
- [ ] Verificar conta Pro de teste: tudo acessível?
- [ ] Documentar o que deu errado em `retros/`
- [ ] Definir critério para nova tentativa (D-0 vNext)
