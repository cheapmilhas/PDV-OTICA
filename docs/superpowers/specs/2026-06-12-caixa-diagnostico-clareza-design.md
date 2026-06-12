# Caixa — Diagnóstico + Clareza + Conferência Completa

**Data:** 2026-06-12
**Status:** Spec aprovada (aguardando review formal)
**Origem:** Cliente PS VISION relatou que uma venda lançada hoje "não foi para o caixa". O dono também notou no seu teste (Atacadão dos Óculos) que "o caixa não funciona tão bem".

---

## 1. Diagnóstico (confirmado no código)

O caixa **não está perdendo vendas**. Ele segue a regra contábil correta de varejo/ótica, mas **não comunica essa regra** e **não dá rastreabilidade de uma venda específica**. Três fatos confirmados:

### 1.1. Só dinheiro/PIX/débito entram no caixa — por design
`METHODS_IN_CASH = ["CASH","PIX","DEBIT_CARD"]` (`src/lib/payment-methods.ts:58`). Cartão de **crédito**, **crediário** (`STORE_CREDIT`) e **saldo a receber** (`BALANCE_DUE`) NÃO geram `CashMovement` — viram `AccountReceivable`/`CardReceivable` (`src/services/sale-side-effects.service.ts:224-299`). Isso é a melhor prática: não é dinheiro na gaveta ainda. A venda "no cartão" do PS VISION, se foi crédito, **corretamente** não aparece no caixa.

### 1.2. A tela mostra só o turno aberto da filial da sessão
`GET /api/cash/shift` → `getCurrentShift(branchId, companyId)` (`src/services/cash.service.ts:294`). O `branchId` vem de `session.user.branchId`. Se a venda PIX caiu num turno auto-aberto diferente, ou (Atacadão, 2 lojas) numa filial diferente da que o usuário olha, o movimento existe mas é invisível ali.

### 1.3. Não existe rastreabilidade venda→caixa
A tela de detalhe da venda (`src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx`) **não mostra em qual caixa a venda caiu** nem distingue "entrou no caixa" de "a prazo". O único endpoint que liga venda↔movimento é `/api/cash/debug`, **travado em `NODE_ENV === "development"`** (`src/app/api/cash/debug/route.ts:13-16`) — inútil em produção. Ninguém consegue provar "cadê a venda #1234".

### 1.4. O card "a prazo" do caixa do dia mostra valores zerados (bug de confiança)
A tela do caixa já tenta conferir a prazo: card amber "A prazo · informativo" (`caixa/page.tsx:490-503`) soma `CashMovement` com método em `METHODS_A_PRAZO`. Mas como crédito/crediário **nunca geram CashMovement**, esse card **quase sempre mostra R$ 0**, mesmo com R$ 5.000 vendidos no crédito. Ele promete uma conferência que não entrega — origem direta da sensação "o caixa não funciona tão bem".

### 1.5. Achado novo: BOLETO e CHEQUE somem do controle
`BOLETO` e `CHEQUE` não estão em `METHODS_IN_CASH` nem em `METHODS_WITH_RECEIVABLE` (`src/lib/payment-methods.ts:58-67`). No fluxo de venda (`sale-side-effects.service.ts`) eles **não geram nem CashMovement nem AccountReceivable** → dinheiro vendido que desaparece do controle financeiro. Bug silencioso.

**Conclusão:** o PIX do PS VISION quase certamente caiu num turno/filial diferente do observado (ou o "PIX" era crédito). Mas hoje é **impossível provar** — e essa impossibilidade é o bug real a resolver.

### 1.6. Melhores práticas (varejo/ótica)
O fechamento de caixa deve mostrar **TODAS as formas de pagamento lado a lado**, em seções separadas: dinheiro/PIX/débito (conferidos contra a gaveta) e crédito/crediário/a-receber (conferidos contra o relatório, não contra a gaveta). Fontes: [goftx](https://goftx.com/blog/pos-reconciliation-guide/), [fitsmallbusiness](https://fitsmallbusiness.com/pos-reconciliation/), [Shopify](https://www.shopify.com/blog/balancing-a-cash-drawer).

---

## 2. Escopo

**Nível escolhido pelo dono:** Diagnóstico + Clareza (não "repensar o caixa do zero").

Cinco entregas: **A** (rastreador), **B** (clareza no detalhe da venda), **C** (microcopy na tela do caixa), **D** (conferência completa do dia), **E** (consertar boleto/cheque).

### Fora de escopo
- Não muda quais métodos entram fisicamente no caixa (dinheiro/PIX/débito permanecem).
- Não reescreve o fluxo de fechamento/conciliação além do necessário para D.
- Não cria FK `Sale → CashShift` (a ligação continua por branchId + janela temporal).
- Não persiste o breakdown por método no banco (é derivável das vendas do turno).
- Não muda o modelo de dados além da migration aditiva mínima da Entrega E (se necessária).

---

## 3. Design técnico

### Entrega A — Rastreador "Onde caiu esta venda?"

**Novo serviço:** `saleService.getCashTrace(saleId: string, companyId: string)`
Caminha `Sale → SalePayment → CashMovement → CashShift`. Retorna, por pagamento:
```ts
type PaymentTrace = {
  paymentId: string;
  method: PaymentMethod;
  amount: number;
  enteredCashRegister: boolean;
  destino: "cash_register" | "accounts_receivable" | "card_receivable" | "none";
  shift?: {                 // presente quando enteredCashRegister = true
    shiftId: string;
    branchName: string;
    operador: string;       // openedByUser.name
    openedAt: string;
    status: "OPEN" | "CLOSED";
  };
};
```
- `enteredCashRegister` = existe `CashMovement` com `salePaymentId = payment.id`. Usa o índice `@@index([salePaymentId])` (`prisma/schema.prisma:1407`).
- `destino` derivado do método: `METHODS_IN_CASH`→`cash_register`; `STORE_CREDIT`/`BALANCE_DUE`/`BOLETO`/`CHEQUE`→`accounts_receivable`; `CREDIT_CARD`→`card_receivable`. (Pós-Entrega E, boleto/cheque já caem em `accounts_receivable`.)
- Multi-tenant: valida `sale.companyId === companyId` antes de retornar (404 se não bate).

**Novo endpoint:** `GET /api/sales/[id]/cash-trace`
- Auth + `requirePermission("cash_shift.view")`.
- `getCompanyId()` da sessão; passa para o serviço.
- Resposta: `{ trace: PaymentTrace[] }`.

**Diagnóstico imediato:** este endpoint rodado na venda real do PS VISION confirma se foi "a prazo" ou shift/filial diferente. Substitui em produção o que `cash/debug` só fazia em dev.

### Entrega B — Clareza no detalhe da venda

`src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx`, card "Formas de Pagamento":
- A página chama `GET /api/sales/[id]/cash-trace` **em paralelo** ao `getById` (não incha o payload principal de `saleService.getById`).
- Cada pagamento ganha um selo + linha auxiliar:
  - 🟢 **"Entrou no caixa"** → `Caixa {branchName} · {operador} · {openedAt}` (+ badge "turno aberto/fechado").
  - 🟡 **"A prazo — vira conta a receber"** (crediário/saldo/boleto/cheque pós-E) ou **"A prazo — recebível de cartão"** (crédito).
  - ⚪ **"Sem destino registrado"** apenas se `destino === "none"` (boleto/cheque pré-Entrega E, ou dados legados).
- Componente isolado `<PaymentDestinationBadge trace={...} />` (arquivo novo, < 80 linhas).

### Entrega C — Microcopy na tela do caixa

`src/app/(dashboard)/dashboard/caixa/page.tsx`:
- Tooltip/nota junto ao bloco "a receber": "Crédito, crediário e saldo a receber não entram no caixa físico — viram contas a receber e aparecem aqui só para conferência."
- Multi-filial: rótulo explícito "Caixa da Loja {branchName}" no header do status. Quando `isAllBranches` (hook `use-branch-context` já existe), exibir aviso "Selecione uma loja para ver o caixa dela" — evita procurar venda da Loja 2 no caixa da Loja 1.

### Entrega D — Conferência completa do dia (todas as formas)

**Novo serviço:** `cashService.getShiftSalesByMethod(shift: { id, branchId, openedAt, closedAt? }, companyId: string)`
```ts
prisma.salePayment.groupBy({
  by: ["method"],
  where: {
    sale: {
      companyId,
      branchId: shift.branchId,
      status: "COMPLETED",
      createdAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) },
    },
  },
  _sum: { amount: true },
  _count: true,
});
```
Daqui sai o **valor real** de crédito/crediário/saldo, independente de `CashMovement`.

**`getCurrentShift`** passa a anexar esse resumo. `/api/cash/shift` retorna `{ shift, salesByMethod }`.

**Tela do caixa do dia** — o card amber zerado vira um **quadro de conferência em 2 blocos**:
- 💵 **Na gaveta / conferível** (Dinheiro, PIX, Débito): valor autoritativo dos `CashMovement` do turno (inclui sangria/reforço no saldo). Esta é a fonte que bate o físico.
- 📄 **A receber / informativo** (Crédito, Crediário, Saldo a receber, Boleto, Cheque): valor real vindo de `getShiftSalesByMethod`.

**Modal de fechamento** (`src/components/caixa/modal-fechamento-caixa.tsx`):
- Ganha o mesmo quadro read-only no Step 1 (após o `FORMAS.map`, antes do "Total geral", ~linha 372). Puramente informativo — **não** altera o que é persistido. `closeShift` continua conferindo só dinheiro (`closingDeclaredCash` vs `closingExpectedCash`). Conserta a inconsistência do `BALANCE_DUE`, que hoje fica num limbo.

**Decisão de fonte dupla (documentar):** dinheiro/PIX/débito existem como `CashMovement` E como `SalePayment`. Para o **bloco gaveta** usar `CashMovement` (autoritativo, inclui sangria/reforço). Para o **bloco a receber** usar `SalePayment` (único lugar onde a prazo aparece). Não somar as duas fontes para o mesmo método.

### Entrega E — Consertar BOLETO e CHEQUE

**Decisão do dono:** boleto e cheque → **conta a receber** (como crediário).

`src/services/sale-side-effects.service.ts`:
- Incluir `BOLETO` e `CHEQUE` no caminho que gera `AccountReceivable` (hoje em `METHODS_WITH_RECEIVABLE = ["STORE_CREDIT","BALANCE_DUE"]`).
- `src/lib/payment-methods.ts`: adicionar `BOLETO`/`CHEQUE` a `METHODS_WITH_RECEIVABLE` (e a `METHODS_A_PRAZO` para classificação consistente nas telas).
- **Vencimento:** boleto e cheque com vencimento +30 dias (igual `BALANCE_DUE`), 1 parcela. (Pré-datado com vencimento customizado fica fora de escopo — sprint futuro.)
- **Cliente obrigatório?** Conta a receber precisa de cliente. Avaliar se boleto/cheque entram em `METHODS_REQUIRE_CUSTOMER`. **Decisão:** SIM — conta a receber sem cliente é órfã. Adicionar ambos a `METHODS_REQUIRE_CUSTOMER` e validar no PDV (gating como crediário já faz).
- **Migration:** nenhuma alteração de schema necessária (`AccountReceivable` já existe). Apenas lógica.
- **Dados legados:** vendas antigas com boleto/cheque sem recebível não são corrigidas retroativamente (sinalizadas como `destino: "none"` na Entrega B). Migração de dados legados = fora de escopo; documentar como dívida.

---

## 4. Arquivos afetados

| Arquivo | Mudança | Entrega |
|---|---|---|
| `src/services/sale.service.ts` | + `getCashTrace()` | A |
| `src/app/api/sales/[id]/cash-trace/route.ts` | novo endpoint | A |
| `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx` | chama cash-trace, renderiza selos | B |
| `src/components/vendas/payment-destination-badge.tsx` | componente novo | B |
| `src/app/(dashboard)/dashboard/caixa/page.tsx` | microcopy, rótulo de filial, quadro 2-blocos | C, D |
| `src/services/cash.service.ts` | + `getShiftSalesByMethod()`, estender `getCurrentShift` | D |
| `src/app/api/cash/shift/route.ts` | retornar `salesByMethod` | D |
| `src/components/caixa/modal-fechamento-caixa.tsx` | quadro read-only de conferência | D |
| `src/services/sale-side-effects.service.ts` | boleto/cheque → AccountReceivable | E |
| `src/lib/payment-methods.ts` | reclassificar boleto/cheque | E |

---

## 5. Testes

- **A:** `getCashTrace` — venda só dinheiro (1 trace cash_register com shift), venda crédito (card_receivable, sem shift), venda mista (cash + crédito), venda de outra company (404). Endpoint: 200 com permissão, 403 sem.
- **D:** `getShiftSalesByMethod` — turno com vendas de todos os métodos retorna soma correta por método; exclui CANCELED/REFUNDED; respeita janela `openedAt..closedAt`; respeita `branchId` (venda de outra filial não entra). Garante crédito não-zerado.
- **E:** venda com boleto gera `AccountReceivable` +30d; idem cheque; ambos exigem cliente (rejeita sem cliente); não geram `CashMovement`; aparecem no bloco "a receber" da Entrega D.
- **Regressão:** dinheiro/PIX/débito continuam gerando CashMovement e batendo o fechamento; `closeShift` inalterado (só dinheiro).
- Meta: manter suíte verde (atualmente ~663 testes) + cobertura dos novos serviços.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Fonte dupla (CashMovement vs SalePayment) gerar dupla contagem | Bloco gaveta usa só CashMovement; bloco a receber usa só SalePayment. Documentado. Nunca somar as duas para o mesmo método. |
| Janela temporal `createdAt` vs `completedAt` divergir | Usar `createdAt >= openedAt`, alinhado a como CashMovements são carimbados hoje. Índice `@@index([companyId, branchId, createdAt])` cobre. |
| Boleto/cheque legados sem recebível | Não corrigir retroativamente; sinalizar honestamente como "sem destino". Dívida documentada. |
| Performance do groupBy por turno | Índice existente cobre branchId+createdAt; turno = janela curta (1 dia típico). |
| Multi-filial confundir ainda | Entrega C torna a filial explícita + bloqueia "todas as filiais" para conferência. |

---

## 7. Critérios de sucesso

1. Dado o ID de qualquer venda, o dono consegue ver em qual caixa (filial/operador/turno) cada pagamento caiu — ou por que não entrou.
2. O caixa do dia mostra crédito/crediário/saldo/boleto/cheque com **valores reais** (não R$ 0), claramente separados de "na gaveta".
3. Boleto e cheque deixam de sumir: viram conta a receber.
4. O usuário entende, na própria tela, por que cartão de crédito não está na gaveta — sem precisar perguntar.
5. Suíte de testes verde; zero regressão no fechamento de caixa (dinheiro).
