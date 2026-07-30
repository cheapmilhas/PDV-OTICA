# Bootstrap das obrigações — proposta APROVADA pelo dono (2026-07-30)

> Etapa 2 do rollout da spec §7. **Aprovada linha a linha pelo dono em 2026-07-30**, a partir
> do levantamento read-only feito no banco de produção na mesma data.
>
> Esta etapa não estava nas 11 tasks do Plano B. Ela apareceu na Task 5, quando o serviço se
> recusou a inferir a âncora do período de `currentPeriodEnd` — decisão correta, confirmada na
> spec §7 etapa 2, que exige o bootstrap e coloca a definição de `sequence = 1` dentro dele.

## Por que o bootstrap é pré-requisito

`Subscription.currentPeriodEnd` tem **7 escritores**, e `mark_paid` confirma pagamento **sem
avançar o campo**. Inferir a âncora dali re-cobraria período já pago. Pior: sem mapear as
faturas vivas, o motor não reconheceria as cobranças com PIX já emitido e **emitiria uma
segunda mensalidade do mesmo período** — dinheiro do cliente saindo duas vezes, num gateway
sem sandbox.

Enquanto o bootstrap não roda para uma assinatura, o motor devolve `skipped/needs_bootstrap`
e **não cobra ninguém**. A âncora é **por assinatura**, então dá para bootstrapar uma clínica
só e ligar a emissão para ela, sem regularizar as 16 de uma vez.

## Foto do banco em 2026-07-30 (produção, leitura apenas)

**16 assinaturas, 8 faturas, 0 obrigações, 0 cortesias.** Só **4 assinaturas** importam para
cobrança; as outras 12 são `CANCELED`, `TRIAL_EXPIRED` ou plano de preço zero.

⚠️ **Correções factuais ao que a spec afirmava:**
- A duplicata **não** é `INV-000003`/`INV-000004`. É na **Óticas Atacadão**, período de junho:
  duas faturas de R$ 149,90, uma que **nunca foi ao gateway** e outra com PIX vivo.
- As "duas conversões já cobradas com PIX vivo" são **TESTE** e **MedFacil**, ambas em `TRIAL`.
- A **MedFacil** é a única das quatro com `accessEnabled = false` — a única que hoje passa pela
  verificação de assinatura de verdade.

---

## Decisão 1 — Óticas Atacadão (`cmm1993ga000c90ezc38kk28n`)

**Estado:** `ACTIVE`, plano Básico **ANUAL** R$ 1.499,00, período `[24/02/2026 → 24/02/2027)`.
Tem **4 faturas mensais** penduradas numa assinatura anual: 2× R$ 149,90 (junho, uma delas a
duplicata que nunca foi ao gateway) e 2× R$ 5,00 com períodos de teste. **Nenhuma paga.**

**APROVADO: cortesia retroativa até o fim do período anual.** É ótica do dono e entra na
carência que ele já concedia informalmente via `accessEnabled`.

| O quê | Valor |
|---|---|
| obrigação `sequence = 1` | `[24/02/2026 → 24/02/2027)` |
| `disposition` | `COURTESY` |
| `priceCents` | `149900` (R$ 1.499,00 — valor cheio, vira receita não faturada) |
| `state` | `PAID` (isenta nasce quitada; sem `issuedAt`/`dueAt`, logo nunca restringe por I1) |
| cortesia | `24/02/2026 → 24/02/2027`, motivo "ótica do dono" |
| 4 faturas | `VOID` — lixo de teste |

### ⚠️ Emenda de 2026-07-30 (o dry-run barrou e o dono decidiu)

O dry-run **recusou** e deu ROLLBACK: duas das quatro faturas são **manuais**
(`isManual = true`), e o script se recusa a cancelar lançamento manual por conta própria —
lançamento manual é decisão de alguém. Foi o dry-run fazendo exatamente o trabalho dele.

O levantamento (leitura apenas) mostrou o que são:

| Fatura | `isManual` | Valor | Descrição | PIX | Pago |
|---|---|---|---|---|---|
| `cmq8wvms3000112j053nia271` | `false` | R$ 149,90 | — | **nunca foi ao gateway** | não |
| `cmqa0trpo0001zthyw53zmupv` | `false` | R$ 149,90 | — | `pay_7q8qptpcuqwj21yd` | não |
| `cmqa5j96l0003mndw7n7hdqe6` (INV-000005) | **`true`** | R$ 5,00 | `"TESTE"` | `pay_nfmlisx8urjclfid` | não |
| `cmqabuwzf00014brjd91vvspg` (INV-000006) | **`true`** | R$ 5,00 | `"MENSALIDADE JJULHO"` | `pay_8q0tv3vfmuva0a2w` | não |

**Decisão do dono (2026-07-30): as duas manuais são teste dele e podem ser anuladas.**
R$ 5,00 numa assinatura ANUAL de R$ 1.499,00, descrições `"TESTE"` e `"MENSALIDADE JJULHO"`
(com o typo), criadas em 11 e 12/06 — é lançamento manual de teste.

O script passa a anular as 4, com `voidReason` distinguindo as manuais das automáticas.
⚠️ **A exceção vale SÓ para esta assinatura** (`cmm1993ga000c90ezc38kk28n`), declarada
explicitamente. A guarda geral continua valendo para qualquer outra: o script **não** cancela
lançamento manual por conta própria.

🚨 **O PIX das duas manuais continua VIVO no Asaas.** Anular a fatura local **não** cancela a
cobrança no gateway — o cliente ainda consegue pagar os R$ 5,00. Se o dono quiser fechar de
verdade, tem que cancelar no painel do Asaas. Fora do escopo deste script, que por regra não
chama o gateway.

## Decisão 2 — Óticas Ultra (`cmn8ww0yy0008m25s5avfmk23`)

**Estado:** `ACTIVE`, plano Básico MENSAL R$ 149,90. Uma fatura **PAGA** de R$ 99,90 (maio,
preço com desconto) e uma `PENDING` de R$ 149,90 (junho) que **nunca foi ao gateway** — o
cliente nunca a recebeu. É a que "vaza há 3 meses".

**APROVADO: cortesia formal de 01/06/2026 até 31/12/2026.** O motor retoma a cobrança em
janeiro/2027, avisando antes de vencer.

| O quê | Valor |
|---|---|
| obrigação `sequence = 1` | `[01/05/2026 → 31/05/2026)`, `PAID`, `priceCents = 9990` (a fatura paga) |
| obrigações seguintes | `COURTESY` de junho em diante, `priceCents = 14990` cada |
| cortesia | `01/06/2026 → 31/12/2026`, motivo "carência concedida" |
| fatura de junho | `VOID` — nunca foi ao gateway; cobrar agora seria punir o cliente por falha nossa |
| receita não faturada registrada | ~R$ 1.049,30 (7 meses) |

> Cobrar o atrasado foi explicitamente **descartado**: a forja classificou isso como "punir o
> cliente por falha nossa", já que ele nunca recebeu aviso nenhum.

## Decisão 3 — TESTE e MedFacil (as duas em `TRIAL`, com PIX vivo)

**APROVADO: mapear a fatura existente para a obrigação.** É o mapeamento que a spec §7 exige;
sem ele o motor emite uma segunda mensalidade do mesmo período.

| Assinatura | obrigação `sequence = 1` | fatura vinculada |
|---|---|---|
| TESTE (`cmryty1d1008ewikgogat8gtv`) | `[07/08/2026 → 07/09/2026)`, `CHARGE`, `ISSUED`, `priceCents = 18990` | `cms4vwe7b001c10quxzva1ww3` (PIX `pay_eo8jup3l0gd7b1b5`) |
| MedFacil (`cms18lj5800034z37xamv6ez5`) | `[09/08/2026 → 09/09/2026)`, `CHARGE`, `ISSUED`, `priceCents = 8990` | `cms50bzgu000cq2snrim3kcyw` (PIX `pay_805aqzhcpooy0f9d`) |

O vínculo é `Invoice.billingObligationId` → obrigação. Quando o PIX for pago, o webhook
(Task 8) marca a obrigação como `PAID`.

⏰ **1ª renovação medical: 09/09/2026** (MedFacil).

## Decisão 4 — As outras 12 assinaturas

**APROVADO: não criar obrigação nenhuma.** O motor já as ignora naturalmente — `CANCELED` e
`TRIAL_EXPIRED` não são "vivas" (`LIVE_STATUSES`), e plano R$ 0,00 vira `INTERNAL`.
Criar obrigação para elas seria inventar dado.

`accessEnabled` delas **fica como está** — aposentar o bypass é assunto do **Plano C**, não
deste bootstrap. Sete delas têm `currentPeriodEnd NULL`, que hoje significa acesso vitalício;
isso também é Plano C.

Inclui **Domus Saude** (plano "Interno — Domus", R$ 0,00, `ACTIVE`): fica intocada nesta etapa.

---

## Como o script tem que ser escrito

Mesma disciplina da migração (`scripts/apply-billing-obligations.cjs`, aplicado em produção
em 2026-07-29):

- **Escrito pelo agente, executado pelo dono.**
- Mostra o **host do banco antes de escrever** qualquer coisa.
- **Idempotente**: reexecutar é no-op seguro. Verificação ANTES e DEPOIS.
- **Uma transação só** (`$transaction` do Prisma, com `timeout` explícito) — ou tudo entra ou
  nada entra. ⚠️ **Um statement por chamada**: o Prisma emite `$executeRawUnsafe` como
  *prepared statement*, que aceita **exatamente um comando** (foi o erro `42601` que derrubou
  a primeira tentativa da migração).
- **Modo `--dry-run` obrigatório**: imprime exatamente o que faria, sem escrever, para o dono
  conferir antes de valer.
- **Não chama o Asaas.** Nenhuma cobrança nova é criada — as duas faturas com PIX já existem.
- Escreve com o **client do Prisma tipado** (`prisma.billingObligation.create` etc.), não SQL
  cru, para a checagem de tipos valer.

⚠️ Uma obrigação isenta escrita como `PLANNED` **trava a assinatura** (achado da revisão de
qualidade da Task 5: o motor devolve `settled` para sempre, sem cobrar e sem alertar). Por
isso as isentas nascem `PAID`.
