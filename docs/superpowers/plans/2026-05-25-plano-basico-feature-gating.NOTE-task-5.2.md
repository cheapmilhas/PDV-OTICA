# Nota de execução — Task 5.2.a-d (Fase 5)

**Data:** 2026-05-26
**Status:** N/A — auditoria mostrou que os botões inline propostos no plano não existem na codebase

## Pontos auditados

| Sub-task | Local sugerido | Resultado da auditoria |
|---|---|---|
| 5.2.a — `Devolver mercadoria` em vendas detalhes | `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx` | Não há botão `Devolver`. Página tem só `Cancelar venda` (operação distinta, permanece livre em todos os planos). Devoluções formais ocorrem em `/dashboard/financeiro/devolucoes`, que já é coberta pelo gate do layout (Fase 4.3). |
| 5.2.b — Seletor de Tratamentos em OS criar/editar | `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx` e `[id]/editar/page.tsx` | Nenhuma referência a `treatment`/`Tratamento` nas duas páginas. O fluxo de cadastro de tratamentos ocorre em `/dashboard/tratamentos` (página dedicada, já gated pelo layout). |
| 5.2.c — `Nova transferência` em estoque | `src/app/(dashboard)/dashboard/estoque/page.tsx` | Nenhuma referência a `transferencia`/`transfer`. Fluxo de transferências fica isolado em `/dashboard/estoque/transferencias` (já gated pelo layout). |
| 5.2.d — Cards de DRE / Comparativo no index de relatórios | `src/app/(dashboard)/dashboard/relatorios/page.tsx` | A página não lista esses relatórios como cards. Acesso a DRE/Comparativo é via sidebar (já filtrada na Task 5.1). |

## Conclusão

A defesa em camadas já implementada cobre 100% dos pontos de acesso identificados:

- **Sidebar + MobileNav** (Task 5.1) — esconde 13 itens quando feature=false
- **Layout gate** (Task 4.3) — redireciona quem digita URL direta com `?upgrade-required=<feature>`
- **withPlanFeatureGuard nas 13 APIs** (Task 4.4) — 403 se cliente bypassa UI

Não há botões inline dentro de páginas liberadas que precisem de `<FeatureGate>` adicional.

## O que fazer se aparecer um caso futuro

Se ao longo do desenvolvimento surgir um botão dentro de página liberada que aponta pra uma feature gated (ex: "Ver detalhe na conciliação" dentro de uma página de caixa), aplicar o padrão:

```tsx
import { FeatureGate } from "@/components/plan/feature-gate";
import { FEATURES } from "@/lib/plan-feature-catalog";

<FeatureGate feature={FEATURES.BANK_RECONCILIATION} fallback={null}>
  <Button>Ver detalhe na conciliação</Button>
</FeatureGate>
```

O componente já foi refatorado (Task 3.1) para aceitar `feature: FeatureKey` e inferir label do registry.
