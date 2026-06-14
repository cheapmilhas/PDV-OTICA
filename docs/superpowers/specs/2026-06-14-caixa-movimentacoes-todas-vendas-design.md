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

### 3.1. Por que abordagem (a) — partição disjunta
À vista (CASH/PIX/DEBIT) existe como CashMovement **E** SalePayment. A prazo existe **só** como SalePayment. A partição `METHODS_IN_CASH` × `METHODS_A_PRAZO` no nível de CashMovement é **exata e disjunta** (`sale-side-effects.service.ts:224`). Logo:

> **Tabela = todos os `CashMovement` (já vêm: à vista + abertura/sangria/reforço/estorno) + SOMENTE `SalePayment` cujo `method ∈ METHODS_A_PRAZO`.**

Zero duplicação por construção: CashMovement nunca contém método a prazo, e a query nova filtra `method: { in: METHODS_A_PRAZO }`.

### 3.2. Novo serviço: getShiftSalePayments
`cashService.getShiftSalePayments(shift: { id, branchId, openedAt, closedAt? }, companyId)` — irmão de `getShiftSalesByMethod`, reusa o mesmo `where` mas com `findMany` linha-a-linha:
```ts
prisma.salePayment.findMany({
  where: {
    status: { not: "VOIDED" },
    method: { in: METHODS_A_PRAZO },
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
Retorna normalizado para o shape da linha:
```ts
type ShiftReceivableRow = {
  id: string;
  kind: "RECEIVABLE";          // marca a linha como "a receber" (não afeta gaveta)
  createdAt: Date;
  method: PaymentMethod;
  amount: number;              // Number(Decimal)
  saleId: string;
  saleNumber: number;
  sellerName: string | null;   // sale.sellerUser?.name
};
```
**Ressalvas obrigatórias** (iguais ao getShiftSalesByMethod, já validado): filtra `status COMPLETED`, exclui `VOIDED`, usa `sale.sellerUser.name` (NÃO existe `sellerName` no schema), `amount` via `Number()`.

### 3.3. Caixa do dia (tela ao vivo)
- `/api/cash/shift/route.ts` (GET): além de `shift` + `salesByMethod`, retornar `receivableRows` (de `getShiftSalePayments`). Modo `?branch=all` continua retornando `shift: null` (sem receivableRows).
- `caixa/page.tsx`:
  - Estado novo `receivableRows`.
  - Array derivado `allRows` = `movements` (CashMovement, com `direction` IN/OUT e sinal) **+** `receivableRows` (marcadas `kind: "RECEIVABLE"`), **ordenado por horário**.
  - Renderizar `allRows` na tabela. Linhas a prazo:
    - Tipo: badge "Venda" + sub-badge "→ a receber" (estilo amber, distinto do verde de entrada).
    - Valor: mostrado **sem `+`/`−`** (ex.: "R$ 1.850,00" em cinza/amber), deixando claro que não entra na gaveta.
    - Operador: `sellerName ?? "—"`.
  - **NÃO** injetar `receivableRows` no array `movements` usado pelo `reduce` de `valorAtual` (`page.tsx:182`) — o saldo da gaveta vem só de CashMovement, intocado.
- **Rodapé da tabela** (novo): duas linhas distintas — "Saldo em gaveta: {valorAtual}" e "Total vendido no turno: {soma de todas as vendas, à vista + a prazo}". Deixar visualmente claro que são números diferentes.

### 3.4. Histórico (turnos fechados)
- `/api/cash-registers/[id]/transactions/route.ts`: já retorna `{ movements, salesByMethod }`; adicionar `receivableRows` via `getShiftSalePayments(shift, companyId)` (o shift já está carregado com openedAt/closedAt/branchId).
- `modal-detalhes-caixa.tsx`: estender o tipo de transação (hoje `"SALE"|"EXPENSE"|"WITHDRAWAL"|"SUPPLY"`, `modal:55-61`) para acomodar a categoria "a receber"; mesclar `receivableRows` na lista renderizada, com a mesma marcação visual.

### 3.5. Fechamento
- `modal-fechamento-caixa.tsx`: **verificar** se renderiza tabela linha-a-linha de movimentações. Se SIM, aplicar o mesmo merge (precisa receber `receivableRows` como prop, threaded por `page.tsx`). Se só usa `ConferenciaFormas` (agregado), **não precisa mudança**. (A confirmar na implementação.)

---

## 4. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/services/cash.service.ts` | + `getShiftSalePayments()` (linha-a-linha, fonte SalePayment a prazo) |
| `src/app/api/cash/shift/route.ts` | retornar `receivableRows` |
| `src/app/(dashboard)/dashboard/caixa/page.tsx` | mesclar movements + receivableRows na tabela; rodapé "gaveta vs total vendido"; badge "a receber" |
| `src/app/api/cash-registers/[id]/transactions/route.ts` | retornar `receivableRows` |
| `src/components/caixa/modal-detalhes-caixa.tsx` | mesclar receivableRows na tabela do histórico |
| `src/components/caixa/modal-fechamento-caixa.tsx` | (se tiver tabela linha-a-linha) mesclar; senão sem mudança |
| `src/services/__tests__/shift-sale-payments.test.ts` | novo — testes do serviço |

---

## 5. Testes

- **getShiftSalePayments:** retorna só métodos a prazo (não inclui CASH/PIX/DEBIT — esses já vêm de CashMovement); exclui VOIDED; exclui sale CANCELED/REFUNDED (status COMPLETED); respeita janela openedAt..closedAt e branchId; normaliza amount (Number) e sellerName (sale.sellerUser?.name, null-safe); ordena por createdAt.
- **Anti-duplicação:** garantir que uma venda em dinheiro (CASH) NÃO apareça em getShiftSalePayments (só a prazo) — senão duplicaria na tabela.
- **Saldo da gaveta inalterado:** teste/asserção de que `valorAtual` não muda ao adicionar receivableRows (idealmente teste de unidade do cálculo; na prática, garantir que receivableRows não entra no array `movements`).
- **Regressão:** tabela continua mostrando CashMovement (à vista + sangria/reforço) como hoje; fechamento de caixa (dinheiro) intocado.
- Meta: suíte verde (atualmente 697 testes) + cobertura do serviço novo.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Dinheiro duplicar na tabela (CashMovement + SalePayment) | Query nova filtra `method: { in: METHODS_A_PRAZO }` — à vista nunca entra. Teste anti-duplicação. |
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
