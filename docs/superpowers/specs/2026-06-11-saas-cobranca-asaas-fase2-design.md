# Fase 2 — Cobrança Automática Asaas (boleto/PIX) — Design

**Data:** 2026-06-11
**Branch sugerida:** `feat/saas-cobranca-fase2`
**Status:** Design aprovado pelo dono (aguardando review da spec)
**Depende de:** Fase 1 (emails do SaaS — já em prod). Reusa `notifyCompany`, `SaasEmailLog`, `SaasEmailConfig`, a tela `/admin/configuracoes/emails`, o catálogo e o layout de email.

## Contexto

A Fase 1 entregou os emails de ciclo de vida do SaaS, mas deliberadamente **NÃO** gera boleto/PIX — os emails de fatura (`INVOICE_CREATED`/`INVOICE_DUE_SOON`) foram movidos para esta Fase 2, porque sem o boleto eles sairiam sem botão de pagar.

Hoje, quando o admin cria uma fatura (`/api/admin/faturas/create`), ela nasce **só no banco** (`status: PENDING`), **sem** `paymentUrl`/`boletoUrl`/`pixCode` — a cobrança real no Asaas não é criada/buscada. Este é o gap que a Fase 2 preenche.

**Infra que JÁ existe (reusar, não reinventar):**
- `Subscription.asaasCustomerId` / `asaasSubscriptionId` (schema). O **checkout** (`src/app/api/billing/checkout/route.ts`) já cria/encontra o customer no Asaas (`asaas.customers.findByCpfCnpj` → `customers.create`) e cria a **subscription Asaas** com `nextDueDate`/`cycle`. Logo, **o Asaas já gera as cobranças mensais recorrentes sozinho** — esta é a base da Fase 2.
- `Invoice` já tem TODOS os campos necessários: `asaasPaymentId`, `paymentUrl`, `boletoUrl`, `pixCode`, `pixQrCodeUrl`, `paymentConfirmedAt`, `reminderSentAt`, `reminderCount`, `dueDate`, `status`, `total`. **Nenhuma migration de campo na Invoice** (só um índice unique novo).
- `src/lib/asaas.ts` — `asaasFetch` + `customers`/`subscriptions`/`payments.get`/`payments.pixQrCode`.
- `src/lib/counter.ts` (`getNextSequence`, upsert+increment atômico) — para gerar `Invoice.number` sem colisão (substitui o `invoice.count()` atual que tem race).
- `notifyCompany` (Fase 1) — único caminho de envio de email (resolve destinatário, modo teste, idempotência via `SaasEmailLog`, fail-silent).
- Cron `reconcile-billing` (6h) + `dunning` (8h) — já consultam/agem sobre billing. A Fase 2 NÃO depende do webhook (que está adiado).

## Decisão central (travada com o dono)

**O Asaas é o motor de cobrança.** A subscription Asaas gera as cobranças mensais. Nós **lemos** do Asaas (via cron, sem depender do webhook) e **comunicamos** (email). NÃO geramos cobrança avulsa para a recorrência — evita duplicar a lógica de recorrência e o risco de cobrança em dobro.

**Como descobrimos cobrança nova sem webhook:** um cron diário (`invoice-reminders`) consulta a API do Asaas (`GET /payments?subscription=X`), detecta cobranças novas (sem `Invoice.asaasPaymentId` local), materializa a Invoice local e dispara o email. Atraso máximo de ~24h é aceitável (cobrança é mensal, vence em dias).

## Escopo da Fase 2

1. Lib Asaas: `payments.list` (paginado) + `payments.create`.
2. Migration aditiva: `Invoice @@unique([subscriptionId, asaasPaymentId])` + 3 flags em `SaasEmailConfig` + 2 valores no enum `SaasEmailType`.
3. Service `invoice-sync.service.ts` (puro/testável) — materializa Invoice local a partir do Asaas.
4. 2 templates: `saas-invoice-created`, `saas-invoice-due-soon` (PIX copia-e-cola em destaque + botão "Pagar agora", valor do Asaas; sem imagem de QR embutida).
5. Cron `invoice-reminders` (diário, gated por flag mestre).
6. Tela admin: 2 toggles novos + a flag mestre `invoiceGenerationEnabled` (com banner de aviso).
7. Rota `/api/admin/invoices/[id]/resend-charge` + botões "reenviar" em Faturas e Cliente.
8. **Quick win:** PIX em destaque no email.
9. **Quick win:** widget "a receber esta semana" em `/admin/financeiro`.
10. **Quick win BR:** boleto não vence em fim de semana (`nextBusinessDay`).

## Arquitetura

```
ASAAS (motor)              CRON invoice-reminders (diário, gated)         EMAIL (notifyCompany)
subscription gera ───┐
cobrança mensal      │  1. flag invoiceGenerationEnabled OFF? → return
(boleto/PIX)         ├─►2. subscriptions status=ACTIVE c/ asaasSubscriptionId
                     │  3. payments.list(subscription) [paginado + throttle]
                     │  4. cobrança NOVA (sem Invoice.asaasPaymentId local)?
                     │     → cria Invoice (valor REAL do Asaas) + boleto/PIX/QR
                     │     → notifyCompany(INVOICE_CREATED)  ──► email
                     │  5. Invoice PENDING + não paga + vence em ≤3d (futuro)?
cliente paga ────────┘     → notifyCompany(INVOICE_DUE_SOON) + reminderSentAt

PAINEL: botão "Reenviar boleto" (Faturas + Cliente) → /api/admin/invoices/[id]/resend-charge
PAINEL: widget "a receber esta semana" em /admin/financeiro
```

## Componentes

### 1. Lib Asaas (`src/lib/asaas.ts` — estender)

- `payments.list(filters: { customer?, subscription?, status?, offset?, limit? }): Promise<{ data: AsaasPayment[]; totalCount: number; hasMore: boolean }>` → `GET /payments?<query>`. Reusa `asaasFetch`.
- `payments.create(input): Promise<AsaasPayment>` → `POST /payments` (billingType BOLETO/PIX, value, dueDate, customer, externalReference, idempotencyKey). Para o botão "reenviar"/fallback.
- **Paginação:** o consumidor (service) faz loop incrementando `offset` até `hasMore === false`. Limite por página padrão 100.
- **Throttle:** o cron aguarda ~200ms entre chamadas ao Asaas (respeita ~5 req/s). Helper simples de sleep.

### 2. Migration aditiva + tipos acoplados

- `Invoice`: `@@unique([subscriptionId, asaasPaymentId])` — impede 2 Invoices para a mesma cobrança Asaas (anti-duplicata). **Nota:** `asaasPaymentId` é nullable; o unique no Postgres permite múltiplos `NULL`, então faturas manuais sem `asaasPaymentId` não colidem entre si — só impede duplicar uma cobrança JÁ vinculada. Verificar no banco de prod que não há 2 Invoices com o mesmo `(subscriptionId, asaasPaymentId)` não-nulo antes de aplicar.
- `SaasEmailConfig`: `+invoiceGenerationEnabled Boolean @default(false)` (mestre da GERAÇÃO — estreia DESLIGADA), `+invoiceCreatedEnabled Boolean @default(true)`, `+invoiceDueSoonEnabled Boolean @default(true)`.
- `enum SaasEmailType`: `+INVOICE_CREATED +INVOICE_DUE_SOON`.

> **⚠️ Conjunto ACOPLADO (todos no mesmo passo, senão `tsc` quebra):** adicionar os 2 valores ao `enum SaasEmailType` obriga, no MESMO commit:
> 1. `SaasEmailConfig` ganha as 2 flags (`invoiceCreatedEnabled`, `invoiceDueSoonEnabled`) + a `invoiceGenerationEnabled`.
> 2. `SAAS_EMAIL_CATALOG` (`saas-email-catalog.ts` — é `Record<SaasEmailType, ...>`) ganha as 2 entradas novas (template/subject/configFlag).
> 3. A união `configFlag` em `SaasEmailCatalogEntry` ganha os 2 literais `"invoiceCreatedEnabled" | "invoiceDueSoonEnabled"`.
> 4. `SaasEmailConfigPatch` (em `saas-email-config.service.ts`) ganha as 3 flags novas (opcionais).
> 5. O `SaasEmailFlags` type (catálogo) já é derivado de `configFlag`, então pega de graça.
> Esquecer qualquer um dos 4 → erro de compilação (`Record` incompleto ou união sem o literal).

> **Distinção CRÍTICA entre os 2 "mestres" (não confundir):**
> - `masterEnabled` (Fase 1, já existe) = gate de TODO email; `notifyCompany` checa primeiro e dá SKIPPED("master_off") se OFF.
> - `invoiceGenerationEnabled` (novo) = gate da GERAÇÃO/BUSCA de cobrança no Asaas; o cron `invoice-reminders` checa e nem toca o Asaas se OFF.
> São independentes. Estado perigoso: `invoiceGenerationEnabled=ON` + `masterEnabled=OFF` → o cron processa cobranças mas TODO email é SKIPPED silenciosamente (cliente não recebe). A tela admin (item 6) DEVE exibir um aviso explícito quando os dois divergirem ("Geração ligada, mas emails desligados pelo interruptor mestre").

### 3. Service `invoice-sync.service.ts` (novo)

- `syncInvoicesForSubscription(subscription): Promise<Invoice[]>` (retorna as faturas NOVAS criadas, para emailar):
  - chama `asaas.payments.list({ subscription: sub.asaasSubscriptionId })` (loop paginado).
  - **filtra o STATUS da cobrança Asaas:** só materializa cobranças "a pagar" — `payment.status ∈ {PENDING, OVERDUE}`. **Ignora** `RECEIVED`, `CONFIRMED`, `REFUNDED`, `CHARGEBACK_REQUESTED`, etc. (nunca mandar "fatura disponível" de uma cobrança já paga/estornada).
  - para cada payment elegível que ainda NÃO tem `Invoice` local com aquele `asaasPaymentId`:
    - **gera `Invoice.number`** (formato vigente `INV-NNNNNN`): via `getNextSequence` (de `src/lib/counter.ts`) com uma chave-sentinela fixa do SaaS — `getNextSequence("__saas__", "invoice", tx)`. O counter é `upsert + increment` atômico (ON CONFLICT), o que já serializa sem race; **NÃO** se usa `pg_advisory_xact_lock` aqui (era impreciso na v1 desta spec). Substitui o `prisma.invoice.count()` atual (que tem race) por este counter atômico.
    - **mapeia Asaas → Invoice** (os nomes diferem): `payment.invoiceUrl → Invoice.paymentUrl`; `payment.bankSlipUrl → Invoice.boletoUrl`; valor `Math.round(payment.value * 100)` → `total` E `subtotal` (ambos NOT NULL; `discount: 0`); `payment.dueDate → Invoice.dueDate`; `asaasPaymentId = payment.id`; `status: PENDING`.
    - **período (NOT NULL):** `periodStart`/`periodEnd` são obrigatórios na Invoice. Derivar do `payment.dueDate`: `periodStart` = 1º dia do mês de competência (mês do dueDate), `periodEnd` = último dia desse mês (mensal). Documentar que é "mês de competência" — simples e suficiente para cobrança mensal.
    - **PIX:** chama `payments.pixQrCode(payment.id)` → retorna `{ encodedImage (base64), payload (copia-e-cola), expirationDate }`. Grava `pixCode = payload` (a string copia-e-cola). **Sobre a imagem do QR:** ver a seção "Decisão de QR do PIX" abaixo — o Asaas NÃO fornece URL pública do QR, só base64.
  - idempotente: o unique `(subscriptionId, asaasPaymentId)` garante no máximo 1 Invoice por cobrança; uma 2ª tentativa (P2002) é tratada como "já existe", não erro.
- Lógica de decisão pura e testável separada do I/O (mockar Asaas + prisma nos testes).

#### Decisão de QR do PIX (corrige suposição da v1)

O endpoint `asaas.payments.pixQrCode(id)` devolve a imagem do QR **só como base64** (`encodedImage`) + o copia-e-cola (`payload`). **Não há URL pública de QR.** Embutir base64 inline em email é bloqueado por muitos clientes (Gmail/Outlook). Portanto:
- **O email NÃO embute imagem de QR.** Mostra: (a) o **PIX copia-e-cola** (`payload`, em destaque, fácil de copiar) + (b) o **botão "Pagar agora"** que abre `Invoice.paymentUrl` (= `payment.invoiceUrl` do Asaas) — essa página do Asaas JÁ exibe o QR renderizado + boleto + cartão. Assim o cliente que quer escanear o QR clica no botão e escaneia na página do Asaas.
- `Invoice.pixQrCodeUrl` fica reservado: NÃO preenchido nesta fase (não há URL do Asaas). Se no futuro hospedarmos o base64 (S3/CDN), preenche aqui — fora de escopo agora.

### 4. Templates (`src/lib/emails/templates.ts` + catálogo)

- `saas-invoice-created`: "Sua fatura do Vis está disponível" — valor (do Asaas), vencimento, **PIX copia-e-cola em destaque** (`pixCode`), **botão "Pagar agora"** (`paymentUrl` — a página do Asaas mostra QR + boleto + cartão), **link do PDF do boleto** (`boletoUrl`). Schema Zod próprio. **NÃO embute imagem de QR** (Asaas só dá base64; ver "Decisão de QR do PIX").
- `saas-invoice-due-soon`: "Sua fatura do Vis vence em 3 dias" — mesmo conteúdo, tom de lembrete cordial.
- Ambos: escape de dados, layout `renderSaasEmailLayout`, `text` plano. **Sem imagem de QR** (Asaas só dá base64, bloqueado em email); o cliente que quer o QR clica no botão "Pagar agora" e escaneia na página do Asaas. Se faltar `pixCode`/`boletoUrl`, mostra só o botão (degrada gracioso).
- Entram em `SAAS_EMAIL_CATALOG` (template/subject/configFlag) e no switch de `renderEmailTemplate`.

### 5. Cron `invoice-reminders` (`src/app/api/cron/invoice-reminders/route.ts` — novo)

- Diário, **fail-closed** com `CRON_SECRET` (Bearer), `runtime nodejs`, `dynamic force-dynamic` — espelha os crons existentes.
- **Gate mestre:** lê `SaasEmailConfig`; se `invoiceGenerationEnabled === false` → retorna `{ ok: true, skipped: "generation_disabled" }` SEM tocar no Asaas.
- **Parte A — INVOICE_CREATED:** `subscription.findMany({ where: { status: "ACTIVE", asaasSubscriptionId: { not: null } } })` (NÃO TRIAL/SUSPENDED/CANCELED) → para cada, `syncInvoicesForSubscription` → para cada fatura NOVA → `notifyCompany(companyId, "INVOICE_CREATED", payload, { periodKey: \`invoice:${invoiceId}:created\`, channels: ["email","inapp"], inapp })`.
- **Parte B — INVOICE_DUE_SOON:** `invoice.findMany({ where: { status: "PENDING", paymentConfirmedAt: null, subscription: { status: "ACTIVE" }, dueDate: { gt: now, lte: now+3d } } })` → `notifyCompany(.., "INVOICE_DUE_SOON", .., { periodKey: \`invoice:${invoiceId}:due_soon\`, channels: ["email","inapp"], inapp })` → marca `reminderSentAt: now`, `reminderCount: increment`.
- Idempotência dupla: `SaasEmailLog` (periodKey por fatura+tipo) impede reenvio; `reminderSentAt` é guarda extra.
- Throttle entre chamadas ao Asaas. Per-sub try/catch (um erro não derruba o cron).
- `vercel.json`: +1 cron (vira 9). Horário livre (ex.: `0 10 * * *`).

### 6. Tela admin (estende `/admin/configuracoes/emails`)

- 2 toggles novos: "Fatura disponível" (`invoiceCreatedEnabled`), "Fatura a vencer" (`invoiceDueSoonEnabled`).
- A flag mestre `invoiceGenerationEnabled` com **banner de aviso**: quando OFF → "Geração de cobrança DESLIGADA — o sistema não busca nem comunica cobranças. Ligue só quando estiver pronto." Quando ON + modo teste ON → "Cobranças sendo processadas, mas emails vão só para <testEmail>."
- Os 2 novos tipos entram no histórico (`SaasEmailLog`) e no preview, reusando a infra da Fase 1.

### 7. Rota + botões "reenviar" (`/api/admin/invoices/[id]/resend-charge` — novo)

- POST (ADMIN ou SUPER_ADMIN): carrega a Invoice → garante boleto/PIX atualizado (re-sync se faltar) → `notifyCompany(companyId, "INVOICE_CREATED", .., { channels: ["email"], periodKey: \`invoice:${id}:resend:${YYYYMMDD}\` })`. O periodKey com data permite reenviar em dias diferentes, mas não duplica no mesmo dia.
- Respeita modo teste (vai pro testEmail se ON) — porque passa por `notifyCompany`.
- Botão "Reenviar boleto/PIX" em `/admin/financeiro/faturas` (lista) E em `/admin/clientes/[id]` (perfil) — ambos chamam a MESMA rota (DRY).
- Histórico filtrado: a tela exibe os `SaasEmailLog` daquela empresa/fatura ("enviado 2x: dia X, Y").

### 8. Widget "a receber esta semana" (`/admin/financeiro`)

- Query: faturas `status: PENDING`, `subscription.status: ACTIVE`, `dueDate` entre hoje e hoje+7d → lista (empresa, valor, vencimento) + total. Componente de leitura, sem mutação.

### 9. Quick win BR — `nextBusinessDay`

- Helper puro: se o `dueDate` cai em sábado/domingo, move para a segunda. Aplicado ao criar/ajustar cobranças (quando aplicável). Evita boleto vencendo em fim de semana (confusão BR).

## Proteções transversais (anti cobrança/email errado)

Derivadas de uma análise adversarial de risco financeiro:

- **Nunca emailar quem já pagou:** filtro `paymentConfirmedAt: null` no DUE_SOON. E no INVOICE_CREATED, o filtro de `payment.status ∈ {PENDING, OVERDUE}` no service garante que cobrança paga/estornada nem vira Invoice nova.
- **Nunca materializar/emailar cobrança em status terminal:** o service ignora `payment.status RECEIVED/CONFIRMED/REFUNDED/CHARGEBACK_REQUESTED` etc. (só `PENDING`/`OVERDUE`).
- **Nunca emailar cobrança a TRIAL/CANCELED/SUSPENDED:** filtro `subscription.status: ACTIVE` em ambas as partes.
- **Nunca mandar DUE_SOON de fatura vencida:** filtro `dueDate > now` (vencida é assunto do dunning).
- **Valor sempre do Asaas:** a Invoice é materializada com `payment.value` do Asaas, não com um total local possivelmente desatualizado (plano/desconto mudou).
- **Anti-duplicata de Invoice:** `@@unique([subscriptionId, asaasPaymentId])` + checagem antes de criar.
- **Anti-duplicata de email:** o `SaasEmailLog` (periodKey por fatura+tipo) é a **fonte da verdade** da idempotência (`notifyCompany` já a aplica antes de enfileirar). O `reminderSentAt` é só um marcador de UI/relatório (mostrar "lembrete enviado em X"), NÃO a trava — não duplicar a lógica de dedupe nele.
- **Modo teste nunca vaza:** TODO email passa por `notifyCompany` (que troca `to` por `testEmail`); proibido `emailQueue.create` solto para cobrança.
- **Sem valor / sem destinatário:** `notifyCompany` registra SKIPPED, nunca quebra o cron.
- **Flag mestre OFF por padrão:** estreia sem tocar no Asaas; o dono liga quando confiante.
- **Number sem colisão:** `getNextSequence` (counter atômico upsert+increment).
- **Rate limit Asaas:** throttle ~200ms/chamada.
- **Determinismo de tempo nos testes:** lógica de "vence em N dias" recebe `now` injetável (testes fixam a data).

## Testes (rede anti-regressão)

- **`invoice-sync.service`:** materializa Invoice com valor do Asaas (total+subtotal+período derivado); idempotente (2ª chamada não duplica); paginação (2 páginas → todas as cobranças); **ignora cobrança em status terminal** (RECEIVED/CONFIRMED/REFUNDED/CHARGEBACK → não cria Invoice); número via counter sem colisão; sem boleto/PIX → degrada.
- **Cron `invoice-reminders`:** 401 sem CRON_SECRET; gate `invoiceGenerationEnabled` OFF → não toca Asaas; INVOICE_CREATED só p/ ACTIVE; DUE_SOON pula pago/cancelado/trial/vencido; idempotente (roda 2x → 1 email); estado divergente `invoiceGenerationEnabled=ON`+`masterEnabled=OFF` → processa mas email SKIPPED (não quebra).
- **Templates:** render + Zod; PIX copia-e-cola + boleto + botão presentes; SEM imagem de QR (não base64, não URL); valor correto.
- **Rota resend:** auth; reenfileira via notifyCompany; respeita modo teste.
- **Lib Asaas:** `payments.list` paginado (mock 2 páginas); `payments.create` monta body certo.
- **`nextBusinessDay`:** sábado→segunda, domingo→segunda, dia útil inalterado.
- **Widget:** query retorna só PENDING/ACTIVE/próx. 7 dias.
- Sempre: `tsc` + suíte + build verdes antes de cada commit.

## Ordem de entrega (fases internas do plano)

1. Lib Asaas (`payments.list` paginado + `payments.create`) + testes.
2. Migration (unique Invoice + 3 flags config + enum) **+ o conjunto acoplado de tipos no MESMO passo** (catalog Record +2, união configFlag +2, SaasEmailConfigPatch +3) + regenerar client + `tsc` verde.
3. `nextBusinessDay` helper.
4. `invoice-sync.service` (mapeamento Asaas→Invoice, filtro de status, número via counter, período derivado) + testes.
5. 2 templates (PIX copia-e-cola + botão, sem QR base64) + catálogo.
6. Cron `invoice-reminders` + vercel.json + testes.
7. Tela admin (toggles + banner flag mestre).
8. Rota resend + botões (Faturas + Cliente) + histórico filtrado.
9. Widget "a receber esta semana".
10. Suíte + build + revisão final.

## Notas de deploy / armadilhas (herdadas + novas)

- **Estreia segura:** entregar com `invoiceGenerationEnabled = false` E modo teste ON. Sequência: ligar flag mestre (cron passa a processar, emails só p/ testEmail) → conferir boleto/PIX real chegando → desligar modo teste (vai p/ clientes).
- Deploy MANUAL `vercel deploy --prod` (working tree); email do commit `cheapmilhas@users.noreply.github.com`.
- **Migration NÃO roda no build** — aplicar manual via `prisma db execute` com **heredoc inline** (`<<'SQL'`), NÃO `--file`/`--stdin < arquivo` (o hook RTK quebra redirecionamento de arquivo). Inserir row em `_prisma_migrations` + checar drift cockpit.
- `vercel.json` vai de 8 → 9 crons (conta Pro). Horário livre.
- **Antes do unique:** conferir no banco de prod que não há `(subscriptionId, asaasPaymentId)` duplicado não-nulo (senão o índice falha ao criar).
- Webhook Asaas continua adiado — a Fase 2 NÃO depende dele. Quando voltar, vira "bônus de tempo-real" sem refazer nada.
- `ASAAS_API_KEY` já em prod. O cron usa ela (consulta direta), não o webhook.

## Fora de escopo (Fase futura — YAGNI)

- SMS de cobrança, desconto por pagamento antecipado, parcelamento de inadimplência, aviso de cartão vencido.
- Aviso pré-vencimento de 7 dias (mantido só o de 3 dias).
- Dashboard MRR/Churn/Runway completo (widget "a receber" é o mínimo desta fase).
- NF-e anexada ao email de cobrança.
- Backfill de empresas antigas sem `asaasSubscriptionId` (problema real, mas separado — tratar em sprint próprio).
- Bloqueio hard de acesso pós-trial-expired (janela lazy aceita; separado).
