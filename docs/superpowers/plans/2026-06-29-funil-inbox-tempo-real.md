# Plano — Funil: Inbox de WhatsApp ao vivo + qualificação quase-real (Fase 3)

**Branch:** `feat/whatsapp-inbox-funil` (a partir de `main` — schema alinhado com prod, 60 migrations).
**Data:** 2026-06-29.
**Decisões do dono:** Inbox = ABA dentro do Funil; qualificação = cron-job.org (alta freq) + cron diário existente + botão manual; permissão = reusar `leads.access`.

## Contexto / o que já existe (reuso 100%)
- Webhook Evolution multi-tenant → `persistInboundMessage` grava `WhatsappConversation` + `WhatsappMessage` (idempotente por `evolutionId`), seta `needsAnalysis=true` em conversa já analisada.
- `qualifyConversation(id, {force})` e `qualifyPendingConversations(companyId?)` — claim otimista (CAS), transcrição de áudio (Whisper), fail-closed por cota/flags, anti-loop (`analysisAttempts<3`).
- Rota manual `POST /api/whatsapp/conversations/[id]/qualify` (perm `leads.create`, tenant-guard, `assertAiAllowed`).
- Cron diário `/api/cron/whatsapp-qualify` (GET, `CRON_SECRET`) → `qualifyPendingConversations()`.
- Índices: `(companyId, lastMessageAt)`, `(companyId, analyzedAt)`, `(conversationId, receivedAt)`.
- Padrão de tela: client component, `fetch`+`useState`, shadcn, `react-hot-toast`, `ProtectedRoute permission`.
- Padrão de polling: `setInterval` (whatsapp-connect usa 3s; notificações 30s/5min).

## O que falta (escopo mínimo do v1)
**Nenhuma migração de schema. Nenhuma env nova. Nenhuma permissão nova.**

### T1 — GET lista de conversas (rota nova)
`GET /api/whatsapp/conversations` — perm `leads.access`, `getCompanyId()`.
- Query: `companyId` (sempre), default `isGroup=false`, `orderBy lastMessageAt desc`, `take` paginável (cursor opcional).
- Filtro opcional `status`: `pending` (`analyzedAt null OR needsAnalysis`) | `analyzed` | `all`.
- Retorna por conversa: `id, contactNumber, contactName, lastMessageAt, analyzedAt, needsAnalysis, leadId, isGroup`, + `lastMessageText` (última msg) + `unreadCount`/`messageCount` (opcional v1: só messageCount).
- TESTE: multi-tenant (não vaza outra empresa), filtro de status, exclui grupos por default.

### T2 — GET thread de mensagens (rota nova)
`GET /api/whatsapp/conversations/[id]/messages` — perm `leads.access`, tenant-guard (conversa.companyId == sessão).
- Retorna mensagens ordenadas `receivedAt asc`, `take` (ex. últimas 100).
- TESTE: tenant-guard (404 se outra empresa), ordenação.

### T3 — Aba "Conversas" no Funil
- Refatorar `dashboard/funil/page.tsx` para ter abas: **"Funil"** (kanban atual) | **"Conversas"** (inbox novo). Componente `WhatsappInbox` novo.
- `WhatsappInbox`: lista de conversas (esquerda) + thread (direita).
  - **Polling ~7s** via `setInterval`, **pausa em `document.visibilityState === "hidden"`** (e quando a aba "Conversas" não está ativa).
  - Badge por conversa: "Pendente" / "Lead criado" (via `leadId`).
  - Botão **"Analisar com IA agora"** por conversa → `POST .../qualify` (reusa rota pronta). Mostra loading, toast no resultado (lead criado / não é lead / cota atingida).
- TESTE (component, se viável no padrão do projeto): render da lista, badge correto, polling pausa em hidden. (Maioria via teste de rota; componente mínimo.)

### T4 — Qualificação quase-real (cron-job.org na rota existente)
- **Decisão:** reusar a rota `/api/cron/whatsapp-qualify` existente — o cron-job.org externo bate nela a cada 1-2 min (Hobby = 1 cron/dia na Vercel; o externo contorna). O cron diário da Vercel continua como fallback.
- **Ajuste fino (opcional, recomendado):** filtro "esfriar" — só qualificar conversa com `lastMessageAt < now - COOLDOWN_MIN` (ex. 3-4 min), p/ não qualificar no meio de uma rajada. Adicionar em `qualifyPendingConversations` atrás de constante (default mantém comportamento se 0).
- TESTE: varredura respeita o cooldown; não-regressão do cron diário.
- **Entrega ao dono:** URL da rota + header `Authorization: Bearer <CRON_SECRET>` + instruções de cadastro no cron-job.org.

## Fora de escopo (v2)
SSE/WebSocket, fila (QStash), marcar mensagem como lida, responder pelo inbox, contadores de não-lido persistidos.

## Critério de saída
- `tsc` 0, testes verdes, `build` OK. **PARAR ANTES DO DEPLOY** (gate do dono). Sem migração, sem env nova.
- Deploy (quando autorizado): via working-tree CLI, `migrate status` antes, smoke das rotas.
