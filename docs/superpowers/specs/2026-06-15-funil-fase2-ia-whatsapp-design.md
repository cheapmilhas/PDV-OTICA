# Funil de Leads — Fase 2: IA porteira do WhatsApp — Design / Spec

**Data:** 2026-06-15
**Origem:** continuação do Funil de Leads (Fase 1 deployada 2026-06-15). Inspiração: modelo "Sépias" do Vesalia (`docs/benchmarking/versalha/`).
**Status:** Desenho aprovado no brainstorm. Bloco A' aprovado para implementação; B'/C/D desenhados.

## 1. Visão

A IA é a **porteira do funil**: toda conversa que chega no WhatsApp da ótica é guardada; após um período de silêncio, o Claude lê a conversa inteira (texto + áudio transcrito) e **decide se aquilo merece virar um lead** — e, se sim, já qualifica (etapa do funil + interesse). Conversas que não são oportunidade de venda (pedir horário, fornecedor, reclamação de garantia) ficam só no histórico e **não poluem o funil**.

**Por que a IA decide (e não uma regra fixa):** o dono quer que a inteligência fique na IA, que entende intenção a partir do texto/áudio — em vez de "todo número novo vira lead" (que enche o funil de lixo).

## 2. Estado atual (o que já existe — reusar)

- **WhatsApp vivo em produção:** envs Evolution setadas, ≥1 ótica conectada via QR.
- `WhatsappConnection` (`schema.prisma:~4202`): 1 por empresa, `instanceName = vis_${companyId}`, status, número.
- **Webhook** `POST /api/webhooks/evolution` (JWT HS256, multi-tenant, fail-closed): hoje só trata `connection.update` e `qrcode.updated`; **ignora `message.received`** (case default só marca `lastEventAt`).
- **Claude SDK** já em uso: OCR de receita (`src/app/api/ocr/prescription/route.ts`, `@anthropic-ai/sdk`, rate-limit 10/h **por usuário**). Padrão de chamada + rate-limit reusáveis — MAS: (a) o model lá é `claude-sonnet-4-20250514`, **deprecado/retirando 2026-06-15 — usar `claude-sonnet-4-6` nos novos call-sites**; (b) o rate-limit do OCR é por `userId`; a IA porteira não tem usuário logado → rate-limit/cota **por `companyId`**.
- **Funil:** `Lead`/`LeadStage`, `POST /api/leads`, `createLead` (service), kanban `/dashboard/funil` (Fase 1).
- **Envio** (`src/lib/whatsapp.ts:35`): `LEGACY_WHATSAPP_SEND_DISABLED = true` — desligado até virar per-company (relevante só p/ Bloco D).

## 3. Princípios

1. **Economia de token:** a IA roda **1 vez por conversa**, após silêncio — não a cada mensagem.
2. **Privacidade/PII:** mensagens são dados pessoais. Multi-tenant rígido por `companyId`. Nada de número/conteúdo em logs ou respostas além do necessário.
3. **Fail-safe:** se a IA falhar/estourar cota, a conversa fica guardada (não se perde); só não vira lead automático.
4. **Reuso:** webhook, Claude SDK, funil e rate-limit já existem — estender, não recriar.
5. **Aditivo:** migrations e seeds aditivos (lição da Fase 1: seeds do projeto fazem `deleteMany` — nunca usar; criar scripts cirúrgicos).

---

## 4. Bloco A' — Guardar conversas (PRIMEIRO PASSO, sem IA)

**Objetivo:** o webhook passa a receber e **persistir** as mensagens recebidas, agrupadas em conversa por número/ótica. Zero token. Valida o fluxo Evolution→Vis end-to-end.

### Modelo de dados
```prisma
model WhatsappConversation {
  id            String   @id @default(cuid())
  companyId     String
  contactNumber String                       // número do cliente (E.164)
  contactName   String?                      // pushName do WhatsApp, se vier
  lastMessageAt DateTime @default(now())
  analyzedAt    DateTime?                    // quando a IA analisou (Bloco B')
  leadId        String?                      // lead gerado, se houver (Bloco B')
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  messages      WhatsappMessage[]
  @@unique([companyId, contactNumber])
  @@index([companyId, lastMessageAt])
  @@index([companyId, analyzedAt])
}

model WhatsappMessage {
  id             String   @id @default(cuid())
  conversationId String
  companyId      String                      // denormalizado p/ scoping rápido
  direction      String                      // "inbound" | "outbound"
  type           String                      // "text" | "audio" | "image" | "other"
  text           String?                     // texto, ou transcrição do áudio (Bloco B')
  mediaUrl       String?                     // url/ref da mídia, se houver
  evolutionId    String?  @unique            // id da msg na Evolution (idempotência)
  receivedAt     DateTime @default(now())
  createdAt      DateTime @default(now())
  conversation   WhatsappConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([companyId, conversationId])
  @@index([conversationId, receivedAt])    // p/ montar contexto cronológico (Bloco B')
}
```
Migration aditiva. `evolutionId @unique` garante idempotência (webhook pode reentregar).

**Áudio no A':** mensagens de áudio são guardadas com `type=audio` + `mediaUrl` (e `text=null` até o Bloco B' transcrever). No A' não há transcrição — só persistência.

### Webhook
Em `src/app/api/webhooks/evolution/route.ts`, adicionar tratamento do evento `message.received` (ou `messages.upsert`, conforme o payload real da Evolution — **confirmar o nome do evento e o shape do payload na implementação**):
- Resolver empresa via `instanceName` (já existe).
- Só mensagens **inbound** (ignorar as enviadas pela própria ótica nesta fase).
- Upsert da `WhatsappConversation` por `(companyId, contactNumber)`, atualizar `lastMessageAt` e `contactName`.
- Criar `WhatsappMessage` (idempotente via `evolutionId`). Áudio: guardar `type=audio` + `mediaUrl` (transcrição fica no Bloco B').

### Visibilidade (Fase A')
- Opcional/mínimo: uma listagem simples de conversas recebidas (pode ser só dado no banco nesta fase; a UI de "caixa de conversas" pode vir no B'). Decisão de implementação.

### Permissões
Reusar `leads.*` ou criar `whatsapp.inbox.view` se for expor UI. A definir no plano.

### Não-objetivos do A'
- Nenhuma IA, nenhuma transcrição, nenhuma criação de lead, nenhum envio.

---

## 5. Bloco B' — IA porteira (qualifica e cria lead)

### Gatilho (decidido — compatível com Vercel Hobby)
**NÃO usar "silêncio de 2-3 min"** — inviável no plano Hobby (cron 1×/dia; `vercel.json` todos `0 N * * *`). Em vez disso, **híbrido**:
- **Manual:** botão "Analisar com IA" numa conversa → roda na hora. Controle total de custo, ideal p/ lead quente.
- **Cron diário:** no início do dia, varre conversas com **mensagens novas desde a última análise** (`lastMessageAt > analyzedAt` OU `analyzedAt IS NULL`) e qualifica em lote. Pega o que o vendedor não clicou. Respeita `analyzedAt` (não re-analisa o que não mudou) → economiza token.
- Trade-off aceito: lead que chega de manhã e ninguém clica vira lead automático no cron do dia seguinte. Para ótica (não-urgente) é aceitável; o botão manual cobre a urgência.

### Arquitetura de IAs (decidido — cada uma no que faz melhor)
```
ÁUDIO → [Whisper/OpenAI: transcreve] → texto ┐
TEXTO ───────────────────────────────────────┼→ [Claude: decide é-lead? + qualifica]
```
- **Transcrição:** **Whisper (OpenAI)** — o Claude SDK NÃO transcreve áudio. Whisper é padrão de mercado, ótimo PT-BR, ~US$0,006/min, integração HTTP simples. Exige **`OPENAI_API_KEY`** nova (env). Registrada como feature `audio_transcription` na medição de tokens (Bloco C).
- **Qualificação:** **Claude** — modelo `claude-sonnet-4-6` (NÃO o `claude-sonnet-4-20250514` do OCR, que está deprecado/retirando 2026-06-15). Feature `lead_qualification` na medição.

**Pipeline:**
1. **Áudio → texto:** mensagens `type=audio` sem `text` são transcritas via Whisper (OpenAI); resultado salvo em `WhatsappMessage.text`. (Dependência externa NOVA — não existe transcrição no projeto hoje. Pode ser fase incremental: começar só com texto e ligar áudio depois.)
2. **Montar o contexto:** concatenar as mensagens da conversa (ordem cronológica, via `@@index([conversationId, receivedAt])`).
3. **Claude qualifica** (1 chamada, model `claude-sonnet-4-6`): prompt estruturado → JSON com:
   - `isLead` (bool) — é oportunidade de venda?
   - `reason` (string curta) — por que sim/não.
   - `interest` (grau/sol/lente de contato/exame/outro) — se aplicável.
   - `suggestedStage` (mapeia p/ `LeadStage` da empresa) — se `isLead`.
   - `confidence`.
4. **Decisão:**
   - `isLead = true` → `createLead(data, companyId, userId, branchId)` onde `data = { name: contactName ?? número, phone: contactNumber, source: WHATSAPP, interest, stageId: <sugerida> }`. **Assinatura real (confirmada):** `createLead` exige `userId` e `branchId` posicionais. Como não há vendedor logado, usar um **usuário-robô do sistema** por empresa (criar/reusar um `User` tipo "IA"/"sistema" como `sellerUserId`) e `branchId = null`. Vincular `conversation.leadId`. Reusa o dedupe por telefone da Fase 1.
   - `isLead = false` → só marca `analyzedAt`; conversa fica no histórico, fora do funil.
5. **Registrar tokens** (Bloco C): a chamada loga `input_tokens`/`output_tokens` (de `response.usage` do SDK) por `companyId`, feature `lead_qualification`. A transcrição loga `audio_transcription` (segundos/custo Whisper).

**Fail-safe:** erro de IA/cota → `analyzedAt` fica nulo (re-tenta depois) ou marca erro; a conversa nunca se perde.

**Dedupe:** se o número já é `Customer`/`Lead` ativo, `createLead` já avisa (Fase 1). Decidir se atualiza o lead existente em vez de criar outro.

---

## 6. Bloco C — Medição de tokens (requisito do dono)

**Modelo:**
```prisma
model AiTokenUsage {
  id            String   @id @default(cuid())
  companyId     String
  feature       String                     // "lead_qualification" | "ocr_prescription" | "audio_transcription" ...
  provider      String                     // "anthropic" | "openai"
  model         String
  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  cacheTokens   Int      @default(0)        // cache_creation+cache_read do Anthropic, se houver
  audioSeconds  Int?                        // p/ Whisper (cobrança por tempo, não token)
  createdAt     DateTime @default(now())
  @@index([companyId, createdAt])
  @@index([companyId, feature])
}
```
Serve **qualquer** feature de IA do Vis. **Instrumentar também o OCR de receita existente** (`src/app/api/ocr/prescription/route.ts` hoje DESCARTA `response.usage` — passar a logar). O `usage` do Anthropic SDK retorna `input_tokens`/`output_tokens` (+ `cache_*` se prompt caching). Whisper cobra por tempo de áudio (`audioSeconds`), não por token.

**Controles:**
- **Super Admin:** liga/desliga a IA global (kill-switch) + painel de consumo por ótica (tokens por período/feature, custo estimado, quem está perto do limite). Espelha o admin SaaS existente.
- **Config da ótica:** liga/desliga a IA da sua clínica + ver tokens gastos (traduzir token → "crédito" amigável). IA desligada não roda nem consome.
- Flags por empresa (reusar padrão de feature-flag/`WHATSAPP_ENABLED_COMPANY_IDS` e gating de plano).

**Cota/limite:** opcional — bloquear quando estourar (rate-limit já tem precedente no OCR).

---

## 7. Bloco D — Resposta automática (futuro, opcional)

- Reativar envio per-company (hoje `LEGACY_WHATSAPP_SEND_DISABLED=true`): migrar `sendWhatsAppText` para usar `instanceName` da empresa em vez da env global.
- IA responde o lead seguindo "pontos importantes" cadastrados pela ótica (como no Vesalia: começa desligada, treina, revisa, então liga).
- Janela de atuação (24h ou fora do horário), pausa após resposta humana. Fora do escopo imediato.

---

## 8. Riscos e cuidados

- **Custo de IA:** o gatilho-por-silêncio é a principal mitigação. Cota por ótica como rede de segurança.
- **PII (LGPD):** conteúdo de conversa e número são sensíveis. Scoping por `companyId`, retenção a definir, nada em logs.
- **Idempotência do webhook:** `evolutionId @unique` (a Evolution reentrega).
- **Shape do payload da Evolution:** o evento de mensagem na Evolution v2.3.x é **`messages.upsert`** (NÃO `message.received`), com `data.key.id` (→ `evolutionId`), `data.key.remoteJid` (número@s.whatsapp.net → `contactNumber`), `data.pushName` (→ `contactName`), `data.message.conversation` (texto) / `data.message.audioMessage` (áudio). **Confirmar o shape exato com um payload real na implementação** — o `EvolutionWebhookPayload` atual (route.ts) só tipa eventos de conexão, precisará estender. O `instanceName` é gerado por um helper em `src/lib/evolution.ts` (confirmar o helper, não hardcodar `vis_`).
- **Não reativar o envio sem querer:** Bloco A'/B' são read/processa; o envio (D) fica explicitamente fora.

## 9. Faseamento de entrega

1. **A'** — guardar conversas (migration + webhook). Entrega: conversas aparecem no banco/inbox. Sem IA.
2. **B'** — IA porteira (transcrição + qualificação + criar lead). Entrega: lead nasce qualificado do WhatsApp.
3. **C** — medição de tokens + telas liga/desliga (super admin + ótica). Entrega: controle de custo.
4. **D** — resposta automática (futuro).

Cada bloco entrega valor sozinho e é deployável independentemente.

## 10. Entregável do primeiro passo (A')

Webhook persiste mensagens inbound em `WhatsappConversation`/`WhatsappMessage` (idempotente, multi-tenant), migration aditiva, testes. Sem IA, sem envio, sem lead.
