# Campanha — Mapa do motor pré-existente (DIAGNÓSTICO, read-only)

**Data:** 2026-06-25 · **Status:** somente leitura, nada alterado · **base:** `10f283e`

> Mapeia o motor de campanha que já existia antes da Comissão Fase 1, para decidir
> se reusar/estender/substituir. Decisão é do Matheus. Toda afirmação tem prova
> (arquivo:linha).

---

## TL;DR

- **É feature de PROMOÇÃO de produto (bonificação por venda), não comissão.** Veio do "Sprint 10", autor Matheus, **2026-02-19** (~4 meses antes desta fase). Está **VIVA e em produção**: tela `/dashboard/campanhas` (plan-gated `campaigns`), 7 rotas, e `processaSaleForCampaigns` roda **em toda venda finalizada**.
- **Independente** dos cálculos do Bloco 4 (`Commission`/`SellerCommission`/rankings) — zero referências cruzadas. O motor da Fase 1 consome **só** `CampaignBonusEntry.totalBonus`.
- **Cobre R$ por unidade desde a 1ª** (`PER_UNIT`). **NÃO existe tipo "% do valor"** — é o gap em relação à regra do Matheus.

---

## 1. O que é / de onde veio

- `prisma/schema.prisma` — `model ProductCampaign` entrou em **`6f77e26`** ("feat: schema de campanhas de produto com bonificação (idempotente)").
- `src/services/product-campaign.service.ts` — criado em **`adb1f65`** ("feat: Implementar serviço completo de campanhas de produto"), autor **Matheus Reboucas**, **2026-02-19 15:16**. Commits seguintes: "Sprint 10 parte 2/3/4" (cálculo TIERED, limites, filterEligibleItems), "seleção de produtos".
- **Confirmado ancestral** de `10f283e` → já existia antes desta fase. **Não foi criado agora.**
- **Natureza:** promoção/marketing ("bonificação por vender produto X no período"), com tela própria. NÃO é tentativa anterior de comissão de vendedor.

## 2. Está vivo? — SIM

- Serviço: `src/services/product-campaign.service.ts` (1190 linhas).
- **Chamado na venda:** `src/services/sale-side-effects.service.ts:719` `await processaSaleForCampaigns(saleId, companyId);` (em try/catch — falha não quebra venda).
- **Reversão na devolução/cancelamento:** `src/services/sale.service.ts:1138` `reverseBonusForSale`; reativação `:1390` `reactivateBonusForSale`.
- **Rotas (7):** `src/app/api/product-campaigns/route.ts` + `[id]/{activate,pause,reconcile,simulate,report,route}.ts`.
- **Tela:** `src/app/(dashboard)/dashboard/campanhas/page.tsx` (gated `FeatureGate feature="campaigns"` :408), com `campaign-form.tsx` e `campaign-report.tsx`.
- `CampaignSellerProgress`/`ProductCampaignItem`: usados dentro do serviço (progresso por vendedor / produtos da campanha).

## 3. Como funciona ponta a ponta

- **Criação:** `createCampaign` (DTO em :9-41): nome, período, `bonusType`, `countMode`, campos por tipo, e `items[]` (produto/categoria/marca/fornecedor).
- **`processaSaleForCampaigns(saleId)`** (:705): busca campanhas `ACTIVE` com `startDate ≤ now ≤ endDate` e branch compatível (:737); para cada uma, `filterEligibleItems` (:763), conta conforme `countMode`, chama `calculateBonus`, checa limites (`checkBonusLimits`), respeita stacking, e faz **upsert idempotente** em `CampaignBonusEntry` (`@@unique([campaignId,saleId,saleItemId])`, :836) com `totalBonus = finalBonus / nº itens` (:852), status `PENDING`. Atualiza `CampaignSellerProgress`.
- **`filterEligibleItems`** (:~610): minSaleAmount, excludeDiscounted, onlyFullPrice, e match por productId/categoryId/brandId/supplierId. **Sem produtos configurados → nenhum item elegível.**
- **`CampaignSellerProgress`:** acumulado por (campanha, vendedor) — `totalQuantity`, `totalBonus`, elegibilidade. Mantido por `updateProgressIncremental` (:976) e `reconcileCampaignProgress`.
- **Reversão:** `reverseBonusForSale` (:887) marca entries da venda como `REVERSED` + decrementa progresso; `reactivateBonusForSale` (:943) volta a `PENDING` + re-incrementa (idempotente, dentro de tx).

## 4. Tipos de bônus — `enum CampaignBonusType`

```
PER_UNIT          // R$ por unidade (desde a 1ª): qty × bonusPerUnit
MINIMUM_FIXED     // atinge mínimo de unidades → R$ fixo (bonusFixedOnMin)
MINIMUM_PER_UNIT  // R$ por unidade ACIMA (ou a partir) de um mínimo
PER_PACKAGE       // floor(qty / packageUnits) × bonusPerPackage
TIERED            // R$ por faixa de quantidade (tiers JSON {from,to,bonus})
```

Exemplos (calculateBonus :389):
- **PER_UNIT** bonusPerUnit=5, qty=3 → 15.
- **MINIMUM_FIXED** min=10, fixo=50: qty=12 → 50; qty=8 → 0.
- **MINIMUM_PER_UNIT** min=10, R$2/un, AFTER: qty=15 → 5×2=10.
- **PER_PACKAGE** package=6, R$20: qty=13 → 2×20=40.
- **TIERED** faixas {1-9:5},{10-∞:8}: qty=12 → cai na 2ª faixa.

**❌ NÃO existe "% do valor".** Todos são quantidade × R$ fixo. Nenhum aplica percentual sobre o valor vendido. UI confirma (campaign-form.tsx:41 enum só com os 5 tipos).

## 5. Relação com o Bloco 4

- `applyCommissionInTx` (Commission), `goals.service`/rankings **não referenciam campanha** (grep vazio). São trilhas **independentes**.
- O motor da Fase 1 lê **só** `campaignBonusEntry` (`getSellerCampaignBonus`, commission-engine.ts:242) — soma `totalBonus` (≠ REVERSED, venda COMPLETED no mês). Não toca `ProductCampaign`/progress/`calculateBonus`.

## 6. Encaixe com a regra do Matheus

Regra: **campanha = % do valor OU R$ por unidade, desde a 1ª, sem mínimo.**
- ✅ **R$ por unidade desde a 1ª** = `PER_UNIT`.
- ❌ **% do valor** = não existe. **Falta.**
- `MINIMUM_FIXED`/`MINIMUM_PER_UNIT`/`PER_PACKAGE`/`TIERED` são extras opcionais — não exigidos pela regra; dá para simplesmente não oferecê-los (ou esconder na UI).
- **Para cobrir o "% do valor"** (alto nível, sem implementar): novo `bonusType` (ex. `PERCENT_OF_VALUE`) + 1 ramo em `calculateBonus` que use o **valor vendido** dos itens elegíveis (lineTotal), não a quantidade. Hoje `calculateBonus` recebe só `quantity` — então também é preciso passar/disponibilizar o valor monetário dos itens elegíveis a esse ramo. Mexe em: enum (migração aditiva), `calculateBonus`, `processaSaleForCampaigns` (passar valor), DTO + UI do form. Reversão/progresso/idempotência seguem iguais.

## 7. Proposta (não implementar)

- **Reaproveitar e estender é seguro** em princípio: o motor é coeso, idempotente, com reversão testada, e **isolado** das outras trilhas de comissão. Adicionar `PERCENT_OF_VALUE` é aditivo.
- **Riscos:** (a) a feature está **em uso por óticas reais?** Se sim, mudar a UI/semântica pode confundir quem já usa promoções; (b) `calculateBonus` hoje é quantidade-only — o ramo PERCENT precisa do valor monetário, então exige tocar `processaSaleForCampaigns` (caminho crítico da venda, em try/catch); (c) a Fase 1 só soma `totalBonus`, então qualquer bug no novo ramo entra direto na comissão paga.
- **Alternativas:** (1) estender o motor existente [recomendado se a feature é desejada]; (2) deixar campanha como promoção e a comissão calcular o % do valor por conta própria (duplica lógica, volta a divergir — não recomendado); (3) aposentar a campanha de promoção e refazer só para comissão (desperdício, perde feature em uso).

### Perguntas pro Matheus
1. **Você reconhece essa feature de campanha de produto (`/dashboard/campanhas`)? Está em uso por óticas reais hoje?** (só o banco/uso real diz; o código não.)
2. Campanha de comissão e campanha de promoção são **a mesma coisa** ou conceitos separados que por acaso compartilham tabela?
3. Confirmar: quer só `PERCENT_OF_VALUE` + `PER_UNIT`, escondendo os outros 3 tipos? Ou mantê-los disponíveis?

---

## Arquivos inspecionados (read-only)
- `prisma/schema.prisma` (ProductCampaign, ProductCampaignItem, CampaignBonusEntry, CampaignSellerProgress, enum CampaignBonusType)
- `src/services/product-campaign.service.ts` (createCampaign, processaSaleForCampaigns, calculateBonus, calculateTieredBonus, filterEligibleItems, checkBonusLimits, reverseBonusForSale, reactivateBonusForSale, updateProgressIncremental)
- `src/services/sale-side-effects.service.ts:719`, `src/services/sale.service.ts:1138/1390`
- `src/app/api/product-campaigns/**`, `src/app/(dashboard)/dashboard/campanhas/page.tsx` + `campaign-form.tsx`
- `src/services/commission/commission-engine.ts` (getSellerCampaignBonus)
- git: `6f77e26`, `adb1f65`, "Sprint 10"
