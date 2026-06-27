# Livro de Receitas — Fase 2b (telas) — Design

**Data:** 2026-06-27
**Branch:** `feat/livro-receitas-fase1` (continuação; 2a+2b mergeiam juntas)
**Pré-requisito:** Fase 2a (backend) aplicada em prod (banco) + código na branch. Ver [[livro-receitas-fase2a]].

---

## 1. Objetivo

Tornar o Livro de Receitas **visível e editável**, de forma **segura (LGPD)**. Estrutura revista após revisão adversarial: uma fatia de **fundação segura (2b-0)** ANTES das telas.

- **2b-0 (fundação segura — pré-requisito):** permissão de receita + writer único + extensão de filtros.
- **2b-1:** Aba "Receitas" na ficha do cliente — receitas do cliente (titular; dependentes quando houver).
- **2b-2:** Tela "Livro de Receitas" geral — todas as receitas da ótica, busca/filtro.
- **2b-3:** Formulário de digitar grau sem OS — cenário exame puro; editável pelos DOIS caminhos (Livro geral E ficha do cliente). **É o ÚNICO produtor de `isDependente`/`patientName`** (receitas de venda/OS são sempre do titular).

## 1.1 Fase 2b-0 — fundação segura (resolve os 4 críticos da revisão)

1. **Permissão de receita (LGPD — dado de saúde sensível):** criar `PRESCRIPTIONS_VIEW = "prescriptions.view"` e `PRESCRIPTIONS_EDIT = "prescriptions.edit"` no enum `Permission` (`src/lib/permissions.ts`). Seed concede por padrão a ADMIN/GERENTE/VENDEDOR (papéis que já mexem com OS). Aplicar `requirePermission(PRESCRIPTIONS_VIEW)` nos **GETs** (`/api/prescriptions` e `/api/prescriptions/customer/[id]`) — hoje só têm `requireAuth` → vazam receita. Telas/sidebar filtram via `Can`/`usePermissions`.
2. **Writer único:** `upsertPrescription` é a fonte da verdade (deriva `status`, usa `prescriptionImageUrl` oficial, grava campos do Livro). O `prescription.service.update`/`create` (legado: grava `imageUrl`, ignora `status`) fica **marcado como legado** e a UI nova NUNCA o usa. Rota de gravação do grau: `PATCH /api/prescriptions/[id]/grau` → `upsertPrescription`. (A rota existente é `PUT /[id]`, legada.)
3. **Filtros reais na listagem:** estender `prescriptionService.list` + `prescriptionQuerySchema` com `search` (nome do cliente, `contains` insensitive) e faixa de `validade` (`expiresAt` gte/lte) — senão as telas teriam filtros mortos.
4. **Campo de imagem:** telas exibem `prescriptionImageUrl` (oficial), com fallback `imageUrl` (legado) só-leitura.

## 2. Decisão de arquitetura: extrair SÓ a grade OD/OE (risco médio — não subestimar)

Hoje o form de grau está **inline** e em DUAS variantes divergentes: `ordens-servico/nova/page.tsx` e `[id]/editar/page.tsx` (esta tem campos extras: `dnpPertoOd/Oe`, `olhoDominante`, `tipoLente`, `material`). A validação de faixas mora no `handleSubmit` (fora do JSX) e **diverge** do Zod backend (ex.: front `cil −10..0` vs schema `−10..10`; front `dnp 20..40` vs schema `pdFar 20..80`).

Decisão (mais conservadora que a 1ª versão):
> **Extrair APENAS a grade OD/OE** (esf, cil, eixo, dnp, altura, add, prisma, base + adição) num `PrescriptionGradeForm` (`src/components/prescriptions/prescription-grade-form.tsx`), emitindo `{ od, oe, adicao }`. NÃO incluir campos de lente/olho-dominante (ficam onde estão, na OS). A **validação vira função pura compartilhada**, alinhada ao Zod (fonte única de faixas).

- **Risco real (não "controlado"):** a OS (`nova` E `editar`) está em produção. Migrar ambas é obrigatório pra cumprir DRY, OU aceitar conscientemente que só `nova` é migrada primeiro (débito explícito em `editar`). **Decisão:** migrar `nova` e `editar` na mesma fatia, com **teste E2E de regressão** (criar OS + editar OS, conferir que grau grava igual). Sem isso, não mexer.
- DNP por olho: o model só tem `pdFar`/`pdNear`. `dnpPertoOd/Oe` da `editar` não têm coluna — ficam fora do componente extraído (permanecem campos locais da OS, não vão pro Livro).

## 3. Telas

### 3.1 Aba "Receitas" na ficha do cliente
- A ficha (`clientes/[id]/page.tsx`) já usa Tabs (Dados/Vendas/Orçamentos/Ordens). Adicionar `TabsTrigger value="receitas"`.
- Lista as receitas do cliente (titular + dependentes, todas no mesmo `customerId`), via `GET /api/prescriptions/customer/[customerId]` (já existe, já inclui `values`).
- Cada item: paciente (titular ou nome do dependente + badge "Dependente"), data, validade, status (badge AGUARDANDO_GRAU/COMPLETA), resumo do grau OD/OE.
- Receita `AGUARDANDO_GRAU` → botão "Digitar grau" abre o form (3.3).

### 3.2 Tela "Livro de Receitas" geral
- Nova rota `app/(dashboard)/dashboard/livro-receitas/page.tsx` + item na sidebar (perto de "Ordens de Serviço", ícone tipo BookOpen).
- Lista geral via `GET /api/prescriptions` (já existe, paginado, +filtro `status` adicionado na 2a).
- Filtros: busca por cliente, status, validade. Colunas: cliente, paciente, data, validade, status, origem (venda/OS/avulsa).
- Linha `AGUARDANDO_GRAU` → "Digitar grau" abre o form (3.3).

### 3.3 Formulário de digitar grau (sem OS)
- Usa `PrescriptionGradeForm` (§2) + bloco paciente/dependente (`isDependente`, `patientName`, `patientBirthDate`). **É o único lugar do app que marca dependente** — dá sentido à coluna.
- Salva via **`PATCH /api/prescriptions/[id]/grau` → `upsertPrescription({ id, od, oe, adicao, isDependente, patientName, patientBirthDate })`** (writer único da 2a; deriva status; campo de imagem oficial). NÃO usa o `PUT /[id]` legado.
- Guard `PRESCRIPTIONS_EDIT` na rota e na UI.
- Acessível dos DOIS caminhos (Livro geral e ficha do cliente) — mesmo componente modal/drawer.

### 3.4 Evolução do grau (ajuste)
A rota `customer/[customerId]` computa `getGradeEvolution` (gráfico). Hoje misturaria titular + dependentes num só gráfico (bug clínico). Ajuste: a evolução considera **apenas receitas do titular** (`isDependente=false`), ou agrupa por paciente. Decisão: filtrar `isDependente=false` por ora (YAGNI no agrupamento).

## 4. Não-objetivos (YAGNI)
- Trocar OCR→arquivar foto (dívida latente; fase de UI dedicada).
- Impressão da receita (pode virar 2c se o dono pedir).
- Edição de receita já COMPLETA com trilha de auditoria avançada (só o básico).

## 5. Riscos / atenção
- **Extração do form de grau:** a OS em prod não pode regredir. Teste de não-regressão obrigatório.
- **Dependentes:** confirmar que o form do Livro grava `isDependente`/`patientName` e que a aba do cliente os exibe corretamente.
- **Vírgula decimal:** o `PrescriptionGradeForm` deve preservar o comportamento atual (entrada com vírgula; `buildValues` converte no backend).
- **Permissões:** NÃO existe guard de receita hoje (revisão confirmou) — a 2b-0 CRIA `PRESCRIPTIONS_VIEW/EDIT` e aplica nos GETs+telas+sidebar.

## 6. Resolução da revisão adversarial (2026-06-27)

| # | Sev | Achado | Resolução |
|---|---|---|---|
| 4 | CRÍTICO | GETs de receita sem permissão → vazamento LGPD | §1.1.1: cria `PRESCRIPTIONS_VIEW/EDIT`, aplica nos GETs |
| 2 | CRÍTICO | Dois writers (legado `imageUrl`/sem status × `upsertPrescription`); é PUT não PATCH | §1.1.2: `upsertPrescription` único; legado marcado; rota `PATCH /grau` |
| 3 | CRÍTICO | Dependentes nunca populados pela 2a | §1: form §3.3 é o único produtor; venda/OS = titular |
| 1 | CRÍTICO | Extração do form: nova≠editar, validação fora do JSX e ≠ Zod | §2: extrai só grade OD/OE, migra nova+editar, teste E2E |
| 5 | MÉDIO | `list` sem busca por nome nem filtro de validade | §1.1.3: estende list + query schema |
| 6 | MENOR | imagem dividida, evolução mistura dependentes, DNP por olho | §1.1.4, §3.4, §2 |
