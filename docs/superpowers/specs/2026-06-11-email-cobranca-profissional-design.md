# Email de Cobrança Profissional (Vis) — Fase Email-A — Design

**Data:** 2026-06-11
**Branch:** feat/saas-cobranca-fase2 (worktree `.worktrees/saas-cobranca-fase2`)
**Status:** Design + layout APROVADOS pelo dono (via ui-ux-pro-max + aprovação do mockup). Spec para review.

## Problema

O dono recebeu, no teste de R$5, um email com **identidade errada**: CPF/nome pessoal dele no topo e rodapé, sem marca Vis, "Descrição não informada", botão verde "Visualizar cobrança", link asaas.com. **Diagnóstico:** esse email é o AUTOMÁTICO do Asaas (gerado pela conta Asaas), NÃO o nosso template Vis. O Asaas dispara a notificação dele sempre que uma cobrança é criada. Resultado: o cliente recebe (ou recebe primeiro) o email feio do Asaas em vez do nosso.

Além disso: o `payments.create` hoje NÃO passa a `description` da Invoice ao Asaas → por isso "Descrição não informada"; e o nosso template `INVOICE_CREATED`, apesar de já ter marca Vis/botão/PIX, pode ficar mais profissional (logo real, valor destacado, descrição).

## Objetivo (Fase Email-A — essencial)
Email de cobrança 100% Vis, profissional, sem identidade pessoal do dono. **PDF anexado é Fase Email-B (separada).**

## Decisões do dono (travadas)
1. **Desligar emails do Asaas** no nosso código (`notificationDisabled: true` no customer E no payment) — o nosso email vira o principal. ⚠️ **IMPORTANTE (review):** o flag no `customers.create` só vale para customers NOVOS — o find-or-create curto-circuita os EXISTENTES (incl. o customer do dono, já criado no teste de R$5). **Quem silencia clientes JÁ existentes é o flag no `payments.create`** (roda em toda cobrança nova). A config da marca/notificações no painel Asaas (feita pelo dono) é o único caminho RETROATIVO completo — NÃO é "suspensório" opcional, é necessária p/ customers antigos. Validação pós-deploy: testar com uma cobrança NOVA (o payment carrega o flag), não confiar só no customer.
2. Email Vis: **marca + botão + descrição + PIX** (essencial). PDF anexado = Email-B.
3. **Layout aprovado** (mockup): faixa azul com logo Vis → saudação → card com Valor destacado + Vencimento + Descrição → botão "Pagar agora" → bloco PIX copia-e-cola → link boleto → rodapé Vis discreto.
4. Remetente Vis (`EMAIL_FROM = "Vis <noreply@send.vis.app.br>"`).

## Guidance de design (ui-ux-pro-max)
- Paleta "B2B Service / profissional": navy `#0F172A` (texto forte), texto corpo `#374151`/`#020617`, **CTA azul Vis `#2563eb`** (já usado nos templates), fundo email `#f6f7fb`, card branco. Mantém consistência com os outros 7 emails Vis (mesmo `renderSaasEmailLayout`).
- Email transacional: HTML com TABELAS + CSS INLINE (sem JS, sem flexbox/grid, sem backdrop-blur — clientes de email ignoram). Contraste ≥ 4.5:1. Não depender só de cor (valor tem rótulo "Valor"/"VALOR A PAGAR"). Largura máx ~560px. Logo com `alt`.
- **Logo Vis:** existe `public/vis-logo.png`. Em email, imagem precisa de URL ABSOLUTA pública (clientes não carregam relativo). Usar `https://vis.app.br/vis-logo.png` com `alt="Vis"`. Fallback: se a imagem não carregar, o `alt` + a faixa azul já comunicam a marca (não depender só da imagem).

## Arquitetura

### Componentes a tocar
1. `src/lib/asaas.ts` — `AsaasPaymentCreateInput` ganha `description?` (já tem!) e **`notificationDisabled?: boolean`** (novo no input de payment; já existe no de customer). O `payments.create` repassa ambos no body.
2. `src/services/invoice-charge.service.ts` — no `payments.create` avulso, passar `description: invoice.description ?? undefined` e `notificationDisabled: true`. **+ `src/services/asaas-customer.service.ts`** (`resolveAsaasCustomerId`) — CONFIRMADO que hoje NÃO passa `notificationDisabled` no `customers.create`; adicionar `notificationDisabled: true` ali também (silencia o Asaas no nível do customer, que é o que dispara o email com o CPF do dono). Os DOIS pontos (customer + payment) silenciam o Asaas de vez.
3. `src/lib/emails/templates.ts` — `invoiceCreatedSchema` ganha `description?: string`. `renderInvoiceBody` renderiza o card com Valor destacado + Vencimento + **Descrição** (quando houver) + logo no topo (via layout) seguindo o mockup aprovado. Manter PIX + boleto + botão "Pagar agora".
4. `src/lib/emails/saas-email-layout.ts` — HOJE a marca é só o texto "Vis" em azul `#2E6BFF` (linha 50), sem logo-imagem; rodapé já é Vis (linhas 62-63, manter). Mudança APROVADA: trocar a faixa de marca por uma **faixa azul (#2E6BFF) com o logo Vis** no topo (img absoluta `https://vis.app.br/vis-logo.png`, `alt="Vis"`, altura ~28px, fundo azul). Isso afeta TODOS os 7 emails Vis (ganham o logo) — é desejável (consistência). Manter `heading`/`bodyHtml`/`cta`/rodapé. **Cuidado:** o logo PNG é 766KB (grande p/ email) — usar `width`/`height` fixos no img e, idealmente, uma versão menor; se não houver, referenciar o atual e anotar p/ otimizar depois (não bloqueia).
5. **Passar a `description` no payload do email — 3 call-sites (review):** (a) `invoice-send.service.ts` (sendInvoiceCharge → cobre o reenvio E o createManualCharge); (b) `invoice-reminders.service.ts` **Part A** (INVOICE_CREATED do cron); (c) `invoice-reminders.service.ts` **Part B** (INVOICE_DUE_SOON / lembrete — usa o MESMO renderInvoiceBody, senão o lembrete fica sem descrição). Adicionar `description: invoice.description ?? undefined` nos 3. A rota resend-charge CONFIRMADO chama sendInvoiceCharge (não monta payload próprio) → não precisa tocar.
6. `EMAIL_FROM` — confirmar valor em prod (`Vis <noreply@send.vis.app.br>`). Se já estiver certo, sem mudança de código (é env). Documentar no runbook.

### Fluxo do dado `description`
Invoice.description (preenchida pelo admin no NovaCobrancaButton) → (a) vai ao Asaas no `payments.create` (some o "Descrição não informada" no email do Asaas, caso algum escape) E (b) vai ao payload do nosso email `INVOICE_CREATED` → aparece no card. Ambos os caminhos.

### Modo teste / dedup — INALTERADOS
`notifyCompany` continua respeitando testMode (email vai pro testEmail). periodKeys inalterados. Nenhuma mudança de comportamento de envio — só o CONTEÚDO do template e o silenciamento do Asaas.

## Error handling
- `notificationDisabled` no payment: se o Asaas ignorar o campo (não documentado p/ payment), o cinto-e-suspensórios (config do dono no painel) cobre. Não quebra nada.
- Logo não carrega (cliente bloqueia imagens): `alt="Vis"` + faixa azul comunicam a marca. Email continua legível.
- `description` ausente (cobrança sem descrição): o card omite a linha "Descrição" (não mostra "não informada").

## Testing
- `templates.test.ts`: INVOICE_CREATED com description → card mostra a descrição (escapada); sem description → não mostra a linha; valor/vencimento/PIX/botão presentes; XSS na description é escapado (escapeHtml).
- `invoice-charge.service.test.ts`: `payments.create` chamado com `description` e `notificationDisabled: true`.
- `asaas.ts` (se houver teste): o body do POST /payments inclui notificationDisabled quando passado.
- `invoice-send.service.test.ts`: o payload de notifyCompany inclui `description`.
- Regressão: os outros 7 templates Vis inalterados (snapshot/render não quebra). `saas-email-layout.test.ts` mantém `#2E6BFF` (faixa segue azul) E ganha assertão nova p/ o logo (`alt="Vis"` e/ou `vis-logo`). `invoiceCreatedSchema` ganha campo OPCIONAL → testes que não passam description seguem válidos.

## Deploy
- Sem migration. Só código → `vercel deploy --prod` do worktree.
- Confirmar `EMAIL_FROM` em prod = `Vis <noreply@send.vis.app.br>` (env; se errado, dono ajusta na Vercel).
- Pós-deploy: criar nova cobrança de teste (ou reenviar) → conferir que o email Vis chega (sem o do Asaas) com logo + descrição.

## Fora de escopo (Email-B / futuro)
- **PDF do boleto anexado** (exige suporte a anexo no EmailQueue model + sendEmail/Resend + motor da fila — infra nova). Fase Email-B com spec própria.
- QR Code PIX como imagem no corpo (Asaas dá base64; decisão anterior foi PIX copia-e-cola, mantém).
- Ajuste da marca na conta Asaas (config manual do dono no painel, não-código).
