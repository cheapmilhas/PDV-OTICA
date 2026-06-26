# Bloco 4 — Mapa da Comissão do Vendedor (DIAGNÓSTICO, read-only)

**Data:** 2026-06-25 · **Status:** investigação somente leitura, nada alterado · **main:** `10f283e`

> Objetivo: mapear de ponta a ponta o que o vendedor **vê** × o que ele **recebe/grava**, indo até o ledger. A auditoria de verificação (`AUDITORIA-VERIFICACAO-2026-06-25.md` item "NÃO VERIFICADO" #1) admitiu não ter alcançado o writer da comissão no ledger. Este doc fecha esse buraco.

---

## TL;DR — a verdade tem TRÊS lugares (não dois) e o ledger é o quarto, vazio

| Fonte | Onde | Fórmula | Persiste? | Quem usa |
|---|---|---|---|---|
| **1. Tabela `Commission`** (writer real por venda) | `sale-side-effects.service.ts:509` `applyCommissionInTx` | `sale.total × User.defaultCommissionPercent` (fallback **5%**) | ✅ tabela `Commission`, status PENDING→APPROVED→PAID | Relatório **Relatórios→Comissões** (`commissions.service.ts`) — é o que efetivamente vira pagamento |
| **2. Tabela `SellerCommission`** (fechamento de mês) | `goals.service.ts:315` `calculateCommissions` | `totalSales × baseCommissionPercent` **+ bônus** `× goalBonusPercent` se meta batida | ✅ tabela `SellerCommission` (separada!) | Tela **Metas** (`/api/goals/commissions` GET) |
| **3. Ranking/resumo (efêmero)** | `goals/sellers-ranking/route.ts:69` e `goals/monthly-summary/route.ts:69` | `vendas × User.defaultCommissionPercent` (fallback **0%**) | ❌ calculado on-the-fly | Widgets de ranking/resumo na tela de Metas |
| **4. Ledger `FinanceEntry COMMISSION_EXPENSE`** | — | **NUNCA É ESCRITO** | ❌ | DRE/fluxo de caixa **leem zero** comissão |

As três fontes que persistem/exibem **divergem entre si** e **nenhuma** lança comissão no ledger. O DRE (Bloco 3) e o fluxo de caixa **subestimam o custo** porque comissão nunca entra como despesa.

---

## 1. Tabela `Commission` — o writer REAL por venda (o que vira pagamento)

`src/services/sale-side-effects.service.ts:509-542` — chamado em **toda venda COMPLETED** (`sale.service.ts:822` e `quote.service.ts:968`, dentro da `$transaction`):

```ts
const commissionPercent = seller?.defaultCommissionPercent || new Prisma.Decimal(5);  // FALLBACK 5%
const baseAmount = sale.total;                                                         // BRUTO (inclui desconto já aplicado no total, ignora devolução/taxa)
const commissionAmount = new Prisma.Decimal(baseAmount.toString())
  .mul(commissionPercent).div(100);
await tx.commission.create({ data: {
  companyId, saleId, userId, baseAmount, percentage: commissionPercent, commissionAmount,
  status: "PENDING",
  periodMonth: new Date().getMonth() + 1,   // ⚠️ UTC, não BRT
  periodYear: new Date().getFullYear(),
}});
```

- **Base:** `sale.total` (valor final da venda; sem deduzir devolução nem taxa de cartão).
- **Percentual:** `User.defaultCommissionPercent`, fallback **5%**. **Não** usa `CommissionConfig`. **Não** aplica bônus de meta. **Não** consulta `CommissionRule` (comentário explícito em `:505`).
- **Quando:** na finalização da venda (status COMPLETED).
- **Relatório que consome (paga):** `src/services/reports/commissions.service.ts:87` lê `prisma.commission.findMany` com `sale.status: "COMPLETED"` (`:62`), agrega por vendedor e por status PENDING/APPROVED/PAID. Rota `src/app/api/reports/commissions/route.ts:17` — **tem** `requirePermission(REPORTS_FINANCIAL)` (ao contrário do ranking, ver A9).

### Reversão (cancel/refund): `reverseCommissionForSaleInTx` (`:555-597`)
```ts
if (c.status === "PENDING" || c.status === "APPROVED") { ...update status: "CANCELED"... }   // some
else if (c.status === "PAID") { ...cria Commission NEGATIVA no período corrente... }          // compensa
```
- **PENDING/APPROVED** → vira `CANCELED`. **PAID** → cria lançamento negativo no mês atual.
- **Devolução parcial:** a reversão é **integral por venda** (lê `Commission` da venda inteira). Não há ajuste proporcional ao valor devolvido — coerente com o sistema só fazer `refundFull` hoje, mas é um pressuposto a confirmar.

---

## 2. Tabela `SellerCommission` — fechamento de mês (base + bônus de meta)

`src/services/goals.service.ts:315-394` `calculateCommissions` — chamado **só** em `closeMonth` (`:400`), acionado pelo POST `/api/goals/commissions` ("Fechar mês"):

```ts
const config = await this.getCommissionConfig(branchId);   // CommissionConfig por FILIAL (default 5% base / 2% bônus)
const baseCommission  = seller.totalSales * (config.baseCommissionPercent / 100);
const bonusCommission = seller.goalAchieved
  ? seller.totalSales * (config.goalBonusPercent / 100) : 0;
const totalCommission = baseCommission + bonusCommission;
await tx.sellerCommission.create/update({ ...new Decimal(baseCommission)... });
```

- **Base:** `seller.totalSales` (de `getDashboard`, vendas COMPLETED do mês — `goals.service.ts` dashboard `status: { in: ["COMPLETED"] }`).
- **Percentual:** `CommissionConfig.baseCommissionPercent` (por filial) **+ `goalBonusPercent` se `goalAchieved`**.
- **`getCommissionConfig` converte Decimal→`Number`** → a conta `baseCommission` é **float**, depois embrulhada em `new Decimal(float)` (`:357`) → **drift de centavos** (achado M/A novo da verificação, item 5).
- **Tela Metas (GET diário):** `getCommissions` (`goals.service`) lê **`SellerCommission`** — então antes de "Fechar mês" a tela mostra o que foi materializado no último fechamento, não o tempo real.

---

## 3. Ranking / Resumo — exibição efêmera (não persiste)

`src/app/api/goals/sellers-ranking/route.ts:65-79` e `monthly-summary/route.ts:65-69`:
```ts
const commissionRate = Number(user?.defaultCommissionPercent || 0);   // FALLBACK 0% (não 5%!)
const comissao = (vendas * commissionRate) / 100;
```
- **Base:** `sale.total` (COMPLETED). **Percentual:** `User.defaultCommissionPercent`, fallback **0%**. Sem bônus.
- **A9:** estas duas rotas só fazem `auth()` + `requirePlanFeature` — **sem `requirePermission`** (`:9-15`). ATENDENTE/CAIXA veem comissão de todos.
- **A11:** `metaGeralMes = lastMonthTotal*1.1 || 150000` (`:59`) — meta **inventada**, ignora `SalesGoal`/`SellerGoal` cadastrada.

---

## Lado a lado — onde divergem

| Dimensão | `Commission` (paga) | `SellerCommission` (Metas) | ranking/resumo |
|---|---|---|---|
| Base | `sale.total` bruto | `totalSales` bruto | `sale.total` bruto |
| % fonte | `User.defaultCommissionPercent` | `CommissionConfig` (filial) | `User.defaultCommissionPercent` |
| Fallback do % | **5%** | 5% (default do config) | **0%** |
| Bônus de meta | ❌ não | ✅ sim (`goalBonusPercent`) | ❌ não |
| Deduz devolução | só reversão integral por venda | ❌ não | ❌ não |
| Deduz taxa cartão | ❌ não | ❌ não | ❌ não |
| Status venda | COMPLETED | COMPLETED | COMPLETED |
| Persiste | ✅ `Commission` | ✅ `SellerCommission` | ❌ |
| Ledger | ❌ nunca | ❌ nunca | ❌ nunca |

**Divergência-raiz:** percentual de fonte diferente (`User.defaultCommissionPercent` × `CommissionConfig`), bônus de meta só em um, e fallback 5% × 0%.

---

## Reprodução numérica

Vendedor com `defaultCommissionPercent = 3%`; filial com `CommissionConfig` base 5% / bônus 2%; meta do mês **batida**.

**Cenário A — venda R$ 1.000 (sem devolução):**
- `Commission` (paga): `1000 × 3% = ` **R$ 30** (status PENDING).
- `SellerCommission` (Metas, pós-fechamento): `1000 × 5% + 1000 × 2% = ` **R$ 70**.
- Ranking/resumo: `1000 × 3% = ` **R$ 30** (mas se `defaultCommissionPercent` for nulo → **R$ 0**).
- Ledger: **R$ 0**.
- → O vendedor vê **R$ 70** na tela de Metas, o relatório de pagamento gera **R$ 30**, o DRE acha que custou **R$ 0**.

**Cenário B — venda R$ 1.000 depois devolvida (refund):**
- `Commission`: R$ 30 criada, depois revertida (CANCELED se ainda PENDING) → **R$ 0**. ✅
- `SellerCommission`: `totalSales` cai (venda sai do COMPLETED) → recalcula no próximo fechamento → **R$ 0**. ✅ (mas só após "Fechar mês")
- Os dois convergem em zero, por caminhos diferentes e em momentos diferentes.

**Cenário C — vendedor sem `defaultCommissionPercent` cadastrado:**
- `Commission`: fallback **5%** → R$ 50.
- Ranking: fallback **0%** → R$ 0.
- → Mesma venda, mesmo vendedor: paga R$ 50, exibe R$ 0.

---

## Todas as formas de comissão encontradas

1. **% sobre a venda por vendedor** — `User.defaultCommissionPercent`. ✅ em uso (Commission + ranking/resumo).
2. **% base por filial + bônus de meta** — `CommissionConfig.baseCommissionPercent`/`goalBonusPercent`. ✅ em uso (SellerCommission / fechamento).
3. **Comissão por categoria** — `CommissionConfig.categoryCommissions` (JSON) e `Category.defaultCommissionPercent` (`schema.prisma:643`). ⚠️ **gravado/validado, mas NUNCA aplicado** em nenhuma fórmula.
4. **`CommissionRule`** (por usuário/categoria/marca + `minMarginPercent`) — modelo no schema. ⚠️ **código morto** (comentário em `sale-side-effects.service.ts:505` confirma: "não usado em runtime hoje").
5. Por produto / por método de pagamento / fixo+variável — **não existem**.

---

## Proposta (descrição — NÃO implementar)

**Fonte da verdade candidata:** a tabela **`Commission`** (writer por venda, com ciclo PENDING→APPROVED→PAID e reversão no cancel/refund) é a única com lifecycle de pagamento real e granularidade por venda. Parece ser a base correta a unificar. **Mas a decisão da regra é do Matheus** (ver perguntas).

**Plano de unificação (espírito do Bloco 3 — fonte única / helper):**
1. Criar um helper único `computeCommission({ base, percent, bonus? })` (ex.: `src/services/commission/commission-calc.ts`) com **uma** definição de base, percentual, arredondamento (Decimal, 2 casas) e tratamento de meta — e fazer os três pontos (`applyCommissionInTx`, `calculateCommissions`, ranking/resumo) chamarem o mesmo helper.
2. Decidir **uma** fonte de percentual (ver perguntas) e eliminar o fallback divergente (5% × 0%).
3. Materializar a comissão no **ledger** (`FinanceEntry COMMISSION_EXPENSE`) no mesmo momento da venda (espelhando `generateSaleEntries`), para o DRE/fluxo de caixa pararem de subestimar o custo — **se** o Matheus quiser comissão no DRE.
4. Reconciliar/aposentar uma das duas tabelas (`Commission` × `SellerCommission`) ou deixar explícito que uma é "apuração por venda" e a outra "fechamento mensal" derivada da primeira.
5. A9/A11 (permissão no ranking + meta inventada) entram no mesmo conserto, já que tocam as mesmas rotas.

**Não implementar nada disto agora.**

---

## ❓ Perguntas em aberto pro Matheus (decisões de regra de negócio)

1. **Qual percentual manda:** o **por vendedor** (`User.defaultCommissionPercent`) ou o **por filial + bônus de meta** (`CommissionConfig`)? Os dois ao mesmo tempo? Qual é o "certo"?
2. **Bônus de meta** faz parte da comissão real que o vendedor recebe, ou é só projeção da tela de Metas?
3. **Base:** comissão sobre o **bruto** (`sale.total`) ou sobre o **líquido** (descontando desconto concedido / devolução)?
4. **Devolução:** comissão deve **descontar a parte devolvida**? (hoje só há refund integral; e o ajuste é por venda inteira.)
5. **Taxa de cartão / parcelamento:** comissão deve descontar a taxa da maquininha?
6. **Vendas não concluídas** (OPEN/REFUNDED/CANCELED): confirma que **só COMPLETED** conta (é o que os três fazem hoje)?
7. **Fallback** quando o vendedor não tem `%` cadastrado: 5% (como o writer real) ou 0% (como o ranking)?
8. **Comissão entra no DRE/ledger** como despesa? (hoje não entra — o lucro está superavaliado pelo custo de comissão.)
9. **Comissão por categoria / `CommissionRule`** (código morto): você quer ativar, ou podemos remover do schema?

---

## Arquivos inspecionados (somente leitura)
- `docs/AUDITORIA-COMPLETA-2026-06-23.md`, `docs/AUDITORIA-VERIFICACAO-2026-06-25.md`
- `src/services/sale-side-effects.service.ts` (writer + reversão)
- `src/services/goals.service.ts` (config, dashboard, calculateCommissions, getCommissions, closeMonth)
- `src/services/reports/commissions.service.ts` (relatório de pagamento)
- `src/services/finance-report.service.ts`, `src/app/api/finance/aggregate/route.ts` (leituras de COMMISSION_EXPENSE)
- `src/app/api/goals/sellers-ranking/route.ts`, `monthly-summary/route.ts`, `commissions/route.ts`, `reports/commissions/route.ts`
- `src/app/(dashboard)/dashboard/metas/page.tsx`, `relatorios/comissoes/page.tsx` (consumidores)
- `prisma/schema.prisma` (Commission, SellerCommission, CommissionConfig, CommissionRule, User/Category.defaultCommissionPercent, enum FinanceEntryType)
- `src/services/sale.service.ts:822`, `src/services/quote.service.ts:968` (call sites)
