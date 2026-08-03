# Sprint 2 — Podar o que engana: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o caminho que cria fatura sem cobrança ("fatura fantasma") e remover código duplicado/órfão do super admin, sem quebrar menu, breadcrumb ou suíte.

**Architecture:** Remoção cirúrgica. Apagamos a tela `/admin/financeiro/faturas/nova`, o formulário dela e a rota de API `/api/admin/faturas/create` que ela consome. No hub financeiro, os cards "Todas as Faturas" e "Nova Cobrança" **viram um só** ("Faturas e Cobranças") apontando para `/admin/financeiro/faturas`, onde vive o botão correto (`NovaCobrancaButton`, que cria no Asaas + PIX + e-mail) — fundir em vez de redirecionar, porque os dois já teriam o mesmo destino. Dois testes que enumeram as páginas do financeiro precisam ser atualizados junto, senão a suíte quebra por ENOENT.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest, Prisma.

**Environment notes:**
- Trabalhar no worktree `.worktrees/recorrencia`, branch `feat/motor-cobranca`.
- ⚠️ O pre-commit roda `tsc` no projeto inteiro e leva **minutos**. Commit SEMPRE com timeout longo (≥10min) ou em background com log em arquivo — timeout de 2min mata no meio e parece erro.
- ⚠️ NÃO tocar em `@/components/reports/export-buttons` (homônimo, MUITO usado em DRE/BI/fluxo de caixa). O alvo é apenas `src/app/admin/(painel)/relatorios/export-buttons.tsx`.
- ⚠️ NÃO remover `/admin/suporte` — existe de propósito para o breadcrumb não dar 404 (`admin-breadcrumb.tsx:46` tem `NON_LINKABLE = Set(["suporte"])`).
- `/admin/assinaturas` está FORA deste plano (decisão D2.1 do spec: o dono decide olhando as duas telas).
- Spec: `docs/superpowers/specs/2026-08-03-super-admin-evolucao-design.md`.

---

## Contexto verificado (não re-derivar)

| fato | onde |
|---|---|
| A tela fantasma NÃO fala com o Asaas: termina em `prisma.invoice.create` + auditoria | `src/app/api/admin/faturas/create/route.ts:89-134` |
| O `QuickLink` "Nova Cobrança" aponta para ela | `src/app/admin/(painel)/financeiro/page.tsx:185` |
| O caminho CORRETO (cria no Asaas + PIX + e-mail) | `NovaCobrancaButton` → `/api/admin/charges` → `manual-charge.service.ts:78` |
| O botão correto já está na tela de faturas, com seletor de empresa | `(painel)/financeiro/faturas/page.tsx:140` (`<NovaCobrancaButton companies={companies} />`) |
| Teste `it.each` lê o arquivo do disco (quebra com ENOENT se apagarmos) | `src/lib/admin-finance-roles.test.ts:164` |
| Teste que faz `find … -name page.tsx` e compara a lista | `src/lib/admin-finance-roles.test.ts:178-189` |
| Arquivos da tela fantasma | `(painel)/financeiro/faturas/nova/{page.tsx,new-invoice-form.tsx}` |
| Único consumidor da rota fantasma é o formulário que vamos apagar | `new-invoice-form.tsx:39` |

---

## File Structure

**Apagar:**
- `src/app/admin/(painel)/financeiro/faturas/nova/page.tsx`
- `src/app/admin/(painel)/financeiro/faturas/nova/new-invoice-form.tsx`
- `src/app/api/admin/faturas/create/route.ts`
- `src/app/api/admin/faturas/create/route.test.ts`
- `src/app/admin/(painel)/relatorios/export-buttons.tsx`

**Modificar:**
- `src/app/admin/(painel)/financeiro/page.tsx:179-188` — funde os 2 QuickLinks num só
- `src/lib/admin-finance-roles.test.ts:164` — remover `"faturas/nova/page.tsx"` da lista

---

## Task 1: Fundir os QuickLinks do hub financeiro

Feito ANTES de apagar, para que em nenhum commit intermediário o hub aponte para 404.

**Files:**
- Modify: `src/app/admin/(painel)/financeiro/page.tsx:179-188`

- [ ] **Step 1: Ler os DOIS QuickLinks (eles se sobrepõem)**

Run: `sed -n '179,188p' "src/app/admin/(painel)/financeiro/page.tsx"`

Esperado (exatamente 10 linhas):
```tsx
            <QuickLink
              href="/admin/financeiro/faturas"
              title="Todas as Faturas"
              description="Visualizar e gerenciar todas as faturas"
            />
            <QuickLink
              href="/admin/financeiro/faturas/nova"
              title="Nova Cobrança"
              description="Criar cobrança manual para um cliente"
            />
```

🚨 **Ponto que a 1ª versão deste plano errou:** o card "Todas as Faturas" **já aponta para
`/admin/financeiro/faturas`**. Simplesmente redirecionar o "Nova Cobrança" para lá criaria **dois
cards vizinhos com o mesmo destino** — trocaríamos um problema por outro.

- [ ] **Step 2: Fundir os dois num só card**

Substituir as 10 linhas acima por:

```tsx
            <QuickLink
              href="/admin/financeiro/faturas"
              title="Faturas e Cobranças"
              description="Ver todas as faturas e criar cobrança no Asaas (PIX + e-mail)"
            />
```

🔑 Um card só, porque o destino é um só. A tela de faturas **é** onde se cria a cobrança
(`NovaCobrancaButton` em `faturas/page.tsx:140`, com seletor de empresa). O título "Faturas e
Cobranças" mantém a palavra "cobrança" visível para quem procurava o card antigo, e a descrição
diz explicitamente o que o caminho certo faz — em oposição à "cobrança manual" que estamos matando.

- [ ] **Step 3: Verificar que não sobrou referência à tela fantasma neste arquivo**

Run: `grep -n "faturas/nova" "src/app/admin/(painel)/financeiro/page.tsx"`
Esperado: **nenhuma saída** (exit 1).

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(painel)/financeiro/page.tsx"
git commit -m "fix(admin): funde os QuickLinks de faturas no hub financeiro

'Nova Cobranca' levava a /financeiro/faturas/nova, que cria fatura SEM falar com
o Asaas (sem PIX, sem e-mail) — o operador era levado a uma fatura fantasma por
um card com o nome do caminho correto.

Nao bastava redirecionar: o card 'Todas as Faturas' ao lado JA apontava para
/admin/financeiro/faturas, entao os dois ficariam com o mesmo destino. Viraram
um card so, 'Faturas e Cobrancas' — que e onde o NovaCobrancaButton vive
(/api/admin/charges -> Asaas + PIX + e-mail)."
```

---

## Task 2: Atualizar os testes que enumeram as páginas do financeiro

Feito ANTES de apagar os arquivos: se apagarmos primeiro, a suíte quebra com ENOENT e não
conseguimos distinguir "quebrou pelo motivo certo" de "quebrou por outro motivo".

**Files:**
- Modify: `src/lib/admin-finance-roles.test.ts:160-168`

- [ ] **Step 1: Rodar o teste ANTES da mudança (baseline verde)**

Run: `npx vitest run src/lib/admin-finance-roles.test.ts`
Esperado: PASS (todos os testes do arquivo).

- [ ] **Step 2: Remover a entrada da lista**

Em `src/lib/admin-finance-roles.test.ts`, no array `PAGINAS`, apagar a linha:

```ts
    "faturas/nova/page.tsx",
```

Resultado esperado do array:

```ts
  const PAGINAS = [
    "page.tsx",
    "faturas/page.tsx",
    "faturas/[id]/page.tsx",
    "inadimplencia/page.tsx",
  ];
```

🔑 O segundo teste (`a lista de páginas cobre TODAS as telas do financeiro`) faz
`find … -name page.tsx` e compara com `PAGINAS`. Ele fica **vermelho de propósito** neste passo,
porque o arquivo ainda existe no disco — é o sinal de que o teste está fazendo seu trabalho.

- [ ] **Step 3: Rodar o teste e CONFIRMAR que falha pelo motivo certo**

Run: `npx vitest run src/lib/admin-finance-roles.test.ts`
Esperado: **FAIL** no teste "a lista de páginas cobre TODAS as telas do financeiro", com diff
mostrando `faturas/nova/page.tsx` presente no disco e ausente de `PAGINAS`.

⚠️ Se falhar em QUALQUER outro teste, parar e investigar — não é o efeito esperado.

- [ ] **Step 4: NÃO commitar ainda**

Este passo deixa a suíte vermelha de propósito. O commit acontece na Task 3, junto com a remoção
dos arquivos, para que nenhum commit da história tenha a suíte quebrada.

---

## Task 3: Apagar a tela fantasma e sua rota de API

**Files:**
- Delete: `src/app/admin/(painel)/financeiro/faturas/nova/page.tsx`
- Delete: `src/app/admin/(painel)/financeiro/faturas/nova/new-invoice-form.tsx`
- Delete: `src/app/api/admin/faturas/create/route.ts`
- Delete: `src/app/api/admin/faturas/create/route.test.ts`

- [ ] **Step 1: Confirmar que o único consumidor da rota é o form que vamos apagar**

Run: `grep -rn "faturas/create" src/ | grep -v "src/app/api/admin/faturas/create/"`

Esperado: exatamente **uma** linha —
`src/app/admin/(painel)/financeiro/faturas/nova/new-invoice-form.tsx:39`

⚠️ Se aparecer qualquer outro consumidor, **parar**: a rota está em uso por outro caminho e a
remoção precisa ser reavaliada.

- [ ] **Step 2: Apagar os quatro arquivos**

```bash
git rm "src/app/admin/(painel)/financeiro/faturas/nova/page.tsx" \
       "src/app/admin/(painel)/financeiro/faturas/nova/new-invoice-form.tsx" \
       "src/app/api/admin/faturas/create/route.ts" \
       "src/app/api/admin/faturas/create/route.test.ts"
```

- [ ] **Step 3: Confirmar que nenhuma referência sobrou**

Run: `grep -rn "faturas/nova\|faturas/create" src/`
Esperado: **nenhuma saída** (exit 1).

- [ ] **Step 4: Rodar os testes do financeiro — agora devem passar**

Run: `npx vitest run src/lib/admin-finance-roles.test.ts`
Esperado: **PASS**. O teste de contagem agora fecha, porque disco e `PAGINAS` coincidem.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Esperado: exit 0, nenhum erro. (Confere o EXIT CODE, não o texto.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(admin): remove a tela e a rota que criavam fatura fantasma

/admin/financeiro/faturas/nova + /api/admin/faturas/create criavam Invoice
direto no banco: sem asaasPaymentId, sem PIX, sem link e sem e-mail
(route.ts terminava em prisma.invoice.create + auditoria). Uma fatura criada
por ali NUNCA chegava ao cliente — parecia cobranca e nao cobrava.

O caminho correto ja existe e continua: NovaCobrancaButton ->
/api/admin/charges -> manual-charge.service, que cria customer + payment + PIX
no Asaas e dispara o e-mail.

admin-finance-roles.test.ts tinha a pagina em duas travas (it.each que le o
arquivo do disco + teste que faz find e compara a lista); as duas foram
atualizadas no mesmo commit para a suite nunca ficar vermelha na historia."
```

---

## Task 4: Remover o componente órfão de export dos relatórios

**Files:**
- Delete: `src/app/admin/(painel)/relatorios/export-buttons.tsx`

- [ ] **Step 1: Confirmar que é órfão — e que NÃO é o homônimo em uso**

Run: `grep -rn "export-buttons" src/app/admin/`

Esperado: **nenhuma saída** (exit 1) — nada sob `src/app/admin/` importa o arquivo.

🔑 Busca por `export-buttons` **em todo o `src/app/admin/`**, não só pelo caminho literal: um import
relativo (`from "../relatorios/export-buttons"`) escaparia de um grep mais estreito.

- [ ] **Step 2: Confirmar que o homônimo de `components/reports` CONTINUA em uso**

Run: `grep -rln "components/reports/export-buttons" src/ | head`

Esperado: **várias** linhas (DRE, BI, fluxo de caixa, contas a receber).
⚠️ Este é o arquivo que NÃO pode ser tocado. Se o Step 1 tiver retornado algo, parar.

- [ ] **Step 3: Apagar**

```bash
git rm "src/app/admin/(painel)/relatorios/export-buttons.tsx"
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Esperado: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(admin): remove export-buttons orfao de (painel)/relatorios

Componente completo, nao importado por ninguem, que duplicava os ExportCards
renderizados em relatorios/page.tsx:214-252. Nao confundir com
@/components/reports/export-buttons (homonimo, em uso no DRE/BI/fluxo de caixa),
que permanece intacto."
```

---

## ~~Task 5: Unificar o toggle de usuário duplicado~~ — REMOVIDA DO SPRINT

🚫 **Cortada durante a escrita do plano, por verificação no código.** As duas rotas **não são
equivalentes** — unificá-las seria mudança de produto disfarçada de limpeza:

| rota | o que faz |
|---|---|
| `api/admin/company-users/[id]/route.ts:12` | `PATCH` **só de `active`**. Ao REATIVAR (`:46-70`), conta usuários ativos e **bloqueia se estourar o `maxUsers` do plano** (`:58-65`) |
| `api/admin/companies/[id]/users/[userId]/route.ts:74` | `PATCH` **genérico**: `name`, `role`, `branchId` e `active` juntos (`:102-114`). **Sem** trava de limite de plano |

Escolher a segunda **removeria a checagem de limite de plano** (um cliente poderia exceder o que
contratou); escolher a primeira **quebraria a edição de nome/papel/filial**. As duas gravam
`GlobalAudit`, então nem esse critério desempata.

➡️ Vira item próprio no backlog: *"decidir a regra única de ativação de usuário de cliente —
quem valida `maxUsers`?"*. É decisão de produto do dono, não remoção.

---

## Task 5: Verificação completa (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `npx tsc --noEmit`
Esperado: exit 0, zero erros.

- [ ] **Step 2: Suíte completa**

Run: `npx vitest run > /tmp/suite-sprint2.log 2>&1; echo "EXIT=$?"; tail -8 /tmp/suite-sprint2.log`
Esperado: `EXIT=0` e todos os arquivos passando. Baseline antes deste sprint: **3650 testes /
396 arquivos**. Depois da remoção o número de testes **cai** (o `route.test.ts` apagado levava os
seus junto) — isso é esperado; o que não pode haver é FALHA.

- [ ] **Step 3: Limpar o cache do Next ANTES do build**

Run: `rm -rf .next`

🔑 Obrigatório depois de apagar rotas: o `.next/` guarda a rota removida e o build pode passar
usando artefato velho (a memória do projeto registra colisão de build por não limpar). Também
garante que a rota morta não responda em dev.

- [ ] **Step 4: Build de produção**

Run: `npm run build > /tmp/build-sprint2.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/build-sprint2.log`
Esperado: `EXIT=0`. ⚠️ Conferir pelo EXIT CODE, não pelo texto — há ruído pré-existente de
`/api/dashboard/onboarding-status` usando `headers`, que não é regressão.

- [ ] **Step 5: Nenhuma referência órfã sobrou**

Run: `grep -rn "faturas/nova\|faturas/create\|relatorios/export-buttons" src/`
Esperado: nenhuma saída (exit 1).

- [ ] **Step 6: Sanidade do menu e do breadcrumb**

Run: `grep -rn "assinaturas\|suporte" "src/app/admin/(painel)/admin-nav.tsx" "src/app/admin/(painel)/admin-breadcrumb.tsx"`
Esperado: as entradas de `assinaturas` e `suporte` **continuam lá** — nenhuma delas era alvo deste
sprint (D2.1 e a nota do `/admin/suporte`).

- [ ] **Step 7: Commit final se sobrou algo**

```bash
git status --porcelain
git add -A && git commit -m "chore(admin): fecha Sprint 2 (podar o que engana)"
```

---

## Critério de pronto (do spec)

> Não existe caminho — nem por menu, nem por URL — para criar fatura sem cobrança; suíte verde;
> nenhum link ou breadcrumb quebrado.

Verificado por: Task 5 Step 5 (nenhuma referência), Step 2 (suíte), Step 6 (menu/breadcrumb).

## Nota sobre documentação histórica

`grep -rn "faturas/nova"` **fora de `src/`** ainda retorna ocorrências em documentos de auditoria e
planos antigos (`docs/audit/mapping/02_rotas_e_paginas.md`, `docs/historico/AUDITORIA_ADMIN.md`,
`docs/admin-redesign/PLANO-MELHORIAS-*.md`). **Não serão atualizados de propósito:** são registros
datados do que existia à época, e reescrevê-los apagaria a história. Os `grep` deste plano são
sempre restritos a `src/`.

## Fora deste plano (declarado)

- `/admin/assinaturas` — decisão D2.1, do dono.
- `/admin/suporte` — fica (breadcrumb).
- Consolidação `/api/admin/faturas/*` × `/api/admin/invoices/*` — a família `faturas/` ainda tem o
  `workflow`, que é usado; consolidar é trabalho próprio, não cabe num sprint de remoção.
- Deploy. Este sprint termina com commits locais; o push é decisão do dono.
