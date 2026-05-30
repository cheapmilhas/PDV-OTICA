# Auditoria Dogfood — Bugs encontrados (2026-05-30)

**Método:** 13 agentes caçadores em paralelo, análise estática profunda de todo o sistema em produção.
**Total:** ~40 bugs reais. Abaixo agrupados por severidade e tema. Cada um com arquivo:linha e impacto.

---

## 🔴 CRÍTICOS — Prejuízo financeiro / fraude / perda de dados

### Grupo A — REFUND (devolução) está gravemente incompleto
O `refund` (`src/app/api/sales/[id]/refund/route.ts`) foi escrito como "repor estoque + 1 FinanceEntry best-effort", enquanto o `cancel` é completo. **Toda venda paga devolvida via refund gera prejuízo:**
- **A1.** Refund duplicado: sem guard de quantidade já devolvida (não soma RefundItem anteriores). Devolve 100% hoje, 100% amanhã → reembolso 2x, estoque fantasma. `refund/route.ts:59-99`.
- **A2.** FIFO/InventoryLot não revertido (só BranchStock/cache). Lotes dessincronizam permanentemente. `refund/route.ts:130-160` + `stock.service.ts:118-172`.
- **A3.** Cartão/crediário não tratados: CardReceivable continua ativo (ótica recebe da adquirente por venda devolvida) e AccountReceivable continua cobrável (cobra carnê de produto devolvido).
- **A4.** Sem CashMovement OUT (caixa fecha sobrando dinheiro já devolvido) + reversão financeira lança em conta errada (sempre "Contas a Receber" mesmo p/ venda à vista).
- **A5.** Cashback não estornado (ganho mantido, usado perdido).
- **A6.** Comissão e bônus de campanha não revertidos.
- **A7.** Falha financeira engolida silenciosamente mas restock já commitado → devolução invisível no DRE.
- **Solução geral:** refund deve REUSAR a lógica do cancel + agregar RefundItem.qtyReturned por item.

### Grupo B — CANCELAR/REATIVAR venda
- **B1.** Reativar venda não restaura AccountReceivable, CardReceivable, FinanceEntry nem saldo financeiro (cancel deletou fisicamente). Ótica perde cobrança das parcelas. `sale.service.ts:902-1032`.
- **B2.** Cancelar venda NÃO devolve cashback USADO pelo cliente (só estorna o ganho). Cliente perde saldo. `sale.service.ts:825-855`.
- **B3.** Estorno de cashback ganho fora de transação + sem idempotência → saldo negativo / duplo estorno em cancel→reativar→cancel. `sale.service.ts:826-855`.
- **B4.** Reativar gera cashback/bônus de campanha duplicado (totalBonus inflado no progresso do vendedor). `sale.service.ts:1023-1029`.
- **B5.** OS auto-criada (Sprint 2) fica órfã ao cancelar a venda — vai pro laboratório mesmo. Produz óculos de venda cancelada. `sale.service.ts cancel não toca serviceOrderId`.

### Grupo C — CAIXA / CONTAS A RECEBER (ghost cash)
- **C1.** Recebimento de AR pode ser feito 2x (ramo PATCH "marcar recebida" sem guard de status RECEIVED). Dois cliques = dinheiro fantasma no caixa. `accounts-receivable/route.ts:472-595`.
- **C2.** `reverse-payment` deixa CashMovement e FinanceEntry órfãos (estorna AR mas não tira do caixa nem do DRE). Dois caminhos de estorno divergentes. `accounts-receivable/[id]/reverse-payment/route.ts:56-67`.
- **C3.** Recebimento parcial não baixa o saldo (amount não reduz) → pode pagar o valor cheio várias vezes. `receive-multiple/route.ts:99-137`.

### Grupo D — PREÇO / VENDA (fraude de preço)
- **D1.** Backend NÃO valida `unitPrice` — confia 100% no cliente. POST /api/sales com unitPrice 0,01 num produto de R$2000 passa. Fraude indetectável. `sale.schema.ts:23-25` + `sale.service.ts:240-243`.
- **D2.** Desconto sem teto e sem aprovação no servidor. VENDEDOR aplica 99% de desconto via API (modal de aprovação é só frontend). `sales/route.ts:106` + `sale.service.ts:246`.

### Grupo E — SEGURANÇA / MULTI-TENANT
- **E1.** Escalação de privilégio: `users.edit` (que GERENTE tem) permite `PUT /api/users/{self}` com role:ADMIN → vira ADMIN. Idem create. `users/[id]/route.ts:40-64` + `user.schema.ts:29`.
- **E2.** Multi-tenant write leak: `POST /api/crm/contacts` muta lembrete de OUTRA empresa (update sem companyId). `crm.service.ts:343-389`.
- **E3.** Export de clientes sem permissão e sem log LGPD: qualquer usuário autenticado baixa XLSX com CPF/RG/telefone/endereço de toda a base. `customers/export/route.ts:12-21`.

### Grupo F — SUBSCRIPTION / BILLING (operar sem pagar)
- **F1.** Inadimplente (PAST_DUE/SUSPENDED) continua criando vendas — `readOnly` é só badge visual, não enforçado no backend. Nenhuma rota API checa checkSubscription. `sales/route.ts` + `layout.tsx:31`.
- **F2.** Trial expirado / suspenso bloqueado só na renderização do layout — APIs continuam abertas.
- **F3.** Features pagas continuam liberadas após CANCELED/SUSPENDED (getSubscriptionInfo não filtra status). `subscription.ts:227-255`.
- **F4.** `hasSubscription === false` libera TUDO (fail-open) — empresa sem subscription tem Enterprise grátis via API.

### Grupo G — OVERRIDE DE ESTOQUE QUEBRADO (feature que criamos)
- **G1.** Override de gerente de estoque insuficiente: pula a pré-validação mas `atomicStockDebit` (updateMany WHERE quantity>=qty) falha e aborta a venda. O recurso NÃO funciona no fluxo real (BranchStock). `stock.service.ts:41-62` + `sale.service.ts:320-333`. Precisa de parâmetro `allowNegative`.

---

## 🟠 HIGH — Inconsistência grave / segurança

- **H1.** OS aceita qualquer transição de status (DRAFT→DELIVERED direto, sem deliveredByUserId). `service-order.service.ts:516-568`.
- **H2.** Limite de crédito validado por pagamento isolado — burlável com 2 métodos a prazo (STORE_CREDIT + BALANCE_DUE). `sale.service.ts:344-382`.
- **H3.** Entrada de lote não atualiza BranchStock → estoque fantasma que não vende. `inventory/lots/route.ts:76-99`.
- **H4.** PromoPrice por filial NUNCA aplicado no PDV (front ignora branchPromoPrice). Produto em promoção vendido pelo preço cheio. `pdv/page.tsx:319-322`.
- **H5.** Conversão OS→Venda não revalida no servidor (sale.create grava serviceOrderId sem checar companyId/status/garantia). `sale.service.ts:484`.
- **H6.** Webhook Asaas: HMAC opcional → pagamento/assinatura forjável se token vazar. `webhooks/asaas/route.ts`. **Tornar HMAC obrigatório antes de ativar Focus NFe.**
- **H7.** Cron `dunning` fail-open (sem CRON_SECRET = aberto) — qualquer um cancela/suspende assinaturas. `cron/dunning/route.ts:22-26`.
- **H8.** Webhook Focus NFe sem idempotência + HMAC opcional → falsificar status fiscal. `webhooks/focus-nfe/route.ts`.
- **H9.** Refund de cartão/crediário (duplicado no Grupo A, mas crítico).
- **H10.** sellerUserId aceito do request sem validar empresa (forja de comissão). `sale.service.ts:206-207`.
- **H11.** Frontend: venda duplicada via duplo-submit no caminho de override (finally libera finalizingVenda enquanto modal de gerente abre). `pdv/page.tsx:744-759`.
- **H12.** Frontend: ModalFinalizarVenda não reseta `payments` ao fechar sem confirmar → pagamentos vazam para a próxima venda. `modal-finalizar-venda.tsx:245-273`.
- **H13.** Métricas: BI por marca/categoria multiplica custo errado (SUM(costPrice)*SUM(qty)) → margem negativa falsa. `finance/bi/route.ts:55,85`.
- **H14.** Relatório payment-methods conta pagamentos não recebidos (PENDING/VOIDED/REFUNDED). `reports/payment-methods/route.ts:20-32`.
- **H15.** Renegociação de AR não gera lançamento contábil (DRE não bate). `accounts-receivable/[id]/renegotiate/route.ts`.
- **H16.** REFUNDED polui métricas de CRM (generateReminders filtra só CANCELED, não REFUNDED). VIP/totalSpent errado. `crm.service.ts:20,40`.
- **H17.** Import de clientes sobrescreve cliente errado ao casar por nome. `customers/import/route.ts:142-188`.

---

## 🟡 MEDIUM — Robustez / consistência

- **M1.** Auto-abertura de caixa não trata P2002 (race) → venda falha com 500 sob concorrência. `sale.service.ts:385-461`.
- **M2.** Timezone errado em vários relatórios (usam date-fns puro = UTC, não America/Sao_Paulo). Vendas 21h-23h59 caem no dia errado. `reports.service.ts:33-54` + várias rotas reports/*.
- **M3.** Relatórios ignoram seletor de filial (branchId). Multi-loja vê números errados.
- **M4.** Auto-match de conciliação reserva pagamento em sugestão fraca (50%) bloqueando match forte. `reconciliation-match.service.ts:127-147`.
- **M5.** Cashback expirado ainda usável se cron atrasar; processExpiredCashbacks sem guard → saldo negativo. `cashback.service.ts:375-445`.
- **M6.** Bônus de campanha pode estourar teto (check-then-act sem lock). `product-campaign.service.ts:521-625`.
- **M7.** Email de cliente duplicado permitido (sem unique no banco, só app-level com race). `schema.prisma:437`.
- **M8.** N+1 em generateReminders (milhares de queries seriais com 6937 lembretes → timeout). `crm.service.ts:188-207`.
- **M9.** Ajuste manual de cashback aceita negativo sem piso 0. `cashback.service.ts:343`.
- **M10.** XSS armazenado no relatório de estoque impresso (product.name não escapado). `products/print/route.ts:124-159`.
- **M11.** Arrays de venda/OS/orçamento sem .max() (DoS com 50k items). `sale.schema.ts:113-114`.
- **M12.** Role/permissão obsoletos no JWT por até 30 dias (rebaixar/demitir não é efetivo). `auth.ts:22-25`.
- **M13.** Rate limit in-memory inócuo em serverless (reseta por instância). `rate-limit.ts`.
- **M14.** Checkout: race permite duas subscriptions no Asaas (cobrança duplicada). `billing/checkout/route.ts:70-90`.
- **M15.** Refund/getById de produto não inclui branchStocks → preço por filial invisível na edição.
- **M16.** Frontend: convert OS chamado 2x (detalhes + PDV useEffect). Validar idempotência.
- **M17.** Frontend: sem aviso ao sair de formulário preenchido (carrinho/OS/orçamento perdidos).
- **M18.** Frontend: race de busca (resposta fora de ordem sobrescreve lista, sem AbortController).

---

## ✅ Verificado e CORRETO (não-bugs)
Race de estoque entre caixas (atomicStockDebit), índice único de caixa, arredondamento de parcelas, idempotência FIFO/finance entry, createFromSale/warrantySeq (Sprint 2/4), override de gerente NÃO forjável, SQL injection (nenhum), mass assignment (nenhum), error-handler não vaza stack em prod, JSON.parse protegido, fixes Q7.1 (cashDate cartão, double-count), multi-tenant na maioria das rotas, DRE exclui CANCELED.

---

## Ordem de ataque sugerida (por prejuízo)
1. **Refund (Grupo A)** — sangra dinheiro em toda devolução de venda paga. Maior dor.
2. **Caixa/AR ghost cash (C1, C2, C3)** — recebimento duplicado, estorno órfão.
3. **Fraude de preço (D1, D2)** — vendedor cobra qualquer preço via API.
4. **Cancelar/reativar (B1-B5)** — perde cobrança, cashback, OS órfã.
5. **Segurança (E1, E2, E3)** — escalação ADMIN, leak cross-tenant, LGPD.
6. **Billing (F1-F4)** — operar sem pagar.
7. **Override estoque (G1)** — feature quebrada.
8. HIGH e MEDIUM conforme prioridade.
