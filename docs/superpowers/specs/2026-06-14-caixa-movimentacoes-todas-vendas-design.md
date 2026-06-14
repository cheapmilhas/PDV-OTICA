# Caixa — Movimentações mostram TODAS as vendas (à vista + a prazo)

**Data:** 2026-06-14
**Status:** Spec aprovada (aguardando review formal)
**Origem:** Dono notou que a tabela "Movimentações do caixa" (Atacadão dos Óculos) só lista vendas em dinheiro/PIX — uma venda no Crédito de R$ 1.850 e outras a prazo não aparecem. Pergunta: "não seria correto aparecer na movimentação todas as vendas?"

**Continuação de:** `2026-06-12-caixa-diagnostico-clareza-design.md` (feature do caixa já deployada). Aquela entregou o bloco agregado "Conferência por forma de pagamento"; ESTA traz o detalhe linha-a-linha na tabela de movimentações.

---

## 1. Diagnóstico (confirmado no código + pesquisa de mercado)

### 1.1. Por que a venda a prazo não aparece
A tabela "Movimentações do caixa" (`caixa/page.tsx:656-742`) itera **`movements`** (`page.tsx:132` = `shift?.movements`), que vem de `cashService.getCurrentShift` com `include: { movements }` — ou seja, **exclusivamente `CashMovement`**. E `CashMovement type=SALE_PAYMENT` só é criado para `METHODS_IN_CASH` = CASH/PIX/DEBIT_CARD (`sale-side-effects.service.ts:224-241`). Crédito/crediário/boleto/cheque/saldo geram `SalePayment` + recebível, **sem CashMovement** → invisíveis na tabela.

### 1.2. O que o mercado espera
PDVs de varejo/ótica mostram **todas as vendas segregadas por forma de pagamento** na movimentação do caixa, além de sangria/reforço. Fontes: [Conta Azul](https://ajuda.contaazul.com/hc/pt-br/articles/13755614760205), [Olist](https://ajuda.olist.com/pt_BR/primeiros-passos-no-pdv/como-utilizar-o-pdv), [vhsys](https://ajuda.vhsys.com.br/categorias/vendas/pdv-controle-dos-caixas).

### 1.3. O cuidado contábil (não pode misturar)
A "movimentação" tem duas leituras que **não podem somar juntas** ([fitsmallbusiness](https://fitsmallbusiness.com/pos-reconciliation/), [eposnow](https://www.eposnow.com/us/resources/payment-reconciliation-explained/)):
- **Livro-caixa (gaveta):** dinheiro/PIX/débito + sangria/reforço alteram o saldo a conferir.
- **Diário de vendas:** todas as vendas do turno por método (visão de movimento total da loja).

O erro atual é a tabela mostrar só a leitura 1. A correção é mostrar **as duas, claramente rotuladas**, sem misturar saldos.

---

## 2. Escopo

**Modelo escolhido pelo dono:** "Todas as vendas na tabela, marcadas". A tabela lista CashMovement (como hoje) **+** as vendas a prazo, com tag "→ a receber", valor sem sinal, sem somar no saldo da gaveta.

**Decisão do dono — débito:** permanece como à vista (continua `METHODS_IN_CASH`, gera CashMovement). Nenhuma mudança no débito; só adiciona as linhas a prazo.

### Fora de escopo
- Não muda o cálculo do saldo da gaveta (`valorAtual`) nem o fechamento de caixa (dinheiro conferido igual).
- Não separa débito/cartões num 3º grupo (decisão do dono).
- Não mexe no bloco "Conferência por forma de pagamento" (resumo agregado já funciona — vira o resumo; a tabela vira o detalhe).
- Não cria migration (só leitura de dados existentes).

---

## 3. Design técnico

### 3.1. Por que abordagem (a) — partição por "gera CashMovement ou não"
À vista (CASH/PIX/DEBIT) existe como CashMovement **E** SalePayment. Todo o resto existe **só** como SalePayment. O critério de criação de CashMovement é `METHODS_IN_CASH.includes(method)` (`sale-side-effects.service.ts:225`). Logo:

> **Tabela = todos os `CashMovement` (já vêm: à vista + abertura/sangria/reforço/estorno) + os `SalePayment` cujo `method ∉ METHODS_IN_CASH`.**

**⚠️ Correção da auditoria (C1):** o enum `PaymentMethod` tem **10 valores** (`schema.prisma:3377-3388`): CASH, PIX, DEBIT_CARD, CREDIT_CARD, BOLETO, STORE_CREDIT, CHEQUE, **AGREEMENT** (Convênio), **OTHER** (Outro), BALANCE_DUE. `METHODS_IN_CASH` (3) + `METHODS_A_PRAZO` (5) = só 8 — **AGREEMENT e OTHER ficam de fora de ambos**. Se a query filtrasse por `method: { in: METHODS_A_PRAZO }`, convênio/outro continuariam INVISÍVEIS (o mesmo bug que estamos consertando) e a tabela ficaria inconsistente com o agregado `getShiftSalesByMethod` (que não filtra método e JÁ conta convênio/outro). **Por isso a query filtra `method: { notIn: METHODS_IN_CASH }`** — captura a prazo + convênio + outro, com a mesma garantia de zero overlap (CashMovement só contém METHODS_IN_CASH).

Zero duplicação por construção: CashMovement nunca contém método fora de METHODS_IN_CASH, e a query nova exclui exatamente METHODS_IN_CASH.

### 3.2. Novo serviço: getShiftSalePayments
`cashService.getShiftSalePayments(shift: { id, branchId, openedAt, closedAt? }, companyId)` — irmão de `getShiftSalesByMethod`, reusa o mesmo `where` mas com `findMany` linha-a-linha:
```ts
prisma.salePayment.findMany({
  where: {
    status: { not: "VOIDED" },
    method: { notIn: METHODS_IN_CASH },   // C1: tudo que NÃO gera CashMovement (a prazo + convênio + outro)
    sale: {
      companyId,
      branchId: shift.branchId,
      status: "COMPLETED",
      createdAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) },
    },
  },
  select: {
    id: true, method: true, amount: true,
    sale: { select: { id: true, number: true, createdAt: true, sellerUser: { select: { name: true } } } },
  },
  orderBy: { sale: { createdAt: "asc" } },
});
```
Retorna normalizado para o shape da linha. **`createdAt` é `string` (ISO)** no shape do cliente — `NextResponse.json` serializa Date→string; o cliente faz `new Date(x.createdAt)` para ordenar (M1):
```ts
type ShiftReceivableRow = {
  id: string;
  kind: "RECEIVABLE";          // marca a linha como "a receber" (não afeta gaveta)
  createdAt: string;           // ISO; cliente parseia para ordenar
  method: PaymentMethod;
  amount: number;              // Number(Decimal)
  saleId: string;
  saleNumber: number;
  sellerName: string;          // sale.sellerUser.name (sellerUser é relação obrigatória, sempre presente)
};
```
**Ressalvas obrigatórias** (iguais ao getShiftSalesByMethod, já validado): filtra `status COMPLETED`, exclui `VOIDED`, usa `sale.sellerUser.name` (NÃO existe `sellerName` no schema; `sellerUser` é relação NOT NULL → sempre presente, L1), `amount` via `Number()`. **Consistência:** mesmos filtros do `getShiftSalesByMethod` exceto que aquele não filtra método (conta tudo) e este exclui METHODS_IN_CASH (à vista já está na tabela via CashMovement) — a UNIÃO (CashMovement à vista + estas linhas) cobre exatamente o mesmo conjunto que o agregado.

### 3.3. Caixa do dia (tela ao vivo)
- `/api/cash/shift/route.ts` (GET): além de `shift` + `salesByMethod`, retornar `receivableRows` (de `getShiftSalePayments`). Modo `?branch=all` continua retornando `shift: null` (sem receivableRows).
- `caixa/page.tsx`:
  - Estado novo `receivableRows`.
  - Array derivado `allRows` = `movements` (CashMovement, com `direction` IN/OUT e sinal) **+** `receivableRows` (marcadas `kind: "RECEIVABLE"`), **ordenado por horário** com `new Date(x.createdAt).getTime()` (M1 — datas vêm como string ISO da API).
  - Renderizar `allRows` na tabela. Linhas a prazo:
    - Tipo: badge "Venda" + sub-badge "→ a receber" (estilo amber, distinto do verde de entrada).
    - Valor: mostrado **sem `+`/`−`** (ex.: "R$ 1.850,00" em cinza/amber), deixando claro que não entra na gaveta.
    - Operador: `sellerName`.
  - Empty-state da tabela: trocar o guard `movements.length === 0` (`page.tsx:678`) por `allRows.length === 0` (M2) — senão um turno só com vendas a prazo mostraria "nenhuma movimentação".
  - **NÃO** injetar `receivableRows` no array `movements` usado pelo `reduce` de `valorAtual` (`page.tsx:182`) — o saldo da gaveta vem só de CashMovement, intocado.
- **Rodapé da tabela** (novo): duas linhas distintas:
  - "Saldo em gaveta: {valorAtual}" (já existe, de CashMovement).
  - "Total vendido no turno: {total}" onde **`total = salesByMethod.reduce((s,r)=>s+r.amount,0)`** (H3 — NÃO usar `totalVendas`/`resumoPagamentos`, que são só à vista e dariam total subcontado; `salesByMethod` já inclui a prazo + convênio + outro).

### 3.4. Histórico (turnos fechados)
- `/api/cash-registers/[id]/transactions/route.ts`: já retorna `{ movements, salesByMethod }`; adicionar `receivableRows` via `getShiftSalePayments(shift, companyId)` (o shift já está carregado com openedAt/closedAt/branchId).
- **⚠️ Payload das transações do histórico (H1/H2):** hoje o endpoint mapeia cada movimento para `{ id, type, amount, description, createdAt }` (`transactions/route.ts:47-53`) — **descarta `method`, `direction` e operador**, e devolve `type` cru (`SALE_PAYMENT`/`OPENING_FLOAT`/`REFUND`…). O modal (`modal-detalhes-caixa.tsx`) tem um union `"SALE"|"EXPENSE"|"WITHDRAWAL"|"SUPPLY"` (`:55-61`) e um `transactionTypeLabels` (`:150-155`) que **já não casa** com os tipos crus → labels saem `undefined` para SALE_PAYMENT/OPENING_FLOAT/REFUND. Além disso o sinal é hardcoded `+`/`−` por tipo (`:336-338`) → uma linha a receber sairia com `+`. **Antes de mesclar receivableRows, esta entrega precisa:**
  - (a) Alinhar o mapa de tipos/labels do modal aos valores reais de `CashMovementType` (ou mapear no endpoint, como a tela ao vivo faz via `getTipoLabel`).
  - (b) Ampliar o shape retornado para incluir `method`, e um campo `kind` ("MOVEMENT" | "RECEIVABLE") + um flag de "sem sinal".
  - (c) Adicionar branch de render `kind === "RECEIVABLE"` (amber, sem sinal, Forma + Operador do vendedor).
  - (d) Reordenar a lista mesclada por horário parseado (o endpoint hoje devolve `desc`, `:43`; receivableRows vêm `asc` — re-sortar no cliente, M1).
  Este conserto do mapeamento de tipos do histórico é pré-existente mas precisa ser feito junto, senão o histórico fica visualmente quebrado.

### 3.5. Fechamento
- `modal-fechamento-caixa.tsx`: **verificar** se renderiza tabela linha-a-linha de movimentações. Se SIM, aplicar o mesmo merge (precisa receber `receivableRows` como prop, threaded por `page.tsx`). Se só usa `ConferenciaFormas` (agregado), **não precisa mudança**. (A confirmar na implementação.)

### 3.6. Reconciliar "Resumo por forma" vs "Conferência por forma" (M3)
A tela do dia hoje tem **dois** blocos "por forma de pagamento" que mostram totais diferentes para o mesmo turno:
- **"Conferência por forma de pagamento"** (`page.tsx:516`) — fonte `salesByMethod` = TODAS as vendas (à vista + a prazo + convênio/outro). Correto/completo.
- **"Resumo por forma de pagamento"** (`page.tsx:605`) — fonte `resumoPagamentos` = `calculatePaymentSummary()` sobre `movements` = **só à vista**. Subconta.

Com a tabela passando a mostrar tudo, ter um "Resumo por forma" que só conta à vista fica visivelmente inconsistente. **Decisão:** **remover** o bloco "Resumo por forma de pagamento" (`page.tsx:577-628` aprox.) — ele é redundante com "Conferência por forma" (que é a versão completa) e agora enganoso. O "Total de vendas" card (`page.tsx:539`) que também usa `totalVendas` (à vista) deve passar a usar o total de `salesByMethod` para não subcontar. (Se o dono preferir manter "Resumo por forma" renomeado para "À vista por forma", registrar como alternativa — mas o default é remover.)

---

## 4. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/services/cash.service.ts` | + `getShiftSalePayments()` (linha-a-linha, `method notIn METHODS_IN_CASH` → a prazo + convênio + outro) |
| `src/app/api/cash/shift/route.ts` | retornar `receivableRows` |
| `src/app/(dashboard)/dashboard/caixa/page.tsx` | mesclar movements + receivableRows (sort por data parseada); rodapé "gaveta vs total vendido" (total = salesByMethod); badge "a receber"; empty-state `allRows`; **remover bloco "Resumo por forma"**; card "Total de vendas" passa a usar salesByMethod |
| `src/app/api/cash-registers/[id]/transactions/route.ts` | retornar `receivableRows`; ampliar shape (method, kind, sem-sinal) |
| `src/components/caixa/modal-detalhes-caixa.tsx` | alinhar tipos/labels aos `CashMovementType` reais; mesclar receivableRows; branch render "a receber" (amber, sem sinal); re-sort por horário |
| `src/components/caixa/modal-fechamento-caixa.tsx` | (se tiver tabela linha-a-linha) mesclar; senão sem mudança |
| `src/services/__tests__/shift-sale-payments.test.ts` | novo — testes do serviço |

---

## 5. Testes

- **getShiftSalePayments:** retorna TODO método `notIn METHODS_IN_CASH` (a prazo + **AGREEMENT/convênio + OTHER/outro** — C1), e **NÃO** inclui CASH/PIX/DEBIT (esses já vêm de CashMovement); exclui VOIDED; exclui sale CANCELED/REFUNDED (status COMPLETED); respeita janela openedAt..closedAt e branchId; normaliza amount (Number) e sellerName (sale.sellerUser.name); ordena por createdAt.
- **Cobre convênio/outro (C1):** teste explícito de que uma venda em AGREEMENT e uma em OTHER aparecem no resultado (não ficam invisíveis).
- **Consistência com o agregado:** soma de (CashMovement à vista SALE_PAYMENT/IN) + (getShiftSalePayments) == soma de `getShiftSalesByMethod` para o mesmo turno (table e Conferência batem).
- **Anti-duplicação:** garantir que uma venda em dinheiro (CASH) NÃO apareça em getShiftSalePayments — senão duplicaria na tabela.
- **Saldo da gaveta inalterado:** teste/asserção de que `valorAtual` não muda ao adicionar receivableRows (idealmente teste de unidade do cálculo; na prática, garantir que receivableRows não entra no array `movements`).
- **Regressão:** tabela continua mostrando CashMovement (à vista + sangria/reforço) como hoje; fechamento de caixa (dinheiro) intocado.
- Meta: suíte verde (atualmente 697 testes) + cobertura do serviço novo.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| **Convênio/Outro ficarem invisíveis** (C1, crítico) | Query filtra `method: { notIn: METHODS_IN_CASH }` (não `in: METHODS_A_PRAZO`) → captura AGREEMENT/OTHER também. Teste explícito. |
| **Histórico visualmente quebrado** (H1/H2) | Alinhar tipos/labels do modal aos CashMovementType reais + branch "a receber" sem sinal + ampliar payload, junto desta entrega. |
| **Total do rodapé subcontado** (H3) | "Total vendido" usa `salesByMethod.reduce` (completo), não `totalVendas`/`resumoPagamentos` (só à vista). |
| **3 números "por forma" inconsistentes** (M3) | Remover bloco "Resumo por forma" (só à vista) + card "Total de vendas" passa a usar salesByMethod. |
| Dinheiro duplicar na tabela (CashMovement + SalePayment) | Query exclui `METHODS_IN_CASH` — à vista nunca entra. Teste anti-duplicação. |
| Linha a prazo somar no saldo da gaveta | receivableRows vêm de fonte separada; nunca entram no array `movements` do `reduce` de valorAtual. Teste. |
| Venda cancelada aparecer na tabela | Filtra status COMPLETED + payment não-VOIDED (igual getShiftSalesByMethod já validado). |
| Janela de tempo de borda (sale.createdAt vs shift.openedAt) | Mesma janela do getShiftSalesByMethod já em produção; `gte openedAt` inclui a venda que abriu o turno (shift criado antes do sale na transação). |
| Histórico/fechamento ficarem inconsistentes com o dia | Replicar a mesma mescla nos 3 lugares (dia, histórico, e fechamento se aplicável). |
| Performance (findMany por turno) | Janela curta (1 dia); índices `Sale[companyId,branchId,createdAt]` + `SalePayment[saleId,status]` cobrem. |

---

## 7. Critérios de sucesso

1. Na tabela "Movimentações do caixa" (dia e histórico), TODA venda do turno aparece — à vista com sinal +/−, a prazo marcada "→ a receber" sem sinal.
2. O saldo da gaveta continua igual (a prazo não soma no físico).
3. O rodapé mostra claramente "saldo em gaveta" ≠ "total vendido no turno".
4. Venda cancelada/estornada não polui a tabela.
5. Suíte verde; zero regressão no fechamento de caixa (dinheiro).
