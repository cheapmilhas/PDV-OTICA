import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";
import { CommissionsService } from "@/services/reports/commissions.service";
import { computeSellerCommission } from "@/services/commission/commission-engine";

/**
 * PREVIEW de comissão — Comissão Fase 2 / Passo 3a.
 *
 * 100% READ-ONLY. Compara, por MÊS calendário e por vendedor:
 *   - ATUAL: a comissão que é paga hoje (tabela Commission, via
 *     CommissionsService — exatamente o que o Relatório de Comissões já apura).
 *   - NOVA: o resultado do motor computeSellerCommission (níveis + campanha),
 *     calculado na hora — NADA é gravado.
 *
 * Por que MÊS (e não intervalo livre): a "comissão de meta" do motor depende do
 * total líquido do MÊS inteiro (% do maior nível atingido, retroativo). Em meio
 * mês o nível sairia rebaixado e a comparação enganaria. Então os DOIS lados são
 * apurados sobre o mesmo mês calendário fechado.
 *
 * NÃO grava, NÃO muda pagamento, NÃO desliga cálculo legado. Só exibe.
 */

export interface CommissionPreviewRow {
  userId: string;
  userName: string;
  /** Comissão paga hoje (Commission) no mês. */
  current: string;
  /** Comissão pelo motor novo (níveis + campanha). */
  proposed: string;
  /** proposed − current (pode ser negativo). */
  diff: string;
  /** Variação % sobre o atual (null se atual = 0). */
  diffPercent: string | null;
  /** Detalhe do motor novo, para transparência. */
  proposedDetail: {
    netSales: string;
    metaCommission: string;
    campaignBonus: string;
    appliedPercent: string;
  };
}

export interface CommissionPreviewReport {
  year: number;
  month: number;
  rows: CommissionPreviewRow[];
  totals: {
    current: string;
    proposed: string;
    diff: string;
  };
}

function money(v: Decimal.Value): Decimal {
  return new Decimal(v);
}
function fmt(v: Decimal): string {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Gera a comparação atual × nova para um mês calendário e uma ótica.
 * branchId opcional restringe o lado ATUAL à filial (o motor novo é por empresa).
 */
export async function generateCommissionPreview(
  companyId: string,
  year: number,
  month: number,
  branchId?: string
): Promise<CommissionPreviewReport> {
  // Limites do mês calendário em BRT (mesmo critério do motor).
  const midMonth = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const startDate = startOfLocalMonth(midMonth);
  const endDate = endOfLocalMonth(midMonth);

  // --- Lado ATUAL: o que é pago hoje (reusa o serviço do relatório real) ---
  const current = await new CommissionsService().generateReport(companyId, {
    startDate,
    endDate,
    branchId,
  });

  const currentByUser = new Map<string, { name: string; total: number }>();
  for (const s of current.sellers) {
    currentByUser.set(s.userId, { name: s.userName, total: s.totalCommission });
  }

  // --- União de vendedores: quem aparece no atual OU vendeu COMPLETED no mês ---
  // (o motor novo pode achar comissão p/ quem ainda não tem linha em Commission).
  const salesSellers = await prisma.sale.findMany({
    where: {
      companyId,
      status: "COMPLETED",
      createdAt: { gte: startDate, lte: endDate },
      ...(branchId ? { branchId } : {}),
    },
    select: { sellerUserId: true, sellerUser: { select: { name: true } } },
    distinct: ["sellerUserId"],
  });

  const userNames = new Map<string, string>();
  for (const [id, v] of currentByUser) userNames.set(id, v.name);
  for (const s of salesSellers) {
    if (s.sellerUserId && !userNames.has(s.sellerUserId)) {
      userNames.set(s.sellerUserId, s.sellerUser?.name ?? "—");
    }
  }

  // --- Lado NOVO: motor por vendedor (read-only, nada gravado) ---
  const rows: CommissionPreviewRow[] = [];
  let totalCurrent = money(0);
  let totalProposed = money(0);

  for (const [userId, name] of userNames) {
    const result = await computeSellerCommission(companyId, userId, year, month);

    const curr = money(currentByUser.get(userId)?.total ?? 0);
    const prop = money(result.total);
    const diff = prop.minus(curr);
    const diffPercent = curr.isZero()
      ? null
      : fmt(diff.div(curr).mul(100));

    totalCurrent = totalCurrent.plus(curr);
    totalProposed = totalProposed.plus(prop);

    rows.push({
      userId,
      userName: name,
      current: fmt(curr),
      proposed: fmt(prop),
      diff: fmt(diff),
      diffPercent,
      proposedDetail: {
        netSales: result.netSales,
        metaCommission: result.metaCommission,
        campaignBonus: result.campaignBonus,
        appliedPercent: result.meta.appliedPercent,
      },
    });
  }

  // ordena por maior diferença absoluta (o que mais muda primeiro)
  rows.sort((a, b) => Math.abs(Number(b.diff)) - Math.abs(Number(a.diff)));

  return {
    year,
    month,
    rows,
    totals: {
      current: fmt(totalCurrent),
      proposed: fmt(totalProposed),
      diff: fmt(totalProposed.minus(totalCurrent)),
    },
  };
}
