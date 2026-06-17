# Assistente de Lentes — Fase 2 (Base de Conhecimento + Playground) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao super admin uma **Base de Conhecimento** gerenciável (documentos texto, global ou por ótica) que vira o contexto curado da IA, e um **Playground** isolado para testar (na Fase 2 testa o motor óptico + a montagem de contexto, sem chamada Claude — a IA entra na Fase 3), mais o botão **ligar/desligar IA para todas as óticas**.

**Architecture:** Nova tabela `LensKnowledgeDoc` (texto no Postgres, `companyId` null = global). Um serviço `lens-knowledge.service.ts` que faz CRUD + monta o contexto (global + da ótica) com `companyId` tipado obrigatório no fluxo do vendedor (falha fechada). `AiTokenUsage.companyId` passa a ser opcional (para o uso do playground = `companyId null`). A tela `/admin/configuracoes/ia` ganha sub-abas (Config | Base de Conhecimento | Playground). Tudo reusa a infra de IA C1-D.

**Tech Stack:** Next.js App Router · Prisma 5.22 · TypeScript · Vitest · React (client components). Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-06-17-assistente-lentes-ia-design.md` (Camada 2 + Governança A/B/C + Fase 2).

---

## Fatos verificados (seguir à risca)

- **rtk quebra binários no worktree:** `node node_modules/{vitest/vitest.mjs run,typescript/bin/tsc --noEmit,prisma/build/index.js}`. `git commit --no-verify`. Se um exit code parecer engolido, prefixar `rtk proxy`.
- **Sem banco local:** migration via SQL escrito à mão (migrate diff exige shadow db). Aplicar `migrate deploy` só no deploy.
- **Build:** `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build`.
- **`AiTokenUsage`** hoje: `companyId String` (NOT NULL) + `company Company @relation(... onDelete: Cascade)` + índices `[companyId,createdAt]`/`[companyId,feature]`. Esta fase torna `companyId` **opcional** (`String?`, relação opcional) — migração aditiva (afrouxar NOT NULL é seguro; nenhuma linha existente quebra). **Confirmado seguro:** `getMonthlyUsage`/`getDailyUsage` filtram `where: { companyId }` com valor específico → linhas com `companyId = null` (playground) NUNCA aparecem nos painéis de nenhuma ótica.
- **`logAiUsage`** (`src/services/ai-usage.service.ts`): `LogAiUsageInput.companyId: string` hoje → passa a `string | null`; o `prisma.aiTokenUsage.create` grava `companyId: input.companyId` (aceita null após o schema mudar).
- **Tela admin de IA é UMA página só hoje** (`src/app/admin/configuracoes/ia/page.tsx` server `force-dynamic` + `requireAdminRole`/`getAiConfig` → `<IaClient/>`; `ia-client.tsx` é o form client com o select de modelo). Esta fase introduz **sub-abas** — o conteúdo atual vira a aba "Configuração".
- **Rotas admin** usam `getAdminSession()` (retorna o admin ou null → 401). Padrão: `NextRequest`/`Request` + try/catch implícito + `NextResponse.json`. Ver `src/app/api/admin/ai-config/route.ts`.
- **`AiGlobalConfig`** singleton id="global". `CompanySettings` tem `iaAvailable`/`iaEnabled` (o "ligar p/ todas" mexe em `iaAvailable` de todas as óticas).
- **Estimativa de tokens:** usar heurística simples declarada (`Math.ceil(text.length / 4)`) na Fase 2; não depender da API de token-counting (evita custo/rede no upload). Documentar como aproximação.
- **Empresa-listagem segura:** o "ligar p/ todas" faz `updateMany` em `CompanySettings` — NÃO cria Company nova, então não há risco de empresa-fantasma (decisão da spec: playground usa `companyId null`, não Company de sistema).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `prisma/schema.prisma` | Modificar | `+ model LensKnowledgeDoc`; tornar `AiTokenUsage.companyId` opcional (+relação opcional). |
| `prisma/migrations/<ts>_lens_knowledge/migration.sql` | Criar | Migration aditiva (CREATE TABLE LensKnowledgeDoc + ALTER AiTokenUsage drop-not-null + drop-fk/re-add-optional-fk). |
| `src/services/lens-knowledge.service.ts` | Criar | CRUD de docs (super admin) + `buildKnowledgeContext(companyId)` (global + da ótica, companyId obrigatório tipado, falha fechada) + `estimateTokens(text)`. |
| `src/services/lens-knowledge.service.test.ts` | Criar | TDD: CRUD, escopo global vs ótica, **teste anti-vazamento** (corpus de A não aparece p/ B), estimativa de tokens. |
| `src/services/ai-usage.service.ts` | Modificar | `LogAiUsageInput.companyId: string \| null`. |
| `src/services/ai-usage.service.test.ts` | Modificar | caso: logAiUsage com companyId null grava (playground). |
| `src/app/api/admin/lens-knowledge/route.ts` | Criar | GET (lista) + POST (cria) — getAdminSession. |
| `src/app/api/admin/lens-knowledge/route.test.ts` | Criar | auth 401; lista; cria (valida escopo/título/conteúdo). |
| `src/app/api/admin/lens-knowledge/[id]/route.ts` | Criar | PATCH (ativa/desativa/edita) + DELETE — getAdminSession. |
| `src/app/api/admin/lens-knowledge/[id]/route.test.ts` | Criar | auth 401; patch; delete. |
| `src/app/api/admin/ai-playground/route.ts` | Criar | POST: roda motor óptico + monta contexto p/ uma ótica-alvo (ou global), grava logAiUsage com companyId null + feature "lens_advisor_playground". SEM chamada Claude na F2. |
| `src/app/api/admin/ai-playground/route.test.ts` | Criar | auth 401; retorna análise do motor + resumo do contexto; **não toca cota/custo de ótica real** (companyId null no log). |
| `src/app/api/admin/ai-toggle-all/route.ts` | Criar | POST: liga/desliga `iaAvailable` (e opcionalmente `iaEnabled`) de todas as óticas (updateMany). getAdminSession. |
| `src/app/api/admin/ai-toggle-all/route.test.ts` | Criar | auth 401; updateMany chamado com o valor certo. |
| `src/app/admin/configuracoes/ia/ia-tabs.tsx` | Criar | client: sub-abas (Configuração \| Base de Conhecimento \| Playground) + o botão "ligar/desligar p/ todas". |
| `src/app/admin/configuracoes/ia/knowledge-client.tsx` | Criar | client: lista/cria/ativa/deleta docs (chama as rotas lens-knowledge). |
| `src/app/admin/configuracoes/ia/playground-client.tsx` | Criar | client: form de grau+armação+ótica-alvo → chama ai-playground → mostra análise do motor + contexto. |
| `src/app/admin/configuracoes/ia/page.tsx` | Modificar | renderizar `<IaTabs/>` envolvendo o `<IaClient/>` atual como a aba "Configuração" + passar a lista de óticas (id/nome) p/ o playground/knowledge. |

> **Ordem:** T1 schema (LensKnowledgeDoc + AiTokenUsage.companyId opcional) → T2 logAiUsage aceita null → T3 lens-knowledge.service (CRUD + contexto + anti-vazamento) → T4 rotas lens-knowledge (list/create) → T5 rota lens-knowledge [id] (patch/delete) → T6 rota ai-toggle-all → T7 rota ai-playground (motor + contexto, sem IA) → T8 UI sub-abas + Base de Conhecimento → T9 UI Playground + botão toggle-all → T10 verificação.

---

## Task 1: Schema — LensKnowledgeDoc + AiTokenUsage.companyId opcional

**Files:** `prisma/schema.prisma` + migration.

- [ ] **Step 1: Adicionar o model + afrouxar AiTokenUsage**

Adicionar perto de `AiGlobalConfig`:
```prisma
/// Base de conhecimento do Assistente de Lentes (Fase 2). Só super admin edita.
/// companyId null = GLOBAL (vale p/ todas as óticas); preenchido = só daquela ótica.
model LensKnowledgeDoc {
  id               String   @id @default(cuid())
  companyId        String?
  title            String
  content          String   @db.Text
  tokensEstimate   Int      @default(0)
  active           Boolean  @default(true)
  createdByAdminId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([companyId, active])
}
```
Em `model AiTokenUsage`: trocar `companyId String` por `companyId String?` e a relação `company Company @relation(...)` por `company Company? @relation(...)` (a FK passa a aceitar null). Manter os índices (Postgres indexa null normalmente).
> NOTA: NÃO adicionar back-relation obrigatória em Company (a relação opcional não exige). Se o Prisma reclamar de relação ambígua/faltando, ajustar o lado de Company para opcional também — confirmar com `generate`.

- [ ] **Step 2: generate**

Run: `node node_modules/prisma/build/index.js generate` → sucesso.

- [ ] **Step 3: Escrever a migration à mão**

Criar `prisma/migrations/20260617100000_lens_knowledge/migration.sql` (timestamp posterior a `20260617090000_lens_advisor_model`):
```sql
-- CreateTable
CREATE TABLE "LensKnowledgeDoc" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensEstimate" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LensKnowledgeDoc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LensKnowledgeDoc_companyId_active_idx" ON "LensKnowledgeDoc"("companyId", "active");

-- AlterTable: AiTokenUsage.companyId passa a aceitar NULL (playground)
ALTER TABLE "AiTokenUsage" ALTER COLUMN "companyId" DROP NOT NULL;
```
> A FK `AiTokenUsage_companyId_fkey` existente já permite a coluna nula (uma FK aceita NULL por padrão). NÃO precisa dropar/recriar a FK — apenas `DROP NOT NULL`. Confirmar que o nome da constraint não precisa mudar (não precisa).

- [ ] **Step 4: Verificar additivo-seguro**

Run: `grep -iE "drop table|drop column|truncate" prisma/migrations/20260617100000_lens_knowledge/migration.sql`
Expected: vazio (há `DROP NOT NULL`, que NÃO é destrutivo de dados — é só afrouxar a coluna; o grep acima não deve casar com "DROP NOT NULL").

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260617100000_lens_knowledge/
git commit --no-verify -m "feat(lens-f2): LensKnowledgeDoc + AiTokenUsage.companyId opcional (aditiva)"
```

---

## Task 2: logAiUsage aceita companyId null

**Files:** `src/services/ai-usage.service.ts` (+test).

- [ ] **Step 1: Teste que falha**

Em `ai-usage.service.test.ts`, adicionar: `logAiUsage({ companyId: null, feature: "lens_advisor_playground", provider: "anthropic", model: "claude-haiku-4-5", inputTokens: 10, outputTokens: 5 })` → `prisma.aiTokenUsage.create` é chamado com `data.companyId === null` (mockar prisma como nos testes existentes).

- [ ] **Step 2: Run → FAIL** (tipo não aceita null).

- [ ] **Step 3: Implementar**

Mudar `LogAiUsageInput.companyId: string` → `companyId: string | null`. O `create` já usa `companyId: input.companyId` (agora aceita null pós-schema). Nada mais muda (fail-safe try/catch intacto).

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/services/ai-usage.service.ts src/services/ai-usage.service.test.ts
git commit --no-verify -m "feat(lens-f2): logAiUsage aceita companyId null (playground)"
```

---

## Task 3: lens-knowledge.service (CRUD + contexto + anti-vazamento)

**Files:** `src/services/lens-knowledge.service.ts` (+test).

- [ ] **Step 1: Testes que falham (TDD)**

Criar `lens-knowledge.service.test.ts` (mockar `@/lib/prisma`). Casos:
- `estimateTokens("abcd")` ≈ `Math.ceil(4/4)=1`; string maior proporcional.
- `createDoc({title, content, companyId: null})` grava `tokensEstimate` calculado + active true.
- `listDocs()` retorna todos (admin) ordenados.
- `buildKnowledgeContext(companyId)`: retorna SÓ docs globais (companyId null, active) + docs daquele companyId (active) — **e NUNCA docs de outra ótica**. Teste explícito: doc da ótica "A" + doc global → `buildKnowledgeContext("B")` traz só o global, não o de A.
- `buildKnowledgeContext` com companyId vazio/undefined → lança ou retorna só global de forma segura (falha fechada — escolher e testar: recomendado LANÇAR se companyId não for string não-vazia, pois no fluxo do vendedor é sempre obrigatório).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementar**

```typescript
import { prisma } from "@/lib/prisma";

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4); // heurística ~4 chars/token (aproximação v1)
}

export interface KnowledgeDocInput {
  title: string;
  content: string;
  companyId: string | null; // null = global
  createdByAdminId?: string | null;
}

export async function createDoc(input: KnowledgeDocInput) {
  return prisma.lensKnowledgeDoc.create({
    data: {
      title: input.title,
      content: input.content,
      companyId: input.companyId,
      tokensEstimate: estimateTokens(input.content),
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });
}

export async function listDocs() {
  return prisma.lensKnowledgeDoc.findMany({ orderBy: [{ companyId: "asc" }, { createdAt: "desc" }] });
}

export async function updateDoc(id: string, patch: Partial<{ title: string; content: string; active: boolean }>) {
  const data: Record<string, unknown> = {};
  if (typeof patch.title === "string") data.title = patch.title;
  if (typeof patch.content === "string") { data.content = patch.content; data.tokensEstimate = estimateTokens(patch.content); }
  if (typeof patch.active === "boolean") data.active = patch.active;
  return prisma.lensKnowledgeDoc.update({ where: { id }, data });
}

export async function deleteDoc(id: string) {
  return prisma.lensKnowledgeDoc.delete({ where: { id } });
}

/**
 * Monta o contexto curado para o fluxo do VENDEDOR: docs globais ativos +
 * docs ativos DAQUELA ótica. companyId é OBRIGATÓRIO e tipado — falha fechada
 * (lança) se ausente, p/ nunca vazar corpus entre óticas.
 */
export async function buildKnowledgeContext(companyId: string): Promise<{ docs: { title: string; content: string; scope: "global" | "company" }[]; tokens: number }> {
  if (!companyId || typeof companyId !== "string") {
    throw new Error("buildKnowledgeContext: companyId obrigatório (isolamento multi-tenant)");
  }
  const rows = await prisma.lensKnowledgeDoc.findMany({
    where: { active: true, OR: [{ companyId: null }, { companyId }] },
    orderBy: [{ companyId: "asc" }, { createdAt: "asc" }],
  });
  const docs = rows.map((r) => ({ title: r.title, content: r.content, scope: (r.companyId === null ? "global" : "company") as "global" | "company" }));
  const tokens = docs.reduce((s, d) => s + estimateTokens(d.content), 0);
  return { docs, tokens };
}
```

- [ ] **Step 4: Run → PASS (inclui o anti-vazamento).**

- [ ] **Step 5: Commit**

```bash
git add src/services/lens-knowledge.service.ts src/services/lens-knowledge.service.test.ts
git commit --no-verify -m "feat(lens-f2): lens-knowledge.service (CRUD + contexto isolado por ótica)"
```

---

## Task 4: Rota admin lens-knowledge (GET list + POST create)

**Files:** `src/app/api/admin/lens-knowledge/route.ts` (+test).

- [ ] **Step 1: Testes que falham** (mockar getAdminSession + o service). Casos: sem sessão → 401; GET retorna a lista; POST com {title, content, companyId} cria; POST sem title/content → 400.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementar** (espelhar o padrão de `api/admin/ai-config/route.ts`: getAdminSession → 401; ler body; validar; chamar service). POST aceita `companyId` (string ou null). Passar `createdByAdminId: admin.id`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `feat(lens-f2): rota admin lens-knowledge (list + create)`.

---

## Task 5: Rota admin lens-knowledge/[id] (PATCH + DELETE)

**Files:** `src/app/api/admin/lens-knowledge/[id]/route.ts` (+test).

- [ ] **Step 1: Testes que falham**: 401 sem sessão; PATCH {active:false} chama updateDoc; DELETE chama deleteDoc.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementar** (params Promise<{id}> como nas outras rotas [id]; getAdminSession; PATCH→updateDoc, DELETE→deleteDoc).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(lens-f2): rota admin lens-knowledge [id] (patch + delete)`.

---

## Task 6: Rota admin ai-toggle-all (ligar/desligar IA p/ todas)

**Files:** `src/app/api/admin/ai-toggle-all/route.ts` (+test).

- [ ] **Step 1: Testes que falham**: 401 sem sessão; POST {iaAvailable:true} → `prisma.companySettings.updateMany({ data: { iaAvailable: true } })` chamado; POST {iaAvailable:false} idem com false. (Opcional: aceitar iaEnabled também — manter simples: só iaAvailable na F2, documentar.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementar**: getAdminSession→401; ler body; `if (typeof body.iaAvailable === "boolean") await prisma.companySettings.updateMany({ data: { iaAvailable: body.iaAvailable } })`; retornar `{ updated: count }`. NÃO cria Company nenhuma.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(lens-f2): rota admin ai-toggle-all (liga/desliga IA p/ todas as óticas)`.

---

## Task 7: Rota admin ai-playground (motor + contexto, SEM IA na F2)

**Files:** `src/app/api/admin/ai-playground/route.ts` (+test).

- [ ] **Step 1: Testes que falham** (mockar getAdminSession, buildKnowledgeContext, logAiUsage, e o motor é import puro). Casos:
  - 401 sem sessão.
  - POST {od, oe, frame?, companyId?} → retorna `{ analysis: <resultado de analyzeLens>, context: { docCount, tokens, scope } }`.
  - companyId fornecido → buildKnowledgeContext(companyId); sem companyId → só global (buildGlobalContext OU buildKnowledgeContext com um modo "global"; ver nota).
  - **isolamento de cota/custo:** se a F2 registrar algo via logAiUsage, é com `companyId: null` + `feature:"lens_advisor_playground"` — assertar que NÃO passa o companyId-alvo no log. (Na F2 sem chamada Claude, pode-se NÃO logar nada — então o teste assegura que logAiUsage NÃO é chamado com um companyId de ótica real. Escolher: F2 não loga uso, pois não há custo real ainda; documentar.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementar**: getAdminSession→401; ler body (od/oe no formato do motor — números, ou strings parseadas igual ao painel); `const analysis = analyzeLens({od, oe}, frame)`; montar contexto (se companyId → buildKnowledgeContext(companyId); senão listar só globais). Retornar análise + resumo do contexto (contagem/tokens/escopos), SEM expor conteúdo sensível além do necessário. **Na F2 não chama Claude e não loga custo** (não há gasto real) — deixar um TODO claro de que a Fase 3 adiciona a chamada + logAiUsage(companyId:null).
  > Para "só global" sem companyId: adicionar um helper `buildGlobalContext()` no service (findMany where companyId null + active) OU permitir buildKnowledgeContext aceitar um sentinela — recomendado: criar `buildGlobalContext()` separado (mantém buildKnowledgeContext com companyId obrigatório/falha-fechada intacto p/ o fluxo do vendedor).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(lens-f2): rota admin ai-playground (motor + contexto, isolado, sem IA)`.

> Se o Step 3 exigir `buildGlobalContext()`, adicioná-lo ao service na Task 3 retroativamente OU nesta task com seu próprio mini-teste — preferir adicionar aqui com 1 teste para manter a Task 3 já revisada intacta.

---

## Task 8: UI — sub-abas + Base de Conhecimento

**Files:** `ia-tabs.tsx` (criar), `knowledge-client.tsx` (criar), `page.tsx` (modificar).

- [ ] **Step 1: Sub-abas**

Criar `src/app/admin/configuracoes/ia/ia-tabs.tsx` (client): 3 abas (Configuração | Base de Conhecimento | Playground) com estado local de aba ativa (botões estilizados, padrão Tailwind das telas admin). Recebe como children/props os 3 painéis. A aba "Configuração" renderiza o `<IaClient config={...}/>` atual (sem alterá-lo).

- [ ] **Step 2: Base de Conhecimento client**

Criar `knowledge-client.tsx` (client): lista docs (título, escopo Global/ótica, tokens, ativo) via GET; form de novo doc (título + escopo: select Global ou uma ótica da lista + textarea conteúdo) via POST; toggle ativo/inativo via PATCH; excluir via DELETE. Recebe a lista de óticas (id/nome) como prop p/ o select de escopo. Estados de loading/erro/sucesso amigáveis.

- [ ] **Step 3: page.tsx**

Modificar o server `page.tsx`: além de `getAiConfig()`, buscar a lista de óticas (`prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })`) e renderizar `<IaTabs>` com: aba Config = `<IaClient config={...}/>`; aba Base = `<KnowledgeClient companies={...}/>`; aba Playground = `<PlaygroundClient companies={...}/>` (criada na Task 9 — pode entrar como placeholder aqui e ser preenchida na T9, ou fazer T9 antes; manter ordem T8→T9 com placeholder simples).

- [ ] **Step 4: Typecheck** `node node_modules/typescript/bin/tsc --noEmit` → 0 erros.
- [ ] **Step 5: Commit** `feat(lens-f2): sub-abas de IA + tela Base de Conhecimento`.

---

## Task 9: UI — Playground + botão ligar/desligar p/ todas

**Files:** `playground-client.tsx` (criar), `ia-tabs.tsx` (modificar p/ o botão toggle-all).

- [ ] **Step 1: Playground client**

Criar `playground-client.tsx` (client): form com grau OD/OE (esf/cil/eixo/add) + armação opcional + select de ótica-alvo (ou "Global"); botão "Testar" chama POST `/api/admin/ai-playground`; mostra o resultado do motor (índice/espessura/alertas, reusando a apresentação do painel da OS se prático) + um resumo do contexto (quantos docs/tokens, escopo). Deixa claro na UI que **na Fase 2 testa o motor + contexto; a resposta da IA entra na Fase 3**.

- [ ] **Step 2: Botão "ligar/desligar IA p/ todas"**

No `ia-tabs.tsx` (ou na aba Configuração), adicionar 2 botões/ação que chamam POST `/api/admin/ai-toggle-all` com `{iaAvailable:true|false}`, com AlertDialog de confirmação (ação em massa!) e feedback do nº de óticas atualizadas.

- [ ] **Step 3: Typecheck** → 0 erros.
- [ ] **Step 4: Commit** `feat(lens-f2): playground (motor+contexto) + ligar/desligar IA em massa`.

---

## Task 10: Verificação final da Fase 2

- [ ] **Step 1:** Suíte completa: `node node_modules/vitest/vitest.mjs run` → tudo verde.
- [ ] **Step 2:** Typecheck: `node node_modules/typescript/bin/tsc --noEmit` → 0 erros.
- [ ] **Step 3:** Migração: `grep -iE "drop table|drop column|truncate" prisma/migrations/20260617100000_lens_knowledge/migration.sql` → vazio (só CREATE + DROP NOT NULL, que é seguro).
- [ ] **Step 4:** Build: `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build` → "✓ Compiled successfully" + rotas `/api/admin/lens-knowledge`, `/api/admin/ai-playground`, `/api/admin/ai-toggle-all` no route table.
- [ ] **Step 5: Resumo + critério de saída.** Confirmar: docs global/ótica criáveis; **teste anti-vazamento passa** (corpus de A não vaza p/ B); playground isolado (companyId null, sem tocar cota de ótica real); ligar/desligar em massa funciona; tudo aditivo. PARAR antes do deploy. Documentar que a Fase 3 liga a IA por cima (chamada Claude + cache + rate-limit + logAiUsage no playground e no fluxo real).

---

## Segurança / cuidados
- **Isolamento multi-tenant:** `buildKnowledgeContext(companyId)` exige companyId tipado (falha fechada) + teste anti-vazamento. Base de conhecimento é só super admin (admin cliente não vê).
- **Playground isolado:** companyId null no log + feature própria; updateMany do toggle-all não cria Company.
- **AiTokenUsage.companyId opcional** não polui painéis (filtram por companyId específico). Confirmado em Task 1.
- Migração aditiva (CREATE + DROP NOT NULL; sem DROP de tabela/coluna/dado).

## Fora do escopo (Fase 3/4)
- Chamada Claude no playground e no fluxo do vendedor (lens-advisor.service: getAnthropicKey + cache_control + rate-limit + logAiUsage + anti-injeção + degradação graciosa).
- Foto da receita → preenche OS (migrar OCR).
- Upload de PDF/planilha (Blob + parser). Comparativo com preço da loja (popular LabPriceRange).
- Admin cliente subir documentos.
