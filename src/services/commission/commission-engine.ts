import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";

/**
 * MOTOR DE COMISSÃO — Fase 1 (fundação).
 *
 * Regra (decidida pelo Matheus, ver tasks/prd-comissao-vendedor.md):
 *
 *   Comissão do mês = Comissão de meta + Bônus de campanha
 *
 * COMISSÃO DE META (por níveis individuais — mini/meta/mega):
 *   - Cada vendedor tem 3 níveis, cada um com valor-alvo (R$) e percentual.
 *   - Atinge um nível quando o TOTAL VENDIDO LÍQUIDO no mês ≥ valor-alvo dele.
 *   - Vale o % do MAIOR nível atingido, aplicado RETROATIVAMENTE sobre TUDO que
 *     vendeu no mês. Não bateu nem a mini → 0% (mas a campanha ainda conta).
 *   - Fonte dos níveis: tabela SellerCommissionTier (override do vendedor tem
 *     precedência sobre o default da ótica). Sem níveis configurados → 0.
 *
 * BÔNUS DE CAMPANHA (por cima da meta):
 *   - REUSA o motor de campanha já existente em produção (ProductCampaign +
 *     CampaignBonusEntry). Esta Fase NÃO recalcula campanha: apenas SOMA os
 *     CampaignBonusEntry já gravados por venda para o vendedor no mês
 *     (excluindo os REVERSED). Várias campanhas → os bônus se somam.
 *
 * "VALOR VENDIDO LÍQUIDO" (vale p/ meta — campanha já vem pronta do motor dela):
 *   - Valor que o cliente pagou (com desconto): Sale.total (o desconto já está
 *     abatido no total; espelha o ledger, onde SALE_REVENUE = Sale.total).
 *   - Descontando devoluções: subtrai os Refund.totalRefund (COMPLETED) das
 *     vendas que continuam COMPLETED (devolução PARCIAL). A devolução TOTAL
 *     hoje vira Sale.status=REFUNDED e já sai do filtro COMPLETED sozinha — por
 *     isso só subtraímos refunds de vendas ainda COMPLETED, sem dupla contagem.
 *     Mesmo critério do DRE dinâmico / realized-revenue (Bloco 3): só COMPLETED.
 *   - SEM descontar taxa de maquininha.
 *   - Período = mês calendário em America/Sao_Paulo (date-utils), bucketando a
 *     venda pela data dela (Sale.createdAt), como o dashboard de Metas já faz —
 *     parcelado/crediário conta no mês da venda, não conforme o cliente paga.
 *
 * Função PURA de cálculo: calcula e RETORNA. NÃO grava em Commission/
 * SellerCommission/ledger, NÃO é chamada por nenhuma tela/rota nesta fase.
 * Ligar às telas e materializar é a Fase 2.
 *
 * decimal.js em TODO o dinheiro (o cálculo legado da tela de Metas usa float e
 * tem drift de centavos — não repetir).
 */

/** Casas decimais e arredondamento padrão para dinheiro (R$). */
const MONEY_DP = 2;
const MONEY_ROUNDING = Decimal.ROUND_HALF_UP;

function money(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(MONEY_DP, MONEY_ROUNDING);
}

/** Um nível de meta (mini/meta/mega) já resolvido para o vendedor. */
export interface CommissionTierInput {
  /** Valor-alvo em R$ a ser atingido pelo total vendido líquido do mês. */
  targetAmount: Decimal.Value;
  /** % aplicado retroativamente sobre tudo quando este é o maior nível batido. */
  percent: Decimal.Value;
}

/** Detalhamento do nível de meta efetivamente aplicado. */
export interface MetaTierBreakdown {
  /** % do maior nível atingido (0 se não bateu nem a mini). */
  appliedPercent: string;
  /** Valor-alvo do nível aplicado (null se nenhum atingido). */
  appliedTarget: string | null;
}

export interface SellerCommissionResult {
  /** Total vendido líquido do mês (base da comissão de meta). */
  netSales: string;
  /** Comissão de meta (% do maior nível × netSales, retroativo). */
  metaCommission: string;
  /** Soma dos bônus de campanha já gravados (CampaignBonusEntry). */
  campaignBonus: string;
  /** metaCommission + campaignBonus. */
  total: string;
  /** Detalhe do nível de meta aplicado (para auditoria/exibição). */
  meta: MetaTierBreakdown;
}

/**
 * NÚCLEO PURO: calcula a comissão a partir de valores já apurados.
 *
 * Recebe o líquido vendido, os níveis de meta do vendedor e o bônus de campanha
 * já somado — sem tocar no banco. É o que os testes exercitam diretamente.
 *
 * Regra da meta: pega o MAIOR nível cujo targetAmount ≤ netSales e aplica seu
 * percent sobre TODO o netSales (retroativo). Empate de targetAmount → vence o
 * maior percent (defensivo; níveis bem cadastrados são monotônicos).
 */
export function computeCommissionFromValues(params: {
  netSales: Decimal.Value;
  tiers: CommissionTierInput[];
  campaignBonus: Decimal.Value;
}): SellerCommissionResult {
  const netSales = money(params.netSales);
  const campaignBonus = roundMoney(money(params.campaignBonus));

  // Maior nível atingido: targetAmount ≤ netSales, escolhendo o de maior
  // percent (e, em empate, maior alvo).
  let applied: { target: Decimal; percent: Decimal } | null = null;
  for (const tier of params.tiers) {
    const target = money(tier.targetAmount);
    const percent = money(tier.percent);
    if (netSales.greaterThanOrEqualTo(target)) {
      if (
        !applied ||
        percent.greaterThan(applied.percent) ||
        (percent.equals(applied.percent) && target.greaterThan(applied.target))
      ) {
        applied = { target, percent };
      }
    }
  }

  const appliedPercent = applied ? applied.percent : money(0);
  const metaCommission = roundMoney(netSales.mul(appliedPercent).div(100));
  const total = roundMoney(metaCommission.plus(campaignBonus));

  return {
    netSales: roundMoney(netSales).toFixed(MONEY_DP),
    metaCommission: metaCommission.toFixed(MONEY_DP),
    campaignBonus: campaignBonus.toFixed(MONEY_DP),
    total: total.toFixed(MONEY_DP),
    meta: {
      appliedPercent: appliedPercent.toFixed(MONEY_DP),
      appliedTarget: applied ? applied.target.toFixed(MONEY_DP) : null,
    },
  };
}

/**
 * Resolve os 3 níveis de meta de um vendedor (override do vendedor tem
 * precedência sobre o default da ótica, por nível).
 *
 * Espelha o padrão default+override (AiGlobalConfig/getEffectiveMarkup): para
 * cada nível, usa a linha do vendedor (userId = X) se existir, senão a linha
 * default da ótica (userId = null).
 */
export function resolveSellerTiers(
  rows: Array<{
    userId: string | null;
    level: "MINI" | "META" | "MEGA";
    targetAmount: Prisma.Decimal | number | string;
    percent: Prisma.Decimal | number | string;
  }>,
  userId: string
): CommissionTierInput[] {
  const levels: Array<"MINI" | "META" | "MEGA"> = ["MINI", "META", "MEGA"];
  const tiers: CommissionTierInput[] = [];

  for (const level of levels) {
    const override = rows.find((r) => r.userId === userId && r.level === level);
    const fallback = rows.find((r) => r.userId === null && r.level === level);
    const chosen = override ?? fallback;
    if (chosen) {
      tiers.push({
        targetAmount: chosen.targetAmount.toString(),
        percent: chosen.percent.toString(),
      });
    }
  }

  return tiers;
}

/** Limites (UTC) do mês calendário em America/Sao_Paulo para (year, month). */
function monthBoundsUTC(year: number, month: number): { start: Date; end: Date } {
  // Meio-dia UTC do dia 15 cai com folga dentro do mês em BRT (UTC-3), sem
  // risco de escorregar para o mês vizinho na conversão de fuso.
  const midMonth = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  return {
    start: startOfLocalMonth(midMonth),
    end: endOfLocalMonth(midMonth),
  };
}

/**
 * Soma o valor vendido LÍQUIDO de um vendedor no mês (base da comissão de meta).
 *
 * net = Σ Sale.total (COMPLETED, bucketado por createdAt no mês BRT)
 *       − Σ Refund.totalRefund (COMPLETED) de vendas que SEGUEM COMPLETED.
 *
 * (Devolução total já tira a venda do COMPLETED; só descontamos devolução
 * parcial aqui, evitando dupla contagem — consistente com o ledger/Bloco 3.)
 */
export async function getSellerNetSales(
  companyId: string,
  userId: string,
  start: Date,
  end: Date,
  client: Pick<typeof prisma, "sale" | "refund"> = prisma
): Promise<Decimal> {
  const grossAgg = await client.sale.aggregate({
    where: {
      companyId,
      sellerUserId: userId,
      status: "COMPLETED",
      createdAt: { gte: start, lte: end },
    },
    _sum: { total: true },
  });

  const gross = money(grossAgg._sum.total?.toString() ?? "0");

  // Devoluções (parciais) de vendas que continuam COMPLETED no mês.
  const refundAgg = await client.refund.aggregate({
    where: {
      companyId,
      status: "COMPLETED",
      sale: {
        sellerUserId: userId,
        status: "COMPLETED",
        createdAt: { gte: start, lte: end },
      },
    },
    _sum: { totalRefund: true },
  });

  const refunded = money(refundAgg._sum.totalRefund?.toString() ?? "0");

  return gross.minus(refunded);
}

/**
 * Soma o bônus de campanha já gravado para o vendedor no mês.
 *
 * REUSA o motor de campanha existente: só agrega CampaignBonusEntry (totalBonus)
 * das vendas do vendedor no mês, ignorando os REVERSED. Bucketamos pela data da
 * VENDA (mesmo critério da meta), não por earnedAt, para um único conceito de
 * "mês".
 */
export async function getSellerCampaignBonus(
  companyId: string,
  userId: string,
  start: Date,
  end: Date,
  client: Pick<typeof prisma, "campaignBonusEntry"> = prisma
): Promise<Decimal> {
  const agg = await client.campaignBonusEntry.aggregate({
    where: {
      companyId,
      sellerUserId: userId,
      status: { not: "REVERSED" },
      sale: {
        status: "COMPLETED",
        createdAt: { gte: start, lte: end },
      },
    },
    _sum: { totalBonus: true },
  });

  return money(agg._sum.totalBonus?.toString() ?? "0");
}

/**
 * Calcula a comissão de um vendedor para (companyId, userId, year, month).
 *
 * Função pura de cálculo: lê os dados e RETORNA o resultado. NÃO grava nada,
 * NÃO é chamada por nenhuma tela/rota nesta fase (Fase 2 liga e materializa).
 */
export async function computeSellerCommission(
  companyId: string,
  userId: string,
  year: number,
  month: number,
  client: Pick<
    typeof prisma,
    "sale" | "refund" | "campaignBonusEntry" | "sellerCommissionTier"
  > = prisma
): Promise<SellerCommissionResult> {
  const { start, end } = monthBoundsUTC(year, month);

  const [netSales, campaignBonus, tierRows] = await Promise.all([
    getSellerNetSales(companyId, userId, start, end, client),
    getSellerCampaignBonus(companyId, userId, start, end, client),
    client.sellerCommissionTier.findMany({
      where: { companyId, OR: [{ userId }, { userId: null }] },
      select: { userId: true, level: true, targetAmount: true, percent: true },
    }),
  ]);

  const tiers = resolveSellerTiers(tierRows, userId);

  return computeCommissionFromValues({
    netSales: netSales.toString(),
    tiers,
    campaignBonus: campaignBonus.toString(),
  });
}
