# Comissão Bloco 4 — despesa de comissão no ledger (DRE lê R$0)

**2026-06-29.** Branch `feat/comissao-ledger-bloco4`. Conserta: a comissão é calculada
mas NUNCA vira `FinanceEntry COMMISSION_EXPENSE` no ledger → o DRE soma R$0 → lucro inflado.

## Decisões do dono
- **Regime de CAIXA**: a despesa entra no ledger quando a comissão é **paga**.
- **Modo novo (Atacadão)**: criar fluxo de pagamento (hoje a comissão é só calculada read-only, 403 nas rotas).
- **Materializar ao pagar**: o valor só é gravado no instante do pagamento (snapshot).
- **Granularidade: por vendedor/mês** (1 pagamento = comissão total de 1 vendedor naquele mês).
- Contas: DÉBITO `5.1.02` "Comissões de Vendedores" / CRÉDITO `1.1.01` "Caixa".

## Estado do código (verificado)
- `commission-flag.ts`: kill-switch por companyId. Atacadão = "new"; resto = "legacy".
- Modo **legacy**: grava `Commission` por venda (`applyCommissionInTx`); paga via `markCommissionAsPaid` (SellerCommission) na rota `PUT /api/goals/commissions/[id]`.
- Modo **new**: `computeSellerCommission` calcula sob demanda (vendas líq + tiers + campanha), NÃO grava; `closeMonth` e o PUT retornam **403** (sem lifecycle de propósito).
- `SellerCommission` (tabela): `userId+branchId+year+month` @unique, `totalCommission`, `status`, `paidAt`. Serve de snapshot materializado.
- `FinanceEntry`: `@@unique([companyId, sourceType, sourceId, type, side])` → upsert idempotente. Enum `COMMISSION_EXPENSE` já existe. DRE lê em `finance-report.service.ts:68,276`.

## Implementação

### ✅ FEITO — camada LEGACY (resolve óticas em modo legacy)
- `generateCommissionPaymentEntry(tx, {companyId, branchId, commissionId, amount, paidAt, sellerName})` em `finance-entry.service.ts`: upsert COMMISSION_EXPENSE/DEBIT (5.1.02→1.1.01), idempotente por `sourceType="SellerCommission"`+`sourceId`, não lança se amount<=0. 4 testes.
- `markCommissionAsPaid` (legacy): update PAID commita 1º; depois lança no ledger em tx própria + try/catch (falha não reverte o PAID).

### ⏳ A FAZER — camada NOVO (resolve a Atacadão)
1. **Service `paySellerCommissionNew(companyId, branchId, userId, year, month, paidByUserId)`** em goals/commission:
   - Calcula com `computeSellerCommission` (snapshot do valor devido AGORA).
   - Materializa: `upsert` em `SellerCommission` (chave userId+branchId+year+month) com `status=PAID`, `paidAt`, `totalCommission`=snapshot. Idempotente: se já PAID, não re-paga (evita lançar 2×).
   - Lança no ledger reusando `generateCommissionPaymentEntry` (mesmo helper) com `sourceId`=SellerCommission.id.
   - Multi-tenant: branch.companyId; valida que o branch é da empresa.
2. **Rota**: nova ação de pagar no modo new. Em vez do 403 cego, expor `POST /api/goals/commissions/pay` (ou similar) que SÓ funciona em modo new (espelha o guard invertido) + `requirePermission("goals.manage")` + plan-feature goals.
3. **UI** (`commission-new-view.tsx`): botão "Marcar como paga" por linha de vendedor (só com permissão). Mostra estado pago/pendente lendo o SellerCommission materializado.

## Salvaguardas
- Idempotência dupla: SellerCommission @unique + FinanceEntry @unique. Pagar 2× não duplica despesa nem registro.
- try/catch no ledger não quebra o pagamento (padrão do projeto).
- Devolução/estorno DEPOIS do pagamento: fora do escopo desta fatia (regime de caixa = o que foi pago, foi pago). Documentar como dívida.
- Não toca o legacy nem o DRE (que já lê certo).

## TDD
- Helper: ✅ 4 testes. paySellerCommissionNew: materializa+paga+lança; idempotente (2ª chamada não duplica); cross-tenant (branch de outra empresa rejeita); amount 0 não lança. Rota: 403 em legacy, OK em new, permissão.
