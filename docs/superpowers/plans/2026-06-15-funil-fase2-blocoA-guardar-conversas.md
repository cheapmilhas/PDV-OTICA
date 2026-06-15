# Funil Fase 2 — Bloco A' (Guardar Conversas do WhatsApp) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o webhook da Evolution API persistir as mensagens recebidas do WhatsApp, agrupadas em conversas por número/ótica — sem IA, sem transcrição, sem criar lead.

**Architecture:** Dois models novos (`WhatsappConversation` 1:N `WhatsappMessage`), multi-tenant por `companyId`, idempotentes via `evolutionId @unique`. O webhook existente (`/api/webhooks/evolution`) ganha um `case "messages.upsert"` que resolve a empresa pelo `instanceName` (já faz isso para conexão) e chama um service novo `whatsapp-message.service.ts` que faz upsert da conversa + cria a mensagem. Espelha os padrões de service/teste da Fase 1.

**Tech Stack:** Next.js (App Router) · Prisma 5.22 · TypeScript · Vitest · JWT (jose, já usado no webhook).

**Spec:** `docs/superpowers/specs/2026-06-15-funil-fase2-ia-whatsapp-design.md` (seção 4 — Bloco A').

---

## Convenções verificadas no código (seguir à risca)

- **Proxy rtk** quebra comandos: usar formas diretas via node — `node node_modules/vitest/vitest.mjs run <arquivo>`, `node node_modules/typescript/bin/tsc --noEmit`, e `git commit --no-verify`.
- **Sem banco local** nesta máquina: a migration é gerada via `node node_modules/prisma/build/index.js migrate diff --from-schema-datamodel /tmp/schema-base.prisma --to-schema-datamodel prisma/schema.prisma --script > <migdir>/migration.sql` (compara schema do HEAD vs atual). NÃO aplicar; será aplicada via `migrate deploy` no deploy.
- **Webhook** (`src/app/api/webhooks/evolution/route.ts`): autentica JWT HS256 (`EVOLUTION_WEBHOOK_SECRET`), resolve empresa via `prisma.whatsappConnection.findUnique({ where: { instanceName: instance }, select: { id, companyId, status } })`, usa `switch (event)` (`connection.update`, `qrcode.updated`, default só marca `lastEventAt`), retorna `NextResponse.json({ ok: true })` / `{ error }` com status. Usa `logger.child({ webhook: "evolution" })`.
- **Evento de mensagem:** `messages.upsert` (Evolution v2.3.x). Payload `data` é polimórfico (`[k: string]: unknown`) — extrair só os campos esperados; **confirmar o shape com um payload real / log na implementação** e ser defensivo (campos podem faltar).
- **Service:** estilo de `src/services/lead-stage.service.ts` — funções async exportadas, `import { prisma } from "@/lib/prisma"`, isolamento por `companyId` no WHERE, `tx?: Prisma.TransactionClient` opcional.
- **Teste:** Vitest, `vi.mock("@/lib/prisma", () => ({ prisma: {...} }))`, `vi.mock("@/lib/logger", ...)`, helper `makeRequest(body, authHeader?)` (ver `route.test.ts` existente). Mocks resetados em `beforeEach`.
- **Logger:** `logger.child({...})` → `.info/.warn/.error(msg, ctx)` (de `src/lib/logger.ts`).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `prisma/schema.prisma` | models `WhatsappConversation`, `WhatsappMessage` + back-relation em Company | Modificar |
| `prisma/migrations/<ts>_whatsapp_messages/` | migration aditiva | Criar (via diff) |
| `src/lib/validations/whatsapp-inbound.ts` | parse defensivo do payload `messages.upsert` → shape tipado | Criar |
| `src/lib/validations/whatsapp-inbound.test.ts` | testes do parser | Criar |
| `src/services/whatsapp-message.service.ts` | `persistInboundMessage()` (upsert conversa + cria msg idempotente) | Criar |
| `src/services/whatsapp-message.service.test.ts` | testes do service | Criar |
| `src/app/api/webhooks/evolution/route.ts` | `case "messages.upsert"` | Modificar |
| `src/app/api/webhooks/evolution/route.test.ts` | teste do novo case | Modificar |

---

## Task 1: Schema — WhatsappConversation + WhatsappMessage

**Files:**
- Modify: `prisma/schema.prisma`
- Create (via diff): `prisma/migrations/<ts>_whatsapp_messages/migration.sql`

- [ ] **Step 1: Adicionar os models ao schema**

Inserir perto do `model WhatsappConnection` (linha ~4202):

```prisma
model WhatsappConversation {
  id            String    @id @default(cuid())
  companyId     String
  contactNumber String
  contactName   String?
  lastMessageAt DateTime  @default(now())
  analyzedAt    DateTime?
  leadId        String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  company  Company           @relation(fields: [companyId], references: [id], onDelete: Cascade)
  messages WhatsappMessage[]

  @@unique([companyId, contactNumber])
  @@index([companyId, lastMessageAt])
  @@index([companyId, analyzedAt])
}

model WhatsappMessage {
  id             String   @id @default(cuid())
  conversationId String
  companyId      String
  direction      String   // "inbound" | "outbound"
  type           String   // "text" | "audio" | "image" | "other"
  text           String?
  mediaUrl       String?
  evolutionId    String?  @unique
  receivedAt     DateTime @default(now())
  createdAt      DateTime @default(now())

  conversation WhatsappConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([companyId, conversationId])
  @@index([conversationId, receivedAt])
}
```

Adicionar back-relation em `model Company`: `whatsappConversations WhatsappConversation[]`. (Procurar o bloco `model Company` e inserir junto das outras relações, ex.: perto de `whatsappConnection`.)

- [ ] **Step 2: Validar o schema**

Run: `node node_modules/prisma/build/index.js validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀" (se o rtk quebrar `validate`, rodar `generate` no Step 4 já valida).

- [ ] **Step 3: Gerar a migration aditiva (sem aplicar — não há banco local)**

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-base-wa.prisma
TS=$(node -e "const d=new Date();const p=n=>String(n).padStart(2,'0');console.log(`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`)")
MIGDIR="prisma/migrations/${TS}_whatsapp_messages"
mkdir -p "$MIGDIR"
node node_modules/prisma/build/index.js migrate diff \
  --from-schema-datamodel /tmp/schema-base-wa.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$MIGDIR/migration.sql"
cat "$MIGDIR/migration.sql"
```

Expected: SQL **100% aditivo** — só `CREATE TABLE "WhatsappConversation"`, `CREATE TABLE "WhatsappMessage"`, `CREATE INDEX`, `CREATE UNIQUE INDEX`, `ADD CONSTRAINT ... FOREIGN KEY`. **NENHUM** `DROP` ou `ALTER` destrutivo. Se aparecer DROP/ALTER em tabela existente, PARAR e reportar.

- [ ] **Step 4: Gerar o Prisma Client**

Run: `node node_modules/prisma/build/index.js generate`
Expected: "Generated Prisma Client".

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit --no-verify -m "feat(wa-inbox): schema WhatsappConversation + WhatsappMessage (migration aditiva)"
```

---

## Task 2: Parser defensivo do payload `messages.upsert`

**Files:**
- Create: `src/lib/validations/whatsapp-inbound.ts`
- Test: `src/lib/validations/whatsapp-inbound.test.ts`

> O payload da Evolution é polimórfico. Este parser isola a extração num único lugar testável, defensivo a campos faltantes. Shape esperado (Evolution v2.3.x `messages.upsert`): `data.key.id`, `data.key.remoteJid` (`<num>@s.whatsapp.net`), `data.key.fromMe` (bool), `data.pushName`, `data.message.conversation` (texto) ou `data.message.extendedTextMessage.text`, `data.message.audioMessage` (áudio), `data.messageTimestamp` (epoch s).

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect } from "vitest";
import { parseInboundMessage } from "./whatsapp-inbound";

describe("parseInboundMessage", () => {
  it("extrai mensagem de texto inbound", () => {
    const r = parseInboundMessage({
      key: { id: "ABC123", remoteJid: "5585999998888@s.whatsapp.net", fromMe: false },
      pushName: "Maria",
      message: { conversation: "quanto custa um óculos de grau?" },
      messageTimestamp: 1750000000,
    });
    expect(r).toEqual({
      evolutionId: "ABC123",
      contactNumber: "5585999998888",
      contactName: "Maria",
      direction: "inbound",
      type: "text",
      text: "quanto custa um óculos de grau?",
      mediaUrl: null,
      receivedAt: new Date(1750000000 * 1000),
    });
  });

  it("detecta áudio (type=audio, text null)", () => {
    const r = parseInboundMessage({
      key: { id: "AUD1", remoteJid: "5585111@s.whatsapp.net", fromMe: false },
      message: { audioMessage: { url: "https://x/a.ogg" } },
      messageTimestamp: 1750000001,
    });
    expect(r?.type).toBe("audio");
    expect(r?.text).toBeNull();
    expect(r?.mediaUrl).toBe("https://x/a.ogg");
  });

  it("retorna null para mensagem fromMe (outbound — fora do escopo A')", () => {
    expect(
      parseInboundMessage({ key: { id: "X", remoteJid: "5585@s.whatsapp.net", fromMe: true }, message: { conversation: "oi" } })
    ).toBeNull();
  });

  it("retorna null se faltam campos essenciais (sem id ou sem remoteJid)", () => {
    expect(parseInboundMessage({ message: { conversation: "oi" } })).toBeNull();
    expect(parseInboundMessage(null)).toBeNull();
    expect(parseInboundMessage({ key: { id: "X" } })).toBeNull();
  });

  it("lê texto de extendedTextMessage", () => {
    const r = parseInboundMessage({
      key: { id: "E1", remoteJid: "5585@s.whatsapp.net", fromMe: false },
      message: { extendedTextMessage: { text: "tem lente de contato?" } },
      messageTimestamp: 1750000002,
    });
    expect(r?.type).toBe("text");
    expect(r?.text).toBe("tem lente de contato?");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/validations/whatsapp-inbound.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o parser**

```typescript
export interface InboundMessage {
  evolutionId: string;
  contactNumber: string;
  contactName: string | null;
  direction: "inbound";
  type: "text" | "audio" | "image" | "other";
  text: string | null;
  mediaUrl: string | null;
  receivedAt: Date;
}

/** Extrai uma mensagem inbound do payload data de um evento messages.upsert.
 *  Retorna null se for outbound (fromMe), se faltar id/remoteJid, ou se o payload for inválido. */
export function parseInboundMessage(data: unknown): InboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;
  const key = d.key as Record<string, any> | undefined;
  if (!key || typeof key.id !== "string" || typeof key.remoteJid !== "string") return null;
  if (key.fromMe === true) return null; // outbound — fora do escopo A'

  const contactNumber = String(key.remoteJid).split("@")[0];
  if (!contactNumber) return null;

  const msg = (d.message ?? {}) as Record<string, any>;
  let type: InboundMessage["type"] = "other";
  let text: string | null = null;
  let mediaUrl: string | null = null;

  if (typeof msg.conversation === "string") {
    type = "text";
    text = msg.conversation;
  } else if (typeof msg.extendedTextMessage?.text === "string") {
    type = "text";
    text = msg.extendedTextMessage.text;
  } else if (msg.audioMessage) {
    type = "audio";
    mediaUrl = typeof msg.audioMessage.url === "string" ? msg.audioMessage.url : null;
  } else if (msg.imageMessage) {
    type = "image";
    mediaUrl = typeof msg.imageMessage.url === "string" ? msg.imageMessage.url : null;
  }

  const tsRaw = d.messageTimestamp;
  const tsNum = typeof tsRaw === "number" ? tsRaw : typeof tsRaw === "string" ? Number(tsRaw) : NaN;
  const receivedAt = Number.isFinite(tsNum) ? new Date(tsNum * 1000) : new Date();

  return {
    evolutionId: key.id,
    contactNumber,
    contactName: typeof d.pushName === "string" ? d.pushName : null,
    direction: "inbound",
    type,
    text,
    mediaUrl,
    receivedAt,
  };
}
```

> Nota: `new Date()` sem args é usado no fallback — está OK em runtime de produção (só o ambiente de workflow-script proíbe). Se o lint do projeto reclamar, manter (é código de app, não de workflow).

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/validations/whatsapp-inbound.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/whatsapp-inbound.ts src/lib/validations/whatsapp-inbound.test.ts
git commit --no-verify -m "feat(wa-inbox): parser defensivo do payload messages.upsert + testes"
```

---

## Task 3: Service — persistInboundMessage (upsert conversa + cria msg idempotente)

**Files:**
- Create: `src/services/whatsapp-message.service.ts`
- Test: `src/services/whatsapp-message.service.test.ts`

- [ ] **Step 1: Escrever o teste primeiro**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappMessage: { findUnique: vi.fn(), create: vi.fn() },
    whatsappConversation: { upsert: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { persistInboundMessage } from "./whatsapp-message.service";
import type { InboundMessage } from "@/lib/validations/whatsapp-inbound";

const base: InboundMessage = {
  evolutionId: "EV1",
  contactNumber: "5585999",
  contactName: "Maria",
  direction: "inbound",
  type: "text",
  text: "oi",
  mediaUrl: null,
  receivedAt: new Date("2026-06-15T12:00:00Z"),
};

beforeEach(() => vi.clearAllMocks());

describe("persistInboundMessage", () => {
  it("é idempotente: se evolutionId já existe, não cria de novo", async () => {
    (prisma.whatsappMessage.findUnique as any).mockResolvedValue({ id: "m_old" });
    const r = await persistInboundMessage("co_1", base);
    expect(r.created).toBe(false);
    expect(prisma.whatsappConversation.upsert).not.toHaveBeenCalled();
    expect(prisma.whatsappMessage.create).not.toHaveBeenCalled();
  });

  it("upserta a conversa por (companyId, contactNumber) e cria a mensagem", async () => {
    (prisma.whatsappMessage.findUnique as any).mockResolvedValue(null);
    (prisma.whatsappConversation.upsert as any).mockResolvedValue({ id: "conv_1" });
    (prisma.whatsappMessage.create as any).mockResolvedValue({ id: "m_new" });

    const r = await persistInboundMessage("co_1", base);

    expect(r.created).toBe(true);
    const upsertArg = (prisma.whatsappConversation.upsert as any).mock.calls[0][0];
    expect(upsertArg.where).toEqual({ companyId_contactNumber: { companyId: "co_1", contactNumber: "5585999" } });
    expect(upsertArg.update.lastMessageAt).toEqual(base.receivedAt);
    expect(upsertArg.create.companyId).toBe("co_1");

    const createArg = (prisma.whatsappMessage.create as any).mock.calls[0][0];
    expect(createArg.data.conversationId).toBe("conv_1");
    expect(createArg.data.companyId).toBe("co_1");
    expect(createArg.data.evolutionId).toBe("EV1");
    expect(createArg.data.type).toBe("text");
  });

  it("sem evolutionId, ainda cria (não dá pra deduplicar)", async () => {
    (prisma.whatsappConversation.upsert as any).mockResolvedValue({ id: "conv_2" });
    (prisma.whatsappMessage.create as any).mockResolvedValue({ id: "m2" });
    const r = await persistInboundMessage("co_1", { ...base, evolutionId: "" });
    expect(r.created).toBe(true);
    expect(prisma.whatsappMessage.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/services/whatsapp-message.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o service**

```typescript
import { prisma } from "@/lib/prisma";
import type { InboundMessage } from "@/lib/validations/whatsapp-inbound";

export async function persistInboundMessage(
  companyId: string,
  msg: InboundMessage
): Promise<{ created: boolean; conversationId?: string; messageId?: string }> {
  // Idempotência: se já temos esta mensagem (mesmo evolutionId), no-op.
  if (msg.evolutionId) {
    const existing = await prisma.whatsappMessage.findUnique({
      where: { evolutionId: msg.evolutionId },
      select: { id: true },
    });
    if (existing) return { created: false };
  }

  const conversation = await prisma.whatsappConversation.upsert({
    where: { companyId_contactNumber: { companyId, contactNumber: msg.contactNumber } },
    update: {
      lastMessageAt: msg.receivedAt,
      contactName: msg.contactName ?? undefined,
    },
    create: {
      companyId,
      contactNumber: msg.contactNumber,
      contactName: msg.contactName,
      lastMessageAt: msg.receivedAt,
    },
    select: { id: true },
  });

  const created = await prisma.whatsappMessage.create({
    data: {
      conversationId: conversation.id,
      companyId,
      direction: msg.direction,
      type: msg.type,
      text: msg.text,
      mediaUrl: msg.mediaUrl,
      evolutionId: msg.evolutionId || null,
      receivedAt: msg.receivedAt,
    },
    select: { id: true },
  });

  return { created: true, conversationId: conversation.id, messageId: created.id };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/services/whatsapp-message.service.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/services/whatsapp-message.service.ts src/services/whatsapp-message.service.test.ts
git commit --no-verify -m "feat(wa-inbox): persistInboundMessage (upsert conversa + msg idempotente) + testes"
```

---

## Task 4: Webhook — case "messages.upsert"

**Files:**
- Modify: `src/app/api/webhooks/evolution/route.ts`
- Modify: `src/app/api/webhooks/evolution/route.test.ts`

- [ ] **Step 1: Adicionar teste do novo case ao route.test.ts**

**VERIFICADO no `route.test.ts` real — seguir EXATAMENTE estes padrões:**
- Mocks são **funções nomeadas declaradas no topo** (ex.: `const whatsappFindUnique = vi.fn();` ~linha 15) e referenciadas dentro do `vi.mock("@/lib/prisma", ...)`. **Declarar `const waConvUpsert = vi.fn();`, `const waMsgFind = vi.fn();`, `const waMsgCreate = vi.fn();` no topo** e adicioná-las ao objeto `prisma` do `vi.mock` existente: `whatsappConversation: { upsert: (...a) => waConvUpsert(...a) }`, `whatsappMessage: { findUnique: (...a) => waMsgFind(...a), create: (...a) => waMsgCreate(...a) }`. **Resetá-las no `beforeEach`** junto das outras.
- O helper de JWT é **`async function signValid(claims?)`** e retorna **só o token cru (SEM `Bearer`)** → usar `const token = await signValid();` e passar `` `Bearer ${token}` `` como 2º arg de `makeRequest`. (NÃO existe `validAuthHeader()`.)
- `makeRequest(body, authHeader?)` existe (~linha 48). O `beforeEach` já faz `whatsappFindUnique.mockResolvedValue({ id: "conn1", companyId: "co1", status: "CONNECTING" })`.

Testes a adicionar:

```typescript
it("messages.upsert inbound persiste a mensagem (200)", async () => {
  waMsgFind.mockResolvedValue(null);
  waConvUpsert.mockResolvedValue({ id: "conv1" });
  waMsgCreate.mockResolvedValue({ id: "m1" });

  const token = await signValid();
  const req = makeRequest(
    {
      event: "messages.upsert",
      instance: "vis_co1",
      data: {
        key: { id: "WAMID1", remoteJid: "5585999@s.whatsapp.net", fromMe: false },
        pushName: "Maria",
        message: { conversation: "tem óculos de grau?" },
        messageTimestamp: 1750000000,
      },
    },
    `Bearer ${token}`
  );
  const res = await POST(req);
  expect(res.status).toBe(200);
  expect(waMsgCreate).toHaveBeenCalled();
});

it("messages.upsert fromMe (outbound) é ignorado mas responde 200", async () => {
  const token = await signValid();
  const req = makeRequest(
    { event: "messages.upsert", instance: "vis_co1",
      data: { key: { id: "X", remoteJid: "5585@s.whatsapp.net", fromMe: true }, message: { conversation: "resposta" } } },
    `Bearer ${token}`
  );
  const res = await POST(req);
  expect(res.status).toBe(200);
  expect(waMsgCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/app/api/webhooks/evolution/route.test.ts`
Expected: FAIL (case ainda não trata messages.upsert → `waMsgCreate` não é chamado).

- [ ] **Step 3: Implementar o case no route.ts**

No `switch (event)`, antes do `default`, adicionar:

```typescript
      case "messages.upsert": {
        const parsed = parseInboundMessage(payload.data);
        if (parsed) {
          await persistInboundMessage(conn.companyId, parsed);
        }
        // outbound/inválido: ignora silenciosamente, ainda 200
        await prisma.whatsappConnection.update({
          where: { id: conn.id },
          data: { lastEventAt: now },
        });
        break;
      }
```

Adicionar os imports no topo:
```typescript
import { parseInboundMessage } from "@/lib/validations/whatsapp-inbound";
import { persistInboundMessage } from "@/services/whatsapp-message.service";
```

> **VERIFICADO no código real (`route.ts:121`):** a variável da conexão resolvida chama-se **`conn`** (não `connection`) — usar `conn.companyId` e `conn.id`. O payload é **`payload`** e o `now` já existe no topo do `try` (`const now = new Date();` ~linha 131) — reusar `now` (os outros cases já fazem isso). NÃO alterar a lógica de auth nem dos outros cases.

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/app/api/webhooks/evolution/route.test.ts`
Expected: PASS (todos, incluindo os antigos de conexão).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/evolution/route.ts src/app/api/webhooks/evolution/route.test.ts
git commit --no-verify -m "feat(wa-inbox): webhook trata messages.upsert (persiste msg inbound)"
```

---

## Task 5: Verificação final

- [ ] **Step 1: Suíte dos arquivos do Bloco A'**

Run: `node node_modules/vitest/vitest.mjs run src/lib/validations/whatsapp-inbound.test.ts src/services/whatsapp-message.service.test.ts src/app/api/webhooks/evolution/route.test.ts`
Expected: todos verdes.

- [ ] **Step 2: Suíte completa (não quebrou nada)**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: todos verdes (os existentes + os novos).

- [ ] **Step 3: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Migration aditiva confirmada**

Run: `grep -iE "DROP|ALTER TABLE.*DROP" prisma/migrations/*_whatsapp_messages/migration.sql || echo "✓ aditiva"`
Expected: "✓ aditiva".

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A && git commit --no-verify -m "chore(wa-inbox): verificação final Bloco A'"
```

---

## Fora de escopo do Bloco A' (NÃO implementar aqui)

- Transcrição de áudio (Whisper) — Bloco B'.
- Qualificação por IA / criação de lead — Bloco B'.
- Medição de tokens — Bloco C.
- Envio de mensagem — Bloco D (e `LEGACY_WHATSAPP_SEND_DISABLED` segue true).
- UI de "caixa de conversas" — pode vir no B' junto do botão "analisar". Se for desejada uma listagem mínima agora, é um add-on opcional (rota GET + tela), mas não é requisito do A'.

## Notas de deploy (quando for deployar)

- Aplicar a migration via `prisma migrate deploy` (aditiva, só a nova).
- A Evolution precisa estar configurada para enviar o evento `messages.upsert` ao webhook (confirmar no painel/registro da instância — Fase B1 registrou o webhook; verificar se o evento de mensagens está incluído na assinatura de eventos da instância).
- Nenhuma env nova no Bloco A' (Whisper/OpenAI só entra no B').
