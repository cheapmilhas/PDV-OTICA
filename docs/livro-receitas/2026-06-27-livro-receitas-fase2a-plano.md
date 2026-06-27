# Livro de Receitas — Fase 2a (backend) — Plano de Implementação

> **Para quem executa:** implementar tarefa-a-tarefa (TDD: RED→GREEN→commit). Cada passo é uma ação pequena. Steps com `- [ ]`.
> **Spec de referência:** `docs/livro-receitas/2026-06-27-livro-receitas-fase2-design.md`
> **Branch:** `feat/livro-receitas-fase1` (continuação). NÃO mexer na main. NÃO aplicar migração em prod sem snapshot do dono.

**Goal:** Ligar o writer `upsertPrescription` ao fluxo de venda (lente ou exame), com unicidade real por venda, vínculo OS↔receita, rota de leitura e backfill — tudo testado e dormente (sem tela).

**Architecture:** A receita pertence à VENDA. No fechamento da venda (pós-commit, à prova de falha), se há lente ou produto-exame, faz upsert por `saleId` (idempotente). A OS, quando criada, aponta para essa receita. Migração aditiva adiciona `Prescription.saleId @unique` + `Product.isEyeExam`.

**Tech Stack:** Next.js 16, Prisma 5 + Neon Postgres, TypeScript, Vitest. `rtk proxy` prefixa comandos `npx`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `prisma/schema.prisma` | `saleId @unique`, `Product.isEyeExam` | Modificar |
| `prisma/migrations/<ts>_livro_receitas_fase2a/migration.sql` | DDL aditivo | Criar (à mão) |
| `src/services/livro-receitas.service.ts` | upsert por `saleId` (lookup antes de criar) + P2002 | Modificar |
| `src/services/livro-receitas.service.test.ts` | testes do upsert por saleId, skip sem cliente | Modificar |
| `src/services/prescription-from-sale.service.ts` | regra "venda→receita" (detecção lente/exame, monta input) | Criar |
| `src/services/prescription-from-sale.service.test.ts` | testes da regra | Criar |
| `src/services/sale.service.ts:880-902` | chamar prescription-from-sale ANTES do createFromSale | Modificar |
| `src/services/service-order.service.ts` | OS lê receita da venda e grava `prescriptionId`; espelho por saleId | Modificar |
| `src/app/api/prescriptions/customer/[customerId]/route.ts` | leitura por cliente (+dependentes) | Modificar/criar |
| `src/app/api/prescriptions/route.ts` | listagem geral c/ filtro | Modificar |
| `scripts/backfill-livro-receitas.ts` | backfill 3 casos, dry-run | Criar |

---

## Task 1: Migração aditiva (saleId unique + isEyeExam)

**Files:**
- Modify: `prisma/schema.prisma` (model `Prescription` `saleId`; model `Product`)
- Create: `prisma/migrations/<timestamp>_livro_receitas_fase2a/migration.sql`

- [ ] **Step 1: Editar schema** — em `Prescription`, trocar `saleId String?` para `saleId String? @unique`. Remover o `@@index([saleId])` (o unique já cria índice). Em `Product`, adicionar `isEyeExam Boolean @default(false)`.

- [ ] **Step 2: Validar schema**

Run: `rtk proxy npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 3: Gerar o SQL via diff (read-only, sem tocar banco)**

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-old.prisma
rtk proxy npx prisma migrate diff --from-schema-datamodel /tmp/schema-old.prisma --to-schema-datamodel prisma/schema.prisma --script
```
Expected: SQL com `ALTER TABLE "Product" ADD COLUMN "isEyeExam" BOOLEAN NOT NULL DEFAULT false;`, `DROP INDEX "Prescription_saleId_idx";` e `CREATE UNIQUE INDEX "Prescription_saleId_key" ON "Prescription"("saleId");`

- [ ] **Step 4: Escrever a migração à mão** — criar `prisma/migrations/<ts>_livro_receitas_fase2a/migration.sql` com o SQL do diff + cabeçalho documentado (padrão do projeto: "NÃO APLICADA EM PRODUÇÃO… aguardando snapshot do dono"). ⚠️ NÃO rodar `migrate dev`.

- [ ] **Step 5: ⚠️ REGENERAR O PRISMA CLIENT (sem tocar o banco)** — CRÍTICO: `findUnique({ where: { saleId } })` (Task 2) e `product.isEyeExam` (Tasks 3/4) NÃO compilam até o client conhecer os campos novos. `prisma generate` lê o *schema* (não o banco), é seguro e independe da migração estar aplicada em prod.

Run: `rtk proxy npx prisma generate`
Expected: "✔ Generated Prisma Client"

- [ ] **Step 6: Confirmar que o tipo novo existe** (sanity de compilação)

Run: `rtk proxy npx tsc --noEmit`
Expected: exit 0 (sem novos erros). Se acusar `saleId`/`isEyeExam` desconhecido, o generate do Step 5 não rodou.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(livro-receitas): migração 2a — saleId unique + Product.isEyeExam"
```

> ⚠️ A migração **não é aplicada** nesta task. Aplicação em prod é uma etapa final, com snapshot do dono, DEPOIS do backfill idempotente (ver Task 7 e nota de ordem no spec §8).

---

## Task 2: `upsertPrescription` faz upsert por `saleId`

**Files:**
- Modify: `src/services/livro-receitas.service.ts`
- Test: `src/services/livro-receitas.service.test.ts`

- [ ] **Step 1: Escrever teste que falha** — adicionar em `livro-receitas.service.test.ts`:

```ts
it("upsert por saleId: se já existe receita pra venda, ATUALIZA (não duplica)", async () => {
  (prisma.prescription.findUnique as any).mockResolvedValue({ id: "rx-existing" });
  await upsertPrescription({ companyId: "co-1", customerId: "cust-1", saleId: "sale-1", od: { esf: "-1.00" } });
  expect(prisma.prescription.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { saleId: "sale-1" } }));
  expect(prisma.prescription.update).toHaveBeenCalledTimes(1);
  expect(prisma.prescription.create).not.toHaveBeenCalled();
});

it("upsert por saleId: se NÃO existe, cria nova", async () => {
  (prisma.prescription.findUnique as any).mockResolvedValue(null);
  await upsertPrescription({ companyId: "co-1", customerId: "cust-1", saleId: "sale-2", od: { esf: "-1.00" } });
  expect(prisma.prescription.create).toHaveBeenCalledTimes(1);
});
```
Adicionar `findUnique: vi.fn()` ao mock do `prisma.prescription` **e** no `beforeEach` definir o default `(prisma.prescription.findUnique as any).mockResolvedValue(null)` — assim os testes existentes (que esperam CREATE) não regridem quando o código novo chamar `findUnique`.

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `rtk proxy npx vitest run src/services/livro-receitas.service.test.ts`
Expected: FAIL (findUnique não é chamado).

- [ ] **Step 3: Implementar** — em `upsertPrescription`, antes do bloco `if (input.id)`, se `!input.id && input.saleId`: buscar `const found = await prisma.prescription.findUnique({ where: { saleId: input.saleId }, select: { id: true } });` e se `found`, setar `input = { ...input, id: found.id }`. Envolver o `create` final em try/catch que, no erro `P2002` em `saleId`, refaz como update por `saleId` (corrida).

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `rtk proxy npx vitest run src/services/livro-receitas.service.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/services/livro-receitas.service.ts src/services/livro-receitas.service.test.ts
git commit -m "feat(livro-receitas): upsert idempotente por saleId (anti-duplicidade)"
```

---

## Task 3: Serviço `prescription-from-sale` (regra venda→receita)

**Files:**
- Create: `src/services/prescription-from-sale.service.ts`
- Test: `src/services/prescription-from-sale.service.test.ts`

Responsabilidade: dado um `saleId`, decidir se a venda gera receita (tem lente OU item `isEyeExam`), montar o input e chamar `upsertPrescription`. Skip silencioso se sem `customerId`.

- [ ] **Step 1: Escrever testes que falham** — casos:
  - venda com lente + cliente → chama `upsertPrescription` com `saleId`/`customerId`.
  - venda com produto `isEyeExam` + cliente → idem (mesmo sem lente).
  - venda **sem** `customerId` → NÃO chama upsert (retorna `{ created: false }`), loga warn.
  - venda sem lente e sem exame → NÃO chama upsert.
  - (mockar `@/lib/prisma` `sale.findFirst` e `vi.mock` do `./livro-receitas.service`).

- [ ] **Step 2: Rodar — FALHA** (`Run: rtk proxy npx vitest run src/services/prescription-from-sale.service.test.ts`). Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar** `createPrescriptionFromSale(saleId, companyId, userId)`:
  - `findFirst` da venda com `customerId`, `branchId`, `items.product.{type,isEyeExam}`.
  - `triggers = items.some(lente || isEyeExam)`. Se não, retorna `{created:false}`.
  - Se `!customerId`, `log.warn`, retorna `{created:false}`.
  - `upsertPrescription({ companyId, customerId, branchId, saleId, createdByUserId: userId })` (grau vem depois, da OS/tela — aqui nasce vazia = `AGUARDANDO_GRAU`).
  - Retorna `{ created:true, prescriptionId }`.

- [ ] **Step 4: Rodar — PASSA.**

- [ ] **Step 5: Commit** (`feat(livro-receitas): regra venda→receita (lente ou exame, skip sem cliente)`).

---

## Task 4: Engatar no fechamento da venda (ANTES do createFromSale)

**Files:**
- Modify: `src/services/sale.service.ts:880-902`

- [ ] **Step 1: Teste de integração leve** — garantir que `createPrescriptionFromSale` é chamado pós-commit e que falha dele NÃO propaga (mock que lança → venda ainda retorna). Se já há teste de `sale.service` complexo, adicionar caso focado.

- [ ] **Step 2: Rodar — FALHA.**

- [ ] **Step 3: Implementar** — no bloco "10." do `sale.service.ts`, **antes** do `createFromSale`, adicionar (import dinâmico, try/catch próprio que só loga):

```ts
// 9.5 Espelhar receita no Livro (pós-commit, à prova de falha). ANTES da OS,
// para a OS poder apontar pra receita da venda.
try {
  const { createPrescriptionFromSale } = await import("@/services/prescription-from-sale.service");
  await createPrescriptionFromSale(sale.id, companyId, userId);
} catch (rxErr) {
  log.error("Falha ao espelhar receita no Livro (venda segue)", { saleId: sale.id, err: String(rxErr) });
}
```

- [ ] **Step 4: Rodar — PASSA** + `rtk proxy npx vitest run src/services/` (sem regressão).

- [ ] **Step 5: Commit** (`feat(livro-receitas): criar receita no fechamento da venda (pré-OS)`).

---

## Task 5 (preâmbulo): confirmar o shape real do `prescriptionData`

⚠️ O writer (`buildValues`) espera `{ od:{esf,cil,eixo,dnp,altura,add,prisma,base}, oe:{...}, adicao }`. O form da OS (`ordens-servico/nova/page.tsx:66`) usa esse shape, MAS confirmar antes de extrair, senão grava grau vazio em silêncio.

- [ ] **Step 0:** Inspecionar uma OS real com grau em prod (read-only): `SELECT "prescriptionData" FROM "ServiceOrder" WHERE "prescriptionData" IS NOT NULL LIMIT 3;` (via script tsx). Confirmar chaves `od/oe/esf/...`. Se divergir, ajustar o mapeamento ou um adapter antes da Task 5b.

- [ ] **Step 1: Importar logger** em `service-order.service.ts` (NÃO tem hoje): adicionar `import { logger } from "@/lib/logger";` + `const log = logger.child({ service: "service-order" });` no topo da classe/módulo, seguindo o padrão de `sale.service.ts:34`.

## Task 5a: `createFromSale` faz a OS apontar pra receita da venda

**Files:** Modify `src/services/service-order.service.ts` (`createFromSale`)

- [ ] **Step 1: Teste que falha** — após `createFromSale` numa venda que já tem receita (mock), a OS criada recebe `prescriptionId` = id da receita.
- [ ] **Step 2: Rodar — FALHA.**
- [ ] **Step 3: Implementar** — em `createFromSale`, após criar a OS (ou logo após o `$transaction`), `prisma.prescription.findUnique({ where: { saleId }, select: { id: true } })`; se achar, `prisma.serviceOrder.update({ where: { id: newOrder.id }, data: { prescriptionId } })`. À prova de falha (try/catch com `log.error`).
- [ ] **Step 4: Rodar — PASSA** + suite `service-order*` sem regressão.
- [ ] **Step 5: Commit** (`feat(livro-receitas): OS aponta pra receita da venda`).

## Task 5b: espelhar o grau digitado na OS → receita (por saleId)

**Files:** Modify `src/services/service-order.service.ts` (`update`, `create`)

- [ ] **Step 1: Teste que falha** — ao `update()` salvar `prescriptionData` numa OS com venda, resolve a receita por `saleId` e chama `upsertPrescription` com o grau → status `COMPLETA`, **NÃO** cria 2ª receita. Caso OS sem venda → resolve por `serviceOrderId`.
- [ ] **Step 2: Rodar — FALHA.**
- [ ] **Step 3: Implementar** — em `update()`/`create()`, após gravar `prescriptionData`, resolver a receita (por `saleId` da venda da OS; fallback `serviceOrderId`) e `upsertPrescription({ id: rx.id, od, oe, adicao })` extraídos do JSON. À prova de falha (`try/catch` + `log.error`, não quebra o save da OS).
- [ ] **Step 4: Rodar — PASSA** + suite `service-order*` sem regressão.
- [ ] **Step 5: Commit** (`feat(livro-receitas): espelhar grau da OS na receita do Livro`).

---

## Task 6: Rotas de leitura (por cliente + listagem geral)

**Files:**
- Modify: `src/app/api/prescriptions/customer/[customerId]/route.ts`
- Modify: `src/app/api/prescriptions/route.ts`

- [ ] **Step 1: Testes** (ou teste de serviço se a rota for fina): GET por cliente retorna receitas do titular **e** dos dependentes (mesmo `customerId`, `isDependente` variando), com `values` incluídos. GET geral filtra por `status`/validade/cliente, multi-tenant (`companyId` sempre no where).

- [ ] **Step 2: Rodar — FALHA.**

- [ ] **Step 3: Implementar** — seguir padrão de auth do projeto (`requireAuth()`+`getCompanyId()`), `where: { companyId, customerId }`, `include: { values: true }`, ordenar por `issuedAt desc`. Listagem geral: paginação + filtros opcionais.

- [ ] **Step 4: Rodar — PASSA.**

- [ ] **Step 5: Commit** (`feat(livro-receitas): rotas de leitura por cliente e geral`).

---

## Task 7: Script de backfill (3 casos, dry-run)

**Files:**
- Create: `scripts/backfill-livro-receitas.ts`

- [ ] **Step 1: Implementar com `--dry-run` default** — varre OSs com `prescriptionData`, classifica:
  - caso (a) venda já tem receita → skip;
  - caso (b) venda sem receita → cria por `saleId` + grava `prescriptionId` na OS;
  - caso (c) OS sem venda → cria por `serviceOrderId`, `saleId=null`.
  - Foto: `prescriptionImageUrl` da OS, fallback `imageUrl` legado.
  - Idempotente; imprime contagem por caso. SÓ grava se `--apply` explícito.

- [ ] **Step 2: Rodar dry-run local** (`Run: rtk proxy npx tsx scripts/backfill-livro-receitas.ts --dry-run`). Expected: relatório de contagem, 0 escritas.

- [ ] **Step 3: Commit** (`feat(livro-receitas): script backfill (dry-run) das OSs antigas`).

> ⚠️ Execução real do backfill + aplicação da migração `saleId @unique` em PROD = etapa do dono, com snapshot. Ordem: aplicar `isEyeExam` + deploy do código → backfill dry-run → backfill `--apply` → só então `saleId @unique`. (Spec §8.)

---

## Encerramento da Fase 2a

- [ ] Rodar suite completa: `rtk proxy npx vitest run` (sem regressão) + `rtk proxy npx tsc --noEmit` (limpo).
- [ ] Relatório de fim de fase (regra do dono): o que foi feito + como funciona + próxima fase (2b: telas).
- [ ] Tudo **dormente**: nenhuma tela escreve/lê ainda; rotas existem mas sem UI.

---

## Resolução da revisão do plano (2026-06-27)

| Sev | Achado | Resolução |
|---|---|---|
| CRÍTICO | `prisma generate` nunca rodava → Tasks 2-4 não compilariam (`saleId`/`isEyeExam` desconhecidos) | Task 1 Step 5/6: generate + tsc sanity |
| MÉDIO | `service-order.service.ts` sem `logger` → `log.error` quebraria | Task 5 preâmbulo Step 1: importar logger |
| MÉDIO | Task 5 grande + shape do `prescriptionData` não confirmado | Quebrada em 5a/5b + Step 0 inspeciona JSON real |
| MENOR | mock `findUnique` frágil | Task 2 Step 1: default `mockResolvedValue(null)` no beforeEach |
| OK | ordem venda→OS e Task1→Task2 corretas | mantidas |
