# PROMPT — colar numa SESSÃO NOVA do Claude Code (Fase 2: cobrança Asaas)

> Copie TUDO abaixo da linha e cole como primeira mensagem numa sessão nova, no diretório `/Users/matheusreboucas/PDV OTICA`.

---

Vamos implementar a **Fase 2 dos emails/cobrança do SaaS** (geração automática de boleto/PIX). A spec já está APROVADA e commitada.

**Spec aprovada:** `docs/superpowers/specs/2026-06-11-saas-cobranca-asaas-fase2-design.md` (branch atual `feat/saas-emails`).
**Contexto na memória:** leia o arquivo de memória "saas-emails-ciclo-vida" e o MEMORY.md ANTES de começar — tem todas as decisões, armadilhas e o estado do que já foi feito (Fase 1 + Asaas em prod).

## O que fazer

1. Leia a memória + a spec.
2. Use a skill `/writing-plans` para criar o plano de implementação da Fase 2 a partir dessa spec.
3. Depois execute com `subagent-driven-development` (1 subagente por task + revisão dupla spec+qualidade), igual fizemos na Fase 1.

## Pontos críticos da spec (já decididos, NÃO re-perguntar)

- **Decisão central:** o Asaas é o motor de cobrança (a subscription Asaas, criada no checkout, gera as cobranças mensais sozinha). NÓS só descobrimos e comunicamos. NÃO gerar cobrança avulsa para a recorrência.
- **Sem depender do webhook** (que está com problema/adiado). Um cron diário `invoice-reminders` consulta o Asaas (`GET /payments?subscription=X`), descobre cobranças novas, materializa a Invoice local e manda email.
- **2 emails:** `INVOICE_CREATED` (fatura disponível) + `INVOICE_DUE_SOON` (3 dias antes de vencer). PIX copia-e-cola + botão "Pagar agora" (`paymentUrl`) + link do boleto. **SEM imagem de QR** (Asaas só dá base64; quem quer QR clica no botão e vê na página do Asaas).
- **Motor compartilhado** `runInvoiceReminders` chamado por DUAS portas: o cron (automático/diário) E um botão "Sincronizar agora" no painel (manual). Mesma lógica, sem duplicar.
- **Botão "rodar agora"** nos dois lugares (tela de emails + tela de Faturas), respeitando as mesmas travas.
- **Botão "reenviar boleto"** em Faturas + perfil do Cliente (mesma rota `/api/admin/invoices/[id]/resend-charge`).
- **Widget "a receber esta semana"** em `/admin/financeiro`.
- **Flag mestre `invoiceGenerationEnabled` (default OFF)** controla se o cron/botão tocam o Asaas. É SEPARADA de `masterEnabled` (gate de email da Fase 1). Estreia DESLIGADA.
- **Reusa da Fase 1:** `notifyCompany`, `SaasEmailLog`, `SaasEmailConfig`, tela `/admin/configuracoes/emails`, catálogo, layout. NÃO reinventar.
- **Quick win BR:** boleto não vence em fim de semana (`nextBusinessDay`).

## Proteções anti-erro de cobrança (OBRIGATÓRIAS — estão na spec, não omitir)

- Materializar Invoice só de cobrança Asaas com `status ∈ {PENDING, OVERDUE}` (ignorar RECEIVED/CONFIRMED/REFUNDED/CHARGEBACK).
- `INVOICE_CREATED`/`DUE_SOON` só para `subscription.status: ACTIVE` (nunca TRIAL/SUSPENDED/CANCELED).
- `DUE_SOON` só para `paymentConfirmedAt: null` + `dueDate > now` (nunca pago, nunca já vencido).
- Valor SEMPRE do Asaas (`payment.value`), não o `Invoice.total` local.
- Anti-duplicata: `Invoice @@unique([subscriptionId, asaasPaymentId])` + `SaasEmailLog` periodKey por fatura+tipo.
- `Invoice.number` via `getNextSequence` (counter atômico de `src/lib/counter.ts`), chave `("__saas__","invoice")` — NÃO `invoice.count()`, NÃO advisory lock.
- `periodStart`/`periodEnd`/`subtotal` são NOT NULL — derivar do `payment.dueDate` (mês de competência; subtotal=total, discount=0).
- Mapeamento Asaas→Invoice: `payment.invoiceUrl→paymentUrl`, `payment.bankSlipUrl→boletoUrl`, `pixQrCode.payload→pixCode`.
- Todo email passa por `notifyCompany` (respeita modo teste) — proibido `emailQueue.create` solto.

## ⚠️ Conjunto de tipos ACOPLADO (no MESMO commit, senão tsc quebra)

Adicionar `INVOICE_CREATED`/`INVOICE_DUE_SOON` ao `enum SaasEmailType` obriga, junto: `SAAS_EMAIL_CATALOG` (Record) +2 entradas; união `configFlag` +2 literais; `SaasEmailConfig` +3 flags; `SaasEmailConfigPatch` +3 flags.

## 🚨 GUARDRAILS dos subagentes implementadores (lições da Fase 1 — NÃO repetir os erros)

- Os subagentes NÃO devem rodar git além de `git add <arquivos da task>` + `git commit`. PROIBIDO: checkout/switch/branch/reset/stash/restore/rebase/cherry-pick. (Na Fase 1 um subagente haiku resetou pra commit órfão e quase perdeu uma task.)
- PROIBIDO subagente rodar `prisma format/generate/migrate/db`, trocar/criar branch.
- Usar modelo ≥ sonnet para tasks que tocam git/prisma/schema. Haiku só pra coisa trivial isolada.
- Cada task: TDD (teste falha → implementa → passa → commit), `tsc` + vitest do arquivo verdes antes do commit. Revisão dupla (spec + qualidade) por subagente após cada task.
- Verificar o commit de cada task (só os arquivos da task, tree limpo, branch certa) ANTES de seguir.

## Armadilhas de DEPLOY (na memória — só no fim, NÃO automatizar)

- Deploy MANUAL `vercel deploy --prod` (working tree). Email do commit `cheapmilhas@users.noreply.github.com` (senão Vercel bloqueia). Vercel CLI: `~/.nvm/.../bin/vercel`, já logado como cheapmilhas-4586.
- Migration NÃO roda no build → aplicar manual via `prisma db execute` com **heredoc inline** `<<'SQL'` (o hook RTK quebra `--file` e `--stdin < arquivo`). Inserir row em `_prisma_migrations` com checksum. Drift do cockpit existe (P3006) — contornar.
- `.env` local aponta pro Neon de PROD — cuidado com migrations.
- `vercel.json` vai de 8 → 9 crons (conta Pro). ASAAS_API_KEY já em prod.
- **Antes do unique de Invoice:** conferir no banco de prod que não há `(subscriptionId, asaasPaymentId)` duplicado não-nulo.
- Estreia segura: entregar com `invoiceGenerationEnabled=false` + modo teste ON. Sequência: ligar flag → testar (botão "rodar agora") → conferir boleto/PIX no testEmail → desligar modo teste.

## Antes de começar

Leia a memória, depois me apresente o plano (writing-plans) para eu aprovar antes de executar.
