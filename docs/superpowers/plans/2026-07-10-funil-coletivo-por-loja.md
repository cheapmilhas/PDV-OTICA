# Funil Coletivo por Loja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o funil de leads coletivo por loja — todo vendedor vê todos os leads — concedendo `LEADS_VIEW_ALL` ao papel SELLER, e fazendo o robô de IA criar leads sem vendedor (card "da loja").

**Architecture:** Duas mudanças independentes. (1) Permissão: SELLER ganha `LEADS_VIEW_ALL` no `ROLE_PERMISSIONS` → o gate `viewAll` do `listLeads` deixa de filtrar por vendedor. (2) Robô: o qualifier deixa de atribuir o usuário-bot como vendedor; o lead nasce com `sellerUserId=null` (schema alargado p/ aceitar null, `createLead` respeita null explícito). Backfill zera o vendedor dos leads do bot já existentes.

**Tech Stack:** Next.js 16, Prisma+Neon, TypeScript, Zod, Vitest. Multi-tenant com companyId.

**Environment notes:**
- Worktree `/Users/matheusreboucas/PDV OTICA/.worktrees/funil-coletivo` (branch `feat/funil-coletivo-por-loja`, base `a32ba953`). node_modules linkado, .env copiado, prisma client já gerado.
- Comandos com `./node_modules/.bin/` (rtk hook quebra `npx`).
- **SEM migração de banco.** `Lead.sellerUserId` já é `String?` nullable.
- Pre-commit tsc hook: se falhar por `systemKey` (client stale), rode `./node_modules/.bin/prisma generate`. NÃO usar `--no-verify` para código — o tsc precisa passar.
- NÃO tocar deploy/env Vercel. Pós-merge (dono): `vercel deploy --prod` + `POST /api/permissions/seed` + rodar o backfill.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/permissions.ts` | SELLER ganha `LEADS_VIEW_ALL` (funil coletivo) | Modificar (:223 área) |
| `src/lib/validations/lead.schema.ts` | `sellerUserId` aceita `null` explícito | Modificar (:11) |
| `src/services/lead.service.ts` | `createLead` respeita `null` explícito (não cai no `?? userId`) | Modificar (:133) |
| `src/services/conversation-qualifier.service.ts` | Robô cria lead sem vendedor (`sellerUserId=null`) | Modificar (:7,330,340-349) |
| `src/lib/permissions-refund.test.ts` ou novo | Teste: SELLER tem VIEW_ALL, não tem SALES_VIEW_ALL | Modificar/Criar |
| `src/lib/validations/lead.schema.test.ts` | Teste: parse com `sellerUserId:null` passa | Modificar |
| `src/services/lead.service.test.ts` | Teste: null explícito grava null; undefined usa userId | Modificar |
| `src/services/conversation-qualifier.service.test.ts` | Teste: robô cria com sellerUserId=null | Modificar |
| `backfill-ownerless-bot-leads.mjs` (raiz do projeto, temporário) | Zera vendedor dos leads do bot existentes | Criar (efêmero) |

---

## Task 1: SELLER ganha LEADS_VIEW_ALL (funil coletivo)

**Files:**
- Modify: `src/lib/permissions.ts` (bloco `ROLE_PERMISSIONS.SELLER`, ~209-253)
- Test: `src/lib/permissions-funil-coletivo.test.ts` (novo)

- [ ] **Step 1: Write the failing test**

Crie `src/lib/permissions-funil-coletivo.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { Permission } from "@/lib/permissions";

describe("Funil coletivo — permissões do SELLER", () => {
  it("SELLER tem LEADS_VIEW_ALL (funil coletivo por loja)", () => {
    expect(ROLE_PERMISSIONS.SELLER).toContain(Permission.LEADS_VIEW_ALL);
  });

  it("SELLER NÃO tem SALES_VIEW_ALL (vendas seguem por vendedor)", () => {
    expect(ROLE_PERMISSIONS.SELLER).not.toContain(Permission.SALES_VIEW_ALL);
  });

  it("SELLER mantém LEADS_VIEW_OWN e LEADS_ACCESS", () => {
    expect(ROLE_PERMISSIONS.SELLER).toContain(Permission.LEADS_VIEW_OWN);
    expect(ROLE_PERMISSIONS.SELLER).toContain(Permission.LEADS_ACCESS);
  });
});
```

Confirme os nomes de import lendo o topo de `src/lib/permissions.ts` (se `Permission` e `ROLE_PERMISSIONS` são exports nomeados — são).

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/lib/permissions-funil-coletivo.test.ts`
Expected: FAIL no 1º caso ("SELLER tem LEADS_VIEW_ALL") — hoje o SELLER só tem `LEADS_VIEW_OWN`.

- [ ] **Step 3: Adicionar a permissão**

Em `src/lib/permissions.ts`, no bloco `SELLER`, na seção "Funil de Leads" (onde está `Permission.LEADS_VIEW_OWN,` ~linha 223), adicione a linha logo abaixo:

```typescript
    Permission.LEADS_VIEW_OWN,
    Permission.LEADS_VIEW_ALL, // Funil coletivo por loja: vendedor vê todos os leads (fila coletiva). Vendas seguem por vendedor (SALES_VIEW_ALL fica fora).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/lib/permissions-funil-coletivo.test.ts`
Expected: PASS (3 casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts src/lib/permissions-funil-coletivo.test.ts
git commit -m "feat(funil): SELLER ganha LEADS_VIEW_ALL (funil coletivo por loja)"
```

---

## Task 2: Alargar o schema — sellerUserId aceita null

**Files:**
- Modify: `src/lib/validations/lead.schema.ts:11`
- Test: `src/lib/validations/lead.schema.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `src/lib/validations/lead.schema.test.ts` (dentro do describe existente ou um novo):

```typescript
import { createLeadSchema } from "@/lib/validations/lead.schema";

describe("createLeadSchema — sellerUserId nullable", () => {
  it("aceita sellerUserId: null (lead sem vendedor / da loja)", () => {
    const r = createLeadSchema.safeParse({ name: "Maria", sellerUserId: null });
    expect(r.success).toBe(true);
  });
  it("aceita sellerUserId ausente (undefined)", () => {
    const r = createLeadSchema.safeParse({ name: "Maria" });
    expect(r.success).toBe(true);
  });
  it("aceita sellerUserId string", () => {
    const r = createLeadSchema.safeParse({ name: "Maria", sellerUserId: "u_1" });
    expect(r.success).toBe(true);
  });
});
```

Se o arquivo já importa `createLeadSchema` no topo, não duplicar o import.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/lib/validations/lead.schema.test.ts`
Expected: FAIL no caso `null` — hoje `z.string().optional()` rejeita null.

- [ ] **Step 3: Alargar o campo**

Em `src/lib/validations/lead.schema.ts:11`, troque:

```typescript
  sellerUserId: z.string().optional(),
```

por:

```typescript
  sellerUserId: z.string().nullable().optional(), // null = lead "da loja" (sem vendedor); undefined = usa quem criou
```

`updateLeadSchema` deriva via `.partial()` (:23) — herda automático, sem mudança.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/lib/validations/lead.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/lead.schema.ts src/lib/validations/lead.schema.test.ts
git commit -m "feat(funil): createLeadSchema aceita sellerUserId null (lead sem vendedor)"
```

---

## Task 3: createLead respeita null explícito

**Files:**
- Modify: `src/services/lead.service.ts:133`
- Test: `src/services/lead.service.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione dentro do `describe("createLead", ...)` em `src/services/lead.service.test.ts` (o arquivo já tem o pattern `prisma.lead.create.mock.calls[0][0].data`):

```typescript
  it("sellerUserId: null explícito grava null (lead da loja)", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_n", name: "Bot" });

    await createLead({ name: "Bot", sellerUserId: null }, "co_1", "user_fallback", "br_1");
    const data = (prisma.lead.create as any).mock.calls[0][0].data;
    expect(data.sellerUserId).toBeNull();
  });

  it("sellerUserId undefined usa o userId (dono = quem criou)", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_u", name: "Ana" });

    await createLead({ name: "Ana" }, "co_1", "user_fallback", "br_1");
    const data = (prisma.lead.create as any).mock.calls[0][0].data;
    expect(data.sellerUserId).toBe("user_fallback");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/services/lead.service.test.ts`
Expected: FAIL no caso `null` — hoje `data.sellerUserId ?? userId` transforma null em `user_fallback`.

- [ ] **Step 3: Ajustar a lógica**

Em `src/services/lead.service.ts:133`, troque:

```typescript
      sellerUserId: data.sellerUserId ?? userId,
```

por:

```typescript
      // null explícito = lead "da loja" (sem vendedor, ex.: robô do funil).
      // undefined = usa quem criou (comportamento humano padrão).
      sellerUserId: data.sellerUserId === null ? null : (data.sellerUserId ?? userId),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/services/lead.service.test.ts`
Expected: PASS (ambos os novos casos + os existentes).

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros (o schema alargado na Task 2 torna `data.sellerUserId === null` type-sound).

- [ ] **Step 6: Commit**

```bash
git add src/services/lead.service.ts src/services/lead.service.test.ts
git commit -m "feat(funil): createLead respeita sellerUserId null explícito"
```

---

## Task 4: Robô cria lead sem vendedor

**Files:**
- Modify: `src/services/conversation-qualifier.service.ts` (import :7, uso :330, chamada :340-349)
- Test: `src/services/conversation-qualifier.service.test.ts`

- [ ] **Step 1: Write the failing test**

O teste do qualifier já tem `createLeadMock` e mocka `getOrCreateAiSellerUser`. Adicione um caso que verifica o `sellerUserId` passado ao `createLead`. Primeiro LEIA `src/services/conversation-qualifier.service.test.ts` para achar o teste que exercita a criação de lead (onde `createLeadMock` é chamado) e o pattern de asserção. Adicione (adaptando ao setup existente do arquivo):

```typescript
  it("robô cria lead SEM vendedor (sellerUserId null no data)", async () => {
    // ... reusar o setup que leva o fluxo a criar lead (isLead=true, match, etc.)
    // Após rodar o qualify que cria o lead:
    const dataArg = createLeadMock.mock.calls[0][0];
    expect(dataArg.sellerUserId).toBeNull();
  });
```

Se o arquivo já tem um teste "cria lead" com o setup pronto, ESTENDA esse teste com a asserção `expect(createLeadMock.mock.calls[0][0].sellerUserId).toBeNull()` em vez de criar um novo do zero (menos frágil). O ponto: o 1º argumento (`data`) do createLead deve conter `sellerUserId: null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/services/conversation-qualifier.service.test.ts`
Expected: FAIL — hoje `data` (linhas 341-348) não tem `sellerUserId`, e o bot é passado como 3º arg posicional.

- [ ] **Step 3: Remover a atribuição do bot**

Em `src/services/conversation-qualifier.service.ts`:

(a) Remover a linha 330:
```typescript
    const sellerUserId = await getOrCreateAiSellerUser(conv.companyId);
```

(b) Adicionar `sellerUserId: null` ao objeto `data` do createLead (dentro do bloco linhas 341-348), e trocar o 3º arg posicional `sellerUserId` por um placeholder (não será usado, pois `data.sellerUserId === null` curto-circuita). A chamada (340-349) fica:

```typescript
    const { lead } = await createLead(
      {
        name: conv.contactName ?? conv.contactNumber,
        phone: conv.contactNumber,
        source,
        interest: result.interest ?? undefined,
        stageId: result.stageId ?? undefined,
        notes: `Lead criado pela IA do funil. Motivo: ${safeReason}`.slice(0, 500),
        sellerUserId: null, // lead "da loja": funil coletivo, vendedor definido só na venda
      },
      conv.companyId, "", null,
      {
```

(O 3º arg `""` satisfaz o tipo `userId: string`; nunca é usado porque `data.sellerUserId === null` vence o fallback. Alternativamente, se preferir clareza, veja se a assinatura de `createLead` aceita refactor — mas NÃO refatore a assinatura aqui; passar `""` é suficiente e localizado.)

(c) Se o import `getOrCreateAiSellerUser` (linha 7) ficar sem uso em TODO o arquivo, removê-lo. Confirme com: `grep -n "getOrCreateAiSellerUser" src/services/conversation-qualifier.service.ts` — se só sobrar o import, apague o import.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/services/conversation-qualifier.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (garante que o import removido não deixou referência órfã)**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/services/conversation-qualifier.service.ts src/services/conversation-qualifier.service.test.ts
git commit -m "feat(funil): robô cria lead sem vendedor (funil coletivo)"
```

---

## Task 5: Script de backfill (leads do bot existentes → sem vendedor)

**Files:**
- Create: `backfill-ownerless-bot-leads.mjs` (raiz do worktree, temporário — NÃO commitar)

- [ ] **Step 1: Escrever o script (dry-run default, --apply explícito)**

Crie `backfill-ownerless-bot-leads.mjs` no raiz do worktree:

```javascript
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Usuários-bot do sistema (o robô "IA (Funil WhatsApp)" é isSystem=true).
const bots = await prisma.user.findMany({ where: { isSystem: true }, select: { id: true, companyId: true, name: true } });
const botIds = bots.map((b) => b.id);
console.log(`### ${APPLY ? "APLICANDO" : "DRY-RUN (nada será alterado)"}`);
console.log(`Bots do sistema: ${bots.length} — ${bots.map((b) => `${b.name}(${b.companyId})`).join(", ") || "nenhum"}`);

if (botIds.length === 0) {
  console.log("Sem bots — nada a fazer.");
  await prisma.$disconnect();
  process.exit(0);
}

// Leads atribuídos a um bot (o alvo do backfill).
const affected = await prisma.lead.count({ where: { sellerUserId: { in: botIds } } });
console.log(`Leads com vendedor = bot: ${affected}`);

if (!APPLY) {
  console.log("\nDRY-RUN: reset NÃO aplicado. Rode com --apply para desvincular (sellerUserId=null).");
} else {
  const r = await prisma.lead.updateMany({
    where: { sellerUserId: { in: botIds } },
    data: { sellerUserId: null },
  });
  console.log(`\n✅ APLICADO: ${r.count} leads desvinculados (sellerUserId=null). O bot NÃO foi deletado.`);
}
await prisma.$disconnect();
```

- [ ] **Step 2: Rodar o dry-run**

Run: `node --env-file=.env backfill-ownerless-bot-leads.mjs`
Expected: lista os bots do sistema e a contagem de leads com vendedor=bot. NÃO altera nada.

> NOTA: este é o dry-run contra PROD (o .env aponta pra prod). É só leitura (count). O `--apply` é decisão do dono no deploy — NÃO rodar `--apply` durante a implementação. O objetivo aqui é só validar que o script roda e reporta.

- [ ] **Step 3: NÃO commitar o script; deixá-lo para o deploy**

O script é uma ferramenta pontual. NÃO adicionar ao git. Verifique que não está staged:

```bash
git status --short
```
Se aparecer `backfill-ownerless-bot-leads.mjs` como untracked, deixe assim (não `git add`). Ele fica no worktree para o dono rodar `--apply` no deploy, ou pode ser movido para `scratchpad/` depois.

---

## Task 6: Verificação final (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros. (Se `systemKey`, rode `./node_modules/.bin/prisma generate` e repita.)

- [ ] **Step 2: Suite completa**

Run: `./node_modules/.bin/vitest run`
Expected: todos PASS. Foco: `permissions-funil-coletivo`, `lead.schema`, `lead.service`, `conversation-qualifier.service`.

- [ ] **Step 3: Build de produção**

Run: `./node_modules/.bin/next build`
Expected: "Compiled successfully".

- [ ] **Step 4: Commit de sobras (se houver)**

```bash
git add -A ':!backfill-ownerless-bot-leads.mjs' && git commit -m "chore(funil): verificação final" || echo "nada a commitar"
```
(Excluir o script de backfill do commit.)

- [ ] **Step 5: Resumo para o dono**

Confirme: (a) SELLER vê todos os leads (funil coletivo); (b) vendas intocadas (SALES_VIEW_ALL fora do SELLER); (c) robô cria lead sem vendedor; (d) card trata null; (e) sem migração. Passos pós-deploy do dono: `vercel deploy --prod` → `POST /api/permissions/seed` → `node --env-file=.env backfill-ownerless-bot-leads.mjs --apply`.
