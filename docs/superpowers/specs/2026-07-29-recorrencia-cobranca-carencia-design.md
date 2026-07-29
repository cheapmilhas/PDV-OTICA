# Recorrência de cobrança + carência explícita

**Data:** 2026-07-29
**Estado:** desenho aprovado pelo dono; spec revisada em 2 rodadas (revisor de spec + Codex adversarial)
**Origem:** forja adversarial (3 criativos × 3 críticos + Codex como 4ª voz independente)

> **Nota de revisão.** A 1ª versão desta spec afirmava que a régua de inadimplência atual entregava "três avisos ao longo de duas semanas" e que a escrita era restrita aos 14 dias. **Ambas eram falsas** (§4.6). A régua real trava a escrita no vencimento e pode pular marcos. Corrigido, e o ajuste da régua passou a fazer parte do escopo (D8/D9) — o que aumenta o blast radius: mexe em todas as óticas em produção, não só no caminho novo.

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
| D5 | Cliente sem carência que não paga **é restringido**, mas só após a régua completa (cobrança emitida → vencimento → avisos 3/7/14 → restrição de escrita → cancelamento aos 30). ⚠️ A régua atual **não** entrega isso hoje — ver D8/D9 e §4.6. |
| D6 | **Clínica segue a mesma régua da ótica.** Sem exceção por produto. |
| D7 | Óticas Ultra e Atacadão: o passado não faturado vira **cortesia retroativa**, não cobrança retroativa. |
| D8 | **A escrita permanece liberada durante os avisos**, sendo restrita apenas no marco final. Exige mudar a semântica atual de `PAST_DUE` (ver §4.6.1). |
| D9 | **Só restringe quem foi comprovadamente avisado** — aviso efetivamente despachado, não apenas enfileirado (ver §4.6.2). |

---

## 4. Arquitetura

### 4.1. Obrigação de cobrança (`BillingObligation`)

O objeto que falta. Uma obrigação declara: *"a assinatura X deve o valor V pelo período [início, fim)"*.

Propriedades essenciais:

- **Sequência contígua por assinatura.** A obrigação `n+1` começa exatamente onde a `n` terminou (`novoPeriodStart = periodEnd anterior`), **nunca** em `now`. Isso elimina deriva de calendário e buraco de cobertura.
- **Identidade = `(subscriptionId, sequence)`**, garantida por unique no banco. Não por advisory lock: três dos quatro pontos que criam Invoice hoje (`createManualCharge`, `invoice-sync`, `admin/faturas/create`) **não pegam lock nenhum** — a disciplina de lock já é violada, e a duplicata `INV-000003/4` é a prova.
- **Preço e plano congelados na emissão** (não na criação — ver §4.1.2). O histórico do que foi cobrado fica correto mesmo após reajuste ou troca de plano.
- **Dois eixos ortogonais, não um enum só.** Misturar destino com ciclo de vida torna "emitida e vencida" — a base de I1 — não consultável de forma inequívoca:
  - **Disposição** (o que se pretende fazer com o período): `CHARGE` · `COURTESY` · `INTERNAL` (plano de preço zero) · `LEGACY_WAIVED` (passado regularizado).
  - **Estado** (onde o período está): `PLANNED` → `ISSUED` → `PAID`, mais `VOID` (anulada, com motivo).
  - Mais os carimbos que I1 consulta: `issuedAt`, `dueAt`, `paidAt`, e a tentativa vigente.
- **Calendário explícito:** intervalo semiaberto `[periodStart, periodEnd)`, tudo em UTC, com data-âncora do ciclo preservada e regra de fim de mês (31/01 + 1 mês). Contiguidade sozinha não evita deriva: a aritmética atual usa `setMonth` (`src/lib/trial-conversion-charge.ts:59-74`), que desloca 31/01 para março.
- **A constraint garante unicidade, não contiguidade.** `UNIQUE(subscriptionId, sequence)` impede duas linhas com o mesmo número, mas não impede lacuna (`sequence` 3 sem 2) nem sobreposição de datas. A contiguidade é responsabilidade da função pura que calcula o próximo período, travada por teste e vigiada pelo detector de descontinuidade (§8.1).

A obrigação é **a fonte de verdade do período**. `Subscription.currentPeriodEnd` continua existindo e sendo escrito pelo webhook (não vira cache derivado — ver §8.2), mas as decisões de cobrança passam a consultar a obrigação.

### 4.1.1. Assinatura efetiva (pré-requisito)

`Subscription` **não tem unique em `companyId`**, e hoje cada fluxo resolve a ambiguidade de um jeito diferente: `checkSubscription` pega a mais recente, inclusive se for `CANCELED` (`subscription.ts:116-127`); `plan-change` recusa se houver mais de uma elegível (`internal/domus/plan-change/route.ts:148`); a conversão de trial idem (`trial-conversion-charge.service.ts:121`); o checkout busca só `ACTIVE`/`TRIAL` (`billing/checkout/route.ts:100`), de modo que uma empresa `PAST_DUE` pode ganhar assinatura nova enquanto a antiga segue no dunning; o canal do Domus devolve 409 com duas não-canceladas (`internal/domus/billing/route.ts:127`).

Um motor que iterasse "cada assinatura elegível" **cobraria a mesma empresa duas vezes**. Sequência por assinatura não resolve duplicidade por empresa.

→ A entrega introduz `resolveEffectiveSubscription(companyId)`, **fonte única e fail-closed em ambiguidade**, usada pelo motor e pelo gate. Fail-closed aqui significa: não cobra e alerta o operador, nunca escolhe por conveniência (escolher "a mais recente" cobraria a assinatura errada, com valor e plano errados).

### 4.1.2. Vigência de plano

Emissão antecipada cria uma janela em que a obrigação já está congelada e o plano muda antes do período começar: a obrigação cobra o plano A enquanto o entitlement já publica o plano B (a troca escreve `Subscription.planId` no ato — `admin/clientes/[id]/actions/route.ts:130`, `domus-plan-change/deps.ts:324`).

→ Regra: **obrigação ainda não emitida é recalculada** quando o plano muda; obrigação já emitida é cancelada e reemitida, ou mantida com o preço antigo por decisão explícita registrada. "Preço congelado" vale a partir da **emissão**, não da criação.

> Correção factual: a troca de plano **não** emite cobrança imediata. Ela faz `PUT /subscriptions/{id}` no Asaas, alterando apenas cobranças futuras (`domus-plan-change/deps.ts:230`, `lib/asaas.ts:95`); e downgrade hoje é recusado com 501 (`internal/domus/plan-change/route.ts:189`).

### 4.1.3. Trial estendido

Estender trial só altera `trialEndsAt` (`admin/clientes/[id]/actions/route.ts:84`), sem tocar em fatura. Se a obrigação já foi emitida cobrindo o período seguinte, a extensão passa a cobrar dias que voltaram a ser gratuitos.
→ Regra: estender trial **recalcula ou anula** a obrigação não paga do período afetado.

### 4.2. Tentativa de pagamento

Uma obrigação pode ter várias tentativas de cobrança no gateway (reemissão após cancelamento, troca de método). Reemitir **não cria período novo** — cria outra tentativa vinculada à mesma obrigação.

Isso resolve três casos que quebravam a abordagem descartada: ciclo anual, período que cruza mês, e reemissão após cancelamento.

> **Reemissão exige decisão humana.** `decideOnExistingCharge` manda `CANCELED`/`REFUNDED` para revisão manual (`src/lib/trial-conversion-charge.ts:132-138`), e isso é preservado: o motor **não** reemite sozinho cobrança cancelada ou estornada — ele sinaliza ao operador, que decide. A reutilização da função vale para os casos automáticos (`PENDING`/`OVERDUE` = reusa; `PAID` = nada a fazer).

### 4.3. Cortesia (`SubscriptionCourtesy`)

Concessão vinculada à assinatura, com **início, fim, motivo e autor**. Quando o motor gera o período seguinte de uma assinatura com cortesia vigente, a obrigação nasce com disposição `COURTESY`: nenhuma fatura, nenhum e-mail, nenhum PIX — e o valor cheio do plano fica registrado como receita não faturada.

O acesso de quem está em cortesia é liberado **pelo caminho normal** (a obrigação vigente está quitada, logo o cliente está em dia), não por bypass. Diferença crítica: o cadeado do Domus volta a funcionar para clínicas isentas — elas publicam `writeAllowed: true` *porque estão em dia*, e no dia em que a cortesia vencer, o cadeado age sozinho.

Aviso de vencimento de cortesia reusa o mecanismo de alerta ao operador que já existe (`alertOperators`, o mesmo do trial terminando).

**Cortesia ≠ plano interno.** A Domus Saude tem plano "Interno — Domus" com `priceMonthly = 0`. Isso é conta interna permanente, não cortesia comercial temporária: plano de preço zero **não gera obrigação a cobrar**, e não entra na contagem de receita não faturada. Misturar os dois faria a conta interna do dono aparecer como receita perdida.

**Cortesia é avaliada por período inteiro, alinhada ao ciclo.** Uma cortesia que termina no meio de um ciclo criaria ambiguidade (marcar o período todo como cortesia estenderia o benefício; marcá-lo como cobrável cobraria dias concedidos). Regra: a cortesia é avaliada contra o `periodStart` da obrigação e **vale para o período inteiro**; a interface arredonda a data escolhida para o limite do ciclo e mostra ao operador a data efetiva antes de confirmar. Cortesia parcial de período fica fora de escopo — sem isso seria preciso quebrar períodos, o que contradiz a contiguidade da sequência.

### 4.4. Gate de acesso

`checkSubscription` passa a considerar a obrigação vigente. Duas invariantes inegociáveis:

**(I1) Ninguém é bloqueado sem ter sido cobrado.** O gatilho de inadimplência é uma obrigação **emitida e vencida**, nunca uma data de calendário. É a diferença entre "o cliente não pagou" e "nós não cobramos" — e é o que impede o cenário Óticas Ultra (suspensão em 3 dias de cron por uma fatura que o cliente nunca recebeu).

**(I2) Vencimento grava estado, nunca só calcula.**
O trigger `subscription_entitlement_revision_upd` (`prisma/migrations/20260719140000_entitlement_revision/migration.sql:94-106`) só avança a revisão do entitlement quando **uma coluna muda**. A passagem do tempo não muda coluna.

Modo de falha se I2 for violada: ontem o Domus recebeu `writeAllowed: true` na revisão 42 → hoje o período vence → o Vis passa a calcular `false` → publica `false` **ainda na revisão 42** → o receptor monotônico do Domus **rejeita por revisão não-crescente** → a clínica segue escrevendo PHI. Teste unitário passa, tela do admin mostra bloqueado, cadeado aberto.

Portanto a transição para inadimplente é uma **escrita persistida** (`ACTIVE → PAST_DUE` + `pastDueSince`), que dispara o trigger e propaga o bloqueio de verdade. Escrever `pastDueSince` também torna a linha visível ao cron de dunning, que filtra `pastDueSince: { not: null }` (`src/app/api/cron/dunning/route.ts:59`).

**As tabelas novas precisam do mesmo tratamento.** Os triggers existentes observam apenas `Company` e `Subscription`. Se o gate passa a depender de obrigação paga/anulada ou de cortesia criada/revogada, essas mudanças alterariam o acesso **sem tocar coluna publicável de `Subscription`** — e o Domus receberia a revisão antiga, ou nem haveria linha no outbox. É a falha de I2 reaparecendo por outra porta.
→ Regra: **toda transição que afeta acesso ou bumpa a revisão por trigger próprio nas tabelas novas, ou altera atomicamente uma coluna publicável de `Subscription` na mesma transação.** A escolha entre as duas fica para o plano; o que não pode é nenhuma das duas.

**Persistir ≠ ter chegado.** A escrita enfileira no outbox de forma durável; a entrega ao Domus é feita pelo publisher (best-effort) e pelo drain horário (`vercel.json`, `drain-entitlement-outbox`). Falha de rede ou configuração mantém a linha na fila. O texto correto é "enfileira para publicação eventual, com backstop horário" — o receptor monotônico torna a chegada fora de ordem segura, mas não instantânea.

### 4.5. Motor de geração

Piggyback no cron `invoice-reminders` (`0 10 * * *`), que hoje varre `status: ACTIVE AND asaasSubscriptionId != null` — ou seja, **varre zero todo dia**. Sem 19º cron.

Por rodada, para cada assinatura elegível: garantir que existe a obrigação do período seguinte; se `TO_CHARGE`, emitir fatura com PIX e boleto e enviar e-mail. **Teto de uma obrigação por assinatura por rodada** (recuperação de backlog é gradual e observável, não avalanche de cobranças).

Emissão acontece alguns dias **antes** do período começar, para o cliente pagar antes de estar devendo.

### 4.6. Régua de inadimplência

Reusa a infraestrutura existente (`src/lib/dunning.ts`, cron `dunning` às 8h, `DunningEvent`), mas **exige duas mudanças de semântica** — a régua atual não entrega o que D5 promete.

#### 4.6.1. A escrita hoje trava no vencimento, não no marco final

`checkSubscription` devolve `readOnly: true` já no primeiro dia de `PAST_DUE` (`src/lib/subscription.ts:204-218`), e `requireWriteAccess` bloqueia sempre que `readOnly` (`:272-286`). Ou seja: hoje os avisos de 3/7/14 acontecem com o cliente **já sem escrever**, e o marco de 14 dias apenas troca `PAST_DUE` (leitura liberada) por `SUSPENDED` (`allowed: false`).

Isso contraria D5/D8. A entrega introduz um estágio intermediário: **vencido e avisado, ainda gravável**. Concretamente, `PAST_DUE` deixa de implicar `readOnly` imediato; a restrição de escrita passa a valer a partir do marco final da régua.

Efeito por produto:
- **Ótica:** hoje `SUSPENDED` devolve `allowed: false` — perde o acesso inteiro. Mantido.
- **Clínica:** `writeAllowed` é o único campo que o guard do Domus lê (`src/lib/entitlement-projection.ts:34`), então a clínica perde **escrita**, nunca leitura — o prontuário continua consultável mesmo suspensa. Assimetria pré-existente, aqui documentada e preservada.

> ⚠️ Esta mudança afeta **todas as óticas em produção**, não só o caminho novo. É a parte de maior blast radius da entrega e deve ser fatiada e testada isoladamente.

#### 4.6.2. O cron pula marcos e não confirma entrega

Dois defeitos reais, ambos confirmados no código:

**Pula marcos.** `nextDunningStage` devolve o **maior** marco atingido ainda não avisado, não todos os pendentes (`src/lib/dunning.ts:17-34`; o próprio docblock exemplifica: "entrou com 10 dias e lastStage=0 → retorna 7, não 3"). Se o cron encontra o cliente já com 14 dias de atraso, envia **um** aviso e suspende na mesma execução (`cron/dunning/route.ts:93-178`). Com 30 dias, pode avisar, suspender e cancelar numa rodada só.
→ A régua passa a exigir os marcos em **execuções distintas**: não se restringe no mesmo tick em que o primeiro aviso foi emitido.

**Confunde enfileirado com enviado.** `notifyCompany` grava `SaasEmailLog = SENT` ao enfileirar (`saas-notification.service.ts:160`), e `Invoice.invoiceSent = true` é gravado logo em seguida (`invoice-send.service.ts:86`) — mas o despacho real pode falhar depois, com até 3 tentativas (`email-queue.service.ts:101`). Também retorna `SKIPPED` silenciosamente quando o envio está desligado, sem destinatário, ou em modo de teste (`saas-notification.service.ts:67`).
→ **É exatamente o caso que acabou de acontecer com a MedFacil** (e-mail redirecionado para o operador por `testMode`, cliente nunca avisado).
→ Por D9, o gate exige **evidência de despacho efetivo**. A peça já existe e está **órfã**: `DunningEvent` (`prisma/schema.prisma:3878`) tem `status`, `sentAt`, `errorDetail`, canal (`EMAIL`/`WHATSAPP`/`SYSTEM`) e os cinco estados `PENDING`/`SENT`/`DELIVERED`/`FAILED`/`SKIPPED` (`:4707`) — e **nenhuma linha de código a escreve ou lê hoje** (verificado por varredura). Passa a ser a trilha de comunicação que autoriza a restrição.
`SKIPPED` é justamente o caso da MedFacil (e-mail suprimido por modo de teste): a tabela já distingue "falhou ao enviar" de "nem tentou", que é a diferença entre punir o cliente por problema nosso e não punir.

#### 4.6.3. Invariante resultante

**(I3) Não se restringe acesso sem trilha de aviso despachado.** Falha de e-mail vira alerta ao operador, nunca punição ao cliente. Se o aviso não saiu, o relógio da régua não avança.

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
- `CREATE TABLE billing_shadow_decisions` (artefato descartável do modo sombra — §7, etapa 3)
- `Invoice.billingObligationId` — coluna **nullable**
- **Triggers de revisão de entitlement** nas duas primeiras tabelas, chamando `bump_entitlement_revision(companyId)` — sem isso, mudança de obrigação/cortesia não chega ao Domus (§4.4)
- Índices de apoio

Nenhum `ALTER` destrutivo, nenhum `NOT NULL` novo, nenhum `UPDATE` em linha viva. Reversível por `DROP TABLE` / `DROP COLUMN` / `DROP TRIGGER`.

> A mudança de semântica da régua (§4.6.1) **não** é migração — é código, e é a parte que afeta clientes existentes. Deve ser fatiada e deployada separadamente das tabelas.

> **Rejeitado explicitamente:** escrever `currentPeriodEnd` futuro em linhas existentes para "não jogar cliente pagante em inadimplência no deploy". Isso apagaria a evidência da inadimplência atual (inclusive a da Óticas Ultra) e alimentaria o dunning com data fabricada, de forma irreversível sem PITR. O mesmo efeito é obtido em memória, sem escrita.

---

## 7. Entrada em produção

Cinco etapas isoladas, reversíveis **até a etapa 4** (ver ressalva na própria etapa):

0. **Ajuste da régua** (§4.6.1/4.6.2), deployado sozinho, antes de tudo. É a única parte que muda comportamento de cliente existente sem depender do motor novo, e por isso vai primeiro e isolada: se algo quebrar, o culpado é inequívoco.
1. **Deploy inerte.** Tabelas, triggers e código sobem; motor desligado por flag própria. Nada muda para ninguém.
2. **Bootstrap e limpeza do passado.** Proposta linha a linha das 8 faturas existentes, aprovada pelo dono antes de executar: quais duplicatas anular, qual nunca foi ao gateway, o que vira cortesia retroativa e — o ponto crítico — **o mapeamento de cada fatura viva para a obrigação correspondente**. Sem esse mapeamento, o motor não reconhece `INV-000008`/`INV-000009` (as duas conversões já cobradas, com PIX vivo) e **emitiria uma segunda mensalidade do mesmo período**. Inclui definir a obrigação inicial (`sequence = 1`) de cada estado legado: em trial, ativo pago, ativo sem evidência de pagamento, e período vencido.
   > A justificativa anterior ("a duplicata quebraria a constraint") estava **errada**: a unicidade proposta é na tabela nova, e as duplicatas vivem em `Invoice`. A etapa continua sendo pré-requisito, mas pelo motivo acima.
3. **Modo sombra.** O motor roda sem emitir e sem bloquear, gravando as decisões em **artefato próprio e descartável** (`BillingShadowDecision`), nunca em `BillingObligation` — senão o modo sombra congelaria preço, plano e sequência reais, e ao ligar a emissão o sistema cobraria decisões tomadas dias antes. Prova o que se propõe a provar (a quem, quanto, quando, e quem seria restrito) e assume o que não prova: gateway, e-mail, webhook e concorrência só são exercitados na etapa 4.
4. **Ligar emissão.** Cobra de verdade; ainda não restringe ninguém. Acompanhar o primeiro ciclo real.
   > **Esta etapa não é reversível no sentido comercial.** Desligar a flag não cancela cobrança já criada no Asaas nem "desmanda" e-mail. A reversão precisa de procedimento explícito: cancelar as tentativas `PENDING` no gateway e tratar caso a caso o que já foi pago.
5. **Ligar restrição, por coorte**, começando pelas assinaturas íntegras. `accessEnabled` é desligado **nesta etapa, empresa por empresa**, e só depois de verificar, no mesmo instante: exatamente uma assinatura efetiva; obrigação cobrindo a data atual; cortesia (se houver) já materializada em obrigação; nenhuma tentativa antiga capaz de rebaixar; e decisão do gate ainda favorável. Registrar a cortesia **não basta** como preflight.
   > **Aposentar os escritores do bypass antes da coorte.** Três caminhos ainda gravam `accessEnabled: true` (`public/register/route.ts:143`, `auth/activate/route.ts:90`, `admin/clientes/create/route.ts:315`) — sem tratá-los, o bypass reaparece em cadastro novo depois do cutover. Também não existe hoje ação administrativa para alternar o campo por empresa: o procedimento operacional precisa ser criado.
   > **Destino do campo:** `accessEnabled` deixa de ser bypass de cobrança e **permanece** apenas como isenção declarada de conta interna, ou é aposentado em favor de `SUBSCRIPTION_BYPASS_COMPANY_IDS`. Decidir no plano — manter dois caminhos de bypass sem dono é o estado que criou este problema.

Reversão: `ENFORCE_SUSPENSION=false` (kill-switch global existente) e `SUBSCRIPTION_BYPASS_COMPANY_IDS` (isenção por empresa existente) seguem valendo.

**Flags próprias, uma por etapa.** O motor **não** pendura em `invoiceGenerationEnabled`: essa flag tem default `false` (`prisma/schema.prisma:4822`), mora em `SaasEmailConfig` e é editada numa tela intitulada "E-mails". Usá-la transformaria um botão de e-mail em "desligar o faturamento do SaaS".

São quatro chaves independentes, para que cada etapa ligue e desligue sozinha: **geração de obrigação**, **modo sombra**, **emissão real** e **enforcement** — as duas últimas com allowlist de coorte. Uma flag única faria a etapa 5 (restringir acesso) ser refém da etapa 4 (cobrar).

---

## 8. Riscos aceitos

### 8.1. O cron pode dormir
Se o cron falhar ou a Vercel pausar o projeto, ninguém é cobrado silenciosamente. **Mitigação:** detector de descontinuidade na sequência de obrigações (buraco = alarme) + `withHeartbeat`, que o cron já usa. Não é garantia, é vigia.

### 8.2. `currentPeriodEnd` continua com múltiplos escritores
O desenho **não** transforma `currentPeriodEnd` em cache derivado, apesar de a proposta original (base C) sugerir. Motivo: o campo tem **cinco** escritores (checkout `billing/checkout/route.ts:244`; webhook `webhooks/asaas/route.ts:379`; criação administrativa `admin/clientes/create/route.ts:341`; cadastro medical `public/register-medical/route.ts:153`; seed `admin/seed/route.ts:108`) e é lido pelo canal do Domus e pelo export. Transformá-lo em derivado sem aposentar os escritores criaria divergência entre cache e ledger — com o gate lendo o cache, uma divergência vira decisão de acesso errada, inclusive contra quem acabou de pagar.

A obrigação passa a ser a fonte para **decisões de cobrança**; `currentPeriodEnd` segue como está para os consumidores atuais. Consequência assumida: **o campo vai divergir da obrigação** em dois casos conhecidos — cortesia (não cria fatura, logo ninguém avança o campo) e pagamento manual via `mark_paid` (ativa sem renovar período, `admin/faturas/[id]/workflow/route.ts:78`). O gate fica correto; **telas, canal do Domus e export podem exibir período vencido para cliente em dia**. Mitigação mínima nesta entrega: as telas de cobrança leem a obrigação, não o campo legado. Unificar os dois é trabalho posterior.

### 8.2.1. Armadilha do sync nativo dentro de `ensureInvoiceCharge`
`ensureInvoiceCharge` executa o sync da assinatura nativa quando existe `asaasSubscriptionId` e, **se o sync não produzir `paymentUrl`, cai no caminho standalone** (`invoice-charge.service.ts:72-85`) — criando uma segunda cobrança para a mesma obrigação. Hoje nenhuma assinatura em produção tem esse campo, mas o checkout ótico continua podendo criá-lo.
→ O motor **exclui explicitamente** assinaturas com `asaasSubscriptionId`, ou usa caminho de emissão que não passe pelo sync legado. Sem isso, a primeira empresa que usar o checkout self-service vira cobrança dupla.

### 8.2.2. Arbitragem de eventos atrasados do gateway
Com múltiplas tentativas por obrigação, um `PAYMENT_OVERDUE` atrasado da tentativa A (cancelada) pode rebaixar uma assinatura cuja tentativa B já foi paga — o webhook hoje rebaixa por qualquer fatura não-manual vencida (`webhooks/asaas/route.ts:497`).
→ Regra: o webhook arbitra **pelo estado da obrigação**. Tentativa cancelada ou obrigação já quitada não controla acesso.

### 8.3. Recorrência nativa do gateway fica de fora
O checkout ótico já contém `asaas.subscriptions.create` (o Asaas cobraria sozinho), mas o caminho está bloqueado por três defeitos próprios: o período não avança sem Invoice local (dívida documentada em `webhooks/asaas/route.ts:392-399`); o sync deriva período do **mês-calendário do vencimento**, inventando um mês para assinatura anual (`invoice-sync.service.ts:26-47`); e o sync só importa `PENDING`/`OVERDUE`, ignorando pagamento já confirmado (`invoice-sync.service.ts:9-10`). Corrigir isso é entrega própria. **Fora do escopo.**

### 8.4. Defeitos vizinhos conhecidos, fora do escopo
- `@@unique([subscriptionId, asaasPaymentId])` sobre coluna nullable: no Postgres NULLs não colidem, então faturas pré-gateway coexistem livremente. É a explicação mecânica da duplicata `INV-000003/4`.
- `mark_paid` e `reactivate` ativam a assinatura sem renovar o período (efeito assumido em §8.2).
- Criação anual pelo admin usa `trialEnd` como fim de período (`admin/clientes/create/route.ts:328-343`) — o bootstrap da etapa 2 precisa corrigir isso ao criar a obrigação inicial da Óticas Atacadão, senão a primeira obrigação anual nasce com 14 dias.

Nenhum é introduzido por esta entrega; todos ficam registrados. As invariantes I1/I2/I3 protegem o gate contra os efeitos dos dois primeiros.
(A arbitragem de `PAYMENT_OVERDUE` **saiu** desta lista: §8.2.2 a traz para dentro do escopo, porque múltiplas tentativas por obrigação tornam o defeito alcançável.)

---

## 9. Testes

**Funções puras** (sem banco, sem rede) cobrem a regra de negócio: encadeamento de períodos, cortesia vigente, preço congelado, decisão sobre cobrança existente, detecção de vencimento.

**Invariantes travadas por teste** — cada uma falha se alguém remover a proteção:

| Invariante | O que o teste prova |
|---|---|
| I1 | Assinatura vencida **sem obrigação emitida** não restringe ninguém. |
| I2 | Transição para inadimplente **grava estado** (não só calcula) → revisão do entitlement avança. Vale também para mudanças nas tabelas novas. |
| I3 | Sem trilha de aviso **despachado**, não há restrição — falha de e-mail alerta o operador, não pune o cliente. |
| Contiguidade | `periodStart` da obrigação `n+1` == `periodEnd` da `n`; nunca `now`. |
| Idempotência | Duas execuções concorrentes produzem **uma** obrigação (constraint, não lock). |
| Reemissão | Reemitir cobrança cancelada **não** cria período novo, e exige decisão humana. |
| Cortesia | Obrigação de cortesia não emite fatura, não manda e-mail, e registra valor não faturado. |
| Plano interno | Plano de preço zero não gera obrigação a cobrar nem conta como receita não faturada. |
| Anual | Ciclo anual gera **uma** obrigação de 12 meses, não 12 mensais. |
| Empresa ambígua | Empresa com duas assinaturas vivas **não é cobrada** — alerta o operador (fail-closed). |
| Marcos distintos | Não se restringe no mesmo tick em que o primeiro aviso foi emitido. |
| Sync nativo | Assinatura com `asaasSubscriptionId` não é processada pelo motor (evita cobrança dupla). |
| Evento atrasado | `PAYMENT_OVERDUE` de tentativa cancelada não rebaixa obrigação já quitada. |

**Testes de integração contra Postgres real** (não mock) para: os triggers de revisão, o outbox, e a concorrência da constraint. Mock de Prisma não executa trigger — I2 não é demonstrável em teste unitário.

**Verificação de sabotagem:** para cada invariante, remover a proteção no código deve quebrar o teste correspondente — conferido no símbolo real, não em comentário.

---

## 10. Fora de escopo

- Recorrência nativa do Asaas (§8.3).
- Unificar `currentPeriodEnd` com o ledger (§8.2).
- Proration em troca de plano no meio do período (a política de vigência de §4.1.2 evita a inconsistência **sem** calcular proporcional).
- Cortesia que começa ou termina no meio de um ciclo (§4.3: arredonda para o limite do período).
- Cobrança retroativa da Óticas Ultra (D7: vira cortesia).
- Correção dos defeitos vizinhos de §8.4.

---

## 11. Sequência de trabalho sugerida

Ordem por dependência, não por tamanho. Cada item é fatia commitável e testável isoladamente:

1. `resolveEffectiveSubscription` (§4.1.1) — pré-requisito de tudo; nada mais é seguro sem ele.
2. Ajuste da régua (§4.6) — independente do motor, deploy próprio, é o que toca cliente existente.
3. Migração inerte: tabelas + triggers de revisão (§6).
4. Funções puras: relógio de ciclo, cortesia, precificação (§5).
5. Serviço de obrigação + modo sombra (§7, etapas 1 e 3).
6. Bootstrap das 8 faturas, com aprovação do dono (§7, etapa 2).
7. Emissão real, piggyback no cron (§7, etapa 4).
8. Cortesia na interface + relatório de receita não faturada.
9. Enforcement por coorte e aposentadoria do bypass (§7, etapa 5).
