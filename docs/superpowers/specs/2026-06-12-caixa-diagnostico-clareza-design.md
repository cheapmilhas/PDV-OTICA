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
A tela de detalhe da venda (`src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx`) **não mostra em qual caixa a venda caiu** nem distingue "entrou no caixa" de "a prazo". O único endpoint que liga venda↔movimento é `/api/cash/debug`, **travado em `NODE_ENV === "development"`** (`src/app/api/cash/debug/route.ts:14`) — inútil em produção. Ninguém consegue provar "cadê a venda #1234".

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
- Não muda o modelo de dados (Entrega E é só lógica — `AccountReceivable` já existe; nenhuma migration).

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
  enteredCashRegister: boolean;        // derivado DOS DADOS (ver regra abaixo), não do método
  destino: "cash_register" | "accounts_receivable" | "card_receivable" | "none";
  reversed: boolean;                   // pagamento estornado/cancelado (tem CashMovement REFUND/OUT)
  netCashAmount: number;               // soma líquida dos movimentos (IN − OUT) — 0 se estornado
  shift?: {                 // o turno do movimento IN original (SALE_PAYMENT), se houver
    shiftId: string;
    branchName: string;     // via include shift.branch.name (NÃO é só branchId)
    operador: string;       // openedByUser.name
    openedAt: string;
    status: "OPEN" | "CLOSED";
  };
};
```

**Regras de derivação (corrigem defeitos da auditoria — venda cancelada/estornada não pode mentir):**
- Um `SalePayment` pode ter **vários** `CashMovement` (`cashMovements: CashMovement[]`): o `SALE_PAYMENT`/`IN` original **e**, se cancelado, um `REFUND`/`OUT` com o **mesmo `salePaymentId`** anexado a *outro* turno (`sale.service.ts:929`). Logo:
  - `shift` resolve **somente do movimento `type=SALE_PAYMENT, direction=IN`** (determinístico) — nunca do REFUND. Inclui `shift.branch` e `shift.openedByUser` no query.
  - `reversed` = existe algum `CashMovement` `REFUND`/`OUT` para esse `salePaymentId`, OU `SalePayment.status === "VOIDED"`.
  - `netCashAmount` = Σ(IN) − Σ(OUT) dos movimentos do pagamento.
  - `enteredCashRegister` = existe movimento `SALE_PAYMENT/IN` (derivado **dos dados**, não do método). Usa `@@index([salePaymentId])` (`prisma/schema.prisma:1407`).
- `destino` (rótulo de fallback) derivado do método: `METHODS_IN_CASH`→`cash_register`; `STORE_CREDIT`/`BALANCE_DUE`/`BOLETO`/`CHEQUE`→`accounts_receivable`; `CREDIT_CARD`→`card_receivable`. **Mas:** se o método aponta `accounts_receivable`/`card_receivable` e **não existe** a linha de recebível correspondente (ex.: `STORE_CREDIT` sem `installmentConfig` — `sale-side-effects.service.ts:244`), `destino = "none"` (evita afirmar "vira conta a receber" pra algo que não gerou nada).
- Multi-tenant: valida `sale.companyId === companyId` antes de retornar (404 se não bate).

**Novo endpoint:** `GET /api/sales/[id]/cash-trace`
- Auth + `requirePermission("sales.view")`. **(Corrigido: era `cash_shift.view`, que daria 403 pro `STOCK_MANAGER` — que tem `sales.view` mas não `cash_shift.view`, `permissions.ts:253-277`. O selo aparece na tela de detalhe da venda, então a permissão é a de ver venda.)**
- `getCompanyId()` da sessão; passa para o serviço.
- Resposta: `{ trace: PaymentTrace[] }`.

**Diagnóstico imediato:** este endpoint rodado na venda real do PS VISION confirma se foi "a prazo" ou shift/filial diferente. Substitui em produção o que `cash/debug` só fazia em dev.

**Destino de `cash/debug`:** o `cash-trace` supersede o `cash/debug` (dev-only). **Deletar** `src/app/api/cash/debug/route.ts` nesta entrega — evita rota órfã duplicada (alinhado à limpeza de APIs órfãs que o projeto já vem fazendo).

### Entrega B — Clareza no detalhe da venda

`src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx` (é **`"use client"`**, fetch em `useEffect` — `detalhes/page.tsx:1,106`), card "Formas de Pagamento":
- A página dispara `GET /api/sales/[id]/cash-trace` num `useEffect` **com dependência `[id]`** (não `[sale?.id]`), pra rodar **independente** do `getById` — assim é de fato paralelo, não um waterfall sequencial. O badge tem seu **próprio estado de loading** (skeleton discreto) até o trace chegar; não bloqueia o resto da página.
- Cada pagamento ganha um selo + linha auxiliar:
  - 🟢 **"Entrou no caixa"** → `Caixa {branchName} · {operador} · {openedAt}` (+ badge "turno aberto/fechado"). Mostrado quando `enteredCashRegister && !reversed`.
  - 🔴 **"Estornado / cancelado"** → quando `reversed` (estado de **primeira classe**, não confundir com "entrou"). Mostra "saiu do caixa no estorno". *(Corrige o defeito crítico: venda cancelada não pode aparecer como 🟢.)*
  - 🟡 **"A prazo — vira conta a receber"** (crediário/saldo/boleto/cheque pós-E) ou **"A prazo — recebível de cartão"** (crédito), quando `destino` é receber e a linha de recebível existe.
  - ⚪ **"Sem destino registrado"** quando `destino === "none"` (boleto/cheque legados, ou método-aponta-receber-mas-sem-linha).
- Componente isolado `<PaymentDestinationBadge trace={...} />` (arquivo novo, < 100 linhas).

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
    status: { not: "VOIDED" },          // exclui pagamentos estornados (defeito #4)
    sale: {
      companyId,
      branchId: shift.branchId,
      status: "COMPLETED",               // exclui CANCELED/REFUNDED total
      createdAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) },
    },
  },
  _sum: { amount: true },
  _count: true,
});
```
Daqui sai o **valor real** de crédito/crediário/saldo, independente de `CashMovement`.

**Semântica explícita (defeito #4 — "a receber" é ambíguo):** este número é **"faturado neste turno por método"**, NÃO "saldo em aberto a receber". Pagamentos parciais (`SalePayment.status PENDING`) entram pelo valor bruto faturado; refunds **parciais** (relação `Refund[]`, que não muda `Sale.status`) **não** são descontados aqui. O rótulo na UI será **"Vendido no turno (a prazo)"**, não "a receber em aberto" — pra não prometer um saldo que a query não calcula. Conciliação de saldo em aberto fica fora de escopo (é o módulo de contas a receber).

**Índices (defeito #5 — confirmado OK):** `Sale @@index([companyId, branchId, createdAt])` (`schema.prisma:1190`) cobre o filtro; `SalePayment @@index([saleId, status])` (`schema.prisma:1268`) cobre o join. Sem índice faltando.

**Onde aplicar (defeito #3 — o conserto NÃO pode ser só o turno ao vivo):**
- **Caixa do dia ao vivo:** `getCurrentShift` anexa o resumo; `/api/cash/shift` retorna `{ shift, salesByMethod }`.
- **Histórico de caixas (turnos fechados):** `cash-history.service.ts` / `getShiftById` (que alimentam `caixa/historico`) **também** anexam `getShiftSalesByMethod(shift, companyId)` usando `openedAt..closedAt`. Sem isso, turno fechado continua mostrando R$ 0 em crédito/crediário — conserto pela metade.
- **Modal de fechamento:** ver plumbing abaixo.

**Trava de "todas as filiais" (defeito #4-multi):** `/api/cash/shift` resolve branch por `session.user.branchId`, ignorando a seleção `isAllBranches` do cliente → hoje mostraria dados de UMA loja sob rótulo "todas". **Correção:** o cliente passa a sinalizar o modo "ALL" ao endpoint (query param `?branch=all` ou header), e em modo ALL o endpoint **não** retorna `shift`/`salesByMethod` de uma filial arbitrária — retorna `{ shift: null, allBranches: true }`. A UI mostra "Selecione uma loja específica para ver a conferência do caixa" (Entrega C deixa de ser só visual e passa a refletir o que o backend realmente faz).

**Tela do caixa do dia** — o card amber zerado vira um **quadro de conferência em 2 blocos**:
- 💵 **Na gaveta / conferível** (Dinheiro, PIX, Débito): saldo autoritativo dos `CashMovement` do turno (inclui sangria/reforço). Bate o físico.
- 📄 **Vendido no turno · a prazo** (Crédito, Crediário, Saldo a receber, Boleto, Cheque): valor real de `getShiftSalesByMethod`.

**Microcopy gaveta ≠ vendas (defeito #1):** o "saldo em gaveta" inclui sangria/reforço/abertura, então **não** é igual a "vendas em dinheiro do turno". Pra não confundir a conferência, o bloco gaveta mostra uma linha auxiliar **"vendas à vista no turno"** (vinda das linhas CASH/PIX/DEBIT do `salesByMethod`, que assim **não** são descartadas — elas viram a referência de conciliação), separada do "saldo em gaveta". Assim o operador vê: saldo físico esperado *e* quanto disso veio de vendas vs. ajustes manuais.

**Regra anti-dupla-contagem:** o **saldo da gaveta** vem só de `CashMovement`; as linhas CASH/PIX/DEBIT do `salesByMethod` aparecem **apenas** como a linha informativa "vendas à vista no turno" — nunca somadas ao saldo. Não há dupla contagem porque são exibidas como números distintos e rotulados.

**Modal de fechamento (plumbing — defeito #3):** `src/components/caixa/modal-fechamento-caixa.tsx`
- Hoje recebe só `resumoPagamentos` + `movements` (`modal-fechamento-caixa.tsx:42-47`), e o "esperado" de crédito vem de `resumoPagamentos` (CashMovement-derivado → vazio pra crédito). **Precisa** receber `salesByMethod` como **nova prop**, threaded por `caixa/page.tsx`. Sem isso, o quadro do modal renderiza o mesmo crédito zerado de hoje.
- Ganha o quadro read-only no Step 1 (após `FORMAS.map`, antes do "Total geral", ~linha 372). Puramente informativo — **não** altera o que é persistido. `closeShift` continua conferindo só dinheiro (`closingDeclaredCash` vs `closingExpectedCash`). Conserta a inconsistência do `BALANCE_DUE`.

**Decisão de fonte dupla (documentar):** dinheiro/PIX/débito existem como `CashMovement` E como `SalePayment`. Saldo de gaveta = `CashMovement` (autoritativo). Vendas-por-método (inclusive à vista, como referência) = `SalePayment` via `getShiftSalesByMethod`. Os dois são exibidos como números **rotulados diferentes**, nunca somados.

### Entrega E — Consertar BOLETO e CHEQUE

**Decisão do dono:** boleto e cheque → **conta a receber** (como crediário). **Exigem cliente** (decisão confirmada — ver behavior change abaixo).

> ⚠️ **Atenção: as constantes `METHODS_WITH_RECEIVABLE` e `METHODS_REQUIRE_CUSTOMER` são dead code** — não são importadas por nenhum arquivo não-teste. A regra real é **hardcoded por método** em dois/três pontos. Adicionar aos constantes NÃO muda comportamento. A implementação precisa editar os call sites hardcoded.

**1. Geração de recebível** — `src/services/sale-side-effects.service.ts`:
- Hoje a criação de `AccountReceivable` é um **if-chain** hardcoded por método (`STORE_CREDIT` → N parcelas ~linha 244; `BALANCE_DUE` → 1 parcela +30d ~linha 274). Adicionar tratamento explícito para `BOLETO` e `CHEQUE` → `AccountReceivable` de **1 parcela, vencimento +30 dias** (clonando o bloco `BALANCE_DUE`, que seta todos os campos obrigatórios — `companyId`, `description`, `amount`, `dueDate` — sem violar constraint). (Pré-datado com vencimento customizado = fora de escopo.)

**2. ⚠️ Ajuste do DRE (defeito crítico da auditoria) — `src/services/finance-entry.service.ts`:**
Sem isso, boleto/cheque seriam **contados em dobro** no DRE. Hoje eles caem no `default` daquele serviço e são lançados como **"Bancos, dinheiro recebido D+0"** — então o DRE registraria a entrada no banco **E** a conta a receber ao mesmo tempo (o mesmo bug que o projeto já corrigiu pra cartão, comentários P0-6/P0-7 em `finance-entry.service.ts:357,405`). Para tratar boleto/cheque como `BALANCE_DUE`, adicionar `BOLETO`/`CHEQUE` em **três pontos**:
- `getPaymentDebitAccountCode` (~l.76-77): apontar para `"1.1.03" Contas a Receber` (não `"1.1.02" Bancos`).
- `getFinanceAccountType` (~l.100-101): retornar `null` (não `"BANK"`) — evita incrementar saldo de banco imediato.
- `cashDate` (~l.363): retornar `null` (não recebido D+0) — igual `STORE_CREDIT`/`BALANCE_DUE`.
> Este comportamento atual (boleto/cheque no DRE) é **completamente sem testes** — adicionar testes de DRE pra boleto/cheque junto, senão não há rede de segurança.

**3. Exigência de cliente (hardcoded)** — editar os DOIS call sites. O backend é a trava real (loop por pagamento → trata **pagamento misto** boleto+dinheiro corretamente):
- Backend (trava real): `src/services/sale.service.ts` (~linha 474, dentro do `for (const payment of payments)`, hoje `if (payment.method === "BALANCE_DUE" && !customerId)`) → estender para `BOLETO`/`CHEQUE`. Por ser por-pagamento, venda **mista** (dinheiro + boleto) exige cliente corretamente.
- Frontend (UX): `src/components/pdv/modal-finalizar-venda.tsx` (**caminho corrigido: `pdv/`, não `vendas/`**, ~linha 214, valida o pagamento sendo adicionado) → estender para `BOLETO`/`CHEQUE`.

**4. Reclassificação para as telas** — `src/lib/payment-methods.ts`:
- Adicionar `BOLETO`/`CHEQUE` a `METHODS_A_PRAZO` (usado pela classificação de telas — Entregas B e D). Adicionar também a `METHODS_WITH_RECEIVABLE` e `METHODS_REQUIRE_CUSTOMER` por **consistência documental**, mesmo sendo dead code hoje — assim, se algum dia os call sites forem refatorados para ler dos constantes, já estarão corretos.

**Behavior change (confirmado pelo dono):** após esta entrega, **venda no boleto/cheque sem cliente cadastrado passa a ser bloqueada** no PDV (toast de erro, igual crediário). Isso muda o fluxo de balcão atual onde era possível vender no boleto sem cliente. É o comportamento financeiramente correto — conta a receber sem cliente não tem como ser cobrada. Decisão do dono: aceitar o bloqueio.

**Migration:** nenhuma — `AccountReceivable` já existe. Só lógica.

**Dados legados:** vendas antigas com boleto/cheque sem recebível não são corrigidas retroativamente (sinalizadas como `destino: "none"` na Entrega B). Migração de dados legados = fora de escopo; documentar como dívida.

> Nota: `CREDIT_CARD` vive em `METHODS_A_PRAZO` mas seu recebível é `CardReceivable`, não `AccountReceivable`. A UI separa por **destino** (Entrega A), não por essa constante — o bloco "a receber" não assume que tudo em `METHODS_A_PRAZO` é `AccountReceivable`.

---

## 4. Arquivos afetados

| Arquivo | Mudança | Entrega |
|---|---|---|
| `src/services/sale.service.ts` | + `getCashTrace()`; exigir cliente boleto/cheque (loop ~l.474) | A, E |
| `src/app/api/sales/[id]/cash-trace/route.ts` | novo endpoint (perm `sales.view`) | A |
| `src/app/api/cash/debug/route.ts` | **deletar** (superseded por cash-trace) | A |
| `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx` | cash-trace em useEffect `[id]`, renderiza selos (inclui 🔴 estornado) | B |
| `src/components/vendas/payment-destination-badge.tsx` | componente novo (com loading próprio) | B |
| `src/app/(dashboard)/dashboard/caixa/page.tsx` | microcopy, rótulo/trava de filial, quadro 2-blocos, thread `salesByMethod` p/ modal | C, D |
| `src/services/cash.service.ts` | + `getShiftSalesByMethod()`, estender `getCurrentShift` + `getShiftById` | D |
| `src/services/cash-history.service.ts` | anexar `salesByMethod` aos turnos fechados do histórico | D |
| `src/app/api/cash/shift/route.ts` | retornar `salesByMethod`; tratar modo `?branch=all` (shift null) | D |
| `src/components/caixa/modal-fechamento-caixa.tsx` | nova prop `salesByMethod` + quadro read-only de conferência | D |
| `src/services/sale-side-effects.service.ts` | boleto/cheque → AccountReceivable (+30d, 1 parcela) | E |
| `src/services/finance-entry.service.ts` | boleto/cheque → DRE como "a receber" (3 pontos: débito, tipo, cashDate) | E |
| `src/components/pdv/modal-finalizar-venda.tsx` | exigir cliente boleto/cheque (~l.214) | E |
| `src/lib/payment-methods.ts` | reclassificar boleto/cheque (METHODS_A_PRAZO etc.) | E |

---

## 5. Testes

- **A:** `getCashTrace` — venda só dinheiro (cash_register com shift), crédito (card_receivable, sem shift), mista, outra company (404). **Cenários do bug:** movimento em turno **CLOSED** → `status: "CLOSED"`; movimento em **filial diferente** → `branchName` correto (não o da sessão). **Cenários estorno (críticos):** venda CASH **cancelada** → `reversed: true`, `netCashAmount: 0`, badge 🔴 (NÃO 🟢); estorno anexado a **outro turno** → `shift` resolve do `SALE_PAYMENT/IN` original, não do REFUND. **Método-sem-linha:** `STORE_CREDIT` sem `installmentConfig` → `destino: "none"`. Endpoint: 200 com `sales.view`; `STOCK_MANAGER` (tem sales.view, não cash_shift.view) **recebe 200**, não 403.
- **D:** `getShiftSalesByMethod` — soma correta por método; exclui CANCELED/REFUNDED (Sale.status) e VOIDED (SalePayment.status); respeita janela `openedAt..closedAt` e `branchId`. Crédito não-zerado. **Histórico:** turno fechado também retorna `salesByMethod` (não R$ 0). **Modo ALL:** `?branch=all` retorna `shift: null` + `allBranches: true` (não dados de uma filial).
- **E:** boleto gera `AccountReceivable` +30d (1 parcela); idem cheque; ambos **rejeitam venda sem cliente** (backend loop); **misto dinheiro+boleto** sem cliente também rejeita. **DRE:** boleto/cheque NÃO incrementam saldo de banco D+0 (lançados como a receber, `cashDate: null`) — teste anti-double-count. Não geram `CashMovement`. **Regressão:** boleto/cheque **com** cliente concluem normalmente.
- **Regressão:** dinheiro/PIX/débito continuam gerando CashMovement e batendo o fechamento; `closeShift` inalterado (só dinheiro).
- Meta: manter suíte verde (atualmente ~663 testes) + cobertura dos novos serviços e do DRE de boleto/cheque (hoje sem teste).

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| **Rastreador mentir em venda cancelada/estornada** (crítico) | `enteredCashRegister` derivado dos dados (existe `SALE_PAYMENT/IN`), `reversed` de 1ª classe, `shift` só do IN original (nunca do REFUND), badge 🔴 dedicado. Testes de estorno obrigatórios. |
| **DRE contar boleto/cheque em dobro** (crítico) | Entrega E ajusta `finance-entry.service.ts` (3 pontos) p/ tratar como a receber, igual BALANCE_DUE. Teste anti-double-count. |
| Conserto parcial (só turno ao vivo) | Estendido a histórico (`cash-history.service.ts`/`getShiftById`) e modal de fechamento (prop `salesByMethod`). |
| Modo "todas as filiais" mostrar 1 loja sob rótulo "todas" | Backend trata `?branch=all` retornando `shift: null`; UI bloqueia conferência até escolher loja (não é só visual). |
| Permissão travar quem pode ver a venda | cash-trace gateado em `sales.view` (não `cash_shift.view`); `STOCK_MANAGER` consegue ver os selos. |
| "A receber" ser interpretado como saldo em aberto | Rótulo "Vendido no turno (a prazo)" + semântica documentada: é faturado-no-turno, não outstanding. |
| Gaveta (com sangria/reforço) ≠ vendas à vista | Linha auxiliar "vendas à vista no turno" separada do "saldo em gaveta"; números rotulados distintos, nunca somados. |
| Fonte dupla gerar dupla contagem | Saldo gaveta = só CashMovement; vendas-por-método = só SalePayment. Exibidos como números distintos. |
| Behavior change boleto/cheque exigir cliente | Confirmado pelo dono. Teste de regressão (com cliente conclui) + comunicar na validação. |
| Boleto/cheque legados sem recebível | Não corrigir retroativamente; sinalizar como "sem destino". Dívida documentada. |
| Performance do groupBy por turno | `Sale @@index([companyId,branchId,createdAt])` + `SalePayment @@index([saleId,status])` cobrem (confirmado). Janela curta (1 dia). |
| Multi-filial confundir ainda | Entrega C torna a filial explícita + bloqueia "todas as filiais" para conferência. |

---

## 7. Critérios de sucesso

1. Dado o ID de qualquer venda, o dono consegue ver em qual caixa (filial/operador/turno) cada pagamento caiu — ou por que não entrou.
2. O caixa do dia mostra crédito/crediário/saldo/boleto/cheque com **valores reais** (não R$ 0), claramente separados de "na gaveta".
3. Boleto e cheque deixam de sumir: viram conta a receber.
4. O usuário entende, na própria tela, por que cartão de crédito não está na gaveta — sem precisar perguntar.
5. Suíte de testes verde; zero regressão no fechamento de caixa (dinheiro).
