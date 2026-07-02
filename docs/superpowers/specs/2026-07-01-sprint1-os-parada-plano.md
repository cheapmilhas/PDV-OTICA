# Plano de Implementação — Sprint 1 (funil/conversas)

**Base:** `docs/superpowers/specs/2026-07-01-funil-conversas-melhorias-design.md`
**Ordem:** #1 OS Pronta Parada → #2 `<WhatsAppButton>` → #3 IA copiloto no inbox
**Princípio:** cada fase é entregável e testável sozinha; a #1 já entrega valor sem depender das outras.

Arquivos-âncora confirmados nesta sessão:
- Página OS: `src/app/(dashboard)/dashboard/ordens-servico/page.tsx` — usa `statusFilter` (default `"ativos"`), `counts` por status, `viewMode` list/kanban, resumo de contadores (~linha 537-540), rota `/api/service-orders?status=...`, entrega via `/api/service-orders/[id]/deliver`.
- Service: `src/services/service-order.service.ts` — `list()` monta `where` por status (linha 78-112); `counts` via `groupBy`/`count`; `STATUS_TRANSITIONS` (READY→DELIVERED).
- API: `src/app/api/service-orders/route.ts` (GET list + counts, já passa `companyId`+`branchId`).
- Aviso automático existente: `src/services/whatsapp-automation.service.ts` `runOsReady` (~257-284) grava `WhatsappMessageLog type=OS_READY referenceId=os.id status=SENT`, filtra `acceptsMarketing`.
- Schema: `ServiceOrder` (`status`, `readyAt`, `deliveredAt`); `WhatsappMessageLog` (`type`, `referenceId`, `status`); `Customer.phone`; `Sale` (saldo).

---

## FASE 1 — OS Pronta Parada

### 1.1 Migração (aditiva)
- **Arquivo:** nova migração `prisma/migrations/<ts>_service_order_snooze/migration.sql`
- **SQL:** `ALTER TABLE "ServiceOrder" ADD COLUMN "notifySnoozedUntil" TIMESTAMP(3);`
- **Schema:** adicionar `notifySnoozedUntil DateTime?` em `model ServiceOrder` (comentário: "adiado no 'avisar pronto' — some da fila até esta data; volta se ainda READY").
- **Deploy:** aplicar manual no Neon (build Vercel não roda migrate). Snapshot antes.
- **Aceite:** `npx prisma validate` ok; `migrate status` limpo.

### 1.2 Backend — filtro "prontos_avisar" + flag "avisado"
- **Arquivo:** `src/services/service-order.service.ts`, função `list()`.
- **Adicionar** ramo de status `"prontos_avisar"` no `where`:
  - `status: "READY"`, `deliveredAt: null`
  - `OR: [{ notifySnoozedUntil: null }, { notifySnoozedUntil: { lt: now } }]` (snooze expirado ou inexistente)
  - **excluir já avisados:** `NOT { messageLogs: { some: { type: "OS_READY", status: "SENT" } } }` — usar a relação de `WhatsappMessageLog` por `referenceId=os.id`. (Se a relação não estiver modelada, fazer subquery: buscar IDs com log OS_READY SENT e `id: { notIn }`.) **Fonte canônica de "avisado" = decisão B1 da spec.**
  - ordenar por `readyAt: "asc"`.
- **Retornar por item:** `readyAt`, e o saldo a receber (via `sale` — reusar o cálculo de saldo existente, se houver; senão expor `sale.balance`/`total - paid`).
- **Counts:** adicionar `PRONTOS_AVISAR` ao objeto de counts (mesmo filtro), para o card do resumo.
- **Multi-tenant:** `companyId` + `branchId` já vêm no `list()` — manter.
- **Aceite (teste unit):** com mock, provar que o `where` de `prontos_avisar` tem `status=READY`, `deliveredAt:null`, exclui OS com log OS_READY, e respeita snooze.

### 1.3 Backend — endpoint "ocultar por hoje" (snooze)
- **Arquivo:** nova rota `src/app/api/service-orders/[id]/snooze-notify/route.ts` (POST).
- **Ação:** set `notifySnoozedUntil = amanhã 06:00` (fuso BRT) na OS, gated por `companyId` + permissão de OS.
- **Aceite:** POST seta o campo; GET da lista "prontos_avisar" para de mostrar a OS até a data; volta depois.

### 1.4 Frontend — filtro/aba + linha + resumo
- **Arquivo:** `src/app/(dashboard)/dashboard/ordens-servico/page.tsx`.
- Adicionar opção de `statusFilter` **"Prontos pra avisar"** (segue o padrão de status existente, não `Tabs`).
- Card no resumo de contadores (~linha 537): "🕶️ Prontos pra avisar: N".
- Card-atalho no **Dashboard** (`src/app/(dashboard)/dashboard/page.tsx` ou o dashboard principal) que linka para `?status=prontos_avisar`.
- **Linha de cada OS** na lista quando filtro ativo:
  - **Semáforo** (bolinha): 🟢 0-1d / 🟡 2-4d / 🔴 5d+ desde `readyAt` (`differenceInCalendarDays`).
  - Nome do cliente (bold), "pronto há X dias" (humano), "falta receber R$ Y" só se saldo > 0.
  - Botão **"Avisar no WhatsApp"** (usa `<WhatsAppButton>` da Fase 2; até lá, um botão local que abre `wa.me` + copia texto).
  - Menu `⋯`: "Ocultar por hoje" (chama 1.3), "Já foi retirado" (chama `/deliver` existente).
  - **Teto ≤10 itens** exibidos; rodapé "+N mais antigos".
  - Estado vazio comemorativo ("Nenhum óculos parado 🎉").
- **Aceite (spec §5 #1):** os 7 critérios de aceite da spec (lista só READY não-entregue; some se já avisado; semáforo; botão copia+abre; snooze volta em 24h; DELIVERED remove; estado vazio).

---

## FASE 2 — `<WhatsAppButton>` reutilizável

### 2.1 Util de deep link
- **Arquivo:** novo `src/lib/whatsapp-deeplink.ts`.
- `buildWaMeUrl(phone: string): string | null` — normaliza para `55DDDNUM` reusando a lógica de `src/lib/lead-phone-match.ts`; retorna null se telefone inválido.
- **Aceite (teste):** casos com/sem DDD, com/sem +55, número curto → normalização correta ou null.

### 2.2 Componente
- **Arquivo:** novo `src/components/whatsapp/whatsapp-button.tsx`.
- Props: `{ phone, draftText, contextLabel?, onOpened? }`.
- Ao clicar: `clipboard.writeText(draftText)` → `window.open(waMeUrl)` → toast "Copiei ✅ Cola no WhatsApp". Fallback visível se clipboard falhar. Esconde se `buildWaMeUrl` = null.
- **Lock social leve** (efêmero, TTL ~15min, sem persistir): estado compartilhado (ex. via polling leve ou campo efêmero) mostrando "fulana pegou" — versão mínima pode ser só client-side por sessão; persistência fica como melhoria.
- Trocar o botão local da Fase 1.4 por este.
- **Aceite (spec §5 #2):** os 5 critérios (copia+abre; toast; fallback; escondido sem telefone; "fulana pegou" não bloqueante).

---

## FASE 3 — IA copiloto no inbox

### 3.1 Função de IA
- **Arquivo:** novo `src/lib/ai/conversation-copilot.ts` (mesmo estilo de `lead-qualifier.ts`: SDK Anthropic, `getAnthropicKey()`, marcadores anti-injection).
- `summarizeAndDraft(messages): { summary: string, draft: string }` — resumo 1-2 linhas + rascunho de resposta. Temp baixa. **Não persiste** (stateless).
- **Aceite:** dado um transcript, retorna resumo + rascunho; erro da IA é tratado (não lança pro caller sem tratamento).

### 3.2 Rota
- **Arquivo:** nova `src/app/api/whatsapp/conversations/[id]/copilot/route.ts` (POST) — auth + companyId + carrega mensagens da conversa + chama 3.1. Gated por cota de IA (reusar guard existente do qualifier, `iaEnabled`/limite).
- **Aceite:** POST retorna `{summary, draft}`; respeita cota; multi-tenant.

### 3.3 UI no inbox
- **Arquivo:** `src/components/funil/whatsapp-inbox.tsx` (painel da conversa selecionada).
- Bloco "🤖 Resumo da IA" + "✍️ Sugestão de resposta (rascunho seu)" com botão "Copiar" (editável antes) e aviso FIXO "isto é só um rascunho seu — a IA não manda nada".
- **Aceite (spec §5 #3):** os 5 critérios (gera resumo+rascunho; copiar; aviso sempre visível; nada enviado; erro amigável).

---

## Ordem de execução e verificação
1. Fase 1 completa (migração → backend → snooze → frontend) → **testar em produção com dado real** (OS pronta parada aparece, botão abre wa.me). É a entrega que prova valor.
2. Fase 2 (extrai o botão para componente reutilizável).
3. Fase 3 (copiloto).

**Cada fase:** TDD onde couber (services/utils com teste), `tsc --noEmit` limpo, revisão adversarial do diff antes do commit/PR, migração aplicada no Neon ANTES do deploy do código que a usa. PRs separados por fase.

## Riscos herdados da spec (já mitigados no design)
- Aviso duplicado (botão × automação OS_READY) → resolvido pela exclusão de OS já avisadas (1.2).
- "Avisado" apodrecendo → fonte canônica determinística (`WhatsappMessageLog`), não clique manual.
- Telefone que não normaliza → `buildWaMeUrl` retorna null e o botão some (não quebra).

## Fora deste plano (Sprints 2+)
Fila de Hoje, placar por período, lista de não-convertidos, motivo de perda estruturado, tráfego pago, fez-exame-não-comprou, recompra — ver a spec.
