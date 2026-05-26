# D-3 — Comunicação aos Clientes

## Objetivo
Avisar clientes do plano Básico sobre a mudança de escopo. Reduzir churn pós-flip e converter quem precisa em Pro com oferta de trial.

## Templates

### Email 1 — Cliente sem uso (genérico)

**Assunto:** Atualização do seu plano PDV Ótica

> Olá [Nome],
>
> Estamos atualizando os planos do PDV Ótica para deixar nossa oferta mais clara.
>
> A partir de **[D-0 data]**, o seu plano **Básico (R$ 149,90/mês)** terá o seguinte escopo:
>
> **Incluso:** PDV, vendas, clientes, OS, estoque básico, caixa, relatórios essenciais.
>
> Algumas funcionalidades avançadas migrarão para o **plano Profissional** (R$ 289/mês): DRE Dinâmico, Fluxo de Caixa, Lançamentos manuais, Plano de Contas, Conciliação Bancária, Devoluções formais, BI Analítico, Cartões, Despesas Recorrentes, Tratamentos, Transferências entre Filiais e Comparativo de Lojas.
>
> Pelos seus dados de uso, **essas funcionalidades não fazem parte do seu fluxo diário**, então essa mudança não deve afetar você.
>
> Caso queira testar o Profissional, **14 dias gratuitos sem cartão**: https://pdv-otica.com/precos
>
> Qualquer dúvida, responda este email ou fale com a gente no WhatsApp: https://wa.me/558599252772
>
> Time PDV Ótica

### Email 2 — Cliente com uso leve

**Assunto:** Algumas funcionalidades vão mudar de plano

> Olá [Nome],
>
> Estamos refinando os planos do PDV Ótica. A partir de **[D-0 data]**, o plano **Básico** (R$ 149,90/mês) deixará de incluir:
>
> [LISTA PERSONALIZADA com base no impact-d7.csv]
>
> Como você usou algumas dessas funcionalidades recentemente, queremos te avisar:
>
> - Você continua com **PDV completo, vendas, clientes, OS, estoque e caixa** — tudo isso permanece no Básico.
> - Se quiser manter as outras, o **Profissional** custa R$ 289/mês e inclui tudo. **14 dias grátis**: https://pdv-otica.com/precos
>
> Suporte WhatsApp: https://wa.me/558599252772
>
> Time PDV Ótica

### Email 3 — Cliente com uso pesado (personalizado, com oferta)

**Assunto:** Plano Profissional com 30 dias grátis pra você

> Olá [Nome],
>
> Queremos te ajudar a aproveitar melhor o PDV Ótica.
>
> Pelos seus dados de uso, identificamos que você está usando funcionalidades hoje no plano Básico que serão exclusivas do **Profissional** a partir de **[D-0 data]**:
>
> [LISTA EXATA das features usadas: ex: "DRE Dinâmico (X relatórios em 30 dias)", "Conciliação Bancária (Y batches)", etc]
>
> Como você já vem usando ativamente, queremos te oferecer:
>
> **30 dias grátis do Profissional** (R$ 289/mês após).
>
> O Profissional inclui tudo do Básico + Emissão NF-e, Contas a Pagar/Receber, Comissões, WhatsApp automático, Campanhas, e todas as funcionalidades de gestão financeira que você já usa.
>
> **Pra ativar:** responda este email com "ATIVAR PRO" ou ligue (85) 99925-2772.
>
> Time PDV Ótica

## Como aplicar o trial Pro 30 dias

No admin SaaS (`/admin/clientes/<companyId>`):
1. Ação "Trocar plano" → Profissional
2. Ação "Estender trial" (botão dedicado) → +30 dias do trial Pro
3. Confirmar que `Subscription.status = 'TRIAL'` e `trialEndsAt` está correto

**Importante:** trocar plano DISPARA automaticamente `invalidatePlanFeaturesCache(companyId)` (implementado na Fase 4.7) — cliente vê o novo plano na próxima request.

## Lista a quem enviar

Gerada a partir de `impact-d7.csv` (do D-7):
- **Email 1 (genérico):** linhas com `total_actions = 0`
- **Email 2 (leve):** linhas com `total_actions BETWEEN 1 AND 10`
- **Email 3 (pesado):** linhas com `total_actions > 10`

Ferramenta sugerida: Mailgun, SendGrid, ou disparo manual via Gmail para casos pesados.

## Checklist D-3

- [ ] `impact-d7.csv` revisado e segmentado em 3 buckets
- [ ] Templates revisados com tom do produto/CS
- [ ] Lista de Email 3 (pesado) revisada manualmente (são poucos)
- [ ] Disparos agendados/enviados
- [ ] Suporte avisado das próximas 72h de volume de tickets esperado
