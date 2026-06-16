# Funil Fase 2 — Bloco C2+C3 (Telas de Gestão de IA: super admin + ótica) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar 100% das telas de gestão de IA antes de ligar o teste: o **super admin** cadastra a API key (Anthropic) cifrada, define câmbio/preço/cota, liga a disponibilidade por ótica e vê consumo + **custo real em R$**; a **ótica** liga/desliga a IA e vê seu consumo em **créditos** (sem R$), com relatório.

**Architecture:** Uma config global do SaaS (`AiGlobalConfig`, singleton: API key cifrada + câmbio USD→BRL + markup + fator de crédito) gerenciada só pelo super admin. A API key sai da env e passa a ser lida do banco (cifrada via novo util `secret-cipher.ts` AES-256-GCM). O `ai-pricing.ts` (C1) passa a ler câmbio/fator da config em vez de constantes. Nova aba "IA" em `/admin/clientes/[id]` (toggles iaAvailable/iaEnabled, cota, consumo R$ + histórico) e nova subpágina `configuracoes/ia` na ótica (toggle iaEnabled, créditos, relatório). Rotas admin via `getAdminSession()`, rota da ótica via `requirePermission("company.settings")` aceitando SÓ `iaEnabled`.

**Tech Stack:** Next.js (App Router) · Prisma 5.22 · TypeScript · Vitest · shadcn (Card/Switch/Table) · Recharts · crypto nativo (AES-256-GCM).

**Spec:** `docs/superpowers/specs/2026-06-15-funil-fase2-blocoC-gestao-ia-tokens-design.md` (seções 7-9) + decisões do dono (abaixo).

---

## Decisões do dono (2026-06-16)

1. **API key global cifrada no banco**, cadastrada pelo super admin via UI. Custo na conta do SaaS (modelo centralizado). A `ANTHROPIC_API_KEY` deixa de vir só da env.
2. **Câmbio USD→BRL + markup + fator de crédito = config editável** pelo super admin (não busca câmbio em runtime). Hoje `USD_BRL_RATE=5.5` e `CREDIT_TOKEN_FACTOR=1000` são constantes no `ai-pricing.ts` → viram config no banco com esses defaults.
3. **Créditos = só visualização** (1 crédito = N tokens; informativo, sem faturamento/recarga). A cota é limite técnico definido pelo super admin.
4. **Escopo: C2 (super admin) + C3 (ótica) juntos.**

---

## Achados que moldam o plano (verificados no código)

- **NÃO existe cifragem no projeto** (grep encrypt/crypto/AES = 0; secrets atuais como `evolutionApiKey`/`webhookSecret` são texto puro). → criar `src/lib/secret-cipher.ts` (AES-256-GCM) + **nova env `ENCRYPTION_KEY`** (32 bytes hex) que o dono seta na Vercel ANTES do deploy. Sem ela, cifrar/decifrar falha.
- **Auth admin:** `getAdminSession(): Promise<AdminPayload | null>` (`src/lib/admin-session.ts`). Padrão de rota: `const admin = await getAdminSession(); if (!admin) return 401`. Há `requireCompanyScope(adminId, companyId)` para escopo por empresa — usar nas rotas que recebem `[id]`.
- **Abas admin:** `src/app/admin/clientes/[id]/company-tabs.tsx` — `TabId` union + array `tabs` (id/label/icon). Página renderiza via `<TabPanel tabId=...>`. Há aba "uso" (UsageSnapshot). Adicionar `"ia"` ao union + ao array + um `<CompanyAiPanel>`.
- **Config ótica:** `src/app/(dashboard)/dashboard/configuracoes/` tem subpáginas (`empresa/`, `whatsapp/`, `cashback/`, etc., cada uma `page.tsx`) E uma page principal com Tabs. **Seguir o padrão de subpágina:** criar `configuracoes/ia/page.tsx` + entrada no menu de navegação de config.
- **Rota settings ótica:** `PUT /api/company/settings` — `requireAuth()` + `getCompanyId()` + `requirePermission("company.settings")` + Zod `companySettingsSchema` + `upsert`. Para o C3, criar rota dedicada `PUT /api/company/ai-settings` que aceita SÓ `iaEnabled` (NÃO reusar a de settings p/ não arriscar aceitar iaAvailable/cota).
- **`AiTokenUsage`** (schema:4341) + `getMonthlyUsage(companyId)` (`src/services/ai-usage.service.ts`) retorna `{ totalTokens, totalCostUsd, byFeature }` — só mês corrente. Para histórico por dia, o plano adiciona `getDailyUsage`.
- **`ai-pricing.ts` (C1):** `computeCostUsd`, `usdToBrl`, `tokensToCredits`, consts `USD_BRL_RATE`/`CREDIT_TOKEN_FACTOR`. O C2 passa câmbio/fator por parâmetro (lidos da config), mantendo os defaults.
- **`lead-qualifier.ts` (C1):** hoje `new Anthropic()` lê `ANTHROPIC_API_KEY` da env + guard que lança se ausente. Passa a obter a key da config (decifrada), com fallback à env.
- **UI:** shadcn `@/components/ui/{card,switch,button,table}`; admin `@/components/admin/{KPICard,MrrChart,PageHeader,AdminStatusBadge}`; Recharts. Reusar KPICard (consumo) e o padrão MrrChart (histórico).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/secret-cipher.ts` | `encryptSecret`/`decryptSecret` (AES-256-GCM, ENCRYPTION_KEY) | Criar |
| `src/lib/secret-cipher.test.ts` | round-trip + tamper detection | Criar |
| `prisma/schema.prisma` | model `AiGlobalConfig` (singleton) | Modificar |
| `prisma/migrations/<ts>_ai_global_config/` | migration aditiva | Criar (via diff) |
| `src/services/ai-config.service.ts` | get/update config global (key cifrada, câmbio, markup, fator); `getAnthropicKey()` decifra c/ fallback env | Criar |
| `src/services/ai-config.service.test.ts` | testes | Criar |
| `src/lib/ai-pricing.ts` | `computeCostUsd`/`tokensToCredits` aceitam câmbio/fator opcionais | Modificar |
| `src/lib/ai/lead-qualifier.ts` | usa `getAnthropicKey()` (config→env fallback) | Modificar |
| `src/services/ai-usage.service.ts` | + `getDailyUsage(companyId, month)` p/ histórico | Modificar |
| `src/app/api/admin/ai-config/route.ts` | GET/PUT config global (super admin) | Criar |
| `src/app/api/admin/companies/[id]/ai-settings/route.ts` | PATCH iaAvailable/iaEnabled/cota (super admin) | Criar |
| `src/app/api/admin/companies/[id]/ai-usage/route.ts` | GET consumo + custo R$ + histórico (super admin) | Criar |
| `src/app/admin/clientes/[id]/company-tabs.tsx` | + aba "ia" | Modificar |
| `src/app/admin/clientes/[id]/company-ai-panel.tsx` | UI da aba IA (toggles/cota/consumo R$/gráfico) | Criar |
| `src/app/admin/configuracoes/ia/page.tsx` (global) | tela de cadastro da API key + câmbio/markup/fator | Criar |
| `src/app/api/company/ai-settings/route.ts` | PUT só `iaEnabled` (ótica) | Criar |
| `src/app/api/company/ai-usage/route.ts` | GET créditos + consumo (SEM R$) (ótica) | Criar |
| `src/app/(dashboard)/dashboard/configuracoes/ia/page.tsx` | seção IA da ótica (toggle/créditos/relatório) | Criar |
| (+ testes de rota) | | Criar |

> **Ordem:** T1 cipher → T2 schema AiGlobalConfig → T3 ai-config.service → T4 ai-pricing/lead-qualifier usam config → T5 getDailyUsage → T6 rotas admin (config+ai-settings+ai-usage) → T7 UI aba IA admin → T8 tela global de API key (super admin) → T9 rota+tela da ótica (C3) → T10 verificação. (Backend antes de UI; cipher é base de tudo.)

---

## Convenções (seguir à risca)

- rtk quebra comandos: `node node_modules/vitest/vitest.mjs run <file>`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/prisma/build/index.js <cmd>`, `git commit --no-verify`. curl interceptado → node fetch.
- Sem banco local: migration via `migrate diff` (NÃO aplicar). `migrate deploy` no deploy.
- Migration aditiva (lição do projeto). Seeds NUNCA deleteMany.
- Rotas admin: `getAdminSession()` + `requireCompanyScope` quando houver `[id]`. Rotas ótica: `requireAuth()` + `getCompanyId()` + `requirePermission("company.settings")`.
- Multi-tenant rígido por companyId. **`costUsd`/R$ NUNCA em resposta de rota da ótica.** **API key NUNCA retornada decifrada para o front** (só status "configurada/não").

---

## Task 1: secret-cipher.ts (AES-256-GCM)

**Files:** Create `src/lib/secret-cipher.ts` + `src/lib/secret-cipher.test.ts`

- [ ] **Step 1: Teste primeiro**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { encryptSecret, decryptSecret } from "./secret-cipher";

// ENCRYPTION_KEY = 32 bytes em hex (64 chars)
const KEY = "0".repeat(64);
beforeEach(() => { process.env.ENCRYPTION_KEY = KEY; });

describe("secret-cipher", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const plain = "sk-ant-api03-abcdef123456";
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(enc).toContain(":"); // iv:cipher:tag
    expect(decryptSecret(enc)).toBe(plain);
  });
  it("dois encrypts do mesmo texto dão ciphertexts diferentes (IV aleatório)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
  it("detecta adulteração (authTag inválido lança)", () => {
    const enc = encryptSecret("segredo");
    const [iv, ct, _tag] = enc.split(":");
    const tampered = `${iv}:${ct}:${"0".repeat(32)}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("lança se ENCRYPTION_KEY ausente", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY/);
  });
});
```

- [ ] **Step 2:** Run/FAIL: `node node_modules/vitest/vitest.mjs run src/lib/secret-cipher.test.ts`

- [ ] **Step 3: Implementar**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY ausente ou inválida (esperado 32 bytes em hex = 64 chars)");
  }
  return Buffer.from(hex, "hex");
}

/** Cifra um segredo. Formato: ivHex:cipherHex:authTagHex. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV recomendado p/ GCM
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${enc.toString("hex")}:${tag.toString("hex")}`;
}

/** Decifra. Lança se o authTag não bater (adulteração) ou formato inválido. */
export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("ciphertext inválido");
  const [ivHex, encHex, tagHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
}
```

- [ ] **Step 4:** Run/PASS (4). **Step 5:** Commit:
```bash
git add src/lib/secret-cipher.ts src/lib/secret-cipher.test.ts
git commit --no-verify -m "feat(ia-config): secret-cipher AES-256-GCM (cifra a API key no banco)"
```

---

## Task 2: Schema — AiGlobalConfig (singleton)

**Files:** Modify `prisma/schema.prisma` + migration via diff.

- [ ] **Step 1: Adicionar o model** (perto de `AiTokenUsage`):

```prisma
/// Config global de IA do SaaS (singleton: 1 linha, id fixo "global").
/// Só o super admin edita. anthropicKeyEnc é cifrada (secret-cipher).
model AiGlobalConfig {
  id              String   @id @default("global")
  anthropicKeyEnc String?  // API key Anthropic cifrada (iv:ct:tag); null = usa env
  usdBrlRate      Decimal  @default(5.5) @db.Decimal(10, 4)
  markupPercent   Decimal  @default(0)   @db.Decimal(6, 2) // markup sobre o custo real (relatório super admin)
  creditTokenFactor Int    @default(1000) // 1 crédito = N tokens (visão da ótica)
  updatedAt       DateTime @updatedAt
  createdAt       DateTime @default(now())
}
```

- [ ] **Step 2:** `node node_modules/prisma/build/index.js generate` → "Generated".

- [ ] **Step 3: Migration aditiva (sem aplicar):**

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-base-aigc.prisma
TS=$(node -e "const d=new Date();const p=n=>String(n).padStart(2,'0');console.log(`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`)")
MIGDIR="prisma/migrations/${TS}_ai_global_config"
mkdir -p "$MIGDIR"
node node_modules/prisma/build/index.js migrate diff \
  --from-schema-datamodel /tmp/schema-base-aigc.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$MIGDIR/migration.sql"
cat "$MIGDIR/migration.sql"
```

Expected: SÓ `CREATE TABLE "AiGlobalConfig"`. NENHUM DROP/ALTER em tabela existente. Se houver, PARAR/reportar.

- [ ] **Step 4: Commit:**
```bash
git add prisma/schema.prisma prisma/migrations
git commit --no-verify -m "feat(ia-config): model AiGlobalConfig singleton (migration aditiva)"
```

---

## Task 3: ai-config.service.ts

**Files:** Create `src/services/ai-config.service.ts` + test.

> Lê/grava o singleton. `getAiConfig()` retorna a config (criando o singleton com defaults se não existir). `updateAiConfig(patch)` atualiza (cifra a key se vier nova). `getAnthropicKey()` retorna a key decifrada OU `process.env.ANTHROPIC_API_KEY` como fallback. **Nunca** expõe a key decifrada além do `getAnthropicKey` (uso server-side).

- [ ] **Step 1: Teste**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { aiGlobalConfig: { findUnique: vi.fn(), upsert: vi.fn() } } }));
const encMock = vi.fn((s: string) => `enc(${s})`);
const decMock = vi.fn((s: string) => s.replace(/^enc\(|\)$/g, ""));
vi.mock("@/lib/secret-cipher", () => ({ encryptSecret: (s: string) => encMock(s), decryptSecret: (s: string) => decMock(s) }));
import { prisma } from "@/lib/prisma";
import { getAiConfig, updateAiConfig, getAnthropicKey } from "./ai-config.service";

beforeEach(() => { vi.clearAllMocks(); delete process.env.ANTHROPIC_API_KEY; });

describe("ai-config.service", () => {
  it("getAiConfig cria singleton com defaults se não existe", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null });
    const c = await getAiConfig();
    expect(c.creditTokenFactor).toBe(1000);
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.where).toEqual({ id: "global" });
  });
  it("updateAiConfig cifra a key quando uma nova é passada", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global" });
    await updateAiConfig({ anthropicKey: "sk-ant-novo", usdBrlRate: 5.7 });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(encMock).toHaveBeenCalledWith("sk-ant-novo");
    expect(arg.update.anthropicKeyEnc).toBe("enc(sk-ant-novo)");
    expect(Number(arg.update.usdBrlRate)).toBe(5.7);
  });
  it("updateAiConfig NÃO toca a key se anthropicKey vier vazio/undefined", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global" });
    await updateAiConfig({ usdBrlRate: 6 });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.anthropicKeyEnc).toBeUndefined();
    expect(encMock).not.toHaveBeenCalled();
  });
  it("getAnthropicKey decifra a key do banco", async () => {
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ anthropicKeyEnc: "enc(sk-ant-db)" });
    expect(await getAnthropicKey()).toBe("sk-ant-db");
  });
  it("getAnthropicKey cai na env se banco não tem key", async () => {
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ anthropicKeyEnc: null });
    process.env.ANTHROPIC_API_KEY = "sk-ant-env";
    expect(await getAnthropicKey()).toBe("sk-ant-env");
  });
});
```

- [ ] **Step 2:** Run/FAIL.

- [ ] **Step 3: Implementar**

```typescript
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/secret-cipher";

const SINGLETON_ID = "global";

export interface AiConfigView {
  hasKey: boolean;        // status, NUNCA a key
  usdBrlRate: number;
  markupPercent: number;
  creditTokenFactor: number;
}

/** Lê (e cria com defaults se faltar) o singleton. NÃO retorna a key. */
export async function getAiConfig(): Promise<AiConfigView> {
  const c = await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return {
    hasKey: !!c.anthropicKeyEnc,
    usdBrlRate: Number(c.usdBrlRate.toString()),
    markupPercent: Number(c.markupPercent.toString()),
    creditTokenFactor: c.creditTokenFactor,
  };
}

export interface UpdateAiConfigInput {
  anthropicKey?: string; // se vier não-vazio, cifra e grava
  usdBrlRate?: number;
  markupPercent?: number;
  creditTokenFactor?: number;
}

export async function updateAiConfig(patch: UpdateAiConfigInput): Promise<AiConfigView> {
  const data: Record<string, unknown> = {};
  if (typeof patch.usdBrlRate === "number") data.usdBrlRate = patch.usdBrlRate;
  if (typeof patch.markupPercent === "number") data.markupPercent = patch.markupPercent;
  if (typeof patch.creditTokenFactor === "number") data.creditTokenFactor = patch.creditTokenFactor;
  if (patch.anthropicKey && patch.anthropicKey.trim().length > 0) {
    data.anthropicKeyEnc = encryptSecret(patch.anthropicKey.trim());
  }
  await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  return getAiConfig();
}

/** Server-side: key decifrada do banco, ou env como fallback. NUNCA expor ao front. */
export async function getAnthropicKey(): Promise<string | undefined> {
  const c = await prisma.aiGlobalConfig.findUnique({ where: { id: SINGLETON_ID }, select: { anthropicKeyEnc: true } });
  if (c?.anthropicKeyEnc) {
    try { return decryptSecret(c.anthropicKeyEnc); } catch { /* cai no env */ }
  }
  return process.env.ANTHROPIC_API_KEY;
}
```

- [ ] **Step 4:** Run/PASS (5). **Step 5:** Commit:
```bash
git add src/services/ai-config.service.ts src/services/ai-config.service.test.ts
git commit --no-verify -m "feat(ia-config): ai-config.service (singleton, key cifrada, getAnthropicKey c/ fallback env)"
```

---

## Task 4: ai-pricing + lead-qualifier usam a config

**Files:** Modify `src/lib/ai-pricing.ts` (+test) e `src/lib/ai/lead-qualifier.ts`.

> `computeCostUsd`/`tokensToCredits` passam a aceitar overrides opcionais (câmbio/fator) — mantendo os defaults atuais quando não passados (zero regressão no C1). O `lead-qualifier` passa a instanciar o Anthropic com a key de `getAnthropicKey()`.

- [ ] **Step 1: Teste de ai-pricing** — adicionar casos que provam o override:

```typescript
it("tokensToCredits usa fator custom quando passado", () => {
  expect(tokensToCredits(2000, 500)).toBe(4); // 2000/500
  expect(tokensToCredits(2000)).toBe(2);       // default 1000 mantido
});
it("usdToBrl usa rate custom quando passado", () => {
  expect(usdToBrl(2, 6)).toBeCloseTo(12, 4);
  expect(usdToBrl(2)).toBeCloseTo(11, 4); // default 5.5
});
```

- [ ] **Step 2:** Run/FAIL.

- [ ] **Step 3:** Em `ai-pricing.ts`: `tokensToCredits(tokens: number, factor: number = CREDIT_TOKEN_FACTOR)` e `usdToBrl(usd: number, rate: number = USD_BRL_RATE)`. `computeCostUsd` fica como está (custo em USD não depende de câmbio). Atualizar assinaturas, manter defaults.

- [ ] **Step 4:** Run/PASS.

- [ ] **Step 5: lead-qualifier usa getAnthropicKey** — trocar o `new Anthropic()` de topo de módulo por instanciação na função com a key da config:

```typescript
import { getAnthropicKey } from "@/services/ai-config.service";
// ...remover `const anthropic = new Anthropic();` do topo...
export async function qualifyConversationText(...) {
  const apiKey = await getAnthropicKey();
  if (!apiKey) throw new Error("Anthropic API key não configurada (super admin → config IA, ou env ANTHROPIC_API_KEY)");
  const anthropic = new Anthropic({ apiKey });
  // ... resto igual ...
}
```

**Reescrever o setup do teste do lead-qualifier (não só adicionar mock):** REMOVER as linhas que setam/deletam `process.env.ANTHROPIC_API_KEY` no `beforeEach` e no teste de "key ausente". Adicionar `vi.mock("@/services/ai-config.service", () => ({ getAnthropicKey: vi.fn() }))` e, no `beforeEach`, `getAnthropicKey.mockResolvedValue("test-key")`. O teste "lança se key ausente" passa a fazer `getAnthropicKey.mockResolvedValue(undefined)` e asserta `.rejects.toThrow(/Anthropic API key|ANTHROPIC_API_KEY/)`. A env deixa de ser a fonte no teste.

- [ ] **Step 6:** Run/PASS: `node node_modules/vitest/vitest.mjs run src/lib/ai-pricing.test.ts src/lib/ai/lead-qualifier.test.ts`. Typecheck.

- [ ] **Step 7: Commit:**
```bash
git add src/lib/ai-pricing.ts src/lib/ai-pricing.test.ts src/lib/ai/lead-qualifier.ts src/lib/ai/lead-qualifier.test.ts
git commit --no-verify -m "feat(ia-config): pricing aceita câmbio/fator da config + qualifier usa key do banco"
```

---

## Task 5: getDailyUsage (histórico p/ gráfico)

**Files:** Modify `src/services/ai-usage.service.ts` (+test).

- [ ] **Step 1: Teste**

```typescript
it("getDailyUsage agrupa tokens e custo por dia do mês corrente", async () => {
  (prisma.aiTokenUsage.findMany as any).mockResolvedValue([
    { createdAt: new Date("2026-06-16T10:00:00Z"), inputTokens: 100, outputTokens: 50, cacheTokens: 0, costUsd: "0.01" },
    { createdAt: new Date("2026-06-16T15:00:00Z"), inputTokens: 200, outputTokens: 0, cacheTokens: 0, costUsd: "0.02" },
    { createdAt: new Date("2026-06-17T09:00:00Z"), inputTokens: 50, outputTokens: 50, cacheTokens: 0, costUsd: "0.005" },
  ]);
  const r = await getDailyUsage("co1");
  expect(r.find(d => d.date === "2026-06-16")?.tokens).toBe(350);
  expect(r.find(d => d.date === "2026-06-16")?.costUsd).toBeCloseTo(0.03, 6);
  expect(r.find(d => d.date === "2026-06-17")?.tokens).toBe(100);
  expect(r).toBeInstanceOf(Array);
});
```

- [ ] **Step 2:** Run/FAIL. **Step 3:** Implementar `getDailyUsage(companyId): Promise<{ date: string; tokens: number; costUsd: number }[]>` — findMany do mês (where companyId + createdAt gte startOfCurrentMonth, scoped por companyId), agrupa por `toISOString().slice(0,10)`, ordena por data asc. **Step 4:** Run/PASS.

- [ ] **Step 5: Commit:**
```bash
git add src/services/ai-usage.service.ts src/services/ai-usage.service.test.ts
git commit --no-verify -m "feat(ia-medicao): getDailyUsage (histórico diário p/ gráfico)"
```

---

## Task 6: Rotas admin (config global + ai-settings + ai-usage)

**Files:** Create 3 rotas + testes.

### 6a — `GET/PUT /api/admin/ai-config`

> GET retorna `AiConfigView` (status hasKey, câmbio, markup, fator — SEM a key). PUT aceita `{ anthropicKey?, usdBrlRate?, markupPercent?, creditTokenFactor? }`. Auth `getAdminSession()`.

- [ ] Teste (401 sem admin; GET retorna view sem key; PUT chama updateAiConfig; a key NUNCA aparece na resposta) → FAIL → implementar → PASS → commit `feat(ia-config): rota admin GET/PUT ai-config`.

```typescript
// impl resumida
export async function GET() {
  const admin = await getAdminSession(); if (!admin) return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({ data: await getAiConfig() }); // sem key
}
export async function PUT(request: Request) {
  const admin = await getAdminSession(); if (!admin) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body = await request.json();
  const view = await updateAiConfig({
    anthropicKey: typeof body.anthropicKey === "string" ? body.anthropicKey : undefined,
    usdBrlRate: typeof body.usdBrlRate === "number" ? body.usdBrlRate : undefined,
    markupPercent: typeof body.markupPercent === "number" ? body.markupPercent : undefined,
    creditTokenFactor: typeof body.creditTokenFactor === "number" ? body.creditTokenFactor : undefined,
  });
  return NextResponse.json({ data: view });
}
```

### 6b — `PATCH /api/admin/companies/[id]/ai-settings`

> Super admin liga `iaAvailable`/`iaEnabled` e define `iaMonthlyTokenLimit` de uma empresa. Auth `getAdminSession()` + `requireCompanyScope`. Atualiza `CompanySettings` (upsert por companyId).

- [ ] Teste (401 sem admin; 403 fora de escopo; PATCH grava as 3 flags; aceita iaMonthlyTokenLimit null=ilimitado) → FAIL → impl → PASS → commit `feat(ia-config): rota admin PATCH ai-settings por empresa`.

### 6c — `GET /api/admin/companies/[id]/ai-usage`

> Retorna `getMonthlyUsage` + `getDailyUsage` + **custo R$** (usdToBrl com câmbio+markup da config) + a cota atual. Auth admin + escopo.

- [ ] Teste (401; 403 escopo; retorna totalCostBrl calculado de totalCostUsd×rate×(1+markup); inclui byFeature e daily) → FAIL → impl → PASS → commit `feat(ia-config): rota admin GET ai-usage (custo R$ + histórico)`.

```typescript
// impl resumida do cálculo R$ (Promise.all p/ latência — as 3 leituras são independentes)
const [cfg, usage, daily] = await Promise.all([getAiConfig(), getMonthlyUsage(companyId), getDailyUsage(companyId)]);
const costBrl = usdToBrl(usage.totalCostUsd, cfg.usdBrlRate) * (1 + cfg.markupPercent / 100);
return NextResponse.json({ data: { usage, daily, costBrl, creditTokenFactor: cfg.creditTokenFactor } });
```

---

## Task 7: UI — aba "IA" no detalhe da empresa (super admin)

**Files:** Modify `company-tabs.tsx`; Create `company-ai-panel.tsx`; wire em `page.tsx`.

- [ ] **Step 1:** `company-tabs.tsx`: add `"ia"` ao `TabId` union e `{ id: "ia", label: "IA", icon: Sparkles }` (ou `Bot`) ao array `tabs`.
- [ ] **Step 2:** Criar `company-ai-panel.tsx` (client component): consome `GET /api/admin/companies/[id]/ai-usage`; mostra:
  - `<Switch>` **Disponibilidade** (`iaAvailable`) → PATCH ai-settings.
  - `<Switch>` **Ativa** (`iaEnabled`) → PATCH.
  - Campo **Cota mensal** (tokens; mostra equivalente em créditos) → PATCH.
  - `<KPICard>` Tokens (mês) + `<KPICard>` Custo R$ (mês) + breakdown por feature (Table).
  - Gráfico diário (reusar padrão `MrrChart`/Recharts com `daily`).
- [ ] **Step 3:** `page.tsx`: renderizar `<CompanyAiPanel companyId={id} />` dentro de `<TabPanel tabId="ia">`.
- [ ] **Step 4:** Typecheck + (se houver testes de componente, rodar). Commit `feat(ia-config): aba IA no detalhe da empresa (super admin)`.

> Sem teste unitário de UI obrigatório (o projeto não testa componentes admin em geral — confirmar; se houver padrão, seguir). O build (Task 10) valida a renderização.

---

## Task 8: Tela global de cadastro da API key + câmbio (super admin)

**Files:** Create `src/app/admin/configuracoes/ia/page.tsx` (+ entrada no menu admin de configurações, se houver).

- [ ] **Step 1:** Página (server component busca `GET /api/admin/ai-config` ou usa `getAiConfig()` direto via server) com form:
  - Campo **API key Anthropic** (password input; placeholder "••••" se `hasKey`; vazio = não altera). Texto: "A chave fica cifrada; não é exibida."
  - Campo **Câmbio USD→BRL** (number, default 5.5).
  - Campo **Markup %** (number, default 0).
  - Campo **Fator de crédito** (tokens por crédito, default 1000).
  - Botão Salvar → PUT `/api/admin/ai-config`.
- [ ] **Step 2:** Procurar o menu/nav de `/admin/configuracoes` (a memória cita `/admin/configuracoes/seguranca`, `/sincronizacao`) e adicionar item "IA". Se a estrutura for de subpáginas, seguir o padrão.
- [ ] **Step 3:** Typecheck. Commit `feat(ia-config): tela super admin de cadastro de API key + câmbio/markup/fator`.

> Segurança: a página NUNCA recebe a key decifrada (GET só devolve `hasKey`). O input de key é write-only.

---

## Task 9: Rota + tela da ótica (C3)

**Files:** Create `src/app/api/company/ai-settings/route.ts`, `src/app/api/company/ai-usage/route.ts`, `src/app/(dashboard)/dashboard/configuracoes/ia/page.tsx` (+ testes de rota).

### 9a — `PUT /api/company/ai-settings` (só iaEnabled)

> `requireAuth()` + `getCompanyId()` + `requirePermission("company.settings")`. Aceita SÓ `{ iaEnabled: boolean }`. **NUNCA** iaAvailable/cota. Se a ótica não tem `iaAvailable=true`, retorna 403 (não pode ligar o que não foi liberado).

- [ ] Teste (401 sem auth; 403 sem permissão; 403 se iaAvailable=false ao tentar ligar; grava só iaEnabled; ignora iaAvailable/cota no body) → FAIL → impl → PASS → commit `feat(ia-config): rota ótica PUT ai-settings (só iaEnabled)`.

```typescript
// impl resumida
await requireAuth(); const companyId = await getCompanyId(); await requirePermission("company.settings");
const body = await request.json();
const iaEnabled = body.iaEnabled === true;
const cur = await prisma.companySettings.findUnique({ where: { companyId }, select: { iaAvailable: true } });
if (iaEnabled && !cur?.iaAvailable) throw forbiddenError("IA não liberada para esta ótica.");
await prisma.companySettings.upsert({ where: { companyId }, update: { iaEnabled }, create: { companyId, iaEnabled } });
return NextResponse.json({ success: true, data: { iaEnabled } });
```

### 9b — `GET /api/company/ai-usage` (créditos, SEM R$)

> Retorna consumo em **créditos** (tokens/creditTokenFactor) + cota em créditos + histórico diário em créditos. **NUNCA** `costUsd`/R$.

- [ ] Teste (401; retorna creditsUsed/creditsLimit/daily em créditos; **asserção recursiva de ausência de R$** — sua restrição mais forte: `expect(JSON.stringify(body)).not.toMatch(/usd|brl|cost|R\$/i)`) → FAIL → impl → PASS → commit `feat(ia-config): rota ótica GET ai-usage (créditos, sem R$)`.

```typescript
// impl resumida
const companyId = await getCompanyId(); await requirePermission("company.settings");
const cfg = await getAiConfig();
const usage = await getMonthlyUsage(companyId);
const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: true } });
const creditsUsed = tokensToCredits(usage.totalTokens, cfg.creditTokenFactor);
const creditsLimit = settings?.iaMonthlyTokenLimit != null ? tokensToCredits(settings.iaMonthlyTokenLimit, cfg.creditTokenFactor) : null;
const daily = (await getDailyUsage(companyId)).map(d => ({ date: d.date, credits: tokensToCredits(d.tokens, cfg.creditTokenFactor) })); // SEM costUsd
return NextResponse.json({ data: { iaAvailable: settings?.iaAvailable ?? false, iaEnabled: settings?.iaEnabled ?? false, creditsUsed, creditsLimit, daily } });
```

### 9c — `configuracoes/ia/page.tsx` (ótica)

- [ ] Subpágina (segue padrão das outras subpáginas de config): só renderiza conteúdo de IA se `iaAvailable` (senão "IA não disponível — fale com o suporte"). Mostra:
  - `<Switch>` **IA ligada/desligada** (`iaEnabled`) → PUT ai-settings.
  - Medidor **"Você usou X de Y créditos este mês"** (ou "uso este mês: X créditos" se cota null).
  - Gráfico/histórico diário em créditos.
  - Entrada no menu de navegação de config da ótica.
- [ ] Typecheck. Commit `feat(ia-config): subpágina IA na config da ótica (créditos, liga/desliga)`.

---

## Task 10: Verificação final

- [ ] **Step 1:** Suíte dos arquivos novos: `node node_modules/vitest/vitest.mjs run src/lib/secret-cipher.test.ts src/services/ai-config.service.test.ts src/lib/ai-pricing.test.ts src/lib/ai/lead-qualifier.test.ts src/services/ai-usage.service.test.ts` + as rotas novas → todos verdes.
- [ ] **Step 2:** Suíte completa: `node node_modules/vitest/vitest.mjs run` (atenção ao flake FilterBar).
- [ ] **Step 3:** Typecheck: `node node_modules/typescript/bin/tsc --noEmit` → 0 (se `.next/types` stale, `rm -rf .next`).
- [ ] **Step 4:** Migration aditiva: `grep -iE "DROP|ALTER TABLE.*DROP" prisma/migrations/*_ai_global_config/migration.sql || echo "✓ aditiva"`.
- [ ] **Step 5:** Build: `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build` ("✓ Compiled successfully"; novas rotas/páginas aparecem).
- [ ] **Step 6:** Commit final se houver ajustes.

---

## Segurança / cuidados (checklist)

- **API key:** cifrada no banco (AES-256-GCM); nunca retornada decifrada ao front (GET só `hasKey`); input write-only. **Nova env `ENCRYPTION_KEY`** obrigatória.
- **R$ nunca para a ótica:** as rotas `/api/company/ai-*` retornam só créditos; nenhum `costUsd`/BRL. Teste explícito assertando ausência de R$ na resposta.
- **iaAvailable/cota só super admin:** a rota da ótica aceita só `iaEnabled` e bloqueia ligar se `!iaAvailable`.
- **Multi-tenant:** toda query por companyId; rotas admin com `requireCompanyScope`.
- **Fail-safe:** `getAnthropicKey` cai na env se decifragem falhar (não derruba a IA por config corrompida).

## Notas de deploy

1. **⚠️ Nova env `ENCRYPTION_KEY`** (32 bytes hex) na Vercel ANTES do deploy — gerar com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Sem ela, cadastrar/usar a key falha. Guardar com segurança (perdê-la = perder a key cifrada).
2. `migrate status` → `migrate deploy` (1 tabela aditiva `AiGlobalConfig`).
3. **Após o deploy:** super admin abre a tela de config IA, cola a Anthropic key (vai cifrada), confirma câmbio/fator. Enquanto a key não for cadastrada, `getAnthropicKey` usa a env (se houver) — então o B' continua funcionando se a env já estava setada.
4. **Sequência p/ ligar o teste (depois de tudo no ar):** super admin cadastra key → na aba IA da ótica-piloto liga `iaAvailable` + define cota → a ótica (ou o super admin) liga `iaEnabled` → o cron/botão passa a qualificar. Observar consumo na própria tela (tokens + R$) antes de liberar outras óticas.
5. `.vercel/project.json` (pdv-otica) já no worktree.

## Fora de escopo (v2)

- Faturamento/recarga de créditos (créditos são só visualização agora).
- Câmbio dinâmico (API de cotação).
- Key por ótica (modelo é key global do SaaS).
- Rotação automática de `ENCRYPTION_KEY` / re-cifragem.
- Áudio/imagem na IA (Bloco B' 2º corte).
