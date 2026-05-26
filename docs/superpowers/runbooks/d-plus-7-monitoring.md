# D+1 até D+7 — Monitoring

## Métricas a observar diariamente

### Métricas técnicas
- **Erros 500** em prod (Sentry/Vercel logs): comparar contra baseline pré-D-0
- **Logs estruturados `plan_features_lookup_failed`** (level=warn): contar ocorrências/min
- **Latência P95 do dashboard layout**: medir antes vs depois (cache LRU adiciona ~5ms na primeira request)
- **403 com `code:PLAN_FEATURE_REQUIRED`**: contagem por feature (mostra quais features Básicos tentam mais)

### Métricas de negócio
- **Tickets de suporte** com palavra-chave: "DRE", "devolução", "tratamento", "transferência", "lançamento", "conciliação", "cartão", "despesa fixa"
- **Upgrades Básico→Pro** por dia (comparar com baseline)
- **Cancelamentos** no Básico (alerta se > N por dia)
- **Mensagens no WhatsApp de suporte** com palavras-chave acima

## Logs a buscar

```
# Sentry filter ou Vercel Logs search:
event:"plan_features_lookup_failed"
code:"PLAN_FEATURE_REQUIRED"
```

## Decisões por dia

### D+1
- Houve algum 500 inesperado? → investigar, considerar kill switch se grave
- Tickets dentro do esperado? → seguir
- Spike de cancelamento? → ligar pros impactados, oferecer Pro com desconto

### D+3
- Comportamento estabilizou?
- Algum cliente Pro reportou perda de acesso? → bug, escalar
- Upgrades acontecendo? → bom sinal

### D+7
- Retro: documentar lessons learned em `docs/retros/2026-XX-plano-basico-feature-gating.md`
- Decidir se mantém kill switch como infra permanente ou remove de env (recomendado manter — é cinto de segurança)

## Quando NÃO se preocupar

- `plan_features_lookup_failed` ocasional (1-2/dia): Neon costuma ter glitches transientes
- Cliente reclamando "perdi acesso ao DRE" — é o comportamento esperado, CS responde com Pro
- Latência adicional < 20ms: dentro do orçamento

## Quando se preocupar

- 🔴 5+ `plan_features_lookup_failed`/min sustained
- 🔴 Cliente Pro reportando que perdeu acesso (algo deu errado, regressão)
- 🔴 Tickets > 2x baseline (comunicação D-3 insuficiente)
- 🔴 Cancelamentos > baseline (churn — escalar pra Produto)

## Critério de sucesso final (D+7)

- [ ] Sem erros 500 acumulados
- [ ] Tickets dentro do baseline +20%
- [ ] Conversões Básico→Pro acima de 0 (qualquer upgrade já é ROI da campanha)
- [ ] Sem regressão em planos pagos
- [ ] Equipe confortável com a feature

Se todos ✅: marcar projeto como **concluído** e arquivar runbooks como referência.
