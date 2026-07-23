import { computeMRR, type SubscriptionForMRR } from "@/lib/admin-metrics";
import type { PlatformProduct } from "@/lib/admin-product-context";

/**
 * Números consolidados de UM produto para o dashboard "Grupo".
 * Valores monetários em CENTAVOS (inteiros) — a formatação para reais fica na UI.
 */
export interface ProductSnapshot {
  product: PlatformProduct;
  companies: number;
  activeSubs: number;
  trialSubs: number;
  /** MRR em centavos (soma do valor mensal efetivo das assinaturas ACTIVE). */
  mrrCentavos: number;
}

/**
 * Monta o snapshot de um produto a partir das contagens já consultadas e das
 * assinaturas ativas (filtradas por produto no caller). `computeMRR` é puro —
 * recebe só as subs ACTIVE do produto.
 */
export function buildProductSnapshot(args: {
  product: PlatformProduct;
  companies: number;
  activeSubs: number;
  trialSubs: number;
  activeSubsForMrr: SubscriptionForMRR[];
  now: Date;
}): ProductSnapshot {
  return {
    product: args.product,
    companies: args.companies,
    activeSubs: args.activeSubs,
    trialSubs: args.trialSubs,
    mrrCentavos: computeMRR(args.activeSubsForMrr, args.now),
  };
}

export interface GroupTotals {
  companies: number;
  activeSubs: number;
  trialSubs: number;
  mrrCentavos: number;
}

/**
 * Totais do Grupo = soma dos snapshots por produto. Invariante testável:
 * total.X === Σ snapshot.X. Não deduplica nada — cada Company pertence a
 * exatamente um produto (platformProduct é um enum único por linha).
 */
export function consolidateTotals(snapshots: ProductSnapshot[]): GroupTotals {
  return snapshots.reduce<GroupTotals>(
    (acc, s) => ({
      companies: acc.companies + s.companies,
      activeSubs: acc.activeSubs + s.activeSubs,
      trialSubs: acc.trialSubs + s.trialSubs,
      mrrCentavos: acc.mrrCentavos + s.mrrCentavos,
    }),
    { companies: 0, activeSubs: 0, trialSubs: 0, mrrCentavos: 0 },
  );
}
