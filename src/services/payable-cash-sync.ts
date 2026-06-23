import { Prisma, FinanceAccountType } from "@prisma/client";

/**
 * Sincronização entre o pagamento de Contas a Pagar e o Caixa do PDV.
 *
 * Rotina 21/06: pagar uma despesa em DINHEIRO debitava só a conta financeira
 * (ledger) e não aparecia na aba "Movimentações" do Caixa do PDV (CashShift).
 * Estas funções espelham a saída/entrada física no caixa quando aplicável.
 *
 * Ambas DEVEM ser chamadas dentro de uma $transaction (recebem o tx client).
 */

const ORIGIN_TYPE = "AccountPayable";

interface PostWithdrawalParams {
  companyId: string;
  payableId: string;
  branchId: string | null;
  /** Tipo da conta financeira de saída — só CASH reflete no caixa físico. */
  accountType: FinanceAccountType;
  amount: number;
  description: string;
  userId: string;
}

/**
 * Registra uma sangria (WITHDRAWAL/OUT) no caixa OPEN da filial quando a baixa
 * foi paga em DINHEIRO (conta CASH). Sem caixa aberto, ou conta sem filial, ou
 * conta não-CASH: no-op (não bloqueia o pagamento). Retorna o id do movimento
 * criado, ou null se nada foi registrado.
 */
export async function postPayableCashWithdrawal(
  tx: Prisma.TransactionClient,
  params: PostWithdrawalParams
): Promise<string | null> {
  const { companyId, payableId, branchId, accountType, amount, description, userId } = params;

  if (accountType !== FinanceAccountType.CASH) return null;
  if (!branchId) return null;
  if (!(amount > 0)) return null;

  const openShift = await tx.cashShift.findFirst({
    where: { companyId, branchId, status: "OPEN" },
    select: { id: true },
  });
  if (!openShift) return null;

  const movement = await tx.cashMovement.create({
    data: {
      cashShiftId: openShift.id,
      branchId,
      type: "WITHDRAWAL",
      direction: "OUT",
      method: "CASH",
      amount,
      originType: ORIGIN_TYPE,
      originId: payableId,
      createdByUserId: userId,
      note: `Pagamento de conta: ${description}`,
    },
    select: { id: true },
  });

  return movement.id;
}

interface ReverseWithdrawalParams {
  companyId: string;
  payableId: string;
  description: string;
  userId: string;
}

/**
 * Compensa, de forma IDEMPOTENTE, sangrias de pagamento desta conta cujo turno
 * AINDA está aberto, criando um SUPPLY/IN equivalente. Turnos já fechados não
 * são tocados (o fechamento já contabilizou a sangria). Chamar 2x não duplica
 * a compensação. Retorna a quantidade de movimentos de estorno criados.
 */
export async function reversePayableCashWithdrawal(
  tx: Prisma.TransactionClient,
  params: ReverseWithdrawalParams
): Promise<number> {
  const { companyId, payableId, description, userId } = params;

  const withdrawals = await tx.cashMovement.findMany({
    where: {
      originType: ORIGIN_TYPE,
      originId: payableId,
      type: "WITHDRAWAL",
      direction: "OUT",
      // Defesa em profundidade: só movimentos de caixas desta empresa.
      cashShift: { companyId },
    },
    select: {
      id: true,
      cashShiftId: true,
      branchId: true,
      amount: true,
      method: true,
    },
  });

  let created = 0;

  for (const w of withdrawals) {
    const shift = await tx.cashShift.findFirst({
      where: { id: w.cashShiftId, companyId },
      select: { status: true },
    });
    if (shift?.status !== "OPEN") continue; // turno fechado — não toca

    const alreadyReversed = await tx.cashMovement.count({
      where: {
        originType: ORIGIN_TYPE,
        originId: payableId,
        type: "SUPPLY",
        direction: "IN",
        cashShiftId: w.cashShiftId,
      },
    });
    if (alreadyReversed > 0) continue;

    await tx.cashMovement.create({
      data: {
        cashShiftId: w.cashShiftId,
        branchId: w.branchId,
        type: "SUPPLY",
        direction: "IN",
        method: w.method,
        amount: w.amount,
        originType: ORIGIN_TYPE,
        originId: payableId,
        createdByUserId: userId,
        note: `Estorno de pagamento de conta: ${description}`,
      },
    });
    created++;
  }

  return created;
}
