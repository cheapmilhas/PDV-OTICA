# Cobrança — Envio/Reenvio Manual com Estado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um botão único na fatura que ENVIA a cobrança pela 1ª vez (gerando o boleto/PIX no Asaas quando falta) ou REENVIA quando já existe — gravando o estado de envio na Invoice, exibindo "Enviada em DD/MM por Fulano", bloqueando duplo-envio no mesmo dia, e sem nunca colidir com o envio automático.

**Architecture:** Reusa 100% da infra da Fase 2 (já em prod): `payments.create`/`payments.list`/`pixQrCode` (`src/lib/asaas.ts`), `mapPaymentToInvoiceData` + `nextSaasInvoiceNumber` (`invoice-sync.service`), `notifyCompany` (modo teste + dedup via `SaasEmailLog`). Novo: um service `ensureInvoiceCharge` que garante que a Invoice tenha cobrança (sincroniza se há `asaasSubscriptionId`, senão cria avulsa) e um service `sendInvoiceCharge` que envia + grava `invoiceSent`. A rota resend existente vira a porta única; o componente de botão ganha estado.

**Tech Stack:** Next 16, Prisma/Neon, TypeScript, Vitest. Asaas PROD via `ASAAS_API_KEY` (já no ambiente da Vercel).

## Decisões do dono (travadas)
1. **Botão "Enviar" decide sozinho:** fatura tem `asaasSubscriptionId` → sincroniza a cobrança que a assinatura gerou; senão (fatura avulsa/manual) → cria cobrança avulsa no Asaas. Cobre o teste de R$5 e o futuro.
2. **Anti-duplicado:** bloqueia reenvio no MESMO dia (trava por data via `periodKey`, já existe), permite dias diferentes. O automático respeita a mesma trava.

## Convenções reusadas (NÃO reinventar)
- `asaas.payments.create({customer, billingType, value(reais), dueDate(YYYY-MM-DD), description?, externalReference?})` — já existe (`src/lib/asaas.ts:263`).
- `asaas.payments.pixQrCode(id)` → `{ payload }`; `mapPaymentToInvoiceData(payment, number)` → dados de Invoice; `nextSaasInvoiceNumber(prisma)` → `INV-NNNNNN`.
- `notifyCompany(companyId,"INVOICE_CREATED",payload,{channels:["email"],periodKey})` — respeita modo teste + dedup.
- Invoice tem `invoiceSent/invoiceSentAt/invoiceSentBy/invoiceSentMethod` (já no schema, hoje não preenchidos) — usar para o estado.
- Subscription tem `asaasCustomerId`, `asaasSubscriptionId`, `companyId`.

---

### Task 1: Service `ensureInvoiceCharge` (garante boleto/PIX na Invoice)

**Files:**
- Create: `src/services/invoice-charge.service.ts`
- Test: `src/services/invoice-charge.service.test.ts`

**Contrato:** `ensureInvoiceCharge(invoiceId, deps?): Promise<Invoice>` — carrega a Invoice (com subscription). Se já tem `paymentUrl` → retorna como está (no-op). Senão:
- Se `subscription.asaasSubscriptionId` existe → roda a sincronização da assinatura (reusa `syncInvoicesForSubscription`) e re-busca a Invoice; se a cobrança correspondente foi materializada noutra Invoice, ok. Se a própria Invoice ainda não tem `paymentUrl`, cai no avulso.
- **Avulso:** precisa de `subscription.asaasCustomerId`. Se faltar, cria/acha o customer? **NÃO nesta fase** — se faltar `asaasCustomerId`, lança erro claro `"Assinatura sem customer Asaas — configure o checkout primeiro"` (o teste de R$5 vai criar a sub com customer já setado, via Task 4). Com customer: `asaas.payments.create({customer, billingType: invoice.billingType||"PIX", value: invoice.total/100, dueDate: <invoice.dueDate ou hoje+3 via nextBusinessDay>, externalReference: \`invoice:${invoice.id}\`})` → busca `pixQrCode` → `prisma.invoice.update` gravando `asaasPaymentId, paymentUrl(=invoiceUrl), boletoUrl(=bankSlipUrl), pixCode, billingType`.
- DI: `{ prismaClient?, asaasClient?, syncFn? }`. Testes mockam tudo.

- [ ] Step 1: teste falhando — (a) invoice já com paymentUrl → no-op (não chama asaas); (b) invoice sem paymentUrl + sub COM asaasSubscriptionId → chama syncFn e re-busca; (c) sem paymentUrl + sem subscription Asaas mas COM asaasCustomerId → chama `payments.create` + grava paymentUrl; (d) sem customer → throw com mensagem.
- [ ] Step 2: rodar e ver falhar — `npx vitest run src/services/invoice-charge.service.test.ts`
- [ ] Step 3: implementar (reusar `mapPaymentToInvoiceData` p/ derivar period/valor; `nextBusinessDay` p/ dueDate avulso).
- [ ] Step 4: `npx vitest run src/services/invoice-charge.service.test.ts && npx tsc --noEmit`
- [ ] Step 5: commit `feat(cobranca): ensureInvoiceCharge garante boleto/PIX (sync ou avulso)`

---

### Task 2: Service `sendInvoiceCharge` (envia + grava estado)

**Files:**
- Create: `src/services/invoice-send.service.ts`
- Test: `src/services/invoice-send.service.test.ts`

**Contrato:** `sendInvoiceCharge(invoiceId, adminId, deps?): Promise<{status, alreadySentToday}>`:
1. `ensureInvoiceCharge(invoiceId)` (Task 1).
2. `notifyCompany(companyId,"INVOICE_CREATED",payload,{channels:["email"],periodKey:\`invoice:${id}:resend:${YYYYMMDD}\`})` — payload com `name/amountLabel/dueDateLabel/pixCode/paymentUrl/boletoUrl` (reusa `brl`/`dateBR` de `@/lib/format-brl`).
3. Se `status==="SENT"` → `prisma.invoice.update({ data: { invoiceSent:true, invoiceSentAt: now, invoiceSentBy: adminId, invoiceSentMethod:"email" } })`. Se `status==="SKIPPED"` (já enviado hoje / modo teste sem email) → não regrava, retorna `alreadySentToday` quando o reason for dedup.
- DI `{ prismaClient?, ensureFn?, notifyFn?, now? }`.

- [ ] Step 1: teste — (a) envio SENT grava invoiceSent + chama ensure; (b) SKIPPED não grava; (c) ensure throw → propaga.
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar.
- [ ] Step 4: vitest + tsc verdes.
- [ ] Step 5: commit `feat(cobranca): sendInvoiceCharge envia e grava invoiceSent`

---

### Task 3: Rota `resend-charge` passa a usar o service + remove o 400-sem-link

**Files:**
- Modify: `src/app/api/admin/invoices/[id]/resend-charge/route.ts`
- Modify: `src/app/api/admin/invoices/[id]/resend-charge/route.test.ts`

A rota hoje retorna 400 se `!paymentUrl`. Trocar o corpo do `try` para chamar `sendInvoiceCharge(id, admin.id)` (que agora GERA a cobrança se faltar, via Task 1+2). Remover o early-400 de paymentUrl (o service resolve). Manter auth 401/403/404 e o 500 do catch. Retornar `{ success, status, alreadySentToday }`.

- [ ] Step 1: atualizar testes — remover o caso "400 sem paymentUrl"; adicionar "sem link → gera e envia (status SENT)" mockando `sendInvoiceCharge`. Manter 401/403/404.
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar (importar `sendInvoiceCharge`, mockável; manter findUnique só para o 404).
- [ ] Step 4: vitest do arquivo + tsc.
- [ ] Step 5: commit `feat(cobranca): resend-charge gera cobrança quando falta (porta única enviar/reenviar)`

---

### Task 4: Botão com estado ("Enviar" / "Reenviar (enviada DD/MM)") + desabilita se enviada hoje

**Files:**
- Modify: `src/components/admin/resend-charge-button.tsx`
- Modify: `src/components/admin/resend-charge-button.test.tsx`

Estender props: `{ invoiceId, invoiceSent?: boolean, invoiceSentAt?: string|null, sentToday?: boolean }`. Label dinâmico: sem `invoiceSent` → "Enviar cobrança"; com → "Reenviar (enviada DD/MM)". Se `sentToday` → botão desabilitado com "Já enviada hoje". Após POST, lê `alreadySentToday` da resposta e mostra "Já reenviada hoje". Mantém jsdom pragma + assertions `.toBeDefined()` (sem jest-dom).

- [ ] Step 1: testes — render "Enviar cobrança" sem invoiceSent; "Reenviar" com invoiceSent; desabilitado com sentToday.
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar.
- [ ] Step 4: `npx vitest run src/components/admin/resend-charge-button.test.tsx && npx tsc --noEmit`
- [ ] Step 5: commit `feat(cobranca): botão de cobrança com estado (enviar/reenviar/já enviada hoje)`

---

### Task 5: Passar o estado da Invoice aos botões (Faturas detalhe/lista + Cliente)

**Files:**
- Modify: `src/app/admin/financeiro/faturas/[id]/page.tsx`
- Modify: `src/app/admin/financeiro/faturas/page.tsx`
- Modify: `src/app/admin/clientes/[id]/page.tsx`

Em cada lugar que monta `<ResendChargeButton invoiceId={...} />`, passar também `invoiceSent={inv.invoiceSent}`, `invoiceSentAt={inv.invoiceSentAt?.toISOString() ?? null}`, e `sentToday={ inv.invoiceSentAt ? mesmoDia(inv.invoiceSentAt, new Date()) : false }` (helper inline simples comparando YYYY-MM-DD UTC). As páginas são server components — `inv.invoiceSent/invoiceSentAt` já vêm do findMany (campos da Invoice). Garantir que o `select`/`include` inclui esses 2 campos (se usar select explícito).

- [ ] Step 1: (sem teste novo de página — cobertura é via tsc/build). Ler cada página e localizar o mount.
- [ ] Step 2: implementar os 3 mounts + o helper `mesmoDia`.
- [ ] Step 3: `npx tsc --noEmit` (cobre as 3 páginas).
- [ ] Step 4: commit `feat(cobranca): páginas passam estado de envio (invoiceSent/sentToday) aos botões`

---

### Task 6: Suíte + build + revisão

- [ ] `npx vitest run` (0 falhas)
- [ ] `npx tsc --noEmit`
- [ ] `.env` presente no worktree (`cp "/Users/matheusreboucas/PDV OTICA/.env" .env` se faltar) → `npm run build` verde
- [ ] Verificação de integração: o motor automático (`runInvoiceReminders`) e o botão usam a MESMA trava `periodKey` de dedup → não duplicam entre si; `invoiceSent` é gravado em ambos os caminhos? (Se o automático não grava `invoiceSent`, decidir: a Task 2 service deve ser usada também pelo motor — fora de escopo se o motor já usa notifyCompany direto; documentar.)
- [ ] commit final.

## Notas de deploy (igual Fase 2 — manual)
- Sem migration (campos `invoiceSent*` já existem). Só código → `vercel deploy --prod` do worktree (email commit `cheapmilhas@users.noreply.github.com`; `.env`+`.vercel` copiados pro worktree).
- **TESTE DE R$5 fica trivial depois disto:** criar a subscription/fatura de teste (com `asaasCustomerId`), abrir a fatura no admin, clicar "Enviar cobrança" → gera o boleto/PIX no Asaas + manda o email pro testEmail. Sem script local, sem chave no terminal.
- ⚠️ A criação da subscription/customer de teste no Asaas ainda precisa da `ASAAS_API_KEY` em runtime — mas agora roda DENTRO do app em prod (que já tem a chave), via o botão, não por script local.

## Fora de escopo (YAGNI)
- Criar customer Asaas a partir do CPF dentro do `ensureInvoiceCharge` (assume customer já existe na subscription).
- SMS/WhatsApp. Escolha de billingType na UI (usa o da Invoice ou PIX default).
