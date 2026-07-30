# Gestão de cobranças pelo super admin — frente própria (não é o Plano B)

> Levantada pelo dono em 2026-07-30, no meio do bootstrap do Plano B: *"o ideal seria no próprio
> super admin a gente ter como cancelar, criar, etc… tudo pelo próprio sistema — boletos, PIX,
> cobranças extras, tudo direto pelo sistema para gerar no Asaas."*
>
> **Status: NÃO PLANEJADA.** Este documento registra o problema, o que já existe e as decisões
> em aberto. Não é plano de execução — quando for a vez, passa pela `forja` (é feature nova,
> com múltiplas abordagens válidas e blast radius de dinheiro real).

## O caso concreto que originou a demanda

O dry-run do bootstrap barrou porque três faturas da Óticas Atacadão têm **PIX vivo no Asaas**:

| Fatura | Valor | PIX | O que é |
|---|---|---|---|
| automática (junho) | R$ 149,90 | `pay_7q8qptpcuqwj21yd` | duplicata do período |
| INV-000005 | R$ 5,00 | `pay_nfmlisx8urjclfid` | teste manual (`"TESTE"`) |
| INV-000006 | R$ 5,00 | `pay_8q0tv3vfmuva0a2w` | teste manual (`"MENSALIDADE JJULHO"`) |

A guarda do script recusa anular fatura local com cobrança viva no gateway — e está certa:
mudar o status local **não** cancela o PIX, o cliente ainda pode pagar, e o webhook
ressuscitaria a fatura como `PAID`. Com a Task 8 no ar, o webhook agora também mexe em
obrigação, então o estado ficaria contraditório dos dois lados.

**Hoje a única saída é o dono abrir o painel do Asaas e cancelar à mão.** É exatamente a
lacuna que ele apontou.

## 🔑 O que JÁ existe (não precisa construir)

O cliente Asaas **já sabe cancelar** — falta a rota e a tela que o chamam:

| Capacidade | Onde | Situação |
|---|---|---|
| `asaas.payments.delete(id)` | `src/lib/asaas.ts:312` (`DELETE /payments/{id}`) | ✅ existe, **sem chamador** |
| `asaas.payments.create(...)` | `src/lib/asaas.ts:297` | ✅ existe e é usado |
| `asaas.subscriptions.cancel(id)` | `src/lib/asaas.ts:273` | ✅ existe |
| `asaas.subscriptions.update(id)` | `src/lib/asaas.ts:266` | ✅ existe (troca de plano) |
| `asaas.customers.create/update` | `src/lib/asaas.ts:224/236` | ✅ existe e é usado |
| `createManualCharge` | serviço | ✅ existe — cobrança avulsa já é criável |
| **Cancelar cobrança pela UI** | — | ❌ **não existe** |

⚠️ `DELETE /payments/{id}` do Asaas só remove cobrança **ainda não paga** — o docblock em
`asaas.ts:307-311` já registra isso. Cobrança paga exige estorno, que é outro fluxo.

## Por que isso é frente própria, e não um item do Plano B

O Plano B é *recorrência automática*: o sistema decide sozinho o que cobrar e emite. Esta
frente é *intervenção manual*: o operador decide caso a caso. São eixos diferentes, e
misturá-los cria o risco de o botão manual furar as invariantes do motor.

⚠️ **O ponto de atrito que a forja vai ter que resolver:** hoje `Invoice.isManual` é o que
protege a clínica de ser bloqueada por uma taxa avulsa vencida (decisão deliberada e
documentada no webhook, `route.ts` no `case PAYMENT_OVERDUE`), e o motor **ignora fatura
manual** na guarda de cobrança dupla. Uma tela que crie cobrança avulsa livremente precisa
respeitar isso — senão uma taxa de implantação vencida passa a trancar a clínica inteira.

## Decisões em aberto (para a forja)

1. **Cancelar cobrança precisa cancelar nos DOIS lados** (local + gateway), e a ordem importa:
   se cancelar local primeiro e o gateway falhar, o cliente segue podendo pagar algo que o
   sistema esqueceu. Provavelmente gateway primeiro, local depois, com reconciliação.
2. **O que fazer com a obrigação vinculada** quando a cobrança é cancelada à mão? Volta para
   `PLANNED`? Vira `VOID` com motivo? A Task 5 já tem `voidReason` para isso.
3. **Gate de papel.** Igual à Task 10: `requireSupportScope` **não checa papel**
   (`AdminUser.role` default = `SUPPORT`). Tela que cancela e cria cobrança mexe com dinheiro —
   precisa de gate de papel próprio. Ver memória `admin-gates-scope-vs-role`.
4. **Trilha de auditoria.** Quem cancelou, quando, por quê. Cancelamento de cobrança é ação
   sensível e hoje não haveria registro.
5. **Escopo do "criar"**: cobrança avulsa já existe (`createManualCharge`). Vale expor emissão
   de boleto/PIX arbitrário, ou só avulsa com descrição e valor?
6. **Estorno** (cobrança já paga) é fluxo distinto de cancelamento e tem implicação fiscal —
   provavelmente fora do primeiro corte.

## Relação com o Plano B

Independentes, mas com um encontro prático: **enquanto esta frente não existir, o bootstrap
depende do dono cancelar os 3 PIX à mão no painel do Asaas.** Quando existir, esse passo vira
um clique no super admin.

Não é bloqueio recíproco: o Plano B segue sem ela, e ela pode ser feita depois.
