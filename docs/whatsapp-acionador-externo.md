# Acionador externo da fila de WhatsApp (anti-bloqueio Fase 1)

Este guia é para o **dono** configurar o acionador que faz a fila de WhatsApp
andar aos poucos, protegendo o número de bloqueio. Faça **depois** do deploy.

## Como funciona (resumo)

- O cron diário (`/api/cron/whatsapp-messages`, 12h) **enfileira** as mensagens
  do dia (status `PENDING`), mas **não envia tudo de uma vez**.
- Um endpoint, `/api/cron/whatsapp-dispatch`, envia **1 mensagem por ótica por
  chamada**, respeitando horário comercial (8h–18h, dias úteis) e um teto diário.
- O **ritmo** de envio vem da **frequência com que esse endpoint é chamado**.
  Como o plano Hobby da Vercel só permite cron 1×/dia, usamos um **acionador
  externo gratuito** (cron-job.org) para chamá-lo a cada poucos minutos.
- Há também um cron nativo de **rede de segurança** 1×/dia (12h30) e o
  `/api/cron/whatsapp-messages` drena 1 leva logo após enfileirar — então, mesmo
  sem o acionador externo, a fila não trava de vez. Mas para o envio fluir aos
  poucos durante o dia, **configure o acionador externo abaixo**.

## Passo a passo no cron-job.org

1. Crie uma conta gratuita em <https://cron-job.org>.
2. **Create cronjob**.
3. **Title:** `Vis — WhatsApp dispatch`.
4. **URL:** `https://vis.app.br/api/cron/whatsapp-dispatch`
5. **Schedule:** a cada **3 minutos** (`Every 3 minutes`). Pode usar 2–5 min;
   quanto maior o intervalo, mais devagar a fila anda (e mais seguro o número).
6. **Request method:** `GET`.
7. Em **Advanced → Headers**, adicione:
   - **Name:** `Authorization`
   - **Value:** `Bearer SEU_CRON_SECRET`
   (use o mesmo valor da env `CRON_SECRET` da Vercel; sem ele a chamada volta 401).
8. Salve e **habilite** o cronjob.

> ⚠️ **Segredo:** o `Authorization: Bearer <CRON_SECRET>` protege o endpoint.
> Nunca exponha o `CRON_SECRET` em lugar público. Se vazar, gere um novo na
> Vercel e atualize aqui.

## Como saber se está funcionando

- No cron-job.org, o histórico de execuções deve mostrar **200 OK** (com auth) —
  uma execução sem o header volta **401** (esperado).
- A resposta JSON traz `{ sent, skipped, failed, pendingRestantes,
  skippedOutOfHours }`. Fora do horário comercial, `skippedOutOfHours: true` e
  nada é enviado — isso é normal.
- Na tela **Automações** do sistema, o Histórico mostra as mensagens saindo aos
  poucos (PENDING → SENT).

## E se a fila crescer demais (represar)?

`pendingRestantes` é o sinal de fila represada. Se ele só cresce ao longo do dia:

1. **Reduza o intervalo** do acionador (ex.: de 3 min para 2 min) — envia mais
   rápido, mas com mais risco ao número.
2. **Confira o teto diário** no código (`DAILY_CAP` em
   `src/services/whatsapp-queue-processor.ts`, hoje 50/ótica/dia). Se uma ótica
   gera mais que isso por dia, o excedente fica para o dia seguinte (por design).
3. **Verifique a conexão** da ótica: se o WhatsApp caiu, as mensagens são
   reavaliadas e marcadas `SKIPPED` (não ficam presas).

## Observações

- O botão **"Processar agora"** (aba Automações) enfileira tudo da ótica logada
  e dispara **a 1ª leva** na hora; o resto sai pelo acionador externo.
- Horário comercial e feriados: 8h–18h, sem domingos e sem feriados nacionais de
  data fixa. Feriados móveis (Carnaval etc.) ficam para a Fase 2.
