# Funil Fase 2 — Bloco D (Áudio Whisper + Seletor de Modelo + Margem por Ótica) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) Transcrever áudio do WhatsApp (Whisper/OpenAI) sob demanda e qualificar conversas com áudio; (2) deixar o super admin escolher o modelo Claude (Haiku padrão / Sonnet / Opus); (3) cobrar a ótica em R$ com **margem configurável por ótica** (majorar/subsidiar), sem a ótica ver custo real nem o %.

**Architecture:** O cliente Evolution ganha `getMediaBase64(instance, evolutionId)` (POST `getBase64FromMediaMessage`, só o `key.id` que já temos — investigado e confirmado no código-fonte da Evolution; sem campo novo). Um serviço `audio-transcription.service` baixa+transcreve via Whisper (`whisper-1`, OGG direto, sem conversão), fail-safe. O orquestrador do B' transcreve os áudios da conversa ANTES de montar o contexto. O modelo de qualificação vem de `AiGlobalConfig.qualifierModel` (Haiku/Sonnet/Opus). A margem vem de `AiGlobalConfig.markupPercent` (global) com override opcional por ótica (`CompanySettings.markupPercentOverride`). A ótica passa a ver **R$ com margem embutida** (nunca custo real nem %); o super admin vê custo real + margem + preço + lucro.

**Tech Stack:** Next.js · Prisma 5.22 · TypeScript · Vitest · `@anthropic-ai/sdk` · OpenAI Whisper via `fetch` (sem dep nova) · `secret-cipher` (do C2, AES-256-GCM).

**Spec/contexto:** Bloco C deployado dormente; B' deployado dormente; C2+C3 (telas) implementado NÃO-deployado. Este bloco integra-se a tudo isso. Decisões do dono em `funil-leads-vesalia.md`.

---

## Decisões do dono (2026-06-16)

1. **Áudio agora**, sob demanda, Whisper `whisper-1`, fail-safe. **Sem campo novo no schema** (investigado: `getBase64FromMediaMessage` aceita só `key.id`=`evolutionId`; transcreve logo após receber, store da Evolution fresco; OGG aceito pelo Whisper sem conversão). Nova env **`OPENAI_API_KEY`** cifrada no banco (igual à Anthropic).
2. **Seletor de modelo Claude** no super admin: **Haiku 4.5 padrão** (`claude-haiku-4-5`, $1/$5 — classificação barata em lote), Sonnet 4.6 (`claude-sonnet-4-6`, $3/$15), Opus 4.8 (`claude-opus-4-8`, $5/$25). Whisper fixo.
3. **Margem por ótica:** `markupPercent` global (default) + override por ótica. Subsidiar (−X%) ou majorar (+X%).
4. **Ótica vê tokens + R$ que paga** (custo × (1+margem), margem embutida). NUNCA custo real nem %. **Revisa o C3** (era "só créditos").
5. **Super admin vê** por ótica: custo real (USD→R$) + margem % + preço final + lucro/subsídio.

> **Pré-requisito de ordem:** este bloco assume que o C2+C3 (commits 921e608..1078ac1) já está na árvore. Se C2+C3 for deployado antes deste bloco, a tela da ótica vai do "créditos" para "R$ com margem" — comunicar a mudança. Idealmente C2+C3+D vão juntos ao deploy.

---

## Fatos verificados (seguir à risca)

- **rtk** quebra comandos: `node node_modules/{vitest/vitest.mjs run,typescript/bin/tsc --noEmit,prisma/build/index.js}`, `git commit --no-verify`. curl interceptado → node fetch.
- **Sem banco local:** migration via `migrate diff` (NÃO aplicar).
- **Modelos (IDs oficiais, fonte: skill claude-api):** Haiku `claude-haiku-4-5` ($1 in/$5 out/M, cache read ~$0.10), Sonnet `claude-sonnet-4-6` ($3/$15/$0.30), Opus `claude-opus-4-8` ($5/$25/$0.50). Whisper `whisper-1` ($0.006/min) já está em AUDIO_PRICING.
- **Evolution** (`src/lib/evolution.ts`): cliente com base URL `EVOLUTION_API_URL`, header `apikey`. Padrão de método = `sendText`. Adicionar `getMediaBase64` seguindo esse padrão. Endpoint: `POST /chat/getBase64FromMediaMessage/{instance}` body `{ message: { key: { id: evolutionId } }, convertToMp4: false }` → resposta `{ base64, mimetype, fileName }`.
- **C1/C2 já em árvore:** `logAiUsage` (`LogAiUsageInput` tem `audioSeconds` + `provider`), `getMonthlyUsage`/`getDailyUsage`, `getAiConfig`/`updateAiConfig`/`getAnthropicKey` (`ai-config.service`), `secret-cipher` (encryptSecret/decryptSecret), `computeCostUsd`/`usdToBrl`/`tokensToCredits` (ai-pricing). `AiGlobalConfig` singleton (anthropicKeyEnc/usdBrlRate/markupPercent/creditTokenFactor). `qualifyConversationText(text, stages)` (lead-qualifier, model hardcoded `claude-sonnet-4-6`). `conversation-qualifier.service` (buildConversationText filtra só `text` não-vazio; teto 80 msgs).
- **whatsapp-message.service / parser:** `WhatsappMessage` tem `type` ("audio"), `mediaUrl`, `text`, `evolutionId`. Áudio chega com `text=null`.
- **C2/C3 (implementado, NÃO deployado):** rotas `/api/admin/ai-config`, `/api/admin/companies/[id]/ai-{settings,usage}`, `/api/company/ai-{settings,usage}`; telas `admin/configuracoes/ia`, `admin/clientes/[id]/company-ai-panel.tsx`, `dashboard/configuracoes/ia/page.tsx`. **A rota `/api/company/ai-usage` hoje devolve créditos sem R$ — será modificada.**

---

## Estrutura de arquivos

| Arquivo | Ação |
|---|---|
| `prisma/schema.prisma` | `+ qualifierModel`, `+ openaiKeyEnc` em `AiGlobalConfig`; `+ markupPercentOverride Decimal?` em `CompanySettings` | Modificar |
| `prisma/migrations/<ts>_ai_model_audio_margin/` | migration aditiva | Criar |
| `src/lib/ai-pricing.ts` | + Haiku/Opus em TEXT_PRICING; + `priceForCompany(usd, globalMarkup, override?)` helper de preço final | Modificar |
| `src/services/ai-config.service.ts` | get/update incluem qualifierModel + openaiKey; + `getOpenaiKey()` (decifra, fallback env) | Modificar |
| `src/lib/evolution.ts` | + `getMediaBase64(instance, evolutionId)` | Modificar |
| `src/services/audio-transcription.service.ts` | `transcribeAudio(companyId, instanceName, evolutionId)` (Whisper, fail-safe, logAiUsage) | Criar |
| `src/lib/ai/lead-qualifier.ts` | `qualifyConversationText(text, stages, model)` (model parametrizável) | Modificar |
| `src/services/conversation-qualifier.service.ts` | transcreve áudios antes do contexto; passa qualifierModel | Modificar |
| `src/services/ai-margin.service.ts` | `getEffectiveMarkup(companyId)` (override ?? global) | Criar |
| `src/app/api/admin/ai-config/route.ts` | aceita qualifierModel + openaiKey (PUT) | Modificar |
| `src/app/api/admin/companies/[id]/ai-settings/route.ts` | aceita markupPercentOverride | Modificar |
| `src/app/api/admin/companies/[id]/ai-usage/route.ts` | + margem aplicada + preço + lucro | Modificar |
| `src/app/api/company/ai-usage/route.ts` | devolve R$ final (com margem); NUNCA custo/markup | Modificar |
| UI: `company-ai-panel.tsx`, `admin/configuracoes/ia/ia-client.tsx`, `dashboard/configuracoes/ia/page.tsx` | seletor de modelo + campo openai key + margem por ótica; ótica mostra R$ | Modificar |
| (+ testes) | | |

> **Ordem:** D1 schema → D2 ai-pricing (Haiku/Opus + priceForCompany) → D3 ai-config (qualifierModel/openaiKey/getOpenaiKey) → D4 ai-margin.service → D5 evolution.getMediaBase64 → D6 audio-transcription.service → D7 lead-qualifier model param → D8 orquestrador transcreve+modelo → D9 rotas admin (config/settings/usage) → D10 rota ótica ai-usage (R$ com margem) → D11 UIs → D12 verificação.

---

## Task D1: Schema

**Files:** `prisma/schema.prisma` + migration.

- [ ] Em `AiGlobalConfig`: `qualifierModel String @default("claude-haiku-4-5")` + `openaiKeyEnc String?`.
- [ ] Em `CompanySettings`: `markupPercentOverride Decimal? @db.Decimal(6, 2)` (null = usa o global).
- [ ] `generate`; migration via diff (SÓ ADD COLUMN, todas com default/nullable). Commit `feat(ia-d): qualifierModel/openaiKeyEnc + markupPercentOverride (aditiva)`.

## Task D2: ai-pricing — Haiku/Opus + preço por empresa

**Files:** `src/lib/ai-pricing.ts` (+test).

- [ ] Adicionar a TEXT_PRICING: `"claude-haiku-4-5": {inputPerMillion:1, outputPerMillion:5, cacheReadPerMillion:0.1}` e `"claude-opus-4-8": {inputPerMillion:5, outputPerMillion:25, cacheReadPerMillion:0.5}`.
- [ ] Novo helper: `priceForCompany(costUsd: number, usdBrlRate: number, markupPercent: number): number` → `round(costUsd * usdBrlRate * (1 + markupPercent/100))`. (markupPercent pode ser negativo p/ subsídio; clamp resultado em >=0.)
- [ ] Testes: Haiku/Opus custo; priceForCompany com margem +50%, 0%, −20%; resultado nunca negativo. TDD. Commit.

## Task D3: ai-config — qualifierModel + openaiKey

**Files:** `src/services/ai-config.service.ts` (+test).

- [ ] `AiConfigView` ganha `qualifierModel: string` e `hasOpenaiKey: boolean` (NUNCA a key). `getAiConfig` retorna ambos.
- [ ] `UpdateAiConfigInput` ganha `qualifierModel?` (validar contra allowlist dos 3 IDs; ignora se inválido) e `openaiKey?` (cifra só se não-vazio, como a anthropicKey).
- [ ] `getOpenaiKey(): Promise<string|undefined>` — decifra `openaiKeyEnc`, fallback `process.env.OPENAI_API_KEY`, fail-safe (log.warn no catch — mesmo padrão do getAnthropicKey corrigido).
- [ ] Testes: qualifierModel default haiku; update valida allowlist; getOpenaiKey decifra+fallback; view nunca expõe key. TDD. Commit.

## Task D4: ai-margin.service

**Files:** `src/services/ai-margin.service.ts` (+test).

- [ ] `getEffectiveMarkup(companyId): Promise<number>` → lê `CompanySettings.markupPercentOverride`; se null, lê `AiGlobalConfig.markupPercent`; retorna number. Fail-safe: erro → retorna 0 (sem margem, conservador — não cobra a mais por flake).
- [ ] Testes: override presente vence; ausente cai no global; erro → 0. TDD. Commit.

## Task D5: evolution.getMediaBase64

**Files:** `src/lib/evolution.ts` (+test se houver evolution.test.ts).

- [ ] Adicionar método seguindo o padrão de `sendText`:
```typescript
async getMediaBase64(instanceName: string, evolutionId: string): Promise<{ base64: string; mimetype: string; fileName: string }> {
  return evolutionFetch(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ message: { key: { id: evolutionId } }, convertToMp4: false }),
  });
}
```
(confirmar o nome real do helper de fetch interno — `evolutionFetch` ou equivalente — lendo o arquivo). Teste mockando o fetch interno. Commit.

## Task D6: audio-transcription.service

**Files:** `src/services/audio-transcription.service.ts` (+test).

- [ ] `transcribeAudio(companyId, instanceName, evolutionId): Promise<string | null>`:
  - `getOpenaiKey()`; se sem key → retorna null (não transcreve, fail-safe).
  - `evolution.getMediaBase64(...)` → base64 do OGG.
  - POST `https://api.openai.com/v1/audio/transcriptions` (multipart: file=buffer .ogg, model=`whisper-1`) via fetch, header `Authorization: Bearer <key>`.
  - Estima `audioSeconds` (do tamanho/duração se a resposta trouxer, senão dura do buffer ~ heurística; v1 pode logar duração da resposta do Whisper `verbose_json` se pedida, ou 0). `logAiUsage({companyId, feature:"audio_transcription", provider:"openai", model:"whisper-1", audioSeconds})`.
  - Retorna o texto transcrito; **fail-safe: qualquer erro (download/whisper) → log + retorna null** (a conversa segue só com texto).
- [ ] Testes (mockar evolution.getMediaBase64, fetch do OpenAI, getOpenaiKey, logAiUsage): sucesso retorna texto + loga audioSeconds; sem key → null sem chamar OpenAI; erro de download → null; erro do Whisper → null. TDD. Commit.

## Task D7: lead-qualifier model parametrizável

**Files:** `src/lib/ai/lead-qualifier.ts` (+test).

- [ ] `qualifyConversationText(conversationText, stages, model: string = LEAD_QUALIFIER_MODEL)` — usa o `model` recebido no `messages.create`. Default mantém compat. Atualizar testes p/ assertar que o model passado é usado. Commit.

## Task D8: orquestrador transcreve + usa modelo configurado

**Files:** `src/services/conversation-qualifier.service.ts` (+test).

- [ ] ANTES de `buildConversationText`: para cada msg `type==="audio" && !text`, chamar `transcribeAudio(companyId, instanceName, evolutionId)`; se retornar texto, usar no contexto (preencher localmente — NÃO precisa persistir, mas pode persistir via update opcional). Precisa do `instanceName` (derivar de `instanceNameForCompany(companyId)` de `whatsapp-instance.ts`) e do `evolutionId` (já está em cada msg — adicionar ao `select` do findUnique).
- [ ] Buscar `getAiConfig()` p/ o `qualifierModel`; passar a `qualifyConversationText(text, stages, cfg.qualifierModel)`.
- [ ] Fail-safe: áudio que não transcreve é ignorado (conversa qualifica só com o texto disponível); se não sobra texto algum → marca analyzedAt sem lead (no_text, como hoje).
- [ ] Testes: conversa com áudio → transcreve e inclui no contexto; transcrição null → ignora aquele áudio; usa o qualifierModel da config. Atualizar mocks. TDD. Commit.

## Task D9: rotas admin

**Files:** as 3 rotas admin (+testes).

- [ ] `PUT /api/admin/ai-config`: aceita `qualifierModel` (allowlist) + `openaiKey`. GET retorna `qualifierModel` + `hasOpenaiKey`.
- [ ] `PATCH /api/admin/companies/[id]/ai-settings`: aceita `markupPercentOverride` (number | null; null limpa o override).
- [ ] `GET /api/admin/companies/[id]/ai-usage`: usar `getEffectiveMarkup(companyId)`; devolver `{ usage, daily, costBrlReal, markupPercent, priceBrl, lucroBrl }` onde costBrlReal=usdToBrl(totalCostUsd,rate), priceBrl=priceForCompany(totalCostUsd,rate,markup), lucroBrl=priceBrl-costBrlReal. (admin vê tudo.)
- [ ] Testes: allowlist do modelo; override gravado/limpo; ai-usage calcula os 4 números. Commit cada.

## Task D10: rota ótica ai-usage — R$ com margem (REVISA C3)

**Files:** `src/app/api/company/ai-usage/route.ts` (+test).

- [ ] Mudar a resposta: além de tokens, devolver `priceBrl` = `priceForCompany(usage.totalCostUsd, cfg.usdBrlRate, getEffectiveMarkup(companyId))` e `dailyBrl` por dia (mesma fórmula). **NUNCA** devolver `totalCostUsd`, `costUsd`, `markupPercent`, nem o custo real.
- [ ] **Teste crítico (asserção recursiva ajustada):** o body PODE conter "brl"/"R$" agora (a ótica vê R$), mas **NÃO** pode conter o custo real nem o percentual de margem. Assertar: resposta tem `priceBrl`; resposta NÃO tem chave `costUsd`/`totalCostUsd`/`markupPercent`/`markupPercentOverride`/`lucro`. (Verificar por chave, não por regex de "brl".)
- [ ] Manter créditos se quiser (opcional) — mas o foco vira R$. Commit.

## Task D11: UIs

**Files:** as 3 telas.

- [ ] **admin/configuracoes/ia** (`ia-client.tsx`): + `<select>` qualifierModel (Haiku/Sonnet/Opus, labels amigáveis) + campo password **OpenAI API key** (write-only, placeholder se hasOpenaiKey). PUT inclui ambos.
- [ ] **company-ai-panel.tsx** (admin, por ótica): + campo **Margem override (%)** (number, vazio=usa global) → PATCH markupPercentOverride. Mostrar os 4 números (custo real R$, margem %, preço R$, lucro R$).
- [ ] **dashboard/configuracoes/ia/page.tsx** (ótica): trocar medidor de créditos por **"Você usou X tokens — R$ Y este mês"** (priceBrl). Gráfico diário em R$. NUNCA mostrar custo/margem.
- [ ] Typecheck. Commit cada.

## Task D12: verificação final

- [ ] Suíte dos arquivos novos/alterados + suíte completa + tsc 0 + migration aditiva (grep sem DROP) + build (TMPDIR=/Users/matheusreboucas/.cache/claude-tmp).

---

## Segurança / cuidados

- **Ótica nunca vê custo real nem margem:** rota `/api/company/ai-usage` devolve só `priceBrl` (já com margem). Teste por-chave garante ausência de `costUsd`/`markupPercent`. As telas da ótica não recebem esses campos.
- **OpenAI key cifrada** (mesmo cipher da Anthropic), write-only, fallback env.
- **Áudio fail-safe:** download/Whisper falho nunca trava a qualificação (cai pro texto).
- **Margem negativa (subsídio):** `priceForCompany` faz clamp >= 0 (nunca preço negativo).
- **getEffectiveMarkup fail-safe:** erro → 0 (não cobra a mais por flake de banco).

## Notas de deploy

1. **2 envs novas na Vercel:** `OPENAI_API_KEY` (ou cadastrar via tela) + a `ENCRYPTION_KEY` do C2 (se ainda não setada).
2. `migrate status` → `migrate deploy` (3 colunas aditivas).
3. Idealmente deployar C2+C3+D juntos (a tela da ótica muda de créditos→R$).
4. Super admin: cadastra OpenAI key, escolhe modelo (Haiku default), define margem global + overrides por ótica.
5. Áudio: a Evolution precisa ter a mensagem no store (transcreve logo após receber — o cron diário/botão cobrem isso).

## Fora de escopo (v2)
- Conversão de formato de áudio (Whisper aceita OGG direto).
- Faturamento/cobrança automática do R$ (a ótica só VÊ o valor; cobrança é processo à parte).
- Câmbio dinâmico (USD_BRL_RATE editável no super admin já cobre).
- Cota mensal em R$ (a cota segue em tokens).
