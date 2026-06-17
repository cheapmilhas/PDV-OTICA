# Assistente de Lentes — Fase 4 (Migração do OCR de receita) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar a rota de OCR de receita (`/api/ocr/prescription`) do `new Anthropic()` cru (que usa só a env em build-time + modelo hardcoded) para a infra padrão de IA: `getAnthropicKey()` (chave cifrada do super admin, com fallback p/ env) + modelo **configurável** via novo campo `ocrModel` no `AiGlobalConfig` (default `claude-sonnet-4-6`, melhor leitura de imagem que haiku). Corrige o bug latente (OCR quebra se a env não estiver setada na Vercel; ignora rotação de chave do C2) e fecha a lacuna de configurabilidade. A medição (`logAiUsage`) e o "mede mas NÃO bloqueia" (sem `assertAiAllowed`) já existem e ficam como estão.

**Architecture:** Espelha exatamente o encanamento que a F1 fez para `lensAdvisorModel`: nova coluna no `AiGlobalConfig` (migração ADITIVA) → `AiConfigView` get/update (allowlist `QUALIFIER_MODELS`) → rota PUT `ai-config` aceita o campo → seletor na tela de IA. A rota OCR deixa de instanciar `new Anthropic()` no módulo e passa a, por requisição: `getAnthropicKey()` (guard sem chave) → `new Anthropic({ apiKey })` → `getAiConfig().ocrModel` no `messages.create` E no `logAiUsage`. Sem prompt-injection por nonce (a entrada é IMAGEM, não texto de terceiro — fora de escopo).

**Tech Stack:** Next.js App Router · Prisma 5.22 · TypeScript · Vitest · `@anthropic-ai/sdk` (visão/imagem) · chave cifrada (`secret-cipher`, já existe).

**Spec:** `docs/superpowers/specs/2026-06-17-assistente-lentes-ia-design.md` (Fase 4 = foto-da-receita; esta é a sub-fase "migrar o OCR"). Decisão do dono 2026-06-17: campo próprio `ocrModel` default `claude-sonnet-4-6`.

---

## Fatos verificados (seguir à risca)

- **rtk** quebra binários no worktree: `node node_modules/{vitest/vitest.mjs run,typescript/bin/tsc --noEmit,prisma/build/index.js}`. `git commit --no-verify`. Exit engolido → `rtk proxy`.
- **Sem banco local:** a migração desta fase é **SQL à mão** (uma coluna aditiva). NÃO rodar `migrate dev`. Aplicar `migrate deploy` SÓ no deploy (gated, autorização do dono).
- **Build:** `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build`.
- **Worktree:** `.worktrees/integra-lentes` (branch `feat/integra-lentes`) — é o tip de prod (lentes F1+F2+F3 + anti-bloqueio + travas). Trabalhar AQUI.
- **`getAnthropicKey(): Promise<string | undefined>`** de `@/services/ai-config.service` — retorna a chave DECIFRADA do banco; **se não houver, faz fallback p/ `process.env.ANTHROPIC_API_KEY`**. Logo, migrar o OCR p/ ela é estritamente mais seguro (preferе a chave do super admin, mas ainda funciona via env = comportamento atual). **Guard:** se retornar `undefined` (sem chave nem env) → não chama a API; devolve erro claro (hoje o OCR explodiria — agora falha graciosa).
- **`getAiConfig(): Promise<AiConfigView>`** — após a Task 2, `AiConfigView` terá `ocrModel: string`.
- **Allowlist:** `QUALIFIER_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"]` de `@/services/ai-config.service`. Os 3 têm visão (aceitam `image`). `ocrModel` reusa essa allowlist (defesa em profundidade na rota PUT + no service).
- **`logAiUsage`** já é chamado pela rota OCR com `feature: "ocr_prescription"` — **manter**, só trocar o `model` hardcoded pelo configurável.
- **Rota OCR atual** (`src/app/api/ocr/prescription/route.ts`): `const anthropic = new Anthropic();` no módulo (linha 12), `model: "claude-sonnet-4-20250514"` hardcoded em 2 lugares (create + logAiUsage), rate-limit `ocr-prescription:${userId}` 10/h, validação de tamanho/mime, parse defensivo de JSON. **NÃO tem teste** — a Task 4 cria.
- **Migração F1 (formato a copiar):** `ALTER TABLE "AiGlobalConfig" ADD COLUMN "lensAdvisorModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5';`
- **`assertAiAllowed` NÃO é usado no OCR** (decisão da spec: OCR mede, não bloqueia). MANTER assim — não adicionar.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `prisma/schema.prisma` | Modificar | + `ocrModel String @default("claude-sonnet-4-6")` no model `AiGlobalConfig`. |
| `prisma/migrations/20260617130000_ocr_model/migration.sql` | Criar | `ALTER TABLE ... ADD COLUMN "ocrModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';` (aditiva, SQL à mão). |
| `src/services/ai-config.service.ts` | Modificar | `AiConfigView.ocrModel` + `UpdateAiConfigInput.ocrModel` + leitura no `getAiConfig` + escrita allowlisted no `updateAiConfig` (espelha `lensAdvisorModel`). |
| `src/app/api/admin/ai-config/route.ts` | Modificar | PUT aceita `ocrModel` (mesma allowlist `QUALIFIER_MODELS`). |
| `src/app/api/ocr/prescription/route.ts` | Modificar | Remove `new Anthropic()` do módulo; por request: `getAnthropicKey()` guard → `new Anthropic({ apiKey })` → `getAiConfig().ocrModel` no create + no logAiUsage. |
| `src/app/admin/configuracoes/ia/ia-client.tsx` | Modificar | + seletor "Modelo do OCR de receita" (reusa o padrão do seletor `lensAdvisorModel`). |
| (+ testes de cada um) | | |

> **Ordem:** T1 schema+migração `ocrModel` → T2 ai-config service (view/update) → T3 rota PUT aceita ocrModel → T4 rota OCR migra p/ getAnthropicKey + modelo configurável (+ teste novo) → T5 seletor na tela de IA → T6 verificação.

---

## Task 1: schema + migração aditiva `ocrModel`

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260617130000_ocr_model/migration.sql`.

- [ ] **Step 1:** No `model AiGlobalConfig` do `prisma/schema.prisma`, adicionar a linha (logo após `lensAdvisorModel`):
  ```prisma
  ocrModel        String   @default("claude-sonnet-4-6")
  ```
- [ ] **Step 2:** Criar `prisma/migrations/20260617130000_ocr_model/migration.sql` com:
  ```sql
  -- AlterTable
  ALTER TABLE "AiGlobalConfig" ADD COLUMN "ocrModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';
  ```
  (ADITIVA — a linha singleton existente recebe o default; nenhum dado é perdido. NÃO aplicar agora — só no deploy gated.)
- [ ] **Step 3:** Regenerar o client p/ os types: `node node_modules/prisma/build/index.js generate`. Esperado: "Generated Prisma Client".
- [ ] **Step 4:** `node node_modules/typescript/bin/tsc --noEmit` → 0 (o novo campo ainda não é usado em lugar nenhum; só confirma que o schema compila).
- [ ] **Step 5: Commit** `feat(lens-f4): coluna ocrModel em AiGlobalConfig (aditiva, default sonnet-4-6)`.

---

## Task 2: ai-config.service — expõe e atualiza `ocrModel`

**Files:** `src/services/ai-config.service.ts` (+test).

- [ ] **Step 1: Teste que falha** (`src/services/ai-config.service.test.ts` — **JÁ EXISTE** (~9KB, cobre `qualifierModel`/`lensAdvisorModel`/`getAnthropicKey`); **ESTENDER**, não recriar.) Mockar `@/lib/prisma` no estilo já usado no arquivo de teste. Casos:
  - `getAiConfig()` devolve `ocrModel` lido do registro (ex.: mock retorna `ocrModel: "claude-opus-4-8"` → a view reflete).
  - `updateAiConfig({ ocrModel: "claude-sonnet-4-6" })` → grava (está na allowlist).
  - `updateAiConfig({ ocrModel: "modelo-invalido" })` → **NÃO grava** (silenciosamente ignorado, como `qualifierModel`/`lensAdvisorModel`).
  > Se o arquivo de teste do service ainda não cobre esses helpers, espelhe o estilo dos testes de `lensAdvisorModel` (procure por "lensAdvisorModel" no test file existente e copie o padrão).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementar** (espelha `lensAdvisorModel` EXATAMENTE):
  - `AiConfigView`: + `ocrModel: string;`.
  - `getAiConfig()` return: + `ocrModel: c.ocrModel,`.
  - `UpdateAiConfigInput`: + `ocrModel?: string;`.
  - `updateAiConfig`: + bloco
    ```ts
    // Mesma allowlist (defesa em profundidade); ignora silenciosamente o resto.
    if (patch.ocrModel && (QUALIFIER_MODELS as readonly string[]).includes(patch.ocrModel)) {
      data.ocrModel = patch.ocrModel;
    }
    ```
- [ ] **Step 4: Run → PASS.** + `tsc --noEmit` → 0.
- [ ] **Step 5: Commit** `feat(lens-f4): ai-config expõe/atualiza ocrModel (reusa allowlist)`.

---

## Task 3: rota PUT `ai-config` aceita `ocrModel`

**Files:** `src/app/api/admin/ai-config/route.ts` (+test, se houver).

- [ ] **Step 1: Teste/estende** (se a rota tiver test; se não, pular o teste e confiar no service+tsc — mas PROCURE `ai-config/route.test.ts`). Caso: PUT com `ocrModel` válido → encaminhado; inválido → ignorado.
- [ ] **Step 2 (se houver teste): Run → FAIL.**
- [ ] **Step 3: Implementar** — no parse do body da rota PUT, espelhar o bloco do `lensAdvisorModel`:
  - no tipo do body: `ocrModel?: string;`.
  - no encaminhamento:
    ```ts
    // ocrModel: mesma allowlist (o serviço também valida; aqui ignora silenciosamente como os demais).
    if (typeof body.ocrModel === "string" && (QUALIFIER_MODELS as readonly string[]).includes(body.ocrModel)) {
      patch.ocrModel = body.ocrModel;
    }
    ```
- [ ] **Step 4: Run → PASS** (ou só `tsc` 0 se não houver teste).
- [ ] **Step 5: Commit** `feat(lens-f4): rota PUT ai-config aceita ocrModel`.

---

## Task 4: rota OCR migra p/ getAnthropicKey + modelo configurável (com teste novo)

**Files:** `src/app/api/ocr/prescription/route.ts` (+ NOVO test `route.test.ts`).

- [ ] **Step 1: Teste que falha** (`src/app/api/ocr/prescription/route.test.ts` — NÃO existe hoje, criar). Mockar `@anthropic-ai/sdk` (construtor + messages.create, estilo `lead-qualifier.test.ts`), `@/services/ai-config.service` (`getAnthropicKey`, `getAiConfig`), `@/services/ai-usage.service` (`logAiUsage`), `@/lib/auth-helpers` (`requireAuth` → session com user.id; `getCompanyId` → "co1"), `@/lib/rate-limit` (`rateLimitResponse` → null por padrão). Casos:
  - **happy:** body `{ imageBase64: "<base64 curto>", mimeType: "image/png" }` + `getAnthropicKey` → "k" + `getAiConfig` → `{ ocrModel: "claude-sonnet-4-6", ... }` + messages.create resolve `{ content: [{type:"text", text: JSON.stringify({od:{esf:-2},oe:{esf:-2}})}], usage: { input_tokens: 50, output_tokens: 30, cache_read_input_tokens: 0 } }` → 200 com `{ data: { od, oe, ... } }`; **assert que `messages.create` foi chamado com `model: "claude-sonnet-4-6"`** (o configurável, NÃO o hardcoded antigo) e que `logAiUsage` foi chamado com `feature: "ocr_prescription"`, `model: "claude-sonnet-4-6"`, companyId "co1" e os tokens.
  - **sem chave:** `getAnthropicKey` → undefined → **NÃO chama messages.create**, devolve erro claro (status 4xx/5xx — escolher: recomendado 503/500 com mensagem "IA não configurada"; veja o handleApiError do projeto). Assert messages.create não chamado, logAiUsage não chamado.
  - **rate-limit:** `rateLimitResponse` → uma Response 429 → retorna direto; messages.create não chamado.
  - **imagem ausente:** body sem `imageBase64` → 400 (mantém o comportamento atual). messages.create não chamado.
  - **JSON inválido da IA:** messages.create resolve com texto não-JSON → 422 (mantém o comportamento atual, parse defensivo).
  > Use um `imageBase64` curto (ex.: "QUJD") nos testes — o limite de 8MB não interfere.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementar** a migração na rota:
  - **Remover** `const anthropic = new Anthropic();` do escopo do módulo (linha ~12).
  - Dentro do `try` do POST, APÓS o rate-limit e a validação de input (mime/tamanho) e o `const companyId = await getCompanyId();`:
    ```ts
    const apiKey = await getAnthropicKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: { code: "AI_NOT_CONFIGURED", message: "IA não configurada. Cadastre a chave Anthropic no painel do super admin." } },
        { status: 503 }
      );
    }
    const anthropic = new Anthropic({ apiKey });
    const { ocrModel } = await getAiConfig();
    ```
  - No `anthropic.messages.create({ ... })`: trocar `model: "claude-sonnet-4-20250514"` por `model: ocrModel`.
  - No `logAiUsage({ ... })`: trocar `model: "claude-sonnet-4-20250514"` por `model: ocrModel`.
  - Adicionar os imports: `import { getAnthropicKey, getAiConfig } from "@/services/ai-config.service";`.
  - **NÃO** mexer no rate-limit, na validação de mime/tamanho, no parse defensivo de JSON, na `feature: "ocr_prescription"`, nem adicionar `assertAiAllowed` (OCR mede, não bloqueia).
- [ ] **Step 4: Run → PASS.** + `tsc --noEmit` → 0.
- [ ] **Step 5: Commit** `feat(lens-f4): OCR usa getAnthropicKey + ocrModel configurável (corrige bug latente da env)`.

---

## Task 5: seletor "Modelo do OCR de receita" na tela de IA

**Files (TODOS os 3 hops — o valor inicial flui `page.tsx → ia-tabs.tsx → ia-client.tsx`, e CADA hop redeclara seu próprio `AiConfigView` e o `page.tsx` mapeia campo-a-campo SEM spread):**
- `src/app/admin/configuracoes/ia/page.tsx`
- `src/app/admin/configuracoes/ia/ia-tabs.tsx`
- `src/app/admin/configuracoes/ia/ia-client.tsx`

> **⚠️ Armadilha (do review):** se editar só o `ia-client.tsx`, `config.ocrModel` chega `undefined` em runtime (o `page.tsx` não encaminha e o `ia-tabs.tsx` nem tem o campo na interface). Editar os 3.

- [ ] **Step 1: `page.tsx`** — no objeto `config={{ ... }}` (mapeamento explícito, ~linhas 19-27), adicionar `ocrModel: config.ocrModel,` (a fonte `getAiConfig()` já devolve `ocrModel` após a Task 2). NÃO trocar p/ spread — manter o mapeamento explícito como está.
- [ ] **Step 2: `ia-tabs.tsx`** — no `interface AiConfigView` LOCAL (~linhas 8-16), adicionar `ocrModel: string;` e confirmar que ele repassa o `config` adiante p/ o `ia-client` (segue o que já faz com `lensAdvisorModel`).
- [ ] **Step 3: `ia-client.tsx`** — (a) no `interface AiConfigView` LOCAL (~linhas 7-15) + `ocrModel: string;`; (b) `const [ocrModel, setOcrModel] = useState(config.ocrModel)` espelhando o state do `lensAdvisorModel`; (c) no corpo do PUT, `if (ocrModel) body.ocrModel = ocrModel;` (espelha lensAdvisorModel); (d) o seletor IRMÃO do de `lensAdvisorModel`, **reusando a constante `QUALIFIER_MODEL_OPTIONS`** já no arquivo (~linha 17 — NÃO duplicar a lista); rótulo "Modelo do OCR de receita", ajuda curta "Lê a foto da receita. Sonnet lê manuscrito melhor que Haiku." (o label "padrão" das options se refere ao qualificador — o texto de ajuda do OCR deixa claro que o default aqui é sonnet).
- [ ] **Step 4: Typecheck** `node node_modules/typescript/bin/tsc --noEmit` → 0 (em particular o `page.tsx` exige `ocrModel` no mapeamento depois que a interface o torna obrigatório — esse é o sinal de que os 3 hops bateram).
- [ ] **Step 5: Commit** `feat(lens-f4): seletor de modelo do OCR no super admin (page→tabs→client)`.

---

## Task 6: Verificação final da Fase 4

- [ ] **Step 1:** Suíte completa: `node node_modules/vitest/vitest.mjs run` → tudo verde (inclui o novo teste do OCR + ai-config estendido).
- [ ] **Step 2:** Typecheck → 0 erros.
- [ ] **Step 3:** Migração: confirmar que há EXATAMENTE 1 migração nova (`20260617130000_ocr_model`) e que é aditiva (1 ADD COLUMN). `git status` em prisma/ limpo afora ela.
- [ ] **Step 4:** Build: `TMPDIR=... next build` → "✓ Compiled successfully" + `/api/ocr/prescription` no route table.
- [ ] **Step 5: Resumo + critério de saída.** Confirmar: o OCR não tem mais `new Anthropic()` no módulo; usa `getAnthropicKey` (com guard sem chave) + `ocrModel` configurável no create E no logAiUsage; a medição `ocr_prescription` segue; nada de `assertAiAllowed`; o seletor aparece na tela de IA. **PARAR antes do deploy.** Deploy: aplicar a migração aditiva (`migrate deploy`) ANTES do código (GATE), pois a coluna precisa existir quando `getAiConfig` ler `ocrModel`. ⚠️ A coluna tem default → backfill automático; banco singleton (1 linha) → 0 risco.

---

## Segurança / cuidados
- **getAnthropicKey** já faz fallback p/ env → migração SEM regressão (preferе chave cifrada do super admin, mas funciona via env como hoje). Guard explícito p/ "sem chave nem env" (hoje explodiria; agora 503 claro).
- **Modelo allowlisted** na rota PUT + no service (defesa em profundidade) — só os 3 modelos com visão.
- **Migração ANTES do código no deploy** (a leitura de `ocrModel` em `getAiConfig` exige a coluna). Aditiva + default + 1 linha singleton = sem risco; mas a ordem importa (igual GATE 2 do anti-bloqueio).
- **Sem prompt-injection por nonce:** a entrada do OCR é IMAGEM (não texto de terceiro). Fora de escopo.
- **OCR mede, não bloqueia:** NÃO adicionar `assertAiAllowed` (decisão da spec).

## Notas de deploy
- **TEM migração** (diferente da F3): `20260617130000_ocr_model` aditiva. `migrate deploy` ANTES do `vercel deploy` (gated, autorização do dono).
- Nenhuma env nova.
- Deployar integrando sobre o tip de prod (conferir `migrate status` + `origin/main` antes, como sempre).
- Após deploy: o OCR passa a usar a chave cifrada do super admin se houver (senão a env, como hoje) + o modelo configurado (default sonnet-4-6). Sem mudança visível pro usuário final além de leitura potencialmente melhor.

## Fora de escopo (v2 / fases futuras)
- Anti-injeção/nonce no OCR (entrada é imagem).
- Melhorar QUANTO a foto-receita preenche na OS (mais campos) — o dono pediu só a migração nesta fase.
- Migrar o OCR p/ um serviço dedicado (hoje a lógica vive na rota) — só se crescer.
