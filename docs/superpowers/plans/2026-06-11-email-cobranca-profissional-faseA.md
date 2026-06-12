# Email de Cobrança Profissional (Vis) — Fase Email-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o email de cobrança 100% Vis e profissional (logo, valor destacado, descrição, botão, PIX) E silenciar o email automático do Asaas (que sai com o CPF/nome pessoal do dono).

**Architecture:** Reusa o pipeline de email já em prod (`renderSaasEmailLayout`, `notifyCompany`, templates). Mudanças: (1) `notificationDisabled:true` no customer+payment do Asaas; (2) `description` flui da Invoice → Asaas + → payload do nosso email; (3) template INVOICE_CREATED ganha o card com valor destacado + descrição; (4) layout ganha o logo Vis. Sem migration, sem mudança de envio/dedup — só conteúdo + silenciar Asaas.

**Tech Stack:** Next 16, TypeScript, Vitest. Asaas + Resend (já configurados). Spec: `docs/superpowers/specs/2026-06-11-email-cobranca-profissional-design.md`.

## GUARDRAILS (subagentes)
- git SÓ `git add <arquivos-da-task>` + `git commit`. NUNCA checkout/reset/branch/etc.
- PROIBIDO `prisma format/migrate/generate/db`, `vercel`.
- Só os arquivos da task. `git status --short` antes do commit. Untracked (docs/scripts) NÃO são seus.
- TDD por task, commit isolado. Bloqueou? PARE e relate.

## Fatos do código (verificados)
- `AsaasCustomerInput` (asaas.ts:36-43) JÁ tem `notificationDisabled?`. `AsaasPaymentCreateInput` (asaas.ts:147-154) NÃO tem — adicionar.
- `resolveAsaasCustomerId` (asaas-customer.service.ts) NÃO passa notificationDisabled no customers.create — adicionar. ⚠️ Só afeta customers NOVOS (find-or-create curto-circuita existentes). O flag no PAYMENT é o que silencia clientes já existentes.
- `ensureInvoiceCharge` (invoice-charge.service.ts:75-85) faz o payments.create avulso — NÃO passa description nem notificationDisabled. Adicionar ambos.
- Payload INVOICE_CREATED montado em: invoice-send.service.ts (sendInvoiceCharge), invoice-reminders.service.ts Part A (created) e Part B (due_soon). 3 call-sites p/ a description.
- `invoiceCreatedSchema` (templates.ts:215-222) sem description. `renderInvoiceBody` (templates.ts:224) escapa todos os campos via escapeHtml.
- `renderSaasEmailLayout` (saas-email-layout.ts) marca = só texto "Vis" (#2E6BFF, linha 50), sem logo. Rodapé já Vis. `saas-email-layout.test.ts:15` asserta `#2E6BFF`.
- Logo: `public/vis-logo.png` 2172×724, 766KB (grande). Next serve /public estático → `https://vis.app.br/vis-logo.png`.

---

### Task 1: Asaas — notificationDisabled no payment + customer (silencia o Asaas)

**Files:**
- Modify: `src/lib/asaas.ts` (AsaasPaymentCreateInput + payments.create body)
- Modify: `src/services/asaas-customer.service.ts` (resolveAsaasCustomerId customers.create)
- Modify: `src/services/invoice-charge.service.ts` (payments.create avulso)
- Test: ajustar `src/services/invoice-charge.service.test.ts` + `src/services/asaas-customer.service.test.ts`

Mudanças:
1. `asaas.ts`: adicionar `notificationDisabled?: boolean` e `description?: string` (já tem description) ao `AsaasPaymentCreateInput`. O `payments.create` JÁ serializa `JSON.stringify(input)` — então passar no input basta (confirme que não filtra campos).
2. `asaas-customer.service.ts`: no `customers.create({...})` dentro de `resolveAsaasCustomerId`, adicionar `notificationDisabled: true`.
3. `invoice-charge.service.ts`: no `payments.create({...})` avulso, adicionar `description: invoice.description ?? undefined` e `notificationDisabled: true`.

- [ ] Step 1: testes — (a) invoice-charge: `payments.create` chamado com `notificationDisabled: true` e `description` = invoice.description; (b) asaas-customer: `customers.create` chamado com `notificationDisabled: true`. Ajustar asserções existentes que checam o objeto do create (se usam `toHaveBeenCalledWith` estrito, incluir os campos novos; se checam `.mock.calls[0][0].customer`, seguem ok).
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar as 3 mudanças.
- [ ] Step 4: `npx vitest run src/services/invoice-charge.service.test.ts src/services/asaas-customer.service.test.ts && npx tsc --noEmit`.
- [ ] Step 5: commit `git add src/lib/asaas.ts src/services/asaas-customer.service.ts src/services/invoice-charge.service.ts src/services/invoice-charge.service.test.ts src/services/asaas-customer.service.test.ts && git commit -m "feat(email): silencia emails do Asaas (notificationDisabled customer+payment) + passa description"`

---

### Task 2: description flui ao payload do nosso email (3 call-sites)

**Files:**
- Modify: `src/services/invoice-send.service.ts` (payload notifyCompany)
- Modify: `src/services/invoice-reminders.service.ts` (Part A created + Part B due_soon)
- Test: ajustar os respectivos `*.test.ts`

Em cada lugar que monta `notifyCompany(companyId, "INVOICE_CREATED"|"INVOICE_DUE_SOON", { name, amountLabel, dueDateLabel, pixCode, paymentUrl, boletoUrl }, ...)`, adicionar `description: invoice.description ?? undefined`. (As 3 invoices já são carregadas com seus campos — confirme que `description` está no select/objeto; se houver select explícito, incluir `description: true`.)

- [ ] Step 1: testes — invoice-send: o payload passado ao notifyFn inclui `description`; invoice-reminders: Part A e Part B incluem `description`. (Adapte aos testes existentes desses arquivos.)
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar nos 3 call-sites.
- [ ] Step 4: `npx vitest run src/services/invoice-send.service.test.ts src/services/invoice-reminders.service.test.ts && npx tsc --noEmit`.
- [ ] Step 5: commit `git add src/services/invoice-send.service.ts src/services/invoice-send.service.test.ts src/services/invoice-reminders.service.ts src/services/invoice-reminders.service.test.ts && git commit -m "feat(email): passa description da fatura ao payload de cobrança"`

---

### Task 3: template INVOICE_CREATED — card com valor destacado + descrição

**Files:**
- Modify: `src/lib/emails/templates.ts` (invoiceCreatedSchema + renderInvoiceBody)
- Test: `src/lib/emails/templates.test.ts`

1. `invoiceCreatedSchema`: adicionar `description: z.string().optional()`.
2. `renderInvoiceBody`: montar o corpo conforme o layout aprovado:
   - Um **card** (table com border, bg #f8fafc, radius) contendo: rótulo "Valor" + o `amountLabel` em destaque (font-size ~28px, bold, cor #111827); linha "Vencimento: <due>"; e, SE houver description, linha "Descrição: <description escapada>".
   - Mantém o botão "Pagar agora" (via cta do layout), o bloco PIX copia-e-cola, e o link "Baixar boleto em PDF".
   - `description` SEMPRE via `escapeHtml` (texto livre do admin). Se ausente, NÃO renderiza a linha (sem "não informada").
   - Tudo em tabelas/CSS inline (modo email). Sem flexbox/grid/JS.
- [ ] Step 1: testes — (a) com description → card contém a descrição escapada; (b) sem description → NÃO contém "Descrição"; (c) valor/vencimento/PIX/botão/boleto presentes; (d) XSS na description (`<script>`) é escapado; (e) o `renderInvoiceBody` do due_soon (isReminder) também aceita description.
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar.
- [ ] Step 4: `npx vitest run src/lib/emails/templates.test.ts && npx tsc --noEmit`.
- [ ] Step 5: commit `git add src/lib/emails/templates.ts src/lib/emails/templates.test.ts && git commit -m "feat(email): card de cobrança com valor destacado + descrição (template Vis)"`

---

### Task 4: logo Vis no layout dos emails

**Files:**
- Create: `public/vis-logo-email.png` (versão reduzida — ver Step 0; gerada pelo ORQUESTRADOR, não pelo subagente, pois usa `sips`)
- Modify: `src/lib/emails/saas-email-layout.ts`
- Test: `src/lib/emails/saas-email-layout.test.ts`

> **Step 0 (ORQUESTRADOR, fora do subagente):** gerar logo pequeno: `sips -Z 240 public/vis-logo.png --out public/vis-logo-email.png` (largura máx 240px, ~10-20KB). Se o subagente chegar e o arquivo não existir, PARA e pede ao orquestrador.

1. `saas-email-layout.ts`: trocar o `<p>Vis</p>` (linha 50) por uma **faixa** (td com background `#2E6BFF`, padding) contendo `<img src="https://vis.app.br/vis-logo-email.png" alt="Vis" height="28" style="display:block;border:0;">`. Manter a cor `#2E6BFF` (a faixa É azul → o teste `#2E6BFF` segue passando). O heading volta a ser branco sobre... NÃO — o heading fica no corpo branco (não na faixa). Estrutura: faixa azul com logo (1ª tr) → heading no corpo (2ª tr, como hoje) → bodyHtml → rodapé. Ou seja: adicionar uma tr de faixa ANTES da tr do heading; o heading continua onde está.
2. Manter `heading`/`bodyHtml`/`cta`/rodapé exatamente como estão.

- [ ] Step 1: testes — o html contém `alt="Vis"` e `vis-logo-email.png`; mantém `#2E6BFF`; o heading e o rodapé seguem presentes (asserções existentes não quebram).
- [ ] Step 2: ver falhar.
- [ ] Step 3: implementar a faixa+logo.
- [ ] Step 4: `npx vitest run src/lib/emails/saas-email-layout.test.ts && npx tsc --noEmit`.
- [ ] Step 5: commit `git add public/vis-logo-email.png src/lib/emails/saas-email-layout.ts src/lib/emails/saas-email-layout.test.ts && git commit -m "feat(email): logo Vis na faixa do cabeçalho (todos os emails)"`

---

### Task 5: suíte + build + deploy

- [ ] `npx vitest run` (0 falhas; baseline 737 + novos).
- [ ] `npx tsc --noEmit` limpo.
- [ ] `.env` presente → `npm run build` verde (BUILD_ID).
- [ ] commit final se houver ajuste.

## RUNBOOK — deploy + validação (orquestrador)
1. Gerar `public/vis-logo-email.png` (sips) — Task 4 Step 0.
2. `vercel deploy --prod` do worktree (cp .env+.vercel; email commit cheapmilhas@users.noreply.github.com). Sem migration.
3. Confirmar `EMAIL_FROM` em prod = `Vis <noreply@send.vis.app.br>` (env; se errado, dono ajusta na Vercel — não-código).
4. Validar: criar uma cobrança NOVA (não reusar a INV-000005 — o customer do dono já existia sem o flag; só o payment novo carrega notificationDisabled). Conferir: (a) NÃO chega o email do Asaas (com CPF) — ou chega menos; (b) chega o email Vis com logo + valor destacado + descrição. Se o email não sair na hora, é o cron email-queue 7h (disparar manual via curl CRON_SECRET).
5. ⚠️ Customers JÁ existentes (incl. o do dono) podem ainda receber o email do Asaas até o dono ajustar a config no painel Asaas (retroativo). Documentar p/ o dono.

## Fora de escopo (Email-B)
- PDF do boleto anexado (infra de anexo no EmailQueue + Resend + fila).
- QR Code PIX como imagem.
- Otimização extra do logo / dark mode do email.
