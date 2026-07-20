# Plano de Correções — QA Dogfood 09/07/2026

> **Status: AGUARDANDO APROVAÇÃO DO DONO.** Cada item foi VERIFICADO no código (HEAD `57bde97`) antes de entrar aqui — confirmado que o problema é real, na linha citada, e ainda não corrigido. Nada de suposição.

Encontrado durante teste do fluxo completo da vendedora em produção (filial Pacajus) + varredura de 6 áreas.

---

## Resumo executivo

| # | Item | Severidade | Verificado | Esforço | Risco |
|---|------|-----------|-----------|---------|-------|
| 1 | Estoque por filial não populado no cadastro manual | 🔴 Média-alta (afeta operação) | ✅ Confirmado | Médio | Baixo (1 teste inverte) |
| 2 | "undefined pagamentos" em Contas a Receber | 🟡 Baixa (visual) | ✅ Confirmado | Trivial | Nenhum |
| 3 | Flash "Total R$ 0 / Falta negativa" no PDV | 🟡 Cosmético | ✅ Confirmado | Trivial (1 linha) | Nenhum |
| 4 | Dashboard mostra zeros durante carregamento | 🟡 Baixa (UX) | ✅ Confirmado | Pequeno | Baixo |
| 5 | Divergência de status COMPLETED vs ativos | ⚪ Decisão de produto | ✅ Confirmado como decisão | — | — não corrigir |

**Recomendação de ordem:** #1 primeiro (único que afeta operação real). #2, #3, #4 podem ir juntos num PR de "polimento" (todos pequenos, baixo risco). #5 não é correção — é só uma decisão sua.

---

## Item 1 — 🔴 Estoque por filial não é criado no cadastro manual de produto

**O sintoma (visto no teste):** cadastrei uma armação com "Quantidade em Estoque = 10". No checkout, o PDV acusou "Estoque insuficiente. Disponível: 0" (e "-1" na 2ª venda). O relatório de Posição de Estoque mostrava 8, mas a venda via 0.

**Causa raiz confirmada:**
- O card do PDV lê `Product.stockQty` (cache global). A validação e o débito da venda leem `BranchStock.quantity` (estoque por filial) — fontes diferentes.
- Ao cadastrar manualmente, `syncBranchStock` só grava o `BranchStock` se a empresa tiver **exatamente 1 filial**:
  - `src/services/product.service.ts:296` → `if (branches.length !== 1) return;`
- Em ótica multi-filial (ou quando a venda usa filial ≠ principal), o `BranchStock` nunca é criado → checkout vê 0.
- A **importação** de produtos já faz certo (resolve a filial principal via `resolveOwnedBranchId`), mesmo multi-filial — `src/services/product-import.service.ts`. Só o cadastro manual não.

**Correção proposta:** fazer o cadastro/edição manual espelhar o importador — resolver uma filial-alvo (a principal/mais antiga ativa, reutilizando a lógica de `resolveOwnedBranchId`) e gravar o `BranchStock` nela, em vez de abortar quando há mais de 1 filial.

**Impacto em testes:** o teste `src/services/__tests__/product-branchstock-sync.test.ts` (caso "NÃO toca BranchStock em empresa multi-filial", linhas 82-96) trava o comportamento ATUAL e **precisará ser atualizado** para esperar o upsert na filial principal. Os outros casos (loja única, sem controle de estoque) continuam válidos.

**Decisão que preciso de você (por isso recomendo /forja neste item):** em ótica com várias filiais, ao cadastrar um produto pela tela, o estoque informado deve entrar em **qual filial**? Opções: (a) sempre a principal/mais antiga; (b) a filial ativa no seletor do topo; (c) mostrar um seletor de filial no formulário. Isso muda a implementação.

---

## Item 2 — 🟡 "undefined pagamentos" em Contas a Receber

**Sintoma:** abaixo dos cards "Total a Receber" e "Vencidos", aparece o texto literal "undefined pagamentos".

**Causa raiz confirmada:** o front lê um nome de campo que a API não retorna.
- `src/app/(dashboard)/dashboard/relatorios/contas-receber/page.tsx:314` → ``subtitle={`${data.summary.totalPayments} pagamentos`}``
- `:320` → ``subtitle={`${data.summary.overduePayments} pagamentos`}`` (e nas linhas 180-181 do export PDF)
- Mas o serviço retorna `totalReceivables` / `overdueReceivables` (não `...Payments`): `src/services/reports/accounts-receivable.service.ts:179-188`.
- Como `data.summary.totalPayments` é `undefined`, o template renderiza a string "undefined pagamentos".

**Correção proposta:** trocar no front `totalPayments`→`totalReceivables` e `overduePayments`→`overdueReceivables` (linhas 314, 320, 180-181) e ajustar a interface `ReportData.summary` (linhas 68-69) para os nomes reais. Correção mínima, sem teste travando os nomes atuais.

---

## Item 3 — 🟡 Flash "Total R$ 0 / Falta negativa" no PDV ao liberar venda sem estoque

**Sintoma:** ao clicar "Liberar mesmo assim" no override de estoque, o modal de pagamento pisca por ~2s mostrando Total R$ 0,00 / Falta −R$ X, antes de gravar a venda e redirecionar. A venda é gravada corretamente — é só visual.

**Causa raiz confirmada:** ordem de operações. No ramo de sucesso não-crediário:
- `src/app/(dashboard)/dashboard/pdv/page.tsx:837` → `setCarrinho([])` (zera o total exibido)
- `:841-844` → redirect só depois de 1500ms (`setTimeout`)
- Nesse ramo **falta** `setModalVendaOpen(false)` — o modal fica aberto re-renderizando com total 0 e pagamento antigo.
- O ramo do crediário (`:788-798`) já faz certo: fecha o modal logo após limpar o carrinho.

**Correção proposta:** adicionar `setModalVendaOpen(false);` junto do `setCarrinho([])` na linha 837 — espelhando o ramo do crediário. **1 linha, sem regressão** (a venda já está gravada nesse ponto; os toasts de sucesso são independentes do modal).

---

## Item 4 — 🟡 Dashboard mostra zeros durante o carregamento

**Sintoma:** ao abrir o dashboard, ele mostra R$ 0,00 / 0 clientes / 0 estoque por ~1-2s (parece conta vazia), até os dados chegarem.

**Causa raiz confirmada:** NÃO é bug de dados — a API `/api/dashboard/metrics` retorna 200 com os números certos (confirmado pela aba de rede). O problema é que os 4 cards do topo mostram os valores-padrão (zeros) como placeholder em vez de um skeleton.
- `src/app/(dashboard)/dashboard/page.tsx:66-86` → `defaultMetrics` zerado.
- Já existe um estado `loading` (`:88`), mas ele só é usado nas seções secundárias (produtos baixo, OS, gráficos) — **os 4 cards do topo (`:297-387`) não consultam `loading`**, mostram os zeros direto.
- Ainda exibem "+0.0% vs ontem" / "+100.0%" calculado sobre os zeros durante o load.

**Correção proposta:** aplicar o `loading` já existente aos 4 cards do topo — mostrar skeleton/placeholder enquanto carrega, em vez de zeros. Localizado ao bloco `:297-387`, reaproveita estado que já existe, sem tocar em fetch/API.

---

## Item 5 — ⚪ Divergência de critério de status (decisão sua, NÃO é bug)

**O que é:** o dashboard conta faturamento com `status: "COMPLETED"`; a tela de Vendas ("ativos") conta `status: notIn ["CANCELED","REFUNDED"]` (que inclui vendas OPEN/em aberto). Hoje os números batem porque não há vendas OPEN.

**Leitura (verificada):** é uma divergência **intencional e correta**. O dashboard mede faturamento efetivo (só concluídas) — somar vendas em aberto no faturamento seria errado. **Recomendação: NÃO alinhar.** Fica registrado só para você saber que, se um dia houver muitas vendas em aberto, o total da lista de Vendas e o do dashboard vão divergir por design.

---

## O que NÃO é bug (verificado e descartado)

- **DRE bloqueada por plano** — é feature gating funcionando (aviso "Fazer upgrade"). Correto.
- **Contas a Pagar zerado** — não há fornecedores com dívida. Correto.
- **Alerta "Caixa aberto há 23 dias"** — aviso legítimo do sistema. Ação operacional do dono (fechar o caixa), não código.
- **Campanha "Transitions" expirada em rascunho** — dado antigo, não bug.

---

## Próximos passos (após sua aprovação)

1. **Item 1** → recomendo abrir via `/forja` (tem decisão de arquitetura: qual filial recebe o estoque). Vira spec → implementação com testes.
2. **Itens 2, 3, 4** → um PR único de "polimento QA" (todos pequenos e de baixo risco), via writing-plans → subagent-driven, com verificação (tsc + testes) ao fim.
3. **Item 5** → nenhuma ação de código; só sua ciência.

**Deploy:** segue o padrão da casa (merge → migração manual se houver → `vercel deploy --prod`). Nenhum destes itens exige migração de banco.
