import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";
import { computeSellerCommission } from "@/services/commission/commission-engine";

/**
 * Comissão mensal pela REGRA NOVA (fonte oficial) — Comissão Fase 2.
 *
 * READ-ONLY: calcula na hora, por MÊS calendário e ótica, a comissão de cada
 * vendedor pelo motor (níveis + campanha). É o que a tela de Comissões passou a
 * exibir depois de "virar a chave". NÃO grava nada, NÃO tem lifecycle
 * (aprovar/pagar) ainda — só exibe/confere.
 *
 * Substitui, na exibição, a antiga apuração por tabela Commission (cujo gravador
 * foi desligado). Os números velhos seguem no banco, mas ninguém mais os lê aqui.
 */

export interface MonthlyCommissionRow {
  userId: string;
  userName: string;
  /** Comissão total do vendedor no mês (meta + campanha). */
  total: string;
  netSales: string;
  metaCommission: string;
  campaignBonus: string;
  appliedPercent: string;
  /** Já pago (existe CommissionPayment do vendedor/mês) — Bloco 4. */
  paid: boolean;
  /**
   * Valor efetivamente PAGO (snapshot do CommissionPayment), quando paid=true.
   * "0.00" quando não pago.
   */
  paidAmount: string;
  /**
   * H1 (auditoria 2026-07-02): divergência entre o pago e o devido AGORA.
   * > 0 = pagou a MAIS do que o devido atual (tipicamente porque uma venda do
   * mês foi devolvida DEPOIS do pagamento — netSales caiu, mas o pagamento já
   * saiu). Valor a glosar/cobrar do vendedor no próximo fechamento. "0.00"
   * quando não há divergência (ou não pago). NUNCA negativo — se o devido subiu
   * após o pagamento, não é uma glosa (o vendedor recebe a diferença no próximo
   * pagamento normal), então zeramos.
   */
  overpaid: string;
  /**
   * Glosa REGISTRADA pelo dono (CommissionPayment.clawbackAmount). "0.00" se
   * nada foi registrado. É só reconhecimento — não desconta folha sozinho.
   */
  clawbackAmount: string;
  /**
   * Quanto do overpaid AINDA não foi registrado como glosa = max(0, overpaid −
   * clawbackAmount). > 0 → mostrar o botão "Registrar glosa". 0 → já registrado
   * (ou não há divergência).
   */
  clawbackPending: string;
}

export interface MonthlyCommissionReport {
  year: number;
  month: number;
  rows: MonthlyCommissionRow[];
  total: string;
}

function money(v: Decimal.Value): Decimal {
  return new Decimal(v);
}

/**
 * Gera a comissão do mês por vendedor (regra nova). branchId opcional restringe
 * a quais vendedores entram (os que venderam naquela filial); o cálculo do motor
 * é por empresa.
 */
export async function generateMonthlyCommission(
  companyId: string,
  year: number,
  month: number,
  branchId?: string
): Promise<MonthlyCommissionReport> {
  const midMonth = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const startDate = startOfLocalMonth(midMonth);
  const endDate = endOfLocalMonth(midMonth);

  // Vendedores com venda COMPLETED no mês (na ótica / filial).
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

  const sellers = new Map<string, string>();
  for (const s of salesSellers) {
    if (s.sellerUserId) sellers.set(s.sellerUserId, s.sellerUser?.name ?? "—");
  }

  // Quem já foi pago neste mês (Bloco 4) — 1 query, depois lookup em memória.
  // H1: trazemos também o totalCommission pago (snapshot) para detectar glosa,
  // e o clawbackAmount já registrado (FU-1).
  const paidRows = await prisma.commissionPayment.findMany({
    where: { companyId, year, month },
    select: { userId: true, totalCommission: true, clawbackAmount: true },
  });
  const paidById = new Map(paidRows.map((p) => [p.userId, money(p.totalCommission.toString())]));
  const clawbackById = new Map(paidRows.map((p) => [p.userId, money(p.clawbackAmount.toString())]));

  const rows: MonthlyCommissionRow[] = [];
  let total = money(0);

  for (const [userId, name] of sellers) {
    const r = await computeSellerCommission(companyId, userId, year, month);
    total = total.plus(money(r.total));

    const paidAmount = paidById.get(userId) ?? null;
    // H1: glosa = quanto o pago excede o devido AGORA. Piso 0 (se o devido
    // subiu depois do pagamento, não é glosa — o extra vem no próximo pagamento).
    const overpaid =
      paidAmount !== null
        ? Decimal.max(0, paidAmount.minus(money(r.total)))
        : money(0);

    // FU-1: quanto do overpaid ainda não foi registrado como glosa.
    const clawbackAmount = clawbackById.get(userId) ?? money(0);
    const clawbackPending = Decimal.max(0, overpaid.minus(clawbackAmount));

    rows.push({
      userId,
      userName: name,
      total: r.total,
      netSales: r.netSales,
      metaCommission: r.metaCommission,
      campaignBonus: r.campaignBonus,
      appliedPercent: r.meta.appliedPercent,
      paid: paidAmount !== null,
      paidAmount: (paidAmount ?? money(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      overpaid: overpaid.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      clawbackAmount: clawbackAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      clawbackPending: clawbackPending.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    });
  }

  // maior comissão primeiro
  rows.sort((a, b) => Number(b.total) - Number(a.total));

  return {
    year,
    month,
    rows,
    total: total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
  };
}
