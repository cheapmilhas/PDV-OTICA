# Auditoria Financeiro + Mensagens — Design de Resolução

**Data:** 2026-06-04
**Autor:** Sessão de auditoria (7 agentes críticos + verificação adversarial)
**Status:** Aguardando aprovação do dono

---

## 1. Contexto

O dono relatou que a parte financeira (caixa, contas a receber, contas a pagar,
relatórios, dashboard financeiro) está "confusa" e desconfia de bugs. Também
questionou se as configurações de mensagens (placeholders `{}`) e o botão
"Agradecer pelo WhatsApp" nas vendas funcionam.

Foram despachados 7 agentes auditores read-only (caixa, contas a receber, contas
a pagar, relatórios, dashboard, mensagens, ledger/cashback) e em seguida 4
verificadores adversariais que confirmaram ou refutaram cada achado
Crítico/Alto lendo o código linha a linha.

### Falsos positivos descartados na verificação
- Endpoint `GET /api/accounts-receivable/[id]/penalties` **existe e funciona**.
- `pagination.total` do dashboard usa `count({ where })` — **está correto**.
- Fuso no `endDate` do dashboard financeiro — `endOfLocalDay()` **é aplicado**, OK.

---

## 2. Escopo aprovado (decisões do dono)

- **Mensagens:** corrigir apenas o fluxo "Agradecer" + persistência + carregamento.
  Orçamento/Lembrete/Aniversário ficam **fora deste sprint** (configuráveis mas
  sem envio — tratados depois).
- **DRE/Relatórios:** **unificar no ledger real** (FinanceEntry), aposentando o
  DRE manual com taxa fixa de 3%.

---

## 3. Achados confirmados (espinha dorsal do plano)

### 🔴 Crítico
- **C1 — Pagar conta não debita caixa/conta.**
  `financeiro/page.tsx:320` envia PATCH sem `financeAccountId`; a UI nunca pede a
  conta de saída. `accounts-payable/route.ts:402-441` só decrementa saldo no ramo
  `if (data.financeAccountId)`; o `else` (retrocompat) cria o lançamento mas **não
  baixa saldo**. Resultado: pagamento não reduz o caixa/banco.
- **C2 — "Salvar" das Configurações não persiste mensagens.**
  `configuracoes/page.tsx:154-164` envia só dados da empresa; os campos
  `messageThankYou/Quote/Reminder/Birthday` ficam de fora do PUT.
- **C3 — Placeholders saem literais.**
  `replaceMessageVariables` (`src/lib/default-messages.ts`) reconhece só
  `cliente, valor, otica, data, vendedor, itens, validade, saldo, ganho, dias`.
  A tela oferece/usa `{empresa}`, `{produto}`, `{telefone}`, `{horario}`. O default
  da tela usa `{empresa}` enquanto o backend usa `{otica}`.
- **C4 — Tela de mensagens não carrega o salvo.**
  `configuracoes/page.tsx` inicia textareas com o default e nunca faz fetch das
  mensagens salvas (o `useEffect` só popula dados da empresa).

### 🟠 Alto
- **A1 — Botão "Nova Conta a Receber" morto** (`financeiro/page.tsx:1061` e `:1089`,
  sem `onClick`).
- **A3 — Permissão errada no caixa:** `POST /api/cash/movements:48` usa
  `cash_shift.view` (leitura) para criar sangria/suprimento.
- **A4 — Sangria sem validar saldo:** nem schema nem `cash.service.createMovement`
  checam `amount <= saldo em dinheiro`. Permite caixa negativo.
- **A5 — Pagar conta aceita `paidAmount > amount`** (schema só valida `> 0`).
- **A6 — CARD_FEE debita a conta do adquirente** (`finance-entry.service.ts:440`,
  `financeAccountId: financeAccount?.id`), reduzindo saldo do adquirente além do
  fluxo normal.
- **A7 — Devolução não estorna CARD_FEE:** `generateRefundEntries` reverte
  REFUND/CMV/pagamento mas deixa a taxa de cartão órfã no ledger.
- **A8 — Dois DREs divergentes:** `dre.service.ts` (manual, ignora ledger, 3% fixo,
  usado por `/api/reports/financial/dre`) vs `getDynamicDRE` (lê FinanceEntry,
  usado por `/api/finance/reports/dre`).

### 🟡 Médio (tratar na fase 3)
Race em pagar conta (duplo-clique) · estorno de pagamento com conta antiga não
re-credita · juros/multa recarregados do banco e cobrados de novo · renegociação
ignora multa acumulada e não zera campos da original · inadimplência admin mostra
faturas de assinatura e não o crediário · 3 fontes de "mensagem padrão"
desalinhadas · 2 endpoints concorrentes de settings.

### 🟢 Baixo
`window.location.reload()` na abertura de caixa · toasts de sucesso antes da
resposta · XSS potencial no nome do cliente no carnê · juro mensal com 30 dias fixos.

---

## 4. Plano de resolução

### Fase 1 — Críticos (alto valor, baixo risco)
1. **C1 — Modal "Pagar conta" com conta de saída.**
   - Criar/forçar um modal análogo a `ModalReceberConta` que obriga selecionar a
     conta financeira (`financeAccountId`) ao marcar como paga.
   - `handleMarkAsPaid` passa a enviar `financeAccountId` (e `paidAmount`).
   - Backend: transformar o ramo `else` retrocompat em **erro explícito**
     ("Selecione a conta de saída"), de modo que nenhum pagamento baixe sem conta.
   - Migração: lançamentos antigos sem `financeAccountId` ficam como estão (já
     contabilizados como dívida); documentar.
2. **C2 + C4 — Persistir e carregar mensagens.**
   - `handleSalvarConfiguracoes` inclui `messageThankYou` (e os demais campos já
     existentes no schema do PUT) no body.
   - Adicionar `useEffect` que carrega as mensagens salvas e popula os textareas.
   - Consolidar a fonte de defaults (ver C3) para evitar divergência tela×backend.
3. **C3 — Unificar placeholders.**
   - Em `replaceMessageVariables`, aceitar `{empresa}` como alias de `{otica}` e
     adicionar `telefone`, `produto`, `whatsapp`, `endereco`.
   - `handleThankYouWhatsApp` passa a fornecer esses valores (telefone/whatsapp/
     endereço da empresa; produto a partir dos itens da venda).
   - Sincronizar `MENSAGENS_PADRAO` (tela) com `DEFAULT_MESSAGES` (backend) — fonte
     única.
   - **Teste obrigatório:** snapshot garantindo que nenhum `{placeholder}` conhecido
     sobra literal após substituição no template default.

### Fase 2 — Altos de dinheiro
- **A6/A7/A8:** CARD_FEE com `financeAccountId: null`; estorno reverte CARD_FEE;
  migrar todas as rotas de relatório/DRE para o ledger (`getDynamicDRE` /
  `finance-report.service`) e remover/redirecionar `dre.service.ts` (3% fixo).
- **A4/A5:** validação de boundary (sangria ≤ saldo; `paidAmount ≤ amount`) no
  schema **e** no service.
- **A3:** trocar a permissão do POST de movimentos para uma de criação
  (`cash_shift.open`/`cash_shift.modify` conforme enum de `permissions.ts`).

### Fase 3 — UX + médios
- **A1:** ligar os botões "Nova Conta a Receber" (modal/rota existente) ou removê-los.
- Médios: lock/idempotência no pagar conta; estorno re-credita conta correta;
  recálculo de juros/multa sem dupla cobrança; renegociação considerando penalidades;
  inadimplência admin lendo crediário.

### Fase 4 — Baixos / dívida técnica
- `router.refresh()` na abertura de caixa; toasts após confirmação; escape do nome
  no carnê; consolidar settings em um endpoint único.

---

## 5. Regras de execução
- **Testar ao fim de CADA fase** (tsc + build + review + checagem de bug), conforme
  preferência de workflow do dono.
- Cada fase entra como commit(s) próprio(s); só seguir para a próxima com a anterior
  verde.
- Multi-tenant: toda query nova/alterada mantém `companyId`.
- Nada deployado sem aprovação explícita do dono (deploy é manual via CLI).

## 6. Fora de escopo (registrado, não esquecido)
- Envio de WhatsApp para Orçamento/Lembrete/Aniversário.
- Reescrita do schema de `AccountPayable` para denormalizar `financeAccountId`.
- Timezone do cálculo de penalidades (juro de 30 dias fixos).
