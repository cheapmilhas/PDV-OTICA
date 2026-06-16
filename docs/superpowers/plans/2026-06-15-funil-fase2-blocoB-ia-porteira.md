# Funil Fase 2 — Bloco B' v1 (IA Porteira: qualifica conversa → cria lead) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Claude ler uma conversa de WhatsApp 1:1 (texto) já guardada e decidir se vira lead — criando um `Lead` qualificado (etapa + interesse) atribuído a um usuário-robô da ótica, ou marcando a conversa como analisada sem virar lead. Gatilho: cron diário + botão manual. Usa o guard e a medição de IA do Bloco C1.

**Architecture:** O B' v1 NÃO trata áudio/imagem (só texto — `type=text`), descarta conversas de grupo (`@g.us`) por heurística (novo campo `isGroup`), e ignora o backlog histórico. Um serviço `conversation-qualifier` monta o contexto cronológico da conversa, chama `assertAiAllowed` (C1), chama o Claude (`claude-sonnet-4-6`) com um prompt estruturado que retorna JSON, registra tokens via `logAiUsage` (C1), e — se `isLead` — chama o `createLead` da Fase 1 com um usuário-robô (`ATENDENTE`) da empresa. Dispara por um cron diário (varre conversas 1:1 não-analisadas com mensagem nova) e por um botão manual por conversa.

**Tech Stack:** Next.js (App Router) · Prisma 5.22 · TypeScript · Vitest · `@anthropic-ai/sdk` (já no projeto) · JWT/CRON_SECRET (já no projeto).

**Spec:** `docs/superpowers/specs/2026-06-15-funil-fase2-ia-whatsapp-design.md` (seção 5 — Bloco B') + decisões pós-dados-reais (ver abaixo).

---

## Decisões fixas (dono, 2026-06-15, após inspecionar dados reais de prod)

Os dados reais do inbox (48 conversas / 812 msgs da ótica Atacadão) mostraram que o número conectado recebe **muito grupo/conversa pessoal** (revenda de iPhone, jogos), não só atendimento. Isso forçou:

1. **Só texto no v1.** Áudio (35) e imagem (119) ficam para um 2º corte (Whisper exige download via Evolution + `OPENAI_API_KEY` nova). O B' v1 só qualifica conversas cujo conteúdo textual existe.
2. **Descartar grupos antes da IA.** Conversa de grupo (`remoteJid` termina em `@g.us`) NUNCA vai para a IA. Como o parser do A' descartou o sufixo, **adicionamos `isGroup` ao schema** (Task 1) e o parser passa a setá-lo (Task 2).
3. **Ignorar o backlog.** As conversas que já existem no deploy do B' são marcadas como analisadas (`analyzedAt = agora`) SEM qualificar — não gastam IA no ruído histórico (Task 8, script cirúrgico). Só conversas com mensagem nova **depois** do deploy passam pela IA.
4. **Usuário-robô por empresa.** `createLead` exige um `userId` (vendedor). A IA não tem login → criar/reusar um `User` role `ATENDENTE` (`ia-bot@<companyId>.vis.local`) por empresa como `sellerUserId` (Task 3).
5. **Gatilho = cron próprio + botão manual.** Conta Vercel é Pro (11 crons já no `vercel.json`, deploy do C1 passou). Add 12º cron `/api/cron/whatsapp-qualify` (diário) + rota manual `POST /api/whatsapp/conversations/[id]/qualify` (Tasks 6 e 7).
6. **Modelo Claude `claude-sonnet-4-6`** (NÃO o `claude-sonnet-4-20250514` do OCR, deprecado). Feature de medição = `lead_qualification`.

---

## Convenções verificadas no código (seguir à risca)

- **rtk proxy** quebra comandos: tests `node node_modules/vitest/vitest.mjs run <file>`, typecheck `node node_modules/typescript/bin/tsc --noEmit`, prisma `node node_modules/prisma/build/index.js <cmd>`, commit `git commit --no-verify`. Nunca bare `prisma`/`vitest`/`tsc`/`npx`/`curl` (curl é interceptado pelo rtk → usar node fetch quando precisar de HTTP).
- **Sem banco local:** migration via `migrate diff` (HEAD vs schema), NÃO aplicada; `migrate deploy` no deploy.
- **createLead** (`src/services/lead.service.ts:19`): `createLead(data: CreateLeadDTO, companyId: string, userId: string, branchId: string | null)`. `CreateLeadDTO` (`src/lib/validations/lead.schema.ts:4`): `{ name (obrigatório, min 1), phone?, email?, interest?, source? (enum LeadFunnelSource), stageId? (ausente → 1ª etapa por order asc), sellerUserId?, estimatedValue?, customerId?, quoteId?, notes? }`. Dedupe por telefone **NÃO lança** — cria e retorna `{ ...lead, duplicateWarning: boolean }`. `source` tem `WHATSAPP` (`LeadFunnelSource` schema:4002).
- **LeadStage** (`src/services/lead-stage.service.ts:26`): `listStages(companyId)` → array por `order asc`. Default "Novo" = `order 0`. Sem `isDefault`. `isWon`/`isLost` marcam etapas finais.
- **Webhook** (`src/app/api/webhooks/evolution/route.ts:193`): `case "messages.upsert"` JÁ existe (inbox + opt-out). `conn` resolvido por `instanceName`. `EvolutionWebhookPayload` (route.ts:32) tipa só conexão/texto — o B' v1 NÃO mexe no webhook (a qualificação é assíncrona via cron/botão, não no webhook).
- **Cron** (`src/app/api/cron/invoice-reminders/route.ts:19`): `GET`, valida `authHeader === \`Bearer ${process.env.CRON_SECRET}\``, fail-closed (401 se env vazio ou header errado). `vercel.json` na raiz tem o array `crons`.
- **Claude SDK** (`src/app/api/ocr/prescription/route.ts`): `const anthropic = new Anthropic()`; `await anthropic.messages.create({ model, max_tokens, messages: [{ role:"user", content:[{type:"text", text}] }] })`; `response.usage.{input_tokens, output_tokens, cache_read_input_tokens}`; `response.content.find(b => b.type === "text")` → `.text`; parse JSON limpando ```` ```json ````.
- **C1 (já em prod):** `assertAiAllowed(companyId): Promise<void>` (`src/lib/ai-guard.ts`, lança `forbiddenError`/`businessRuleError` se bloqueado; fail-safe em infra). `logAiUsage(input: LogAiUsageInput): Promise<void>` (`src/services/ai-usage.service.ts`, fail-safe). `LogAiUsageInput = { companyId, feature, provider, model, inputTokens?, outputTokens?, cacheTokens?, audioSeconds? }`.
- **instanceName:** `instanceNameForCompany(companyId)` (`src/lib/whatsapp-instance.ts`) → `vis_${companyId}`.
- **Erros tipados** (`src/lib/error-handler.ts`): `forbiddenError`(403), `businessRuleError`(400), `notFoundError`(404), `unauthorizedError`(401), `handleApiError`.
- **Service/teste:** funções async exportadas, `import { prisma } from "@/lib/prisma"`, `companyId` no WHERE, `vi.mock("@/lib/prisma", ...)`, `beforeEach(() => vi.clearAllMocks())`, logger `logger.child({...})`.
- **`new Date()`** OK em código de app.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `prisma/schema.prisma` | `+ isGroup Boolean @default(false)` em `WhatsappConversation` | Modificar |
| `prisma/migrations/<ts>_wa_conversation_is_group/` | migration aditiva | Criar (via diff) |
| `src/lib/validations/whatsapp-inbound.ts` | parser detecta `@g.us` → `isGroup` no `InboundMessage` | Modificar |
| `src/services/whatsapp-message.service.ts` | `persistInboundMessage` grava `isGroup` na conversa | Modificar |
| `src/services/ai-seller-user.service.ts` | `getOrCreateAiSellerUser(companyId)` (User-robô ATENDENTE) | Criar |
| `src/lib/ai/lead-qualifier.ts` | prompt + chamada Claude + parse JSON → `QualificationResult` | Criar |
| `src/services/conversation-qualifier.service.ts` | `qualifyConversation(id)` + `qualifyPendingConversations(companyId?)` (orquestra: filtro grupo, contexto, IA, cria lead / marca analyzedAt) | Criar |
| `src/app/api/cron/whatsapp-qualify/route.ts` | cron diário (auth CRON_SECRET) → `qualifyPendingConversations()` | Criar |
| `src/app/api/whatsapp/conversations/[id]/qualify/route.ts` | botão manual (auth sessão) → `qualifyConversation(id)` | Criar |
| `vercel.json` | + 12º cron `/api/cron/whatsapp-qualify` | Modificar |
| `prisma/seeds/mark-existing-conversations-analyzed.ts` | script cirúrgico: backlog → `analyzedAt=agora` (NÃO deleteMany) | Criar |
| (+ testes para cada módulo novo/alterado) | | Criar |

> **Ordem:** T1 (schema isGroup) → T2 (parser) → T3 (user-robô) → T4 (qualifier IA, puro/mockável) → T5 (orquestrador) → T6 (cron) → T7 (botão) → T8 (backfill script) → T9 (verificação). T4 não depende de T1-3 (é só o wrapper do Claude); T5 amarra tudo.

---

## Task 1: Schema — `isGroup` em WhatsappConversation

**Files:**
- Modify: `prisma/schema.prisma` (model `WhatsappConversation`)
- Create (via diff): `prisma/migrations/<ts>_wa_conversation_is_group/migration.sql`

- [ ] **Step 1: Adicionar o campo**

No `model WhatsappConversation`, após `contactName String?`:

```prisma
  isGroup       Boolean   @default(false)  // remoteJid terminava em @g.us; grupos NÃO viram lead
```

- [ ] **Step 2: Gerar client (valida schema)**

Run: `node node_modules/prisma/build/index.js generate`
Expected: "Generated Prisma Client".

- [ ] **Step 3: Gerar migration aditiva (sem aplicar)**

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-base-isgroup.prisma
TS=$(node -e "const d=new Date();const p=n=>String(n).padStart(2,'0');console.log(`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`)")
MIGDIR="prisma/migrations/${TS}_wa_conversation_is_group"
mkdir -p "$MIGDIR"
node node_modules/prisma/build/index.js migrate diff \
  --from-schema-datamodel /tmp/schema-base-isgroup.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$MIGDIR/migration.sql"
cat "$MIGDIR/migration.sql"
```

Expected: SÓ `ALTER TABLE "WhatsappConversation" ADD COLUMN "isGroup" BOOLEAN NOT NULL DEFAULT false;`. NENHUM DROP. Se houver outra coisa, PARAR e reportar.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit --no-verify -m "feat(wa-funil): isGroup em WhatsappConversation (migration aditiva)"
```

---

## Task 2: Parser — detectar grupo (`@g.us`)

**Files:**
- Modify: `src/lib/validations/whatsapp-inbound.ts`
- Modify: `src/lib/validations/whatsapp-inbound.test.ts`

> O parser hoje faz `remoteJid.split("@")[0]` e descarta o sufixo. Adicionamos `isGroup` ao `InboundMessage` lendo o sufixo ANTES do split.

- [ ] **Step 1: Adicionar o teste primeiro**

Adicionar ao `describe("parseInboundMessage", ...)` existente:

```typescript
it("marca isGroup=true quando remoteJid termina em @g.us", () => {
  const r = parseInboundMessage({
    key: { id: "G1", remoteJid: "120363012345678901@g.us", fromMe: false },
    message: { conversation: "oferta no grupo" },
    messageTimestamp: 1750000000,
  });
  expect(r?.isGroup).toBe(true);
});

it("marca isGroup=false para conversa 1:1 (@s.whatsapp.net)", () => {
  const r = parseInboundMessage({
    key: { id: "P1", remoteJid: "5585999998888@s.whatsapp.net", fromMe: false },
    message: { conversation: "quanto custa um óculos?" },
    messageTimestamp: 1750000000,
  });
  expect(r?.isGroup).toBe(false);
});
```

> Os testes existentes assertam `r` com `toEqual({...})` (objeto completo). Adicionar `isGroup: false` (ou `true`) aos objetos esperados desses testes existentes para não quebrá-los. Verificar cada `toEqual` no arquivo e acrescentar o campo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/validations/whatsapp-inbound.test.ts`
Expected: FAIL (campo `isGroup` não existe).

- [ ] **Step 3: Implementar**

No `InboundMessage` interface, adicionar:

```typescript
  isGroup: boolean;
```

Na função, ANTES do `const contactNumber = String(key.remoteJid).split("@")[0];`:

```typescript
  const isGroup = String(key.remoteJid).endsWith("@g.us");
```

E no objeto retornado, adicionar `isGroup,` (junto de `contactNumber`).

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/validations/whatsapp-inbound.test.ts`
Expected: PASS (todos, incluindo os antigos ajustados).

- [ ] **Step 5: persistInboundMessage grava isGroup**

Em `src/services/whatsapp-message.service.ts`, no `upsert` da conversa, adicionar `isGroup` ao `create` (e opcionalmente ao `update`, para corrigir conversas já existentes quando chega msg nova):

```typescript
    create: {
      companyId,
      contactNumber: msg.contactNumber,
      contactName: msg.contactName,
      isGroup: msg.isGroup,
      lastMessageAt: msg.receivedAt,
    },
```

> Adicionar ao teste do service (`whatsapp-message.service.test.ts`) uma asserção de que `upsertArg.create.isGroup` reflete `base.isGroup`. Atualizar o `base: InboundMessage` do teste para incluir `isGroup: false`.

- [ ] **Step 6: Rodar testes do service + parser**

Run: `node node_modules/vitest/vitest.mjs run src/lib/validations/whatsapp-inbound.test.ts src/services/whatsapp-message.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/whatsapp-inbound.ts src/lib/validations/whatsapp-inbound.test.ts src/services/whatsapp-message.service.ts src/services/whatsapp-message.service.test.ts
git commit --no-verify -m "feat(wa-funil): parser detecta grupo (@g.us) e persiste isGroup"
```

---

## Task 3: Usuário-robô da IA por empresa

**Files:**
- Create: `src/services/ai-seller-user.service.ts`
- Test: `src/services/ai-seller-user.service.test.ts`

> `createLead` exige um `userId`. A IA não tem login. `getOrCreateAiSellerUser(companyId)` retorna o id de um `User` role `ATENDENTE` dedicado (`ia-bot@<companyId>.vis.local`), criando-o na primeira vez. Idempotente. `email` é único por empresa (índice case-insensitive) — usar o companyId no local-part garante unicidade.

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: vi.fn(), create: vi.fn() } },
}));
import { prisma } from "@/lib/prisma";
import { getOrCreateAiSellerUser } from "./ai-seller-user.service";

beforeEach(() => vi.clearAllMocks());

describe("getOrCreateAiSellerUser", () => {
  it("retorna o user-robô existente sem criar de novo", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ id: "u_bot" });
    const id = await getOrCreateAiSellerUser("co1");
    expect(id).toBe("u_bot");
    expect(prisma.user.create).not.toHaveBeenCalled();
    const where = (prisma.user.findFirst as any).mock.calls[0][0].where;
    expect(where.companyId).toBe("co1");
  });

  it("cria o user-robô ATENDENTE quando não existe", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({ id: "u_new" });
    const id = await getOrCreateAiSellerUser("co1");
    expect(id).toBe("u_new");
    const data = (prisma.user.create as any).mock.calls[0][0].data;
    expect(data.companyId).toBe("co1");
    expect(data.role).toBe("ATENDENTE");
    expect(data.active).toBe(true);
    expect(data.email).toContain("co1"); // unicidade por empresa
    expect(typeof data.passwordHash).toBe("string");
    expect(data.passwordHash.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/services/ai-seller-user.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const AI_BOT_EMAIL = (companyId: string) => `ia-bot@${companyId}.vis.local`;
const AI_BOT_NAME = "IA (Funil WhatsApp)";

/**
 * Retorna o id de um User-robô (role ATENDENTE) dedicado da empresa, criando-o
 * se não existir. Usado como sellerUserId dos leads que a IA cria — não há
 * vendedor logado. Idempotente por (companyId, email).
 *
 * O passwordHash é aleatório e descartado: este usuário NÃO faz login
 * (sem rota de auth que aceite o domínio .vis.local; serve só de "dono" do lead).
 */
export async function getOrCreateAiSellerUser(companyId: string): Promise<string> {
  const email = AI_BOT_EMAIL(companyId);
  const existing = await prisma.user.findFirst({
    where: { companyId, email },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      companyId,
      name: AI_BOT_NAME,
      email,
      // Hash aleatório e inutilizável: o robô nunca autentica.
      passwordHash: randomBytes(32).toString("hex"),
      role: "ATENDENTE",
      active: true,
    },
    select: { id: true },
  });
  return created.id;
}
```

> Verificar no schema/teste que `User` aceita esses campos exatos (name, email, passwordHash, role, active, companyId) — confirmado no relatório (schema:299). Se `role` for enum tipado, `"ATENDENTE"` é membro válido (`UserRole`). Se o `create` exigir mais campos NOT NULL sem default, adicioná-los (conferir o model real ao implementar).

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/services/ai-seller-user.service.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add src/services/ai-seller-user.service.ts src/services/ai-seller-user.service.test.ts
git commit --no-verify -m "feat(wa-funil): usuário-robô ATENDENTE por empresa p/ atribuir leads da IA"
```

---

## Task 4: Qualificador de IA (prompt + Claude + parse)

**Files:**
- Create: `src/lib/ai/lead-qualifier.ts`
- Test: `src/lib/ai/lead-qualifier.test.ts`

> Wrapper puro do Claude: recebe o texto da conversa + as etapas da empresa, chama `claude-sonnet-4-6`, parseia o JSON e retorna `QualificationResult` + o `usage` (tokens) para quem chamar logar. NÃO chama prisma, NÃO chama `logAiUsage` (quem orquestra faz isso — mantém este módulo testável mockando só o SDK).

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => createMock(...a) };
  },
}));

import { qualifyConversationText } from "./lead-qualifier";

beforeEach(() => vi.clearAllMocks());

function mockClaudeJson(obj: unknown, usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 }) {
  createMock.mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(obj) }],
    usage,
  });
}

describe("qualifyConversationText", () => {
  it("retorna isLead=true + interesse + stageId mapeado + usage", async () => {
    mockClaudeJson({ isLead: true, reason: "quer óculos de grau", interest: "grau", suggestedStageName: "Novo", confidence: 0.9 });
    const stages = [{ id: "s_novo", name: "Novo" }, { id: "s_atend", name: "Em atendimento" }];
    const r = await qualifyConversationText("Cliente: quanto custa um óculos de grau?", stages);
    expect(r.isLead).toBe(true);
    expect(r.interest).toBe("grau");
    expect(r.stageId).toBe("s_novo");
    expect(r.usage.inputTokens).toBe(100);
    expect(r.usage.outputTokens).toBe(20);
    const callArg = createMock.mock.calls[0][0];
    expect(callArg.model).toBe("claude-sonnet-4-6");
  });

  it("isLead=false → stageId null", async () => {
    mockClaudeJson({ isLead: false, reason: "só perguntou horário", confidence: 0.8 });
    const r = await qualifyConversationText("que horas vocês abrem?", [{ id: "s_novo", name: "Novo" }]);
    expect(r.isLead).toBe(false);
    expect(r.stageId).toBeNull();
  });

  it("stage sugerida inexistente → cai na primeira etapa", async () => {
    mockClaudeJson({ isLead: true, reason: "lead", suggestedStageName: "Inexistente", confidence: 0.7 });
    const stages = [{ id: "s_novo", name: "Novo" }, { id: "s2", name: "Em atendimento" }];
    const r = await qualifyConversationText("quero comprar lente de contato", stages);
    expect(r.stageId).toBe("s_novo"); // fallback = primeira
  });

  it("JSON inválido do modelo → isLead=false defensivo (não lança)", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "não é json" }], usage: { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0 } });
    const r = await qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }]);
    expect(r.isLead).toBe(false);
    expect(r.parseError).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/ai/lead-qualifier.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
import Anthropic from "@anthropic-ai/sdk";

export const LEAD_QUALIFIER_MODEL = "claude-sonnet-4-6";

export interface QualifierStage {
  id: string;
  name: string;
}

export interface QualificationResult {
  isLead: boolean;
  reason: string;
  interest: string | null;
  /** id da etapa do funil (mapeado a partir do nome sugerido; null se !isLead) */
  stageId: string | null;
  confidence: number;
  parseError: boolean;
  usage: { inputTokens: number; outputTokens: number; cacheTokens: number };
}

const SYSTEM_PROMPT = `Você é o porteiro do funil de vendas de uma ótica. Lê uma conversa de WhatsApp e decide se ela é uma OPORTUNIDADE DE VENDA (lead) para a ótica.

NÃO são lead: grupos de revenda, propaganda de terceiros, conversa pessoal, pedido de horário/endereço, reclamação de garantia já vendida, fornecedor, cobrança, engano.
SÃO lead: interesse em comprar óculos de grau, óculos de sol, lente de contato, exame de vista, conserto/ajuste com intenção de compra, orçamento.

Responda SOMENTE com um JSON válido (sem markdown, sem texto extra):
{
  "isLead": true|false,
  "reason": "frase curta explicando",
  "interest": "grau" | "sol" | "lente_contato" | "exame" | "conserto" | "outro" | null,
  "suggestedStageName": "<nome EXATO de uma das etapas fornecidas>" | null,
  "confidence": 0.0-1.0
}`;

const anthropic = new Anthropic();

/**
 * Qualifica o texto consolidado de uma conversa. Puro: só chama o Claude e
 * parseia. Quem orquestra registra os tokens (usage) via logAiUsage.
 * Defensivo: JSON inválido → isLead=false (não cria lead-lixo, não lança).
 */
export async function qualifyConversationText(
  conversationText: string,
  stages: QualifierStage[]
): Promise<QualificationResult> {
  const stageNames = stages.map((s) => s.name).join(", ");
  const userPrompt = `Etapas do funil desta ótica: ${stageNames}\n\n--- CONVERSA ---\n${conversationText}\n--- FIM ---`;

  const response = await anthropic.messages.create({
    model: LEAD_QUALIFIER_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
  });

  const usage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheTokens: response.usage.cache_read_input_tokens ?? 0,
  };

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

  let parsed: Record<string, unknown> | null = null;
  try {
    const json = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(json);
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed.isLead !== "boolean") {
    return { isLead: false, reason: "resposta inválida da IA", interest: null, stageId: null, confidence: 0, parseError: true, usage };
  }

  const isLead = parsed.isLead === true;
  let stageId: string | null = null;
  if (isLead) {
    const suggested = typeof parsed.suggestedStageName === "string" ? parsed.suggestedStageName : null;
    const match = suggested ? stages.find((s) => s.name === suggested) : null;
    stageId = match?.id ?? stages[0]?.id ?? null; // fallback = primeira etapa
  }

  return {
    isLead,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    interest: typeof parsed.interest === "string" ? parsed.interest : null,
    stageId,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    parseError: false,
    usage,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/ai/lead-qualifier.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/lead-qualifier.ts src/lib/ai/lead-qualifier.test.ts
git commit --no-verify -m "feat(wa-funil): lead-qualifier (Claude sonnet-4-6 decide é-lead + qualifica)"
```

---

## Task 5: Orquestrador — qualifyConversation + qualifyPendingConversations

**Files:**
- Create: `src/services/conversation-qualifier.service.ts`
- Test: `src/services/conversation-qualifier.service.test.ts`

> Amarra tudo. `qualifyConversation(conversationId)`: carrega a conversa + mensagens; se grupo OU já analisada OU sem texto → marca `analyzedAt` e retorna sem IA; senão `assertAiAllowed(companyId)` → monta contexto → `qualifyConversationText` → `logAiUsage` → se `isLead` cria lead (com user-robô) e seta `conversation.leadId`+`analyzedAt`; se não, só `analyzedAt`. Fail-safe: erro de IA deixa `analyzedAt=null` (re-tenta). `qualifyPendingConversations(companyId?)`: varre conversas **1:1, não-analisadas, com texto**, e chama `qualifyConversation` em cada.

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConversation: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));

const assertAiAllowedMock = vi.fn();
vi.mock("@/lib/ai-guard", () => ({ assertAiAllowed: (...a: unknown[]) => assertAiAllowedMock(...a) }));
const logAiUsageMock = vi.fn();
vi.mock("@/services/ai-usage.service", () => ({ logAiUsage: (...a: unknown[]) => logAiUsageMock(...a) }));
const qualifyTextMock = vi.fn();
vi.mock("@/lib/ai/lead-qualifier", () => ({ qualifyConversationText: (...a: unknown[]) => qualifyTextMock(...a), LEAD_QUALIFIER_MODEL: "claude-sonnet-4-6" }));
const listStagesMock = vi.fn();
vi.mock("@/services/lead-stage.service", () => ({ listStages: (...a: unknown[]) => listStagesMock(...a) }));
const createLeadMock = vi.fn();
vi.mock("@/services/lead.service", () => ({ createLead: (...a: unknown[]) => createLeadMock(...a) }));
const getBotMock = vi.fn();
vi.mock("@/services/ai-seller-user.service", () => ({ getOrCreateAiSellerUser: (...a: unknown[]) => getBotMock(...a) }));

import { prisma } from "@/lib/prisma";
import { qualifyConversation } from "./conversation-qualifier.service";

const convBase = {
  id: "c1", companyId: "co1", isGroup: false, analyzedAt: null, leadId: null,
  contactNumber: "5585999", contactName: "Maria",
  messages: [
    { direction: "inbound", type: "text", text: "quanto custa óculos de grau?", receivedAt: new Date("2026-06-15T10:00:00Z") },
    { direction: "inbound", type: "text", text: "tenho receita", receivedAt: new Date("2026-06-15T10:01:00Z") },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  listStagesMock.mockResolvedValue([{ id: "s_novo", name: "Novo" }]);
  getBotMock.mockResolvedValue("u_bot");
  assertAiAllowedMock.mockResolvedValue(undefined);
});

describe("qualifyConversation", () => {
  it("grupo → marca analyzedAt e NÃO chama IA", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...convBase, isGroup: true });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("group");
    expect(qualifyTextMock).not.toHaveBeenCalled();
    expect(prisma.whatsappConversation.update).toHaveBeenCalled(); // analyzedAt setado
  });

  it("já analisada → no-op", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...convBase, analyzedAt: new Date() });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("already_analyzed");
    expect(qualifyTextMock).not.toHaveBeenCalled();
  });

  it("sem texto inbound → marca analyzedAt e pula IA", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...convBase, messages: [{ direction: "inbound", type: "audio", text: null, receivedAt: new Date() }] });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("no_text");
    expect(qualifyTextMock).not.toHaveBeenCalled();
  });

  it("isLead=true → cria lead com user-robô + seta leadId/analyzedAt + loga tokens", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...convBase });
    qualifyTextMock.mockResolvedValue({ isLead: true, reason: "grau", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 0 } });
    // createLead retorna { lead, duplicateWarning } — NÃO o lead achatado.
    createLeadMock.mockResolvedValue({ lead: { id: "lead1" }, duplicateWarning: false });

    const r = await qualifyConversation("c1");

    expect(assertAiAllowedMock).toHaveBeenCalledWith("co1");
    expect(getBotMock).toHaveBeenCalledWith("co1");
    const [data, companyId, userId, branchId] = createLeadMock.mock.calls[0];
    expect(data.name).toBe("Maria");
    expect(data.phone).toBe("5585999");
    expect(data.source).toBe("WHATSAPP");
    expect(data.stageId).toBe("s_novo");
    expect(companyId).toBe("co1");
    expect(userId).toBe("u_bot");
    expect(branchId).toBeNull();
    expect(logAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: "co1", feature: "lead_qualification", provider: "anthropic", inputTokens: 100 }));
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.leadId).toBe("lead1");
    expect(upd.data.analyzedAt).toBeInstanceOf(Date);
    expect(r.leadId).toBe("lead1");
  });

  it("isLead=false → marca analyzedAt, sem lead, mas loga tokens", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...convBase });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "horário", interest: null, stageId: null, confidence: 0.8, parseError: false, usage: { inputTokens: 50, outputTokens: 10, cacheTokens: 0 } });
    const r = await qualifyConversation("c1");
    expect(createLeadMock).not.toHaveBeenCalled();
    expect(logAiUsageMock).toHaveBeenCalled();
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.analyzedAt).toBeInstanceOf(Date);
    expect(upd.data.leadId ?? null).toBeNull();
    expect(r.leadId).toBeNull();
  });

  it("IA bloqueada (assertAiAllowed lança) → NÃO marca analyzedAt (re-tenta depois), propaga", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...convBase });
    assertAiAllowedMock.mockRejectedValue(Object.assign(new Error("bloqueado"), { statusCode: 403 }));
    await expect(qualifyConversation("c1")).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.whatsappConversation.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/services/conversation-qualifier.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { assertAiAllowed } from "@/lib/ai-guard";
import { logAiUsage } from "@/services/ai-usage.service";
import { qualifyConversationText, LEAD_QUALIFIER_MODEL } from "@/lib/ai/lead-qualifier";
import { listStages } from "@/services/lead-stage.service";
import { createLead } from "@/services/lead.service";
import { getOrCreateAiSellerUser } from "@/services/ai-seller-user.service";

const log = logger.child({ service: "conversation-qualifier" });

export interface QualifyResult {
  conversationId: string;
  skipped?: "group" | "already_analyzed" | "no_text" | "not_found";
  isLead?: boolean;
  leadId: string | null;
}

/** Consolida o texto inbound da conversa em ordem cronológica. */
function buildConversationText(messages: { direction: string; type: string; text: string | null; receivedAt: Date }[]): string {
  return messages
    .filter((m) => m.direction === "inbound" && typeof m.text === "string" && m.text.trim().length > 0)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .map((m) => m.text!.trim())
    .join("\n");
}

/**
 * Qualifica UMA conversa. Grupo / já analisada / sem texto → marca analyzedAt e pula IA.
 * Senão: assertAiAllowed → IA → logAiUsage → cria lead (se isLead) → analyzedAt+leadId.
 * Fail-safe: se assertAiAllowed ou a IA lançar, NÃO marca analyzedAt (re-tenta depois).
 */
export async function qualifyConversation(conversationId: string): Promise<QualifyResult> {
  const conv = await prisma.whatsappConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, companyId: true, isGroup: true, analyzedAt: true, leadId: true,
      contactNumber: true, contactName: true,
      messages: { select: { direction: true, type: true, text: true, receivedAt: true } },
    },
  });
  if (!conv) return { conversationId, skipped: "not_found", leadId: null };

  const markAnalyzed = (leadId: string | null) =>
    prisma.whatsappConversation.update({ where: { id: conv.id }, data: { analyzedAt: new Date(), ...(leadId ? { leadId } : {}) } });

  if (conv.analyzedAt) return { conversationId, skipped: "already_analyzed", leadId: conv.leadId };
  if (conv.isGroup) { await markAnalyzed(null); return { conversationId, skipped: "group", leadId: null }; }

  const text = buildConversationText(conv.messages);
  if (!text) { await markAnalyzed(null); return { conversationId, skipped: "no_text", leadId: null }; }

  // Porteira de IA (C1): lança se indisponível/desligada/cota — NÃO marcamos analyzedAt aqui.
  await assertAiAllowed(conv.companyId);

  const stages = await listStages(conv.companyId);
  const result = await qualifyConversationText(text, stages.map((s) => ({ id: s.id, name: s.name })));

  // Registra tokens SEMPRE (lead ou não), feature lead_qualification.
  await logAiUsage({
    companyId: conv.companyId,
    feature: "lead_qualification",
    provider: "anthropic",
    model: LEAD_QUALIFIER_MODEL,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cacheTokens: result.usage.cacheTokens,
  });

  if (!result.isLead) {
    await markAnalyzed(null);
    return { conversationId, isLead: false, leadId: null };
  }

  const sellerUserId = await getOrCreateAiSellerUser(conv.companyId);
  // createLead retorna { lead, duplicateWarning } — destruturar p/ pegar o lead real.
  const { lead } = await createLead(
    {
      name: conv.contactName ?? conv.contactNumber,
      phone: conv.contactNumber,
      source: "WHATSAPP",
      interest: result.interest ?? undefined,
      stageId: result.stageId ?? undefined,
      notes: `Lead criado pela IA do funil. Motivo: ${result.reason}`,
    },
    conv.companyId,
    sellerUserId,
    null
  );
  await markAnalyzed(lead.id);
  log.info("lead criado pela IA", { conversationId, leadId: lead.id, companyId: conv.companyId });
  return { conversationId, isLead: true, leadId: lead.id };
}

/**
 * Varre as conversas pendentes (1:1, não-analisadas, com mensagem) e qualifica cada uma.
 * Erro numa conversa não interrompe as outras. Se companyId vier, restringe à empresa.
 */
export async function qualifyPendingConversations(companyId?: string): Promise<{ processed: number; leads: number; errors: number }> {
  const pending = await prisma.whatsappConversation.findMany({
    where: { analyzedAt: null, isGroup: false, ...(companyId ? { companyId } : {}) },
    select: { id: true },
    take: 200, // teto de segurança por execução
  });

  let leads = 0, errors = 0;
  for (const { id } of pending) {
    try {
      const r = await qualifyConversation(id);
      if (r.leadId) leads++;
    } catch (e) {
      errors++;
      log.error("falha ao qualificar conversa (segue p/ próxima)", { conversationId: id, error: e });
    }
  }
  return { processed: pending.length, leads, errors };
}
```

> Nota fail-safe: dentro de `qualifyPendingConversations`, se `assertAiAllowed` lançar (ex.: cota), o `catch` conta como erro e segue — mas como a cota é por empresa, todas as conversas daquela empresa vão falhar igual; aceitável (o cron do dia seguinte re-tenta). A conversa NÃO é marcada analisada, então não se perde.

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/services/conversation-qualifier.service.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add src/services/conversation-qualifier.service.ts src/services/conversation-qualifier.service.test.ts
git commit --no-verify -m "feat(wa-funil): orquestrador qualifyConversation + varredura (guard+IA+cria lead)"
```

---

## Task 6: Cron diário `/api/cron/whatsapp-qualify`

**Files:**
- Create: `src/app/api/cron/whatsapp-qualify/route.ts`
- Test: `src/app/api/cron/whatsapp-qualify/route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const qualifyPendingMock = vi.fn();
vi.mock("@/services/conversation-qualifier.service", () => ({ qualifyPendingConversations: (...a: unknown[]) => qualifyPendingMock(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));

import { GET } from "./route";

function req(auth?: string) {
  return new Request("https://x/api/cron/whatsapp-qualify", { headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  qualifyPendingMock.mockResolvedValue({ processed: 3, leads: 1, errors: 0 });
});

describe("GET /api/cron/whatsapp-qualify", () => {
  it("401 sem secret correto", async () => {
    const res = await GET(req("Bearer errado"));
    expect(res.status).toBe(401);
    expect(qualifyPendingMock).not.toHaveBeenCalled();
  });

  it("401 fail-closed se CRON_SECRET não setado", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(401);
  });

  it("200 + roda a varredura com secret correto", async () => {
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(200);
    expect(qualifyPendingMock).toHaveBeenCalledWith(); // sem companyId = todas
    const body = await res.json();
    expect(body.processed).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/app/api/cron/whatsapp-qualify/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** (espelha `invoice-reminders/route.ts`)

```typescript
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { qualifyPendingConversations } from "@/services/conversation-qualifier.service";

const log = logger.child({ cron: "whatsapp-qualify" });

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) log.error("CRON_SECRET não configurado — whatsapp-qualify recusado (fail-closed)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await qualifyPendingConversations();
    log.info("varredura de qualificação concluída", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    log.error("falha na varredura de qualificação", { error });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Adicionar o cron ao `vercel.json`**

No array `crons`, adicionar (horário fora dos já usados — 13h, livre):

```json
    { "path": "/api/cron/whatsapp-qualify", "schedule": "0 13 * * *" }
```

> Verificar que vira o 12º cron. Conta é Pro (11 já existiam e o deploy do C1 passou). Se por acaso o deploy reclamar de limite de crons, é sinal de Hobby → PARAR e reportar (decisão do dono era assumir Pro).

- [ ] **Step 5: Rodar e ver passar + typecheck**

Run: `node node_modules/vitest/vitest.mjs run src/app/api/cron/whatsapp-qualify/route.test.ts`
Expected: PASS (3).
Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/whatsapp-qualify/route.ts src/app/api/cron/whatsapp-qualify/route.test.ts vercel.json
git commit --no-verify -m "feat(wa-funil): cron diário whatsapp-qualify (varre conversas 1:1 pendentes)"
```

---

## Task 7: Botão manual — `POST /api/whatsapp/conversations/[id]/qualify`

**Files:**
- Create: `src/app/api/whatsapp/conversations/[id]/qualify/route.ts`
- Test: `src/app/api/whatsapp/conversations/[id]/qualify/route.test.ts`

> Rota autenticada (sessão) que dispara `qualifyConversation` para UMA conversa, com checagem de tenant (a conversa precisa ser da empresa do usuário). Reusa permissão `leads.create` ou `company.settings` — confirmar qual existe e faz sentido (a UI do funil usa `leads.*`). Sem UI nesta task (só a rota; o botão no front é um add-on posterior/opcional).

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCompanyIdMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  requirePermission: vi.fn(),
}));
const qualifyMock = vi.fn();
vi.mock("@/services/conversation-qualifier.service", () => ({ qualifyConversation: (...a: unknown[]) => qualifyMock(...a) }));
vi.mock("@/lib/prisma", () => ({ prisma: { whatsappConversation: { findUnique: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { POST } from "./route";

function ctx(id: string) { return { params: Promise.resolve({ id }) }; }
const req = () => new Request("https://x", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyIdMock.mockResolvedValue("co1");
});

describe("POST qualify [id]", () => {
  it("404 se a conversa não é da empresa do usuário", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue(null);
    const res = await POST(req(), ctx("cX"));
    expect(res.status).toBe(404);
    expect(qualifyMock).not.toHaveBeenCalled();
  });

  it("200 e qualifica quando pertence à empresa", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ id: "c1", companyId: "co1" });
    qualifyMock.mockResolvedValue({ conversationId: "c1", isLead: true, leadId: "lead1" });
    const res = await POST(req(), ctx("c1"));
    expect(res.status).toBe(200);
    expect(qualifyMock).toHaveBeenCalledWith("c1");
    const body = await res.json();
    expect(body.leadId).toBe("lead1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/app/api/whatsapp/conversations/[id]/qualify/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
import { NextResponse } from "next/server";
import { getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { qualifyConversation } from "@/services/conversation-qualifier.service";
import { handleApiError, notFoundError } from "@/lib/error-handler";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("leads.create");
    const companyId = await getCompanyId();
    const { id } = await ctx.params;

    // Tenant guard: a conversa precisa ser da empresa do usuário.
    const conv = await prisma.whatsappConversation.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!conv || conv.companyId !== companyId) {
      throw notFoundError("Conversa não encontrada");
    }

    const result = await qualifyConversation(id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

> Confirmar ao implementar: (a) a permissão correta — checar `src/lib/permissions.ts`/catálogo: existe `leads.create`? Se a granularidade for outra (ex.: `leads.write`), usar a real. (b) a assinatura de `requirePermission` (de `@/lib/auth-helpers`, re-exportada de `auth-permissions`). (c) o shape de `ctx.params` (Next 16 = Promise). Ajustar conforme o código real; manter a lógica (tenant guard + qualifyConversation).

- [ ] **Step 4: Rodar e ver passar + typecheck**

Run: `node node_modules/vitest/vitest.mjs run "src/app/api/whatsapp/conversations/[id]/qualify/route.test.ts"`
Expected: PASS (2).
Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/conversations/[id]/qualify"
git commit --no-verify -m "feat(wa-funil): rota manual de qualificação por conversa (tenant-guard)"
```

---

## Task 8: Script cirúrgico — backlog antigo vira "analisado" (não vira lead)

**Files:**
- Create: `prisma/seeds/mark-existing-conversations-analyzed.ts`

> Decisão do dono: as conversas que já existem no deploy do B' (quase tudo grupo/ruído) NÃO devem ser qualificadas pela IA. Este script marca `analyzedAt = agora` em todas as conversas com `analyzedAt IS NULL` **no momento de rodar** — para o cron não varrer o histórico. ADITIVO e idempotente (rodar de novo não afeta as já marcadas). NUNCA usa `deleteMany` (lição do projeto: seeds destrutivos apagam dados de clientes). Roda UMA vez, no deploy, após a migration.

- [ ] **Step 1: Escrever o script**

```typescript
/**
 * Marca como "analisadas" (analyzedAt = agora) todas as conversas de WhatsApp
 * que ainda não foram analisadas NO MOMENTO de rodar. Objetivo: o cron de
 * qualificação por IA (Bloco B') NÃO varrer o backlog histórico (quase tudo
 * grupo/ruído) — só conversas NOVAS, a partir daqui, passam pela IA.
 *
 * ADITIVO e idempotente. NÃO deleta nada. Rodar UMA vez no deploy do B',
 * após `migrate deploy`.
 *
 * Uso: node node_modules/tsx/dist/cli.mjs prisma/seeds/mark-existing-conversations-analyzed.ts
 * (ou o runner de seeds do projeto). Requer DATABASE_URL no ambiente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.whatsappConversation.count({ where: { analyzedAt: null } });
  const res = await prisma.whatsappConversation.updateMany({
    where: { analyzedAt: null },
    data: { analyzedAt: new Date() },
  });
  console.log(`Conversas não-analisadas antes: ${before}. Marcadas como analisadas agora: ${res.count}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

> Confirmar o runner de seeds/tsx do projeto ao implementar (olhar como `prisma/seeds/add-leads-permissions.ts` é executado — a memória menciona esse padrão cirúrgico). Se o projeto usa `tsx`, o comando acima vale; senão, adaptar.

- [ ] **Step 2: Typecheck do script**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add prisma/seeds/mark-existing-conversations-analyzed.ts
git commit --no-verify -m "chore(wa-funil): script aditivo marca backlog de conversas como analisado"
```

> **NÃO RODAR agora** (sem banco local). Roda no deploy, após `migrate deploy`. Anotado nas Notas de Deploy.

---

## Task 9: Verificação final

- [ ] **Step 1: Suíte dos arquivos do B'**

Run: `node node_modules/vitest/vitest.mjs run src/lib/validations/whatsapp-inbound.test.ts src/services/whatsapp-message.service.test.ts src/services/ai-seller-user.service.test.ts src/lib/ai/lead-qualifier.test.ts src/services/conversation-qualifier.service.test.ts src/app/api/cron/whatsapp-qualify/route.test.ts "src/app/api/whatsapp/conversations/[id]/qualify/route.test.ts"`
Expected: todos verdes.

- [ ] **Step 2: Suíte completa**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: verdes (atenção ao flake conhecido `FilterBar.test.tsx` — se for o único vermelho, rodar isolado pra confirmar verde).

- [ ] **Step 3: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 erros. (Se `.next/types` stale após mudança de schema, `rm -rf .next` e repetir.)

- [ ] **Step 4: Migration aditiva confirmada**

Run: `grep -iE "DROP|ALTER TABLE.*DROP" prisma/migrations/*_wa_conversation_is_group/migration.sql || echo "✓ aditiva"`
Expected: "✓ aditiva".

- [ ] **Step 5: Build**

Run: `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build`
Expected: "✓ Compiled successfully" (rota nova do cron + rota manual aparecem na lista).

- [ ] **Step 6: Commit final (se houver ajustes)**

```bash
git add -A && git commit --no-verify -m "chore(wa-funil): verificação final Bloco B'"
```

---

## Fora de escopo do B' v1 (NÃO implementar aqui)

- **Áudio (Whisper) e imagem** — 2º corte. Exige `OPENAI_API_KEY` + download da mídia via Evolution (o `mediaUrl` `mmg.whatsapp.net` expira e precisa da API key). Quando entrar: feature `audio_transcription` na medição (já prevista no C1).
- **UI** da caixa de conversas / botão "Analisar com IA" no front — a rota manual (Task 7) já existe; o componente React é add-on posterior.
- **Resposta automática** (Bloco D) — `LEGACY_WHATSAPP_SEND_DISABLED` segue true.
- **Telas de gestão de IA** (C2/C3) — já especificadas no Bloco C.
- **Re-análise / atualização de lead existente** — se o número já tem lead, o `createLead` cria com `duplicateWarning` (Fase 1); v1 aceita isso. Dedupe inteligente fica para depois.
- **Dependência de cota:** o guard (`assertAiAllowed`) bloqueia se `iaAvailable=false`. Como o C1 entregou tudo `false`, **a IA NÃO roda até o super admin ligar `iaAvailable`+`iaEnabled`** (telas C2/C3) ou até setar as flags manualmente. Isto é proposital — o B' só dispara para óticas liberadas.

## Notas de deploy (quando for deployar o B')

1. **`migrate status`** contra prod p/ confirmar branch = espelho de prod (lição recorrente: reconstruir sobre a `main` se ela tiver avançado, como no C1).
2. `migrate deploy` aplica `wa_conversation_is_group` (1 coluna aditiva com DEFAULT).
3. **Rodar UMA vez** o script `prisma/seeds/mark-existing-conversations-analyzed.ts` (após a migration) — marca o backlog como analisado p/ o cron não varrer histórico.
4. **Nenhuma env nova** no B' v1 (Whisper/OpenAI só no 2º corte). `CRON_SECRET` já existe (outros crons usam).
5. **Flags de IA:** o B' só roda para óticas com `iaAvailable=true && iaEnabled=true` (guard do C1). Definir essas flags (via C2/C3 ou manualmente) para a ótica-piloto antes de esperar leads automáticos. **Cuidado de custo:** ligar primeiro numa ótica, observar tokens (medição do C1) e qualidade dos leads, antes de liberar para todas.
6. `.vercel/project.json` (pdv-otica) já no worktree.
7. Conta Vercel deve ser **Pro** (12º cron). Se o deploy reclamar de limite de crons → conta é Hobby → remover o cron do `vercel.json` e disparar a varredura de dentro de um cron existente (`whatsapp-messages`), ou só usar o botão manual.
