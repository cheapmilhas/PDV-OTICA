# Sprint Rotina de Testes — Óticas Ultra (Design / Spec)

**Data:** 2026-06-03
**Origem:** Rotina de testes manual do dono (Óticas Ultra, cliente do SaaS), ~15 problemas em 6 módulos + auditoria de PDFs.
**Método de diagnóstico:** 6 agentes paralelos leram o código de cada ponto relatado. Veredito por item: 🔴 bug real · 🟡 falta de implementação · 🟢 comportamento correto (só confuso) · 🔵 dado-fantasma.

**Regra de execução (decisão do dono):** após CADA frente concluída, **testar** antes de passar para a próxima. Só avança com teste OK.

---

## Visão geral das frentes

| Frente | Tema | Prioridade | Esforço | Risco |
|--------|------|-----------|---------|-------|
| F1 | Críticos baratos (fios soltos) | Alta | Baixo | Baixo |
| F2 | Pagar conta debita caixa | Alta | Médio | Médio |
| F3 | Cancelados visíveis por papel | Média | Médio | Baixo |
| F4 | Cadastros (Marca/Categoria) + Nº de venda | Média | Médio (migration) | Médio-Alto (migration) |
| F5 | PDFs com header único | Média | Alto (3 engines) | Baixo |

Ordem de execução: **F1 → F2 → F3 → F4 → F5**, testando entre cada uma.

---

## F1 — Críticos baratos

Todos têm o conserto já existente no código, apenas não plugado. Risco baixíssimo.

### F1.1 — Reforço de caixa não soma saldo 🔴
- **Arquivo:** `src/components/caixa/modal-reforco.tsx:28-49`
- **Causa:** `handleSubmit` é um mock (`setTimeout` → toast → fecha). Nunca chama API. Nenhum `CashMovement` é criado.
- **Correção:** substituir o mock por `POST /api/cash/movements` com `{ type: "SUPPLY", amount, note }`, e refetch do shift após sucesso.
- **Endpoint já existe:** `src/app/api/cash/movements/route.ts:46` → `cash.service.ts createMovement`.

### F1.2 — Sangria não tira saldo 🔴
- **Arquivo:** `src/components/caixa/modal-sangria.tsx:28-49`
- **Causa:** mesmo padrão mock.
- **Correção:** `POST /api/cash/movements` com `{ type: "WITHDRAWAL", amount, note }` + refetch.
- **Nota:** o "toast disse R$60 para R$50" é o valor digitado no campo (interpola `formData.valor`), não há mismatch hardcoded.

### F1.3 — Histórico do turno não atualiza 🔴 (efeito de F1.1/F1.2)
- **Arquivo:** renderizado em `page.tsx:645-705` a partir de `shift.movements`.
- **Causa:** a grid está correta; não mostra nada porque nada foi persistido. Corrigir F1.1+F1.2 resolve automaticamente.

### F1.4 — "Carlos Vendedor" hardcoded na abertura 🔴
- **Arquivos:** `modal-abertura-caixa.tsx:92`, `modal-sangria.tsx:71`, `modal-reforco.tsx:71` — todos com `<span>Carlos Vendedor</span>` fixo.
- **Causa:** placeholder esquecido. O operador real ("mirabou") aparece depois porque vem de `shift.openedByUser.name` (banco).
- **Correção:** trocar a string pelo nome do usuário logado (sessão / `useSession`). Nota: confirmar que "Operador" é o usuário logado (quem executa a ação), não necessariamente quem abriu o turno — podem diferir num turno multi-usuário.

### F1.5 — Grids maiores que a tela 🔴
- **Arquivos:** `src/components/estoque/modal-saida-estoque.tsx:222` e `src/components/caixa/modal-abertura-caixa.tsx:74` — `DialogContent` só tem `max-w-*`, sem cap de altura.
- **Causa:** o `DialogContent` base (`src/components/ui/dialog.tsx:41`) é centrado verticalmente e sem `max-height`/`overflow`. Conteúdo alto estoura para fora; botões de submit caem abaixo da dobra.
- **Molde correto:** `src/components/caixa/modal-fechamento-caixa.tsx:238` usa `max-h-[90vh] overflow-y-auto`.
- **Correção:** adicionar `max-h-[90vh] overflow-y-auto` aos dois modais ofensores.

### F1.6 — (Opcional/bônus) Rótulo do estorno no caixa 🟢
- **Arquivo:** `sale.service.ts:905-930`.
- **Status:** comportamento CORRETO (cancelar venda em dinheiro estorna o caixa via `REFUND`/`OUT`). Não é bug.
- **Melhoria opcional:** rótulo/nota do movimento deixar explícito que é débito de cancelamento, para não confundir.

### Teste F1
- `modal-saida-estoque`, `modal-abertura-caixa`: abrir em viewport curto e confirmar que o botão de submit é alcançável (modal rola internamente).
- Caixa aberto: reforço R$100 → saldo sobe R$100 e movimento aparece no histórico. Sangria R$50 → saldo desce R$50, aparece no histórico.
- Abertura/sangria/reforço: caixa de "operador" mostra o nome do usuário logado, nunca "Carlos Vendedor".
- `tsc` limpo + build + revisão.

---

## F2 — Pagar conta debita o caixa

### Problema confirmado 🔴
- **Arquivos:** `src/app/api/accounts-payable/route.ts:298-426` (PATCH pay), `src/services/finance-entry.service.ts:635-675` (`generateAccountPayableExpenseEntry`).
- O PATCH flipa status para PAID e cria um `FinanceEntry`, MAS esse entry tem `financeAccountId = null` e **não** decrementa `FinanceAccount.balance`. Crédito vai para contra-passivo "Contas a Pagar 2.1.01" em vez de Caixa/Banco. Por isso não aparece no extrato (`finance/accounts/[id]/statement/route.ts:27` filtra por `financeAccountId`).
- Bug secundário: `catch {}` silencioso (route.ts:392-394) engole erros do lançamento.
- UI gap: `handleMarkAsPaid` (`financeiro/page.tsx:320-341`) envia só `{id, status, paidDate}` — sem escolher a conta pagadora.

### Correção
1. UI: adicionar seletor "Conta pagadora" (Caixa/Banco/PIX) no modal de pagamento (`financeiro/page.tsx`).
2. PATCH: receber e validar `financeAccountId` (deve pertencer à empresa).
3. `generateAccountPayableExpenseEntry`: espelhar `generateManualExpenseEntry` (`finance-entry.service.ts:812-853`) — setar `financeAccountId` (creditar Caixa/Banco) e `decrement` do `FinanceAccount.balance`.
4. Remover o `catch {}` silencioso (logar erro real).

### ⚠️ Idempotência e reversão (requisito de design — revisão HIGH)
O `FinanceEntry` é idempotente (upsert por chave única), MAS o `decrement` do saldo NÃO é — um PATCH repetido ou retry debitaria o saldo 2×. Regras obrigatórias:
- **Debitar o saldo SOMENTE na transição real PENDING→PAID.** Derivar isso do resultado do upsert (create vs update) ou checar o status atual antes de decrementar. Nunca decrementar incondicionalmente.
- **Caminho de reversão (PAID→PENDING):** hoje o PATCH reverte deletando o entry. Ao adicionar o `decrement` no pagamento, a reversão DEVE re-creditar o saldo (`increment`) na mesma conta. Sem isso, reverter um pagamento deixa o saldo errado para sempre. Ajustar `deleteAccountPayableExpenseEntry` (ou o caminho equivalente) para o `increment` casado.
- Tudo dentro da mesma transação Prisma do PATCH.

### Fora de escopo (decisão do dono)
- Categoria continua enum fixo de 9 valores (`AccountCategory`). Criar categoria custom = item futuro (exigiria migration + modelo `FinanceCategory`).

### Teste F2
- Pagar a conta de água R$15 (deixada de teste) escolhendo "Caixa": saldo da conta cai R$15, lançamento aparece no extrato da conta, status vira PAID.
- **Idempotência:** repetir o PATCH de pagamento NÃO debita o saldo de novo.
- **Reversão:** marcar como pago, depois reverter (PAID→PENDING) → saldo VOLTA ao valor original (re-credita).
- Erro proposital (conta inexistente) deve aparecer (não ser engolido).
- `tsc` + build + revisão.

---

## F3 — Cancelados visíveis por papel

### Decisão do dono
Admin/Gerente **vê** vendas/pedidos cancelados (controle, com badge "CANCELADO" + toggle "Mostrar cancelados" ligado por padrão para eles). Vendedor **não vê**.

### Raiz comum
Cancelar venda só seta `status: CANCELED` (`sale.service.ts:826-831`); não usa `deletedAt`. Listagens não filtram esse status. O cancelamento JÁ cascateia corretamente (estorna estoque, cancela receivables para CANCELED, cancela OS, reverte cashback/comissões). Logo os dados não estão soltos — só não são filtrados na exibição.

### Onde aplicar
1. **Laboratórios** — `laboratories/route.ts:101-114` (`_count.serviceOrders`) e `laboratories/[id]/service-orders/route.ts:28-51`. Backend decide pelo papel: vendedor → exclui CANCELED no count e na lista; admin/gerente → tudo, marcando canceladas.
   - ⚠️ **(revisão HIGH) Prisma 5.22 NÃO suporta `where` dentro de `_count.select` por relação** (é feature de versão posterior, e não há uso filtrado de `_count` no codebase para copiar). NÃO usar `_count` com filtro. Alternativas para o count por lab quando vendedor: (a) substituir o `_count` por `serviceOrder.count({ where: { laboratoryId, status: { not: "CANCELED" } } })` por lab (ou um `groupBy` por `laboratoryId` numa query só, mapeado depois), ou (b) `$queryRaw` agregando. Preferir o `groupBy` para evitar N+1. Decidir na implementação, mas o `_count` filtrado está descartado.
2. **Contas a Receber** — `accounts-receivable/route.ts:88-196` (hoje, sem param `status`, retorna todos). Vendedor → excluir CANCELED por padrão; admin/gerente → incluir com badge. (Aqui é `where.status` na própria query — trivial, sem o problema do `_count`.)
3. **Estoque (histórico)** 🟢 — NÃO é filtro. `StockMovement` é livro-razão append-only sem `saleId`/`status`; cancelamento adiciona `CUSTOMER_RETURN`. Correto. Melhoria apenas visual (parear/etiquetar SALE↔CUSTOMER_RETURN como "estornado") — baixa prioridade.
4. **Lista de vendas + dashboard/métricas** — confirmar na implementação se a listagem de vendas (`vendas/`) e as métricas financeiras já filtram CANCELED. Se não, aplicar o mesmo critério por papel. (Fora do diagnóstico original mas implícito na queixa "cancelados visíveis"; verificar antes de fechar F3.)

### Como decidir o papel
Usar role da sessão (`ADMIN`/`GERENTE` vs `VENDEDOR`) já disponível via `auth-helpers`. Backend decide o payload; front exibe badge "CANCELADO" para quem recebe os cancelados. Toggle "Mostrar cancelados" para admin/gerente.

### Teste F3
- Como vendedor: Laboratórios não conta pedidos cancelados; Contas a Receber não lista parcela de venda cancelada.
- Como admin: vê os cancelados com badge; toggle "Mostrar cancelados" alterna a visão.
- `tsc` + build + revisão.

---

## F4 — Cadastros (Marca/Categoria) + Número de venda

### F4a — Criar Marca e Categoria 🟡
- **Arquivos:** `produtos/novo/page.tsx:251-286` (dropdowns), `api/brands/route.ts` e `api/categories/route.ts` (só GET). Modelos `Brand`/`Category` existem; criação só acontecia via `upsert` na importação de planilha.
- **Correção:**
  1. Adicionar `POST /api/brands` e `POST /api/categories` (criar por nome, scoped `companyId`, anti-duplicado).
  2. Criação inline "+ Nova" nos dois `Select`, espelhando o padrão `src/components/supplier-select.tsx` (mini-dialog → cria → seleciona).
- **Tipo** (`ProductType`) continua enum fixo — correto, não precisa criação.
- **(Fornecedor já resolvido na F1.4? Não — fornecedor é F1 separado.)** Nota: o botão "Novo Fornecedor" standalone (`fornecedores/page.tsx:361`, stub `toast("Em desenvolvimento")`) é corrigido na F1 plugando `ModalFornecedorRapido` (`POST /api/suppliers` já funciona). Listado aqui só para rastreabilidade.

### F4b — Número de venda sequencial (`#cmopsjhm` → `#000123`) 🟡
- **Causa:** `Sale` não tem campo `number` (`schema.prisma:1119`). Mostra-se `sale.id.substring/slice`. Infra pronta: `Counter` + `getNextSequence` (`src/lib/counter.ts:20`) com chave `"sale"` **reservada mas não usada**. Existe dead code `(sale as any).number` em `sales/[id]/pdf/route.ts:104` (cai sempre em "000000").
- **Correção — ordem da migration importa (revisão MEDIUM):** adicionar coluna NOT NULL + `@@unique` numa tabela populada de uma vez FALHA. Sequência obrigatória:
  1. **Migration passo 1:** adicionar `Sale.number Int?` (NULLABLE, sem unique ainda).
  2. **Backfill:** numerar vendas existentes por `createdAt` ASC, por empresa (1,2,3…). Rodar como script/migration de dados.
  3. **Seed do counter:** semear a linha `Counter` chave `"sale"` por empresa no `MAX(number)` atual, para `getNextSequence` continuar sem colisão.
  4. **Migration passo 2:** tornar `number` NOT NULL e adicionar `@@unique([companyId, number])` (espelha `ServiceOrder` `schema.prisma:855/917`).
  5. `sale.service.ts` create: chamar `getNextSequence(companyId, "sale", tx)` dentro da transação, gravar em `Sale.number`.
  6. Criar `src/lib/sale-number.ts` (`saleDisplayNumber(sale)` → `#000123`, fallback CUID para legado onde `number` for null/0).
  7. Trocar todos os `sale.id.substring/slice` pelo helper (listas, recibos, carnê, e descrição "Parcela 2/4 - Venda #..." em `sale-side-effects.service.ts:253,276`).
  8. Remover o `as any` em `pdf/route.ts:104`.
- **⚠️ Concorrência no deploy:** o passo 5 (criar venda já numerando) e o backfill NÃO podem rodar concorrentes, senão uma venda nova colide no unique. Garantir que o backfill+seed do counter complete ANTES de o código que numera entrar no ar (backfill nas migrations de deploy, que rodam antes do `next build`/start). O seed do counter no MAX evita que `getNextSequence` reutilize número de venda legada.
- **Limitação aceita:** descrições JÁ gravadas (parcelas/ledger antigos) permanecem com CUID — só novas saem com número. Não backfillar texto antigo (arriscado).
- **Atenção:** migration + backfill é a parte mais sensível do sprint. Testar com cuidado redobrado em cópia antes de prod.

### Teste F4
- Produto novo: criar Marca e Categoria inline; aparecem selecionadas e persistidas.
- Nova venda: recebe número sequencial; exibida como `#000123` em lista/recibo/carnê. Venda legada cai no fallback sem quebrar.
- Migration aplica e backfill numera sem colisão (`@@unique` respeitado).
- `tsc` + build + revisão.

---

## F5 — PDFs com header único

### Problema confirmado 🟡
- Logo vive em `CompanySettings.logoUrl` (data-URL base64, `schema.prisma:1795`). Upload em Configurações > Aparência funciona.
- Funciona em ~6 docs (recibo de venda PDF/print, OS, orçamento, recibo AR, relatório de estoque).
- **NÃO funciona** em: Relatório de Caixa (`caixa/[id]/relatorio/page.tsx` — sem logo/nome/CNPJ, o pior), carnê (jsPDF e HTML), comprovante de movimentação (`comprovante-movimentacao.tsx` — hardcoded "PDV Ótica"), recibo compartilhável (`recibo/[token]`), e ~14 relatórios via `report-export.ts`.
- Componentes `src/components/print/print-header.tsx` e `src/components/shared/company-logo.tsx` existem mas são **código morto**.
- Tamanhos de logo inconsistentes (40×18mm, 45px, 50px, h-16...).

### Decisão do dono
Padronizar **TODOS** com header único.

### Correção (3 engines)
1. **`PrintHeader` vira o header canônico** (logo + nome + CNPJ + endereço lidos de `CompanySettings`).
2. **Plugar por engine:**
   - **Páginas HTML + `window.print()`** (Relatório de Caixa, recibo token, comprovante de movimentação): usar `PrintHeader` React.
   - **HTML string** (receipt, carnê HTML, products/print): header HTML padronizado equivalente.
   - **jsPDF** (sales PDF, carnê jsPDF, ~14 relatórios via `report-export.ts`): função `drawPdfHeader(doc, company)` plugada em `report-export.ts` (resolve os ~14 de uma vez) + nos 2 carnês.
3. **Consertar carnê jsPDF** (`pdf-utils.ts:13`) que aceita `logoUrl` mas nunca desenha (param morto).
4. **Padronizar tamanho/posição** da logo.

### Fatiamento interno (testar entre cada)
- **F5a:** Relatório de Caixa + docs mais impressos (recibo de venda, OS) → testar.
- **F5b:** carnê (jsPDF + HTML) + comprovante de movimentação → testar.
- **F5c:** ~14 relatórios via `report-export.ts` → testar.

### Teste F5
- Trocar a logo em Configurações reflete em TODOS os documentos.
- Relatório de Caixa sai com logo + nome + CNPJ, layout de impressão limpo (sem cinzas de tela).
- Comprovante de movimentação não mostra mais "PDV Ótica" hardcoded.
- `tsc` + build + revisão.

---

## Itens explicitamente FORA de escopo desta rodada
- Categoria de conta a pagar customizável (fica enum fixo).
- Backfill de descrições textuais antigas com o novo número de venda.
- Pareamento visual avançado no histórico de estoque (apenas etiqueta simples se sobrar tempo).
- Refatorar o "zerar sistema" em transação fatiada (apenas documentar que reset parcial deixa resíduo; orientar usar "ZERAR SISTEMA" completo).

## Riscos e mitigação
- **Migration Sale.number (F4b):** maior risco. Aditiva + backfill idempotente + seed do counter no máximo. Testar em cópia antes de prod.
- **Pagar conta debita saldo (F2):** garantir idempotência (não debitar duas vezes se PATCH repetir). Validar conta pertence à empresa.
- **Filtro por papel (F3):** não vazar dados entre tenants; o filtro de papel é ADICIONAL ao `companyId`, nunca substituto.

## Critérios de aceite (resumo)
Todas as 15 queixas da rotina de testes endereçadas, com cada frente testada antes da próxima, `tsc` limpo, build verde, revisão de código por frente, e smoke manual do dono ao final.
