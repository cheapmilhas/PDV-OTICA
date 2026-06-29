import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeSellerCommission } from "./commission-engine";
import { generateCommissionPaymentEntry } from "@/services/finance-entry.service";

/**
 * Pagamento de comissão do MOTOR NOVO (Bloco 4). O motor novo calcula a comissão
 * sob demanda (read-only) e não tinha "pagar". Esta função: (1) calcula o valor
 * devido AGORA (snapshot), (2) materializa em CommissionPayment (por empresa,
 * @unique vendedor/mês → idempotente), (3) lança a despesa no ledger.
 *
 * Regime de CAIXA: a despesa entra no ledger no instante do pagamento.
 *
 * Idempotência DUPLA: se já existe CommissionPayment do vendedor/mês, NÃO re-paga
 * (retorna o existente) — e o FinanceEntry também é upsert. Pagar 2× é no-op.
 *
 * Multi-tenant: companyId vem do servidor; o branchId p/ o lançamento é resolvido
 * a partir de uma filial da empresa (o ledger exige branchId; a comissão é por
 * empresa, então usamos a 1ª filial — o valor não muda por filial).
 */
export interface PaySellerCommissionParams {
  companyId: string;
  userId: string;
  year: number;
  month: number;
  paidByUserId: string;
}

export async function paySellerCommission(params: PaySellerCommissionParams) {
  const { companyId, userId, year, month, paidByUserId } = params;

  // Já pago? idempotente — não recalcula nem duplica.
  const existing = await prisma.commissionPayment.findUnique({
    where: { companyId_userId_year_month: { companyId, userId, year, month } },
  });
  if (existing) return { payment: existing, alreadyPaid: true };

  // Snapshot do valor devido agora.
  const result = await computeSellerCommission(companyId, userId, year, month);

  // Filial p/ o lançamento (a comissão é por empresa; o ledger exige branchId).
  const branch = await prisma.branch.findFirst({
    where: { companyId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!branch) throw new Error("Empresa sem filial para lançar a comissão");

  const seller = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { name: true },
  });
  if (!seller) throw new Error("Vendedor inválido");

  const paidAt = new Date();
  const totalCommission = new Prisma.Decimal(result.total);

  // ATOMICIDADE: o pagamento materializado E a despesa no ledger nascem na MESMA
  // transação — ou os dois existem, ou nenhum (padrão correto p/ financeiro).
  // A unique constraint do banco é o árbitro contra corrida (duplo-clique/2 abas):
  // a 2ª chamada concorrente colide em P2002 e é tratada como "já pago".
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.commissionPayment.create({
        data: {
          companyId,
          userId,
          year,
          month,
          netSales: new Prisma.Decimal(result.netSales),
          metaCommission: new Prisma.Decimal(result.metaCommission),
          campaignBonus: new Prisma.Decimal(result.campaignBonus),
          totalCommission,
          paidAt,
          paidByUserId,
        },
      });
      await generateCommissionPaymentEntry(tx, {
        companyId,
        branchId: branch.id,
        commissionId: p.id,
        amount: Number(totalCommission),
        paidAt,
        sellerName: seller.name,
      });
      return p;
    });
    return { payment, alreadyPaid: false };
  } catch (e) {
    // Corrida: outro processo já criou o pagamento deste vendedor/mês.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const already = await prisma.commissionPayment.findUnique({
        where: { companyId_userId_year_month: { companyId, userId, year, month } },
      });
      if (already) return { payment: already, alreadyPaid: true };
    }
    // Falha do ledger (ex.: conta 5.1.02 ausente) reverte o pagamento junto —
    // NÃO marcamos como pago se a despesa não pôde ser lançada (evita o bug
    // original: pago na tela mas DRE=R$0). Propaga p/ a rota tratar (500 + msg).
    throw e;
  }
}
