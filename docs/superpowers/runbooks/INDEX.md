# Runbook Master — Flip do Plano Básico

Linha do tempo para executar o go-live do feature gating do plano Básico (R$ 149,90), bloqueando 13 funcionalidades.

## Timeline

| Quando | Ação | Runbook | Responsável sugerido |
|---|---|---|---|
| **D-14** (após merge) | Deploy de código com kill switch LIGADO | [pre-deploy.md](./pre-deploy.md) | Dev |
| **D-7** | Análise de impacto — query SQL contra prod | [d-minus-7-impact-analysis.md](./d-minus-7-impact-analysis.md) | Dev + Produto |
| **D-3** | Email aos clientes Básicos impactados + oferta de trial Pro 30d | [d-minus-3-customer-email.md](./d-minus-3-customer-email.md) | CS + Produto |
| **D-1** | Seed dos planos pagos (garantia, sem efeito visível) | [d-minus-1-paid-seed.md](./d-minus-1-paid-seed.md) | Dev |
| **D-0** | ★ Seed Básico + flip kill switch + smoke | [d-0-go-live.md](./d-0-go-live.md) | Dev + CS de plantão |
| **D-0 emergência** | Rollback rápido | [rollback.md](./rollback.md) | Dev de plantão |
| **D+1 até D+7** | Monitoring | [d-plus-7-monitoring.md](./d-plus-7-monitoring.md) | Dev + CS |

## Critério de sucesso geral

- Conta de teste Básico não acessa nenhuma das 13 telas após flip
- Conta de teste Profissional acessa as 13 telas normalmente
- Suporte recebe menos de N tickets relacionados nas 24h pós-flip (definir N com CS)
- Nenhum 500 inesperado em produção (Sentry/logs)
- Métrica de upgrade Básico→Pro acima do baseline em 7 dias

## Critério de aborto

Qualquer um dos abaixo dispara o [rollback.md](./rollback.md):
- Spike de erros 500 acima de 3x baseline
- Funcionalidade NÃO listada nas 13 sendo bloqueada inesperadamente
- Cliente Pro perdendo acesso a algo
- Mais de N tickets críticos em 1h
