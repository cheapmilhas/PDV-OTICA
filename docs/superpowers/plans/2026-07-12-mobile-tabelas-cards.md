# Tabelas → Cards Mobile — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter as 20 tabelas do dashboard que ainda forçam scroll horizontal (ou clipam) no celular para o padrão `ResponsiveTable` — 15 viram cartão (`cards`), 5 matrizes viram scroll horizontal deliberado com indicador.

**Architecture:** Frente 2 da auditoria mobile (a frente 1 "Preenchimento" já está em prod). 100% UI, ZERO migration, ZERO lógica de dados alterada. Só troca o wrapper/markup de tabela. O padrão já existe e roda em ~40 telas — esta fase estende para as 20 restantes. Baixo risco.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind, shadcn/ui (`Table` family), `ResponsiveTable`.

**Environment notes:**
- Worktree: `.worktrees/mobile-tabelas-cards` (branch `feat/mobile-tabelas-cards`, base `a8dc6aa6`). `node_modules`+`.env` são symlinks do pai.
- Comandos: typecheck `./node_modules/.bin/tsc --noEmit`; build `npm run build`; testes `./node_modules/.bin/vitest run <path>`. `next lint` NÃO existe.
- **ZERO migration.** Não tocar em nenhuma query, service, ou lógica de cálculo/formatação — SÓ o markup da tabela.
- A maioria dessas telas NÃO tem teste unitário. A verificação por tela é: (1) `data-label` presente em TODA `TableCell` do grupo A; (2) `tsc` limpo; e no fim build + Codex + revisão visual. NÃO inventar testes de UI pesados (as telas usam useSession/fetch — setup desproporcional).
- Codex revisa CADA LOTE (commit) antes de prod. Deploy único no fim, `vercel deploy --prod --archive=tgz --yes` (a árvore excede 15000 arquivos por causa dos worktrees).

---

## Padrão de conversão (LER ANTES — vale para todas as tarefas)

Imports necessários no topo de cada arquivo (adicionar os que faltarem):
```tsx
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
```

### GRUPO A — vira cartão. Regras:
1. Envolver a tabela em `<ResponsiveTable cards minWidth={640}>...</ResponsiveTable>` (ajustar `minWidth` p/ ~800 se ≥8 colunas).
2. Trocar tags cruas por componentes shadcn: `<table>`→`<Table>`, `<thead>`→`<TableHeader>`, `<tbody>`→`<TableBody>`, `<tr>`→`<TableRow>`, `<th>`→`<TableHead>`, `<td>`→`<TableCell>`, `<tfoot>`→`<TableFooter>`. (Se a tela JÁ usa `<Table>` shadcn — ex. lotes-estoque — pular esta troca, só envolver + data-label.)
3. **Adicionar `data-label="<Cabeçalho da coluna>"` em CADA `<TableCell>`** — o texto do rótulo é o mesmo do `<TableHead>` correspondente. Célula de Ações ou vazia (colSpan) recebe `data-label=""` (full-width, sem rótulo).
4. Remover o wrapper `overflow-x-auto`/`overflow-hidden` que existia em volta da tabela (o `ResponsiveTable` cuida disso). ⚠️ despesas-recorrentes usa `overflow-hidden` que CLIPA — remover é o que conserta.
5. Preservar TODO o resto: className de células (`text-right`, `text-center`, cores), Badges, Buttons, formatação, `.map()`, keys, estados loading/vazio.
6. Linha de estado vazio com `colSpan`: manter, marcar a `TableCell` com `data-label=""`.

**Exemplo completo (table cru → cards), baseado em despesas-recorrentes:**
```tsx
// ANTES:
<table className="w-full text-sm">
  <thead className="bg-gray-50 border-b">
    <tr>
      <th className="text-left px-4 py-3 ...">Descrição</th>
      <th className="text-right px-4 py-3 ...">Valor</th>
      <th className="text-center px-4 py-3 ...">Ações</th>
    </tr>
  </thead>
  <tbody className="divide-y ...">
    {items.map((item) => (
      <tr key={item.id} className="...">
        <td className="px-4 py-3 ...">{item.description}</td>
        <td className="px-4 py-3 text-right ...">{formatCurrency(item.amount)}</td>
        <td className="px-4 py-3 text-center"><div className="flex ...">{/* botões */}</div></td>
      </tr>
    ))}
  </tbody>
</table>

// DEPOIS:
<ResponsiveTable cards minWidth={640}>
  <Table className="w-full text-sm">
    <TableHeader className="bg-gray-50 border-b">
      <TableRow>
        <TableHead className="text-left px-4 py-3 ...">Descrição</TableHead>
        <TableHead className="text-right px-4 py-3 ...">Valor</TableHead>
        <TableHead className="text-center px-4 py-3 ...">Ações</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody className="divide-y ...">
      {items.map((item) => (
        <TableRow key={item.id} className="...">
          <TableCell data-label="Descrição" className="px-4 py-3 ...">{item.description}</TableCell>
          <TableCell data-label="Valor" className="px-4 py-3 text-right ...">{formatCurrency(item.amount)}</TableCell>
          <TableCell data-label="" className="px-4 py-3 text-center"><div className="flex ...">{/* botões */}</div></TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</ResponsiveTable>
```

### GRUPO B — scroll deliberado (matrizes). Regras:
1. Envolver em `<ResponsiveTable minWidth={720}>` — **SEM a prop `cards`**. Isso mantém a tabela como tabela (comparação lado-a-lado preservada) e adiciona o indicador de overflow (gradiente) no mobile.
2. Ainda trocar tags cruas por componentes shadcn (Table/TableHeader/etc.) por consistência, MAS **NÃO precisa de `data-label`** (sem `cards`, o rótulo não é usado).
3. Remover o `overflow-x-auto` manual que existia (o ResponsiveTable substitui). `<tfoot>` vira `<TableFooter>` normalmente — sem tratamento especial (não é cartão).
4. `minWidth`: ajustar para a largura real (matriz de 9 colunas ~900; comparativo-lojas com N filiais dinâmico ~200*N, usar 720 como piso).

---

## Estrutura de arquivos (só MODIFY, nenhum novo)

**Lote 1 — Relatórios A** (grupo A, área relatorios):
- `src/app/(dashboard)/dashboard/relatorios/produtos-vendidos/page.tsx` (~554)
- `src/app/(dashboard)/dashboard/relatorios/comissoes/commission-legacy-view.tsx` (~481 e ~534 — 2 tabelas)
- `src/app/(dashboard)/dashboard/relatorios/historico-caixas/page.tsx` (~466)
- `src/app/(dashboard)/dashboard/relatorios/posicao-estoque/page.tsx` (~502)
- `src/app/(dashboard)/dashboard/relatorios/produtos-sem-giro/page.tsx` (~467)

**Lote 2 — Relatórios A (cont.)**:
- `src/app/(dashboard)/dashboard/relatorios/contas-receber/page.tsx` (~455 e ~399 — 2 tabelas)
- `src/app/(dashboard)/dashboard/relatorios/contas-pagar/page.tsx` (~496 e ~463 — 2 tabelas)
- `src/app/(dashboard)/dashboard/relatorios/vendas/page.tsx` (~364)
- `src/app/(dashboard)/dashboard/relatorios/metricas-lentes/page.tsx` (~515 e ~630 — 2 tabelas)

**Lote 3 — Financeiro A**:
- `src/app/(dashboard)/dashboard/financeiro/despesas-recorrentes/page.tsx` (~282 — PRIORIDADE, clipa)
- `src/app/(dashboard)/dashboard/financeiro/lotes-estoque/page.tsx` (~499 — já usa `<Table>`)
- `src/app/(dashboard)/dashboard/financeiro/cartoes/page.tsx` (~157)
- `src/app/(dashboard)/dashboard/financeiro/dashboard/page.tsx` (~622)

**Lote 4 — Grupo B (matrizes, scroll)**:
- `src/app/(dashboard)/dashboard/relatorios/dre/page.tsx` (~472)
- `src/app/(dashboard)/dashboard/relatorios/comparativo-lojas/page.tsx` (~153)
- `src/app/(dashboard)/dashboard/financeiro/fluxo-caixa/page.tsx` (~456 — tem tfoot)
- `src/app/(dashboard)/dashboard/financeiro/dre/page.tsx` (~500 — hierárquica)
- `src/app/(dashboard)/dashboard/caixa/[id]/relatorio/page.tsx` (~161)

---

## Tarefas

### Task 1: Lote 3 primeiro — despesas-recorrentes (a que CLIPA) + Financeiro A

> Começar pela pior (despesas-recorrentes usa overflow-hidden e corta conteúdo). Faz o lote financeiro-A inteiro num commit.

**Files:** os 4 do Lote 3 acima.

- [ ] **Step 1:** Em `despesas-recorrentes/page.tsx`, ler o bloco da tabela (~275-350). Aplicar o padrão GRUPO A: remover o wrapper `overflow-hidden`, envolver em `<ResponsiveTable cards minWidth={640}>`, converter table→Table/etc, adicionar `data-label` em cada TableCell (Descrição, Categoria, Valor, Dia, Frequência, Status; a de Ações → `data-label=""`). Preservar Badges e Buttons.
- [ ] **Step 2:** `lotes-estoque/page.tsx` (~499): já usa `<Table>` shadcn — só envolver em `<ResponsiveTable cards minWidth={800}>` (9 col) e adicionar `data-label` em cada `TableCell` (Produto, SKU, Fornecedor, NF, Entrada, Qtd Original, Qtd Restante, Custo Unit, Custo Total). Remover overflow-x-auto manual se houver.
- [ ] **Step 3:** `cartoes/page.tsx` (~157): padrão GRUPO A. data-label: Data Prevista, Venda, Parcela, Bandeira, NSU, Valor Bruto, Status. `minWidth={720}` (7 col).
- [ ] **Step 4:** `financeiro/dashboard/page.tsx` (~622): padrão GRUPO A. data-label: #, Vendedor, Qtd. Vendas, Total Vendido, Ticket Médio. `minWidth={640}` (5 col).
- [ ] **Step 5:** Verificar: `./node_modules/.bin/tsc --noEmit` → 0 erros nesses arquivos. Grep de sanidade: cada `<TableCell` nos 4 arquivos tem `data-label` (script Python multi-linha, não grep bash — data-label pode estar em linha longa).
- [ ] **Step 6: Commit** — `git add` os 4 arquivos + `git commit -m "feat(mobile-tabelas): financeiro — 4 tabelas viram cartão no celular (despesas-recorrentes clipava)"`.

### Task 2: Lote 1 — Relatórios A (parte 1)

**Files:** os 5 arquivos do Lote 1 (produtos-vendidos, comissoes[2 tabelas], historico-caixas, posicao-estoque, produtos-sem-giro).

- [ ] **Step 1:** Para CADA arquivo, aplicar o padrão GRUPO A (envolver, converter tags, data-label por célula, remover overflow manual). Labels vêm do `<th>`/`TableHead` de cada tabela — usar exatamente o texto do cabeçalho. `minWidth`: 800 para produtos-vendidos (10 col), historico-caixas (9 col), posicao-estoque (8 col), comissoes-1 (8 col); 720 para comissoes-2 (7 col) e produtos-sem-giro (7 col).
- [ ] **Step 2:** `commission-legacy-view.tsx` tem 2 tabelas (~481 resumo por vendedor, ~534 detalhamento) — converter AMBAS.
- [ ] **Step 3:** Preservar Badges de status, formatação de moeda/%, e qualquer célula de total/subtotal (se houver linha total, marcar sua TableCell com data-label do que ela representa, ou "" se for label full-width).
- [ ] **Step 4:** `./node_modules/.bin/tsc --noEmit` → 0 erros. Grep Python: data-label em toda TableCell dos 5 arquivos.
- [ ] **Step 5: Commit** — `feat(mobile-tabelas): relatorios pt.1 — 6 tabelas viram cartão (produtos-vendidos, comissões, histórico-caixas, posição-estoque, sem-giro)`.

### Task 3: Lote 2 — Relatórios A (parte 2)

**Files:** contas-receber (2 tabelas), contas-pagar (2 tabelas), vendas, metricas-lentes (2 tabelas).

- [ ] **Step 1:** Aplicar GRUPO A em cada. contas-receber: tabela :455 (7 col: Descrição, Cliente, Parcela, Vencimento, Valor, Dias Atraso, Categoria) E a :399 (4 col: Cliente, Qtd. Pagamentos, Total a Receber, Vencido) — ambas. contas-pagar: :496 (5 col) E :463 (4 col). vendas: :364 (6 col: Data, Cliente, Vendedor, Total, Status, Pagamento). metricas-lentes: :515 (5 col: #, Laboratório, Nº OS, Entregues, Prazo Médio) E :630 (5 col: Segmento, Receita, Custo, Margem, Qtd).
- [ ] **Step 2:** `minWidth={720}` p/ as de 7 col, `640` p/ as de ≤6 col.
- [ ] **Step 3:** `./node_modules/.bin/tsc --noEmit` → 0. Grep Python: data-label em toda TableCell.
- [ ] **Step 4: Commit** — `feat(mobile-tabelas): relatorios pt.2 — contas-receber/pagar, vendas, métricas-lentes viram cartão`.

### Task 4: Lote 4 — Grupo B (matrizes, scroll deliberado)

**Files:** os 5 do Lote 4.

- [ ] **Step 1:** Aplicar padrão GRUPO B (envolver em `<ResponsiveTable minWidth={...}>` SEM `cards`, converter tags shadcn, SEM data-label, remover overflow manual). `minWidth`: relatorios/dre ~900 (9 col); comparativo-lojas 720 (N dinâmico); fluxo-caixa 720 (5 col + tfoot → TableFooter); financeiro/dre 640 (3 col hierárquica); caixa/relatorio 640 (2 col).
- [ ] **Step 2:** ⚠️ fluxo-caixa tem `<tfoot>` com linha-total — converter para `<TableFooter>` normalmente (sem cards, não vira cartão, o total continua como linha). financeiro/dre é hierárquica (Fragment mãe/filho) — só envolver, não mexer na estrutura de linhas.
- [ ] **Step 3:** `./node_modules/.bin/tsc --noEmit` → 0 erros.
- [ ] **Step 4: Commit** — `feat(mobile-tabelas): matrizes (DRE, comparativo-lojas, fluxo-caixa) com scroll deliberado + indicador no mobile`.

### Task 5: Revisão Codex por lote + verificação final

- [ ] **Step 1:** Para cada um dos 4 commits (lotes), rodar `codex exec` revisando o diff: confirmar que NENHUMA lógica de dados mudou, que data-label está em toda TableCell do grupo A, que o grupo B ficou sem `cards`, que nenhum overflow manual sobrou. Corrigir achados reais.
- [ ] **Step 2:** `./node_modules/.bin/tsc --noEmit` no projeto inteiro → **0 erros**.
- [ ] **Step 3:** `npm test` (suíte completa) → todos passam (se falhar em campo Prisma, `./node_modules/.bin/prisma generate`).
- [ ] **Step 4:** `npm run build` → sucesso.
- [ ] **Step 5:** Commit de quaisquer correções.

---

## Fora de escopo (confirmado na auditoria — NÃO tocar)
- Layouts de impressão/recibo térmico (estoque contagem, imprimir de OS/orçamento/venda) — são para papel.
- Tabelas de itens dentro de forms de OS/orçamento (poucas colunas, contexto de edição; grades de receita já usam `.grade-responsive`).
- As outras 3 frentes da auditoria mobile: alvos <44px, aposentar hamburger, hydration error.
