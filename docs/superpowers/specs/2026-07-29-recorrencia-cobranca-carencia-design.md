# Recorrência de cobrança + carência explícita

**Data:** 2026-07-29
**Estado:** desenho aprovado pelo dono (4 seções), spec a revisar
**Origem:** forja adversarial (3 criativos × 3 críticos + Codex como 4ª voz independente)

---

## 1. Problema

Nenhum cliente do Vis é cobrado pelo segundo mês. Nem ótica (`VIS_APP`), nem clínica (`VIS_MEDICAL`).

O sistema sabe converter um trial em assinatura paga (`createTrialConversionCharge`, validado em produção com dinheiro real em 2026-07-28) e sabe reagir a um pagamento (webhook do Asaas). O que não existe é qualquer coisa que declare **o que é devido no próximo período**. Nenhum código gera a fatura do ciclo seguinte; nenhum cron varre assinaturas por vencimento.

### 1.1. O diagnóstico que estava errado

A leitura inicial — e a memória do projeto — dizia que o vazamento era o ramo `ACTIVE` de `checkSubscription` (`src/lib/subscription.ts:188-197`) não comparar `currentPeriodEnd` com a data atual. Isso é verdade, mas é **irrelevante na prática**:

`src/lib/subscription.ts:104` devolve acesso pleno quando `Company.accessEnabled = true`, **antes de ler a assinatura**.

Medição em produção (2026-07-29): **14 das 17 empresas têm `accessEnabled = true`**, incluindo Óticas Ultra, Óticas Atacadão, Domus Saude e a clínica TESTE. Apenas 3 chegam à verificação de assinatura (Oticas Teste, Clínica Vis (Dev), MedFacil).

Corolário para PHI: `publishEntitlementForCompany` também chama `checkSubscription`. Para TESTE e Domus Saude, o entitlement publica `writeAllowed: true` permanentemente, independente de pagamento — **o cadeado do Domus não existe hoje para essas clínicas**.

Consertar o ramo `ACTIVE` sem tratar o bypass seria corrigir código inalcançável para 82% do parque, e declarar o furo fechado.

### 1.2. O que `accessEnabled` realmente é

Perguntado sobre as duas óticas com período vencido, o dono respondeu que **concede carência** a algumas óticas, e que uma delas é a dele própria.

`accessEnabled` não é herança acidental nem bug: é **cortesia comercial sendo improvisada** no único mecanismo disponível — um booleano que significa "ignore tudo sobre cobrança". Ele não registra quem concedeu, por quê, até quando, nem quanto custou.

Isso reenquadra a entrega: o problema não é só "falta cobrar", é "falta representar isenção". E dissolve a maior tensão do desenho (medo de desligar o bypass e travar cliente legítimo).

### 1.3. Estado de produção (verificado, não re-derivar)

| Fato | Evidência |
|---|---|
| 16 subscriptions, **zero** com `asaasSubscriptionId` | consulta ao banco 2026-07-29 |
| 8 invoices em todo o histórico do SaaS | idem |
| Óticas Ultra: `ACTIVE`, `currentPeriodEnd` 2026-04-26 (vencido há ~3 meses) | idem |
| `INV-000002` (Ultra, R$ 149,90) `PENDING` e **nunca foi ao gateway** (`asaasPaymentId` nulo) | idem |
| `INV-000003` e `INV-000004`: mesma empresa, mesmo valor, mesmo período — **duplicata real** | idem |
| Óticas Atacadão: ciclo anual, `ACTIVE` até 2027-02-24 | idem |
| MedFacil e TESTE: em `TRIAL`, já cobradas, PIX real emitido | idem |
| Primeira renovação medical vence **2026-09-09** (MedFacil) | idem |

---

## 2. Restrições

- **Asaas é produção real, sem sandbox.** O primeiro disparo do motor move dinheiro de verdade.
- **Sem banco de desenvolvimento.** `.env` local aponta para produção. Migração exige `.sql` escrito à mão + `prisma migrate deploy` executado manualmente pelo dono. Há incidente anterior de base de produção zerada.
- **18 crons já existem** e a Vercel já pausou o projeto por excesso de invocations. Cron novo precisa justificar-se contra piggyback.
- **Escala:** 2 clínicas pagantes, ~2 óticas ativas, 1 operador (o dono, desenvolvedor solo).

---

## 3. Decisões do dono

| # | Decisão |
|---|---|
| D1 | Escopo: fechar o bypass **e** construir a recorrência **numa entrega só**, compensando com deploy faseado. |
| D2 | `accessEnabled` é carência improvisada → cortesia vira feature de primeira classe. |
| D3 | Carência **com prazo** e **aviso antes de vencer** (cortesia esquecida já custou 3 meses de receita). |
| D4 | Carência **não emite fatura nenhuma** (sem e-mail, sem PIX, sem documento de R$ 0,00), mas **registra a receita não faturada**. |
| D5 | Cliente sem carência que não paga **é bloqueado**, mas só após a régua completa (cobrança emitida → vencimento → avisos 3/7/14 → restrição de escrita → cancelamento aos 30). |
| D6 | **Clínica segue a mesma régua da ótica.** Sem exceção por produto. |
| D7 | Óticas Ultra e Atacadão: o passado não faturado vira **cortesia retroativa**, não cobrança retroativa. |

---

## 4. Arquitetura

### 4.1. Obrigação de cobrança (`BillingObligation`)

O objeto que falta. Uma obrigação declara: *"a assinatura X deve o valor V pelo período [início, fim)"*.

Propriedades essenciais:

- **Sequência contígua por assinatura.** A obrigação `n+1` começa exatamente onde a `n` terminou (`novoPeriodStart = periodEnd anterior`), **nunca** em `now`. Isso elimina deriva de calendário e buraco de cobertura.
- **Identidade = `(subscriptionId, sequence)`**, garantida por unique no banco. Não por advisory lock: três dos quatro pontos que criam Invoice hoje (`createManualCharge`, `invoice-sync`, `admin/faturas/create`) **não pegam lock nenhum** — a disciplina de lock já é violada, e a duplicata `INV-000003/4` é a prova.
- **Preço e plano congelados** no momento da criação. Reajuste e troca de plano ficam historicamente corretos sem lógica extra.
- **Destino explícito:** `TO_CHARGE` (emite fatura), `COURTESY` (não emite nada, registra valor não faturado), `PAID`, `WAIVED_LEGACY` (passado regularizado), `VOID` (emitida por engano).

A obrigação é **a fonte de verdade do período**. `Subscription.currentPeriodEnd` continua existindo e sendo escrito pelo webhook (não vira cache derivado — ver §8.2), mas as decisões de cobrança passam a consultar a obrigação.

### 4.2. Tentativa de pagamento

Uma obrigação pode ter várias tentativas de cobrança no gateway (reemissão após cancelamento, troca de método). Reemitir **não cria período novo** — cria outra tentativa vinculada à mesma obrigação.

Isso resolve três casos que quebravam a abordagem descartada: ciclo anual, período que cruza mês, e reemissão após cancelamento.

### 4.3. Cortesia (`SubscriptionCourtesy`)

Concessão vinculada à assinatura, com **início, fim, motivo e autor**. Quando o motor gera o período seguinte de uma assinatura com cortesia vigente, a obrigação nasce `COURTESY`: nenhuma fatura, nenhum e-mail, nenhum PIX — e o valor cheio do plano fica registrado como receita não faturada.

O acesso de quem está em cortesia é liberado **pelo caminho normal** (a obrigação vigente está quitada, logo o cliente está em dia), não por bypass. Diferença crítica: o cadeado do Domus volta a funcionar para clínicas isentas — elas publicam `writeAllowed: true` *porque estão em dia*, e no dia em que a cortesia vencer, o cadeado age sozinho.

Aviso de vencimento de cortesia reusa o mecanismo de alerta ao operador que já existe (`alertOperators`, o mesmo do trial terminando).

**Cortesia ≠ plano interno.** A Domus Saude tem plano "Interno — Domus" com `priceMonthly = 0`. Isso é conta interna permanente, não cortesia comercial temporária: plano de preço zero **não gera obrigação a cobrar**, e não entra na contagem de receita não faturada. Misturar os dois faria a conta interna do dono aparecer como receita perdida.

### 4.4. Gate de acesso

`checkSubscription` passa a considerar a obrigação vigente. Duas invariantes inegociáveis:

**(I1) Ninguém é bloqueado sem ter sido cobrado.** O gatilho de inadimplência é uma obrigação **emitida e vencida**, nunca uma data de calendário. É a diferença entre "o cliente não pagou" e "nós não cobramos" — e é o que impede o cenário Óticas Ultra (suspensão em 3 dias de cron por uma fatura que o cliente nunca recebeu).

**(I2) Vencimento grava estado, nunca só calcula.**
O trigger `subscription_entitlement_revision_upd` (`prisma/migrations/20260719140000_entitlement_revision/migration.sql:94-106`) só avança a revisão do entitlement quando **uma coluna muda**. A passagem do tempo não muda coluna.

Modo de falha se I2 for violada: ontem o Domus recebeu `writeAllowed: true` na revisão 42 → hoje o período vence → o Vis passa a calcular `false` → publica `false` **ainda na revisão 42** → o receptor monotônico do Domus **rejeita por revisão não-crescente** → a clínica segue escrevendo PHI. Teste unitário passa, tela do admin mostra bloqueado, cadeado aberto.

Portanto a transição para inadimplente é uma **escrita persistida** (`ACTIVE → PAST_DUE` + `pastDueSince`), que dispara o trigger e propaga o bloqueio de verdade. Escrever `pastDueSince` também torna a linha visível ao cron de dunning, que filtra `pastDueSince: { not: null }` (`src/app/api/cron/dunning/route.ts:59`).

### 4.5. Motor de geração

Piggyback no cron `invoice-reminders` (`0 10 * * *`), que hoje varre `status: ACTIVE AND asaasSubscriptionId != null` — ou seja, **varre zero todo dia**. Sem 19º cron.

Por rodada, para cada assinatura elegível: garantir que existe a obrigação do período seguinte; se `TO_CHARGE`, emitir fatura com PIX e boleto e enviar e-mail. **Teto de uma obrigação por assinatura por rodada** (recuperação de backlog é gradual e observável, não avalanche de cobranças).

Emissão acontece alguns dias **antes** do período começar, para o cliente pagar antes de estar devendo.

### 4.6. Régua de inadimplência

Reusa integralmente o que existe (`src/lib/dunning.ts`, cron `dunning` às 8h): avisos em 3/7/14 dias, restrição de escrita aos 14, cancelamento aos 30 (só se os avisos foram efetivamente registrados). Leitura permanece liberada durante todo o atraso — o que trava é criar dado novo.

Para clínica, isso significa: prontuário legível o tempo todo; escrita restrita só após três avisos ao longo de duas semanas (D6).

---

## 5. Componentes

| Componente | Natureza | Responsabilidade |
|---|---|---|
| `src/lib/billing-clock.ts` | **puro** | Dado o histórico de obrigações e `now`: qual é o próximo período, quando emitir, se está vencido. Sem I/O. |
| `src/lib/billing-courtesy.ts` | **puro** | Cortesia vigente numa data? Destino da obrigação (cobrar / cortesia / isento por plano interno). |
| `src/lib/billing-obligation.ts` | **puro** | Preço congelado (reusa `resolveConversionPriceCents`), decisão sobre cobrança existente (reusa `decideOnExistingCharge`). |
| `src/services/billing-obligation.service.ts` | I/O | Cria a obrigação sob constraint (`ON CONFLICT ... RETURNING`), reserva a Invoice, e **fora da transação** chama `ensureInvoiceCharge` + `sendInvoiceCharge` (padrão já provado em `trial-conversion-charge.service.ts`). |
| `src/services/invoice-reminders.service.ts` | I/O | Ganha a fase de geração de obrigações, antes das fases atuais. |
| `src/lib/subscription.ts` | I/O | Gate por obrigação vigente + transição persistida. |
| Webhook Asaas | I/O | Ao confirmar pagamento, marca a obrigação como paga. |
| `/admin` — tela de cobrança | UI | Obrigações por assinatura, cortesias vigentes/a vencer, receita não faturada, e o relatório do modo sombra. |

Regra de fronteira: **toda decisão de negócio vive em função pura**; o que toca banco e gateway fica fino.

---

## 6. Migração

Estritamente aditiva:

- `CREATE TABLE billing_obligations` (+ unique `(subscription_id, sequence)`)
- `CREATE TABLE subscription_courtesies`
- `Invoice.billingObligationId` — coluna **nullable**
- Índices de apoio

Nenhum `ALTER` destrutivo, nenhum `NOT NULL` novo, nenhum `UPDATE` em linha viva. Reversível por `DROP TABLE` / `DROP COLUMN`.

> **Rejeitado explicitamente:** escrever `currentPeriodEnd` futuro em linhas existentes para "não jogar cliente pagante em inadimplência no deploy". Isso apagaria a evidência da inadimplência atual (inclusive a da Óticas Ultra) e alimentaria o dunning com data fabricada, de forma irreversível sem PITR. O mesmo efeito é obtido em memória, sem escrita.

---

## 7. Entrada em produção

Cinco etapas, cada uma isolada e reversível:

1. **Deploy inerte.** Tabelas e código sobem; motor desligado por flag própria. Nada muda para ninguém.
2. **Limpeza do passado.** Proposta linha a linha das 8 faturas (quais duplicatas cancelar, qual nunca foi ao gateway, o que vira cortesia retroativa), aprovada pelo dono antes de executar. **Antes** de criar a constraint de unicidade — a duplicata quebraria a migração no meio.
3. **Modo sombra.** O motor roda sem emitir e sem bloquear; apenas registra o que teria feito ("teria cobrado R$ 89,90 da MedFacil em 09/09"; "teria bloqueado a empresa X"). Única forma honesta de validar cobrança sem sandbox.
4. **Ligar emissão.** Cobra de verdade; ainda não bloqueia ninguém. Acompanhar o primeiro ciclo real.
5. **Ligar bloqueio, por coorte**, começando pelas assinaturas íntegras. `accessEnabled` é desligado **nesta etapa, empresa por empresa**, e só depois que a cortesia equivalente estiver registrada. Nunca em massa.

Reversão: `ENFORCE_SUSPENSION=false` (kill-switch global existente) e `SUBSCRIPTION_BYPASS_COMPANY_IDS` (isenção por empresa existente) seguem valendo.

**Flag própria.** O motor **não** pendura em `invoiceGenerationEnabled`: essa flag tem default `false` (`prisma/schema.prisma:4822`), mora em `SaasEmailConfig` e é editada numa tela intitulada "E-mails". Usá-la transformaria um botão de e-mail em "desligar o faturamento do SaaS".

---

## 8. Riscos aceitos

### 8.1. O cron pode dormir
Se o cron falhar ou a Vercel pausar o projeto, ninguém é cobrado silenciosamente. **Mitigação:** detector de descontinuidade na sequência de obrigações (buraco = alarme) + `withHeartbeat`, que o cron já usa. Não é garantia, é vigia.

### 8.2. `currentPeriodEnd` continua com múltiplos escritores
O desenho **não** transforma `currentPeriodEnd` em cache derivado, apesar de a proposta original (base C) sugerir. Motivo: o campo já tem quatro escritores (checkout, dois ramos do webhook, ações administrativas) e é lido pelo canal do Domus, pelo export e pelo agendamento de troca de plano. Transformá-lo em derivado sem aposentar os escritores criaria divergência entre cache e ledger — com o gate lendo o cache, uma divergência vira decisão de acesso errada, inclusive contra quem acabou de pagar. A obrigação passa a ser a fonte para **decisões de cobrança**; `currentPeriodEnd` segue como está para os consumidores atuais. Unificar os dois é trabalho posterior.

### 8.3. Recorrência nativa do gateway fica de fora
O checkout ótico já contém `asaas.subscriptions.create` (o Asaas cobraria sozinho), mas o caminho está bloqueado por três defeitos próprios: o período não avança sem Invoice local (dívida documentada em `webhooks/asaas/route.ts:392-399`); o sync deriva período do **mês-calendário do vencimento**, inventando um mês para assinatura anual (`invoice-sync.service.ts:26-47`); e o sync só importa `PENDING`/`OVERDUE`, ignorando pagamento já confirmado (`invoice-sync.service.ts:9-10`). Corrigir isso é entrega própria. **Fora do escopo.**

### 8.4. Defeitos vizinhos conhecidos, fora do escopo
- `@@unique([subscriptionId, asaasPaymentId])` sobre coluna nullable: no Postgres NULLs não colidem, então faturas pré-gateway coexistem livremente. É a explicação mecânica da duplicata `INV-000003/4`.
- `mark_paid` e `reactivate` ativam a assinatura sem renovar o período.
- Criação anual pelo admin usa `trialEnd` como fim de período (`admin/clientes/create/route.ts:328-343`).
- `PAYMENT_OVERDUE` rebaixa qualquer estado não-terminal sem verificar se já existe período posterior pago.

Nenhum é introduzido por esta entrega; todos ficam registrados. As invariantes I1 e I2 protegem o gate contra os efeitos dos dois primeiros.

---

## 9. Testes

**Funções puras** (sem banco, sem rede) cobrem a regra de negócio: encadeamento de períodos, cortesia vigente, preço congelado, decisão sobre cobrança existente, detecção de vencimento.

**Invariantes travadas por teste** — cada uma falha se alguém remover a proteção:

| Invariante | O que o teste prova |
|---|---|
| I1 | Assinatura vencida **sem obrigação emitida** não bloqueia ninguém. |
| I2 | Transição para inadimplente **grava estado** (não só calcula) → revisão do entitlement avança. |
| Contiguidade | `periodStart` da obrigação `n+1` == `periodEnd` da `n`; nunca `now`. |
| Idempotência | Duas execuções concorrentes produzem **uma** obrigação (constraint, não lock). |
| Reemissão | Reemitir cobrança cancelada **não** cria período novo. |
| Cortesia | Obrigação `COURTESY` não emite fatura, não manda e-mail, e registra valor não faturado. |
| Plano interno | Plano de preço zero não gera obrigação a cobrar nem conta como receita não faturada. |
| Anual | Ciclo anual gera **uma** obrigação de 12 meses, não 12 mensais. |

**Verificação de sabotagem:** para cada invariante, remover a proteção no código deve quebrar o teste correspondente — conferido no símbolo real, não em comentário.

---

## 10. Fora de escopo

- Recorrência nativa do Asaas (§8.3).
- Unificar `currentPeriodEnd` com o ledger (§8.2).
- Proration em troca de plano no meio do período.
- Cobrança retroativa da Óticas Ultra (decisão D7: vira cortesia).
- Correção dos defeitos vizinhos de §8.4.
