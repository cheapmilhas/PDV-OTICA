# Livro de Receitas — Fase 2b (telas) — Plano de Implementação

> **Para quem executa:** tarefa-a-tarefa, TDD (RED→GREEN→commit). Steps `- [ ]`.
> **Spec:** `docs/livro-receitas/2026-06-27-livro-receitas-fase2b-design.md`
> **Branch:** `feat/livro-receitas-fase1` (continuação; 2a+2b mergeiam juntas). NÃO mexer na main.

**Goal:** Tornar o Livro de Receitas visível e editável, com segurança LGPD, via 3 telas + fundação segura.

**Architecture:** Fatia 2b-0 (fundação: permissão + writer único + filtros) ANTES das telas. Depois aba na ficha do cliente, tela geral, e form de grau sem OS reusando uma grade OD/OE extraída da OS.

**Tech Stack:** Next.js 16 (App Router), Prisma 5, React, shadcn/ui (Tabs), Vitest. `rtk proxy` prefixa `npx`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/permissions.ts` | enum `PRESCRIPTIONS_VIEW/EDIT` + ROLE_PERMISSIONS + labels | Modificar |
| `src/app/api/prescriptions/route.ts` | guard VIEW no GET + filtros search/validade | Modificar |
| `src/app/api/prescriptions/customer/[customerId]/route.ts` | guard VIEW; evolução só titular | Modificar |
| `src/lib/validations/prescription.schema.ts` | query: +search, +validadeDe/Ate | Modificar |
| `src/services/prescription.service.ts` | list: +search/validade; evolução isDependente=false | Modificar |
| `src/app/api/prescriptions/[id]/grau/route.ts` | PATCH grau → upsertPrescription (guard EDIT) | Criar |
| `src/components/prescriptions/prescription-grade-form.tsx` | grade OD/OE compartilhada | Criar |
| `src/lib/prescription-grade-validation.ts` | validação pura de faixas (fonte única) | Criar |
| `ordens-servico/nova/page.tsx` + `[id]/editar/page.tsx` | consumir PrescriptionGradeForm | Modificar |
| `src/components/prescriptions/prescription-list.tsx` | lista reusável (cliente + geral) | Criar |
| `clientes/[id]/page.tsx` | aba "Receitas" | Modificar |
| `app/(dashboard)/dashboard/livro-receitas/page.tsx` | tela geral | Criar |
| `src/components/layout/sidebar.tsx` + `mobile-nav.tsx` | item "Livro de Receitas" (filtrado por perm) | Modificar |
| `src/components/prescriptions/prescription-grade-dialog.tsx` | modal de digitar grau (2 caminhos) | Criar |

---

# FATIA 2b-0 — Fundação segura

## Task 1: Permissão de receita (LGPD) — ⚠️ TOCAR 4 LUGARES (revisão C1+C2)

**Files:** Modify `src/lib/permissions.ts` (enum + PERMISSION_LABELS) **E** `src/app/api/permissions/seed/route.ts` (array `PERMISSIONS` + `ROLE_PERMISSIONS_MAP`)

> ⚠️ ARMADILHA confirmada (memória + revisão): quem CONCEDE no seed é `ROLE_PERMISSIONS_MAP` em **seed/route.ts** (keyed `ADMIN/GERENTE/VENDEDOR/CAIXA/ATENDENTE` — roles REAIS do banco), NÃO o `ROLE_PERMISSIONS` de permissions.ts (keyed `MANAGER/SELLER`, que NÃO é usado no seed). E o catálogo do seed é um array MANUAL `PERMISSIONS` — adicionar ao enum não basta. Tocar os 4 lugares:
> 1. enum `Permission` (permissions.ts) — `PRESCRIPTIONS_VIEW`/`PRESCRIPTIONS_EDIT`
> 2. `PERMISSION_LABELS` (permissions.ts) — Record com trava tsc, obrigatório
> 3. array `PERMISSIONS` (seed/route.ts) — +2 entradas `{ code, name: PERMISSION_LABELS[...], description, module:"prescriptions", category:"Receitas", sortOrder }`
> 4. `ROLE_PERMISSIONS_MAP.GERENTE` e `.VENDEDOR` (seed/route.ts) — +PRESCRIPTIONS_VIEW/EDIT (ADMIN já recebe tudo via `.map`)

- [ ] **Step 1: Teste que falha** — `src/app/api/permissions/seed/permissions-catalog.test.ts`: (a) `Permission.PRESCRIPTIONS_VIEW==="prescriptions.view"`; (b) o array `PERMISSIONS` do seed tem entrada pros 2 códigos novos; (c) `ROLE_PERMISSIONS_MAP.GERENTE` e `.VENDEDOR` incluem ambos. (Importar `PERMISSIONS`/`ROLE_PERMISSIONS_MAP` do seed — exportá-los se ainda não forem.)
- [ ] **Step 2: Rodar — FALHA.**
- [ ] **Step 3: Implementar** os 4 lugares acima.
- [ ] **Step 4: Rodar — PASSA** + `tsc` (PERMISSION_LABELS quebraria se faltasse). Ignorar `plan-feature-catalog` (falha pré-existente não-relacionada).
- [ ] **Step 5: Commit** (`feat(livro-receitas): permissão prescriptions.view/edit no seed real (LGPD)`).

> Nota: após deploy, o dono roda `POST /api/permissions/seed` pra aplicar. Documentar no relatório.

## Task 2: Guard de leitura nos GETs de receita

**Files:** Modify `src/app/api/prescriptions/route.ts`, `src/app/api/prescriptions/customer/[customerId]/route.ts`

- [ ] **Step 0: AUDITAR consumidores existentes (revisão M2)** — `grep -rn 'api/prescriptions' src/app src/components` (fora de api/). Listar telas que já consomem o GET. Garantir que os roles desses fluxos receberão `prescriptions.view` no seed (Task 1). Se alguma tela de OS lista receita pra papel sem a perm, ampliar o grant ou rever. Documentar a lista no commit.
- [ ] **Step 1: Teste** — (rota fina; se difícil testar a rota direto, testar via assert de que `requirePermission("prescriptions.view")` é chamado — ou cobrir no E2E). Mínimo: garantir import + chamada.
- [ ] **Step 2: Implementar** — adicionar `await requirePermission("prescriptions.view");` após `requireAuth()` nos dois GETs.
- [ ] **Step 3: tsc** (`rtk proxy npx tsc --noEmit`, exit 0).
- [ ] **Step 4: Commit** (`feat(livro-receitas): guard prescriptions.view nos GETs (fecha LGPD)`).

## Task 3: Filtros reais na listagem (search + validade)

**Files:** Modify `src/lib/validations/prescription.schema.ts`, `src/services/prescription.service.ts`, `src/app/api/prescriptions/route.ts`

- [ ] **Step 1: Teste que falha** — em `prescription-list-filter.service.test.ts`: `list` com `search="maria"` → where inclui `customer: { name: { contains: "maria", mode: "insensitive" } }`; com `validadeDe`/`validadeAte` → `expiresAt: { gte, lte }`.
- [ ] **Step 2: Rodar — FALHA.**
- [ ] **Step 3: Implementar** — estender `prescriptionQuerySchema` (+`search?`, `validadeDe?`, `validadeAte?` coerce date), `list(...)` aceitar e montar o where, e a rota ler os query params.
- [ ] **Step 4: Rodar — PASSA.**
- [ ] **Step 5: Commit** (`feat(livro-receitas): busca por nome + filtro de validade na listagem`).

## Task 4: Rota PATCH de grau (writer único)

**Files:** Create `src/app/api/prescriptions/[id]/grau/route.ts`

- [ ] **Step 1: Teste** — PATCH chama `upsertPrescription({ id, od, oe, adicao, isDependente, patientName, patientBirthDate })` e exige `prescriptions.edit`. (testar o handler ou via service.)
- [ ] **Step 2: Rodar — FALHA.**
- [ ] **Step 3: Implementar** — handler PATCH: `requireAuth` + `requirePermission("prescriptions.edit")` + `getCompanyId`; valida body (zod). **OBRIGATÓRIO (revisão M1):** buscar a receita primeiro `prescriptionService.getById(id, companyId)` → **404 se null** (também garante TENANT: `getById` filtra companyId; sem isso o `upsertPrescription→doUpdate` faria update cross-tenant pois não filtra companyId no where). Só então `upsertPrescription({ id, companyId, customerId: rx.customerId, od, oe, adicao, isDependente, patientName, patientBirthDate })`. Retorna a receita atualizada.
- [ ] **Step 4: Rodar — PASSA** + tsc.
- [ ] **Step 5: Commit** (`feat(livro-receitas): PATCH /prescriptions/[id]/grau via upsert único`).

---

# FATIA 2b-1 — Extração da grade OD/OE (risco médio — teste forte)

## Task 5: Validação pura de faixas (fonte única)

**Files:** Create `src/lib/prescription-grade-validation.ts` + test

- [ ] **Step 1: Teste que falha** — `validateGrade({od:{esf:"-31"}})` → erro de faixa; `validateGrade(válido)` → ok. Faixas ALINHADAS ao Zod backend (esf −30..30, cil −10..10, eixo 0..180, add 0.5..4, dnp/pdFar 20..80, altura 10..45). Aceita vírgula decimal.
- [ ] **Step 2: Rodar — FALHA.**
- [ ] **Step 3: Implementar** função pura `validateGrade(data): {ok, errors}`.
- [ ] **Step 4: Rodar — PASSA.**
- [ ] **Step 5: Commit** (`feat(livro-receitas): validação pura de grau (fonte única alinhada ao Zod)`).

## Task 6: Componente `PrescriptionGradeForm` (grade OD/OE)

**Files:** Create `src/components/prescriptions/prescription-grade-form.tsx` + test

- [ ] **Step 1: Teste (RTL)** — renderiza inputs OD/OE (esf,cil,eixo,dnp,altura,add,prisma,base) + adição; emite `onChange({od,oe,adicao})` ao digitar; preserva vírgula. (`@vitest-environment jsdom`.)
- [ ] **Step 2: Rodar — FALHA.**
- [ ] **Step 3: Implementar** — componente controlado, props `{ value, onChange, disabled? }`. SÓ a grade (sem campos de lente/olho-dominante). Usa `validateGrade` pra feedback visual.
- [ ] **Step 4: Rodar — PASSA.**
- [ ] **Step 5: Commit** (`feat(livro-receitas): PrescriptionGradeForm reutilizável`).

## Task 7: ❌ NÃO EXECUTADA — decisão do dono (2026-06-27)

> **Decisão:** ao inspecionar o código real, a OS provou ter um form de grau **legitimamente diferente** do Livro: duas tabelas ("Visão de Longe" esf/cil/eixo/dnp/altura + "Adição / Visão de Perto" com `add`/`dnpPertoOd/Oe` por olho). Esses campos (`dnpPerto*`) **nem existem no model** do Livro. Encaixar o `PrescriptionGradeForm` (grade consolidada do Livro) na OS **mudaria o layout da OS e removeria campos** — regressão numa tela de produção. O dono optou por **NÃO mexer na OS**: o componente serve só o Livro; layouts diferentes são legítimos (usos diferentes). DRY-total da OS fica como possível fatia 2c futura (componente mais rico). **Risco zero na OS preservado.**

### (Plano original mantido para referência) — ⚠️ NÃO APAGAR EXTRAS (revisão C3)

**Files:** Modify `ordens-servico/nova/page.tsx`, `[id]/editar/page.tsx`

> ⚠️ ARMADILHA: `prescriptionData` é UM objeto que mistura grade (`od/oe/adicao`) **com extras** (`olhoDominante, tipoLente, material, ceratometria{}` em nova; +`dnpPertoOd/Oe` em editar). O payload serializa o objeto INTEIRO (`JSON.stringify(prescriptionData)`). Se o componente emitir só `{od,oe,adicao}` e o `onChange` sobrescrever o estado, os extras SOMEM (regressão silenciosa).

- [ ] **Step 1: Substituir** o bloco inline da grade OD/OE por:
  ```tsx
  <PrescriptionGradeForm
    value={{ od: prescriptionData.od, oe: prescriptionData.oe, adicao: prescriptionData.adicao }}
    onChange={(g) => setPrescriptionData((prev) => ({ ...prev, ...g }))}  // MERGE: preserva extras
  />
  ```
  Em AMBAS as páginas. Os campos de lente/olho-dominante/ceratometria/dnpPerto permanecem como inputs locais da OS (fora do componente), lendo/escrevendo `prescriptionData` direto. OCR (`applyOcr`) segue alimentando o mesmo estado.
- [ ] **Step 2: DECISÃO de faixas (consciente)** — a validação inline da OS diverge do Zod (cil −10..0 vs −10..10; dnp 20..40 vs pdFar 20..80). A `validateGrade` (Task 5) usa as faixas do Zod. **Decisão:** adotar as faixas do Zod (alimenta o backend; cil>0 e dnp 41..80 passam a ser aceitos — clinicamente válido). Documentar no commit que o aceite mudou de propósito.
- [ ] **Step 3: tsc + build** (`rtk proxy npx tsc --noEmit`; `rm -rf .next` se stale).
- [ ] **Step 4: Teste de regressão (cobrir o apagamento)** — teste de integração do submit da OS com um `prescriptionData` que TEM `olhoDominante`/`material`/`ceratometria` preenchidos + grau; após editar o grau pelo componente, assert que o payload final AINDA contém os extras (não foram apagados) E o grau novo. Se houver e2e-runner, complementar com criar+editar OS real.
- [ ] **Step 5: Commit** (`refactor(os): OS usa PrescriptionGradeForm com merge (preserva extras, faixas alinhadas ao Zod)`).

---

# FATIA 2b-2 — Telas de leitura

## Task 8: Componente `PrescriptionList` (reusável)

**Files:** Create `src/components/prescriptions/prescription-list.tsx` + test

- [ ] **Step 1: Teste (RTL)** — `@vitest-environment jsdom` no topo do arquivo. Recebe `prescriptions[]`, renderiza: paciente (titular ou `patientName` + badge "Dependente"), data, validade, badge de status, resumo OD/OE, origem (venda/OS/avulsa por saleId/serviceOrderId). Item AGUARDANDO_GRAU mostra botão "Digitar grau".
- [ ] **Step 2: Rodar — FALHA → implementar → PASSA.**
- [ ] **Step 3: Commit** (`feat(livro-receitas): PrescriptionList reutilizável`).

## Task 9: Aba "Receitas" na ficha do cliente

**Files:** Modify `clientes/[id]/page.tsx`

- [ ] **Step 1: Implementar** — `TabsTrigger value="receitas"` + `TabsContent` que faz fetch `GET /api/prescriptions/customer/[id]` e renderiza `<PrescriptionList>`. Filtrar UI por `Can(prescriptions.view)`.
- [ ] **Step 2: tsc + build.**
- [ ] **Step 3: Commit** (`feat(livro-receitas): aba Receitas na ficha do cliente`).

## Task 10: Tela "Livro de Receitas" geral + sidebar

**Files:** Create `app/(dashboard)/dashboard/livro-receitas/page.tsx`; Modify `sidebar.tsx`, `mobile-nav.tsx`

- [ ] **Step 1: Implementar página** — fetch `GET /api/prescriptions` (paginado) + filtros (busca, status, validade) → `<PrescriptionList>`. Guard de página por permissão.
- [ ] **Step 2: Sidebar** — item "Livro de Receitas" (ícone BookOpen) perto de "Ordens de Serviço", filtrado por `prescriptions.view` (como os outros itens fazem).
- [ ] **Step 3: tsc + build.**
- [ ] **Step 4: Commit** (`feat(livro-receitas): tela Livro de Receitas geral + sidebar`).

---

# FATIA 2b-3 — Digitar grau sem OS

## Task 11: Modal de digitar grau (2 caminhos)

**Files:** Create `src/components/prescriptions/prescription-grade-dialog.tsx` + test

- [ ] **Step 1: Teste (RTL)** — `@vitest-environment jsdom` no topo. Abre com `PrescriptionGradeForm` + bloco paciente/dependente (`isDependente`, `patientName`, `patientBirthDate`); ao salvar chama `PATCH /api/prescriptions/[id]/grau` com o payload certo.
- [ ] **Step 2: Rodar — FALHA → implementar → PASSA.**
- [ ] **Step 3: Ligar** o botão "Digitar grau" do `PrescriptionList` (aba do cliente E tela geral) a este modal.
- [ ] **Step 4: tsc + build.**
- [ ] **Step 5: Commit** (`feat(livro-receitas): modal de digitar grau sem OS (dois caminhos)`).

---

## Encerramento da Fase 2b

- [ ] Suite completa (`rtk proxy npx vitest run`) + tsc limpo + build (`rm -rf .next && build`).
- [ ] Smoke manual (browse): aba do cliente, tela geral, digitar grau, ver permissão barrando quem não tem.
- [ ] Relatório de fim de fase (regra do dono).
- [ ] **Merge 2a+2b juntas pra main + deploy** (etapa do dono): após deploy, rodar `POST /api/permissions/seed` (aplica a permissão nova).

## Riscos

- **Task 7 (OS):** maior risco — OS em produção. Teste de regressão obrigatório antes do commit.
- **Permissão pós-deploy:** a permissão nova só vale após o seed; até lá, `requirePermission` pode barrar quem deveria ver. Garantir que o seed roda no deploy (ou documentar passo manual).
- **Teste pré-existente `plan-feature-catalog`** já falha (não-relacionado) — não confundir com regressão.

## Resolução da revisão do plano (2026-06-27)

| Sev | Achado | Resolução |
|---|---|---|
| CRÍTICO C1 | permissão só em permissions.ts não chega a GERENTE/VENDEDOR (mapa real é `ROLE_PERMISSIONS_MAP` no seed) | Task 1: edita seed/route.ts (mapa keyed ADMIN/GERENTE/VENDEDOR) |
| CRÍTICO C2 | catálogo do seed é array manual (já falta 7); enum não basta | Task 1: +2 entradas no array `PERMISSIONS`; teste valida catálogo |
| CRÍTICO C3 | extrair form apaga extras (olhoDominante/material/ceratometria) | Task 7: `onChange` faz MERGE; teste cobre payload com extras; decisão de faixas |
| MÉDIO M1 | PATCH /grau sem buscar receita → guard customerId + cross-tenant | Task 4: getById primeiro (404 + tenant) |
| MÉDIO M2 | guard de leitura pode quebrar consumidores | Task 2 Step 0: auditar consumidores antes |
| MENOR | jsdom faltando em Tasks 8/11 | adicionado `@vitest-environment jsdom` |
| OK | ordem das fatias; RTL/jsdom instalados; requirePermission(string) existe | mantido |
