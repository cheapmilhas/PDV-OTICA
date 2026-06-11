# Runbook — Ligar o Asaas de Produção (cobrança automática + atualização no painel)

> **Objetivo:** habilitar, com segurança, a integração Asaas em produção para que
> (a) o sistema crie cobranças reais (boleto/PIX) e (b) quando o cliente **pagar ou
> deixar de pagar**, o status atualize **automaticamente** no painel do super admin.
>
> **Estado hoje (2026-06-11):** DESLIGADO. Em prod só existe `ALLOW_UNSIGNED_ASAAS_WEBHOOK`.
> Não há `ASAAS_API_KEY` (não cria cobrança) nem `ASAAS_WEBHOOK_TOKEN` (webhook recusa
> tudo com 401 → nada atualiza sozinho). Só o **sandbox** foi testado manualmente.
>
> **Quem faz:** o DONO cola os segredos direto na Vercel (são credenciais de produção —
> não devem passar por chat/terminal de terceiros). Este runbook guia; não executa.

---

## 0. Pré-requisitos

- [ ] Conta Asaas de **produção** ativa e verificada (KYC aprovado, conta bancária para repasse).
- [ ] Acesso ao painel da Vercel (projeto `pdv-otica`).
- [ ] **Revogar a chave de produção que vazou no chat** (`$aact_prod_…` colada em 2026-06-11).
      Asaas → Configurações → Integrações → API → revogar a antiga e **gerar uma nova**.
      Use SEMPRE a chave nova nos passos abaixo.

---

## 1. Como o fluxo funciona (pra entender o que cada peça liga)

```
                         (chave API)                         (webhook token)
  App cria cobrança ──────────────►  ASAAS  ──── evento de pagamento ────►  /api/webhooks/asaas
  (POST /payments)                    │                                          │
                                      │                                          ▼
  cliente paga PIX/boleto ────────────┘                          atualiza Subscription/Invoice
                                                                  + dispara email (Fase 1)
                                                                  + alimenta cron de dunning
                                                                          │
                                                                          ▼
                                                              PAINEL SUPER ADMIN reflete
                                                              (status ACTIVE/PAST_DUE/…,
                                                               inadimplência, notificações)
```

- **`ASAAS_API_KEY`** → habilita o app a **criar/consultar** cobranças. Sem ela: não cria boleto/PIX.
- **Webhook** (`/api/webhooks/asaas`) → é o que faz o **"atualiza sozinho quando paga/não paga"**.
  Sem `ASAAS_WEBHOOK_TOKEN`, o webhook responde **401 a tudo** e nada atualiza.
- **`reconcile-billing` (cron diário)** → rede de segurança: consulta o Asaas direto e
  corrige divergências caso o webhook perca um evento. Também depende da `ASAAS_API_KEY`.

### Eventos que o webhook já trata (prontos, só faltam ser recebidos)
| Evento Asaas | Efeito automático no sistema |
|---|---|
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | Subscription → `ACTIVE`; zera `pastDueSince` + `lastDunningStage`; Invoice → `PAID`; **email PAYMENT_CONFIRMED** |
| `PAYMENT_OVERDUE` | Subscription → `PAST_DUE`; grava `pastDueSince` (inicia régua de cobrança/dunning) |
| `PAYMENT_REFUNDED` | Invoice → `REFUNDED` |
| `PAYMENT_CHARGEBACK_REQUESTED` / `_DISPUTE` | Invoice → `OVERDUE` + nota; Subscription → `PAST_DUE` |
| `SUBSCRIPTION_DELETED` | Subscription → `CANCELED` |

Depois que o webhook marca `PAST_DUE`, o **cron `dunning` (8h diário)** avisa o cliente nos
marcos 3/7/14 dias (in-app + email — Fase 1) e suspende/cancela conforme a régua. Tudo isso
aparece no painel do super admin (status da assinatura, aba inadimplência, notificações).

---

## 2. Variáveis a configurar na Vercel (Production)

> Vercel → projeto `pdv-otica` → Settings → Environment Variables → Production.
> Após adicionar/alterar, **é preciso um novo deploy** para as vars entrarem em vigor
> (o deploy é manual: `vercel deploy --prod`).

| Variável | Valor | Obrigatória? | Para quê |
|---|---|---|---|
| `ASAAS_API_KEY` | a chave NOVA `$aact_prod_…` | **SIM** | criar/consultar cobranças + reconcile |
| `ASAAS_WEBHOOK_TOKEN` | um segredo forte que VOCÊ gera (ex.: `openssl rand -hex 32`) | **SIM** | destrava o webhook (senão 401 em tudo) |
| `ASAAS_WEBHOOK_HMAC_SECRET` | outro segredo forte (`openssl rand -hex 32`) | **Recomendada** | assinatura HMAC do payload (defesa extra) |
| `ASAAS_API_URL` | *(não setar)* | não | a lib usa `https://api.asaas.com/v3` automaticamente quando a chave é `$aact_prod_` |

> ⚠️ A chave `$aact_prod_` faz a lib apontar para **produção** automaticamente
> (`getConfig()` detecta o prefixo). Não precisa setar `ASAAS_API_URL`.

### Sobre `ALLOW_UNSIGNED_ASAAS_WEBHOOK` (já existe em prod)
- Hoje está setada (escape hatch). Política do código: se `ASAAS_WEBHOOK_HMAC_SECRET`
  **não** estiver setado em prod, o webhook recusa — **a menos que** `ALLOW_UNSIGNED_ASAAS_WEBHOOK=1`.
- **Recomendado:** configurar o `ASAAS_WEBHOOK_HMAC_SECRET` e **remover/zerar**
  `ALLOW_UNSIGNED_ASAAS_WEBHOOK` (deixa o webhook em fail-closed pleno).
- Se for ligar SEM HMAC primeiro (rollout gradual), mantenha `ALLOW_UNSIGNED_ASAAS_WEBHOOK=1`
  temporariamente — mas o `ASAAS_WEBHOOK_TOKEN` ainda é obrigatório (é outra camada).

---

## 3. Configurar o webhook no painel do Asaas

Asaas (produção) → Configurações → **Integrações → Webhooks** → Adicionar:

- **URL:** `https://vis.app.br/api/webhooks/asaas`
- **Token de autenticação:** o MESMO valor de `ASAAS_WEBHOOK_TOKEN` que você pôs na Vercel
  (o Asaas envia no header `asaas-access-token`; o código compara).
- **Versão da API:** v3.
- **Eventos a marcar (no mínimo):**
  - `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`
  - `PAYMENT_OVERDUE`
  - `PAYMENT_REFUNDED`
  - `PAYMENT_CHARGEBACK_REQUESTED` (e dispute, se disponível)
  - `SUBSCRIPTION_DELETED`
- **Fila de sincronização:** ativada (o Asaas re-tenta se receber erro — o código retorna
  500 em falha de processamento justamente pra ele reenviar).
- Se usar HMAC: ativar a assinatura no painel e usar o mesmo `ASAAS_WEBHOOK_HMAC_SECRET`.

---

## 4. Deploy + ordem segura de ativação

> Ordem importa: ligue a API e o webhook **antes** de começar a cobrar, e teste o webhook
> com um valor mínimo antes de confiar nele.

1. [ ] Revogar chave `$aact_prod_` vazada e gerar nova (passo 0).
2. [ ] Adicionar `ASAAS_API_KEY` (nova), `ASAAS_WEBHOOK_TOKEN`, `ASAAS_WEBHOOK_HMAC_SECRET` na Vercel (Production).
3. [ ] Configurar o webhook no painel Asaas (passo 3) com o mesmo token/secret.
4. [ ] `vercel deploy --prod` (working tree na branch que está em prod; email do commit
       `cheapmilhas@users.noreply.github.com`). As novas env vars só valem após o deploy.
5. [ ] **Teste do webhook (sem depender de cobrança real):** no painel Asaas, em Webhooks,
       use "Enviar evento de teste" (ou crie uma cobrança de R$ mínimo e pague no seu banco).
       Confirme no app:
       - `GET https://vis.app.br/api/webhooks/asaas` com token errado → **401** (fail-closed OK).
       - Após um `PAYMENT_CONFIRMED` real chegar: a Subscription correspondente vira `ACTIVE`
         e a Invoice vira `PAID` no painel do super admin; e o email PAYMENT_CONFIRMED é
         enfileirado (com `testMode` ainda ligado, vai pro testEmail — ver passo 6).
6. [ ] **Emails do SaaS:** quando validar que tudo conecta, desligue o **modo teste** em
       `/admin/configuracoes/emails` (hoje está ON → emails só vão pro testEmail). Aí os
       avisos passam a ir para os clientes reais.

---

## 5. Como verificar que "atualiza sozinho" está funcionando

Depois de ligado, um pagamento/atraso deve refletir SEM intervenção manual:

- **Cliente paga** → webhook `PAYMENT_CONFIRMED` → no painel do super admin a assinatura do
  cliente mostra `ACTIVE`/em dia, a fatura vira `PAID`, e o cliente recebe o email de
  pagamento confirmado.
- **Cliente não paga (vence)** → webhook `PAYMENT_OVERDUE` → assinatura vira `PAST_DUE`,
  aparece na aba **Inadimplência** do admin. A partir daí o cron `dunning` (8h) avisa o
  cliente em 3/7/14 dias e suspende aos 14 / cancela aos 30 — tudo refletido no painel.
- **Rede de segurança:** o cron `reconcile-billing` (diário) consulta o Asaas e corrige a
  assinatura se o webhook tiver perdido algum evento.

### Sinais de que algo NÃO está ligado
- Webhook do Asaas mostrando entregas com **401** → `ASAAS_WEBHOOK_TOKEN` não bate (ou não
  setado / deploy não rodado).
- App não cria cobrança (erro `ASAAS_API_KEY environment variable is required`) → falta a chave.
- Pagamento feito mas painel não muda → webhook não está chegando (URL errada / evento não
  marcado / token errado). Cheque o histórico de entregas no painel Asaas.

---

## 6. Importante: geração de boleto/PIX automática é a FASE 2

A **Fase 1 (já em prod)** NÃO gera boleto automaticamente — ela só **avisa** (emails de
ciclo de vida + cobrança vencida). O que cria a cobrança real (boleto/PIX) quando a fatura
nasce, e manda o email com o link de pagamento (`INVOICE_CREATED`/`INVOICE_DUE_SOON`), é a
**Fase 2** — ainda não implementada. Ou seja:

- Com este runbook + Asaas ligado: o **webhook** já atualiza pagamento/inadimplência e os
  emails de ciclo de vida funcionam.
- Para o sistema **gerar** o boleto/PIX sozinho e mandar por email com botão de pagar:
  precisa implementar a Fase 2 (validamos no sandbox que a API do Asaas gera tudo certo —
  customer + payment R$5 PIX/boleto + QR + linha digitável).

---

## 7. Segurança / higiene

- [ ] Chave `$aact_prod_` antiga (vazada no chat 2026-06-11): **revogada**.
- [ ] Chave de sandbox `$aact_hmlg_` usada no teste manual: rotacionar quando possível
      (risco baixo por ser ambiente de teste, mas passou pelo chat).
- [ ] Segredos (`ASAAS_*`) configurados **só na Vercel**, nunca commitados nem em `.env` local.
- [ ] `VERCEL_TOKEN` de testes antigos (se ainda existir) — revogar (pendência herdada).
