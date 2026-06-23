import { Prisma, FinanceAccountType, CashMovement } from "@prisma/client";

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
 * AINDA está aberto. Turnos já fechados não são tocados (o fechamento já
 * contabilizou a sangria). Retorna a quantidade de movimentos de estorno criados.
 *
 * Idempotência por NET (espelha reverseAccountReceivableCash): agrupa o líquido
 * OUT(WITHDRAWAL) − IN(SUPPLY) por (shift, método) e cria um SUPPLY só do
 * remanescente. Isso cobre o ciclo pagar→estornar→pagar→estornar na MESMA
 * conta/turno — antes a checagem "já estornei?" era por (conta, shift), então a
 * 2ª sangria via o SUPPLY da 1ª e ficava sem compensação, deixando o caixa a
 * menos. Com o net, cada nova sangria não-compensada gera seu próprio estorno.
 */
export async function reversePayableCashWithdrawal(
  tx: Prisma.TransactionClient,
  params: ReverseWithdrawalParams
): Promise<number> {
  const { companyId, payableId, description, userId } = params;

  // Todos os movimentos desta conta (sangrias OUT e estornos IN já feitos),
  // restritos aos caixas desta empresa (defesa em profundidade).
  const movements = await tx.cashMovement.findMany({
    where: {
      originType: ORIGIN_TYPE,
      originId: payableId,
      cashShift: { companyId },
    },
    select: { cashShiftId: true, branchId: true, amount: true, method: true, direction: true },
  });

  // Líquido a estornar por (shift, método) = OUT − IN já compensado.
  const netByKey = new Map<
    string,
    { cashShiftId: string; branchId: string; method: CashMovement["method"]; net: number }
  >();
  for (const mov of movements) {
    const amount = Number(mov.amount);
    // WITHDRAWAL/OUT soma positivo (a estornar); SUPPLY/IN abate.
    const signed = mov.direction === "OUT" ? amount : -amount;
    const key = `${mov.cashShiftId}:${mov.method}`;
    const prev = netByKey.get(key);
    if (prev) {
      prev.net = Math.round((prev.net + signed) * 100) / 100;
    } else {
      netByKey.set(key, {
        cashShiftId: mov.cashShiftId,
        branchId: mov.branchId,
        method: mov.method,
        net: signed,
      });
    }
  }

  let created = 0;

  for (const info of netByKey.values()) {
    if (info.net < 0.01) continue; // nada a estornar (já compensado)

    const shift = await tx.cashShift.findFirst({
      where: { id: info.cashShiftId, companyId },
      select: { status: true },
    });
    if (shift?.status !== "OPEN") continue; // turno fechado — não toca

    await tx.cashMovement.create({
      data: {
        cashShiftId: info.cashShiftId,
        branchId: info.branchId,
        type: "SUPPLY",
        direction: "IN",
        method: info.method,
        amount: info.net,
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
