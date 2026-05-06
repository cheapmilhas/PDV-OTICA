# 12 — Componentes UI Chave

## 1. Inventário

- **Componentes shadcn/ui em `src/components/ui/`** (32 arquivos):
  - `alert-dialog`, `alert`, `animated-counter`, `avatar`, `badge`, `bento-card`, `button`, `calendar`, `card`, `checkbox`, `collapsible`, `combobox`, `command`, `dialog`, `dropdown-menu`, `form`, `gradient-text`, `input`, `label`, `popover`, `progress`, `responsive-table`, `scroll-area`, `select`, `separator`, `sheet`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster`

- **Componentes customizados em `src/components/**`** (~139 arquivos `.tsx`), organizados por domínio:
  - `admin/`, `auth/`, `caixa/`, `campaigns/`, `cashback/`, `clientes/`, `configuracoes/`, `crm/`, `estoque/`, `financeiro/`, `fornecedores/`, `home/`, `landing/`, `landing-layout/`, `layout/`, `ordens-servico/`, `pages/`, `pdv/`, `permissions/`, `plan/`, `prescriptions/`, `print/`, `produtos/`, `providers/`, `quotes/`, `reports/`, `seo/`, `shared/`, `subscription/`, `theme-provider.tsx`, `vendas/`

## 2. Componentes-chave por domínio

### 2.1 PDV (`src/components/pdv/`)
- `modal-finalizar-venda.tsx` — modal central do checkout
- `modal-novo-cliente.tsx` — cadastro rápido de cliente
- `modal-configurar-crediario.tsx` — configura parcelas STORE_CREDIT

✅ **Disabled durante processamento** confirmado em `modal-finalizar-venda.tsx`: botão "Cancelar" tem `disabled={loading}`. Provavelmente o de "Finalizar" também (não 100% verificado em todo o arquivo). 🟢

### 2.2 Vendas (`src/components/vendas/`)
- `vendas-filters.tsx`

### 2.3 Ordens de serviço (`src/components/ordens-servico/`)
- `kanban-board.tsx` — provável Kanban com `@dnd-kit/sortable`
- `modal-novo-cliente-simples.tsx`
- `prescription-image-upload.tsx` — upload de imagem da receita (LGPD relevante!)

### 2.4 Caixa (`src/components/caixa/`)
- `modal-detalhes-caixa.tsx`, `historico-caixas.tsx`

### 2.5 Layout (`src/components/layout/`)
- `sidebar.tsx` — desktop
- `header.tsx` — top bar (com `md:hidden`/`md:flex` para mobile)
- `mobile-sidebar.tsx` — `Sheet` lateral em mobile
- `mobile-nav.tsx` — barra de navegação inferior em mobile (`md:hidden`)
- `keyboard-shortcuts.tsx` — atalhos globais

### 2.6 Providers (`src/components/providers/`)
- `branch-provider-wrapper.tsx` — contexto de filial (rel. 06 G6)
- `theme-provider.tsx` — tema dark/light

### 2.7 Auth (`src/components/auth/`)
- `ProtectedRoute.tsx` — analisado no rel. 05

## 3. Padrões observados

### 3.1 Formulários
- **Lib:** `react-hook-form` + `@hookform/resolvers/zod`
- Apenas **3 arquivos** usam (busca por `react-hook-form|useForm`):
  - Provavelmente os formulários grandes (modal-novo-cliente, modal-finalizar-venda, etc.)
  - 🟡 **Maioria dos formulários NÃO usa `useForm`** — usam `useState` direto + validação manual. Inconsistência.

### 3.2 Tabelas
- shadcn `Table` e `responsive-table.tsx` (custom)
- Padrão `DataTable` formal: ⚪ INCERTO se existe — não vi em grep
- Sort/filter/paginação: implementado caso-a-caso (não via componente padrão)

### 3.3 Modais
- shadcn `Dialog` (em todo lugar)
- `Sheet` para mobile (drawer lateral)
- Não vi convenção "Drawer no mobile, Dialog no desktop" — parece tudo Dialog mesmo em mobile

### 3.4 Toast
- **Coexistem `sonner` e `react-hot-toast`** (rel. 01 A7) 🟡
- Imports diferentes em arquivos diferentes:
  - `import toast from "react-hot-toast"` (visto em `vendas/[id]/detalhes/page.tsx`, `pdv/page.tsx`, `ordens-servico/nova/page.tsx`)
  - `sonner` provavelmente usado em outros (e em `Toaster` de `src/components/ui/toaster.tsx`)
- 🟡 Inconsistência. Provavelmente migração não terminada.

### 3.5 Mobile responsiveness

**Padrão Tailwind:**
- Breakpoints: `md:` (768px) é o pivô principal
- `hidden md:flex` (desktop only) e `md:hidden` (mobile only)
- `MobileNav` (componente dedicado, fixo bottom)
- `mobile-sidebar.tsx` (Sheet drawer lateral)
- Layout principal `(dashboard)/layout.tsx`: `flex h-screen`, `pb-20 md:pb-6` para evitar sobreposição com nav inferior

✅ **Sistema é mobile-first em vários pontos.** Mas:
- Tabelas com muitas colunas (vendas, OS, financeiro) — ⚪ verificar overflow horizontal
- PDV (checkout) — ⚪ tela complexa, precisa testar
- Modais grandes (modal-finalizar-venda) — ⚪ ver se cabe em viewport mobile

### 3.6 Loading / empty / error states

✅ Confirmado em PDV:
- `loadingProducts`, `loadingCustomers`, `finalizingVenda` (states)
- Renderização condicional com `Loader2 animate-spin`
- Empty states presentes em listagens

🟡 **Padronização:** não vi componente único de "Empty State" / "Loading Skeleton". Cada tela implementa do seu jeito.

### 3.7 Botões críticos com `disabled` + `loading`

| Ação | Componente | Disabled? |
|---|---|---|
| Finalizar venda | `modal-finalizar-venda.tsx` | ✅ confirmado em "Cancelar" — Finalizar provavelmente também (rate-limit também ajuda) |
| Salvar OS | `ordens-servico/nova/page.tsx` | ⚪ não verificado |
| Fechar caixa | (modal de fechamento) | ⚪ |
| Aprovar transferência | `/dashboard/estoque/transferencias` | ⚪ |
| Devolver venda | `/dashboard/vendas/[id]/detalhes` | ⚪ |
| Converter orçamento | `/dashboard/orcamentos/[id]` | ⚪ |
| Salvar cliente | `clientes/novo/page.tsx` | ⚪ |
| Salvar produto | `produtos/novo/page.tsx` | ⚪ |
| Receber conta | financeiro/contas | ⚪ |

**🟠 Recomendação para fase 2:** auditar todos os botões de ação crítica com testes E2E que clicam 2× rápido.

## 4. Telas que **PRECISAM** de teste visual em fase 2

Ordem de prioridade:

### Críticas (golden path)
1. **`/dashboard/pdv`** — fluxo completo de venda (PDV)
2. **`/dashboard/orcamentos/novo`** — criar orçamento
3. **`/dashboard/orcamentos/[id]`** — converter em venda
4. **`/dashboard/ordens-servico/nova`** — criar OS com prescrição
5. **`/dashboard/caixa`** — abertura/fechamento
6. **`/dashboard/vendas/[id]/detalhes`** — devolução, edição

### Importantes (funcionalidades secundárias)
7. **`/dashboard/clientes/novo`** + **/[id]/editar**
8. **`/dashboard/produtos/novo`** + **/[id]/editar**
9. **`/dashboard/estoque`** — listagem
10. **`/dashboard/estoque/transferencias`** — fluxo cross-filial
11. **`/dashboard/financeiro/contas`** — baixa de contas
12. **`/dashboard/relatorios/dre`** + **/vendas** + **/comissoes**

### Mobile-specific
13. **`/dashboard/pdv` em mobile** — venda no celular
14. **MobileNav** — navegação inferior
15. **Sidebar mobile (Sheet)** — drawer lateral

### Dashboards
16. **`/dashboard`** (root) — métricas
17. **`/dashboard/financeiro/dashboard`** — financeiro
18. **`/dashboard/financeiro/bi`** — BI

### Admin SaaS
19. **`/admin/dashboard`**
20. **`/admin/clientes/[id]`** — gestão de tenant

## 5. Sidebar (`src/components/layout/sidebar.tsx`)

⚪ Não lida em detalhe. Provavelmente tem itens condicionais via `usePermission()` (filtragem por permissão, igual ao `dashboard/page.tsx:278` que filtra `hasPermission(item.permission)`).

## 6. Header (`src/components/layout/header.tsx`)

351 linhas. Tem:
- Branch selector (provavelmente)
- Notificações
- Avatar/perfil/logout
- `hidden md:inline-block` para esconder nome do user em mobile

## 7. Print components (`src/components/print/`)

⚪ Não auditados. Provavelmente componentes para PDF de venda/OS/comprovante via `jspdf` + `html2canvas`.

## 8. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| M1 | Coexistência de `sonner` + `react-hot-toast` | 🟡 | imports |
| M2 | Apenas 3 arquivos usam `react-hook-form` (maioria dos forms é `useState` ad-hoc) | 🟡 | grep |
| M3 | Sem componente único de "Empty State" / "Loading Skeleton" — cada tela faz o seu | 🟡 | grep |
| M4 | `modal-finalizar-venda` tem `disabled={loading}` em "Cancelar" — finalizar provavelmente também (mas precisa verificar) | 🟢/⚪ | inspeção |
| M5 | Mobile bem trabalhado (Sheet, MobileNav, breakpoints) ✅ | 🟢 | components/layout |
| M6 | Tabelas com muitas colunas (vendas, OS, financeiro) — risco de quebra em mobile não testado | ⚪ | precisa fase 2 |
| M7 | PDV em mobile — UX não verificada | ⚪ | precisa fase 2 |
| M8 | Botões de ação crítica (devolver, converter, aprovar transferência, baixar conta, etc.) — proteção de duplo clique não auditada | ⚪ | precisa fase 2 |
| M9 | Sidebar usa `usePermission()` para esconder itens (provável) | 🟢 | inferido |
| M10 | Print components (`/components/print/*`) não auditados | ⚪ | grep |
| M11 | `prescription-image-upload.tsx` lida com dado sensível de saúde — UX e validação não auditadas | 🟠 | LGPD |
| M12 | Branch selector / context — confirmar se backend honra branchId do contexto front (não session) | ⚪ | rel. 06 G6 |
