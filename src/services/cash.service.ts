import { prisma } from "@/lib/prisma";
import { CashShift, CashMovement, Prisma } from "@prisma/client";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import type { OpenShiftDTO, CloseShiftDTO, CashMovementDTO } from "@/lib/validations/cash.schema";
import { METHODS_IN_CASH } from "@/lib/payment-methods";
import { computeCashBalance, withdrawalExceedsCash } from "@/lib/finance-validation";

/**
 * Service para operações de Caixa
 *
 * Características:
 * - Multi-tenancy (companyId + branchId)
 * - Validação: apenas 1 CashShift OPEN por branch
 * - Movimentos vinculados ao turno
 */
export class CashService {
  /**
   * Abre um novo turno de caixa
   *
   * Regras:
   * - Só pode existir 1 turno OPEN por branch
   * - Cria CashMovement tipo OPENING_FLOAT
   */
  async openShift(
    data: OpenShiftDTO,
    companyId: string,
    userId: string
  ): Promise<CashShift> {
    const { branchId, openingFloatAmount, notes } = data;

    // Validar se já existe turno aberto
    const existingOpen = await prisma.cashShift.findFirst({
      where: {
        branchId,
        status: "OPEN",
      },
    });

    if (existingOpen) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Já existe um turno de caixa aberto nesta filial. Feche o turno atual antes de abrir um novo.",
        400
      );
    }

    // Criar turno + movimento de abertura em transação.
    // timeout=30s: alinhado com sale.service para tolerar latência Neon.
    // Partial unique index (CashShift_branchId_open_unique) garante atomicidade
    // contra race condition do findFirst + create acima.
    try {
      const shift = await prisma.$transaction(
        async (tx) => {
          // 1. Criar turno
          const newShift = await tx.cashShift.create({
            data: {
              companyId,
              branchId,
              openedByUserId: userId,
              openingFloatAmount,
              status: "OPEN",
              notes,
            },
          });

          // 2. Criar movimento de abertura
          if (openingFloatAmount > 0) {
            await tx.cashMovement.create({
              data: {
                cashShiftId: newShift.id,
                branchId,
                type: "OPENING_FLOAT",
                direction: "IN",
                method: "CASH",
                amount: openingFloatAmount,
                originType: "CASH_SHIFT",
                originId: newShift.id,
                createdByUserId: userId,
                note: "Fundo de troco - abertura de caixa",
              },
            });
          }

          return newShift;
        },
        { timeout: 30_000 }
      );

      return shift;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Já existe um turno de caixa aberto nesta filial. Feche o turno atual antes de abrir um novo.",
          400
        );
      }
      throw err;
    }
  }

  /**
   * Fecha o turno de caixa
   *
   * Regras:
   * - Calcula diferença: declarado vs esperado
   * - Se diferença != 0, exige justificativa
   */
  async closeShift(
    shiftId: string,
    data: CloseShiftDTO,
    companyId: string,
    userId: string
  ): Promise<CashShift> {
    const { closingDeclaredCash, differenceJustification, notes } = data;

    // Q8.2.5: fecha o turno DENTRO de uma transação com SELECT ... FOR UPDATE no
    // shift. Antes, o valor esperado era calculado FORA de qualquer lock — uma
    // venda concorrente entre o cálculo e o update deixava closingExpectedCash
    // defasado (diferença falsa, operador obrigado a justificar). Agora: trava o
    // shift, RELÊ os movimentos já protegido, recalcula e fecha — a venda
    // concorrente ou espera o lock, ou já aparece na releitura.
    const closedShift = await prisma.$transaction(async (tx) => {
      // Lock de linha: serializa fechamentos concorrentes do MESMO shift e
      // bloqueia até esta tx terminar. Filtra por companyId (multi-tenant).
      const locked = await tx.$queryRaw<{ id: string; status: string; notes: string | null }[]>`
        SELECT id, status, notes FROM "CashShift"
        WHERE id = ${shiftId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
      if (!locked[0]) {
        throw notFoundError("Turno de caixa não encontrado");
      }
      if (locked[0].status !== "OPEN") {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Turno já foi fechado por outro usuário. Recarregue a página.",
          409,
        );
      }

      // Relê movimentos DEPOIS do lock — pega qualquer venda que acabou de entrar.
      const movements = await tx.cashMovement.findMany({ where: { cashShiftId: shiftId } });
      const cashMovements = movements.filter((m) => m.method === "CASH");
      const totalIn = cashMovements
        .filter((m) => m.direction === "IN")
        .reduce((sum, m) => sum + Number(m.amount), 0);
      const totalOut = cashMovements
        .filter((m) => m.direction === "OUT")
        .reduce((sum, m) => sum + Number(m.amount), 0);
      const closingExpectedCash = totalIn - totalOut;
      const differenceCash = closingDeclaredCash - closingExpectedCash;

      // Validar justificativa se há diferença (com o valor já protegido pelo lock).
      if (Math.abs(differenceCash) > 0.01 && !differenceJustification) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Há uma diferença de R$ ${differenceCash.toFixed(2)}. Informe a justificativa.`,
          400,
        );
      }

      await tx.cashShift.update({
        where: { id: shiftId },
        data: {
          status: "CLOSED",
          closedByUserId: userId,
          closedAt: new Date(),
          closingDeclaredCash,
          closingExpectedCash,
          differenceCash,
          differenceJustification,
          notes: notes || locked[0].notes,
        },
      });

      return tx.cashShift.findUniqueOrThrow({
        where: { id: shiftId },
        include: { movements: { orderBy: { createdAt: "asc" } } },
      });
    }, { timeout: 30_000 });

    return closedShift;
  }

  /**
   * Cria movimento de caixa (sangria/suprimento)
   *
   * Regras:
   * - Só pode criar se houver turno aberto
   * - SUPPLY = entrada (IN)
   * - WITHDRAWAL = saída (OUT)
   */
  async createMovement(
    data: CashMovementDTO,
    companyId: string,
    branchId: string,
    userId: string
  ): Promise<CashMovement> {
    const { type, amount, method, note } = data;

    // Buscar turno aberto
    const openShift = await prisma.cashShift.findFirst({
      where: {
        branchId,
        status: "OPEN",
      },
    });

    if (!openShift) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não há turno de caixa aberto. Abra o caixa antes de realizar movimentos.",
        400
      );
    }

    // Determinar direção
    const direction = type === "SUPPLY" ? "IN" : "OUT";

    // A4: sangria (WITHDRAWAL) em dinheiro não pode exceder o saldo em dinheiro
    // do turno (mesmo cálculo do fechamento: CASH IN - CASH OUT, incluindo o
    // fundo de troco de abertura). Faz dentro de tx com lock no shift p/ não
    // permitir duas sangrias concorrentes furarem o saldo.
    if (type === "WITHDRAWAL" && method === "CASH") {
      return prisma.$transaction(async (tx) => {
        // Lock do shift serializa sangrias concorrentes do mesmo turno
        await tx.$queryRaw`
          SELECT id FROM "CashShift"
          WHERE id = ${openShift.id} AND "companyId" = ${companyId}
          FOR UPDATE
        `;

        const cashMovements = await tx.cashMovement.findMany({
          where: { cashShiftId: openShift.id, method: "CASH" },
          select: { direction: true, amount: true },
        });
        const saldoCash = computeCashBalance(
          cashMovements.map((m) => ({
            direction: m.direction as "IN" | "OUT",
            amount: Number(m.amount),
          }))
        );

        if (withdrawalExceedsCash(amount, saldoCash)) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            `Sangria de R$ ${amount.toFixed(2)} excede o saldo em dinheiro do caixa (R$ ${saldoCash.toFixed(2)}).`,
            400
          );
        }

        return tx.cashMovement.create({
          data: {
            cashShiftId: openShift.id,
            branchId,
            type,
            direction,
            method,
            amount,
            originType: "MANUAL",
            originId: openShift.id,
            createdByUserId: userId,
            note,
          },
        });
      });
    }

    // Suprimento ou movimento não-CASH: cria direto
    const movement = await prisma.cashMovement.create({
      data: {
        cashShiftId: openShift.id,
        branchId,
        type,
        direction,
        method,
        amount,
        originType: "MANUAL",
        originId: openShift.id,
        createdByUserId: userId,
        note,
      },
    });

    return movement;
  }

  /**
   * Busca turno aberto de uma filial
   */
  async getCurrentShift(branchId: string, companyId: string): Promise<CashShift | null> {
    return prisma.cashShift.findFirst({
      where: {
        branchId,
        companyId,
        status: "OPEN",
      },
      include: {
        movements: {
          orderBy: { createdAt: "asc" },
          include: {
            createdByUser: {
              select: { id: true, name: true },
            },
          },
        },
        openedByUser: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Busca turno de caixa por ID
   */
  async getShiftById(shiftId: string, companyId: string): Promise<CashShift | null> {
    return prisma.cashShift.findFirst({
      where: {
        id: shiftId,
        companyId,
      },
      include: {
        movements: {
          orderBy: { createdAt: "asc" },
        },
        openedByUser: {
          select: { id: true, name: true },
        },
        closedByUser: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Lista movimentos de um turno
   */
  async getShiftMovements(shiftId: string, companyId: string): Promise<CashMovement[]> {
    const shift = await prisma.cashShift.findFirst({
      where: { id: shiftId, companyId },
    });

    if (!shift) {
      throw notFoundError("Turno de caixa não encontrado");
    }

    return prisma.cashMovement.findMany({
      where: { cashShiftId: shiftId },
      orderBy: { createdAt: "asc" },
      include: {
        createdByUser: {
          select: { id: true, name: true },
        },
        salePayment: {
          select: {
            id: true,
            sale: {
              select: { id: true },
            },
          },
        },
      },
    });
  }

  /**
   * Vendas do turno agrupadas por forma de pagamento (fonte: SalePayment).
   * Mostra crédito/crediário/boleto/cheque que NÃO geram CashMovement.
   * Semântica = "faturado no turno por método", NÃO "a receber em aberto".
   */
  async getShiftSalesByMethod(
    shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null },
    companyId: string
  ) {
    const rows = await prisma.salePayment.groupBy({
      by: ["method"],
      where: {
        status: { not: "VOIDED" },
        sale: {
          companyId,
          branchId: shift.branchId,
          status: "COMPLETED",
          createdAt: {
            gte: shift.openedAt,
            ...(shift.closedAt ? { lte: shift.closedAt } : {}),
          },
        },
      },
      _sum: { amount: true },
      _count: true,
    });

    return rows.map((r) => ({
      method: r.method,
      amount: Number(r._sum.amount ?? 0),
      count: r._count,
    }));
  }

  private async queryShiftReceivableRows(
    shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null },
    companyId: string,
    opts: { voided: boolean }
  ) {
    const where: Prisma.SalePaymentWhereInput = {
      status: opts.voided ? "VOIDED" : { not: "VOIDED" },
      method: { notIn: [...METHODS_IN_CASH] },
      sale: {
        companyId,
        branchId: shift.branchId,
        status: opts.voided ? { in: ["CANCELED", "REFUNDED"] } : "COMPLETED",
        createdAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) },
      },
    };
    const rows = await prisma.salePayment.findMany({
      where,
      select: { id: true, method: true, amount: true,
        sale: { select: { id: true, number: true, createdAt: true, sellerUser: { select: { name: true } } } } },
      orderBy: { sale: { createdAt: "asc" } },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: opts.voided ? ("VOIDED" as const) : ("RECEIVABLE" as const),
      voided: opts.voided,
      createdAt: r.sale.createdAt.toISOString(),
      method: r.method,
      amount: Number(r.amount),
      saleId: r.sale.id,
      saleNumber: r.sale.number,
      sellerName: r.sale.sellerUser?.name ?? "—",
    }));
  }

  /** Vendas a prazo ATIVAS do turno (linha-a-linha). method notIn METHODS_IN_CASH → a prazo + convênio + outro. */
  async getShiftSalePayments(shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null }, companyId: string) {
    return this.queryShiftReceivableRows(shift, companyId, { voided: false });
  }

  /**
   * Vendas a prazo CANCELADAS do turno (riscadas na tabela).
   * Filtra status "VOIDED": hoje NADA escreve PaymentStatus.REFUNDED (devolução = refundFull
   * reusa cancel, que seta payment=VOIDED + sale=REFUNDED). Se algum dia gravar payment=REFUNDED,
   * trocar p/ { in: ["VOIDED","REFUNDED"] }.
   */
  async getShiftVoidedReceivables(shift: { id: string; branchId: string; openedAt: Date; closedAt?: Date | null }, companyId: string) {
    return this.queryShiftReceivableRows(shift, companyId, { voided: true });
  }
}

export const cashService = new CashService();

/**
 * Estorna, de forma IDEMPOTENTE, o caixa de um AccountReceivable.
 *
 * Soma todos os CashMovement IN deste AR por shift e subtrai os REFUND OUT
 * já lançados. Para cada shift OPEN com saldo líquido > 0, cria um único
 * REFUND OUT compensando exatamente o remanescente. Shifts já fechados não
 * são tocados (estorno fora do ciclo de caixa — DRE resolve via FinanceEntry).
 *
 * Idempotente: chamar 2x não gera estorno em dobro (o 1º já zera o líquido).
 * Cobre receive-multiple (vários IN) e ciclos receber→estornar→receber.
 *
 * DEVE ser chamado dentro de uma $transaction (recebe o tx client).
 */
export async function reverseAccountReceivableCash(
  tx: Prisma.TransactionClient,
  params: { accountReceivableId: string; description: string; userId: string },
): Promise<void> {
  const { accountReceivableId, description, userId } = params;

  // Multi-tenant: CashMovement não tem companyId; o isolamento é garantido
  // pelo caller, que valida AR.companyId antes de chamar. originId é cuid
  // global, sem colisão entre empresas.
  const movements = await tx.cashMovement.findMany({
    where: { originType: "AccountReceivable", originId: accountReceivableId },
  });

  // Agrupar líquido (IN - OUT) por (shift + método). Chave inclui o método
  // para que um pagamento CASH+PIX seja estornado como CASH OUT + PIX OUT
  // (espelha o lado IN, que cria 1 movimento por método) — senão o relatório
  // por forma de pagamento ficaria distorcido.
  const netByKey = new Map<
    string,
    { cashShiftId: string; branchId: string; method: CashMovement["method"]; net: number }
  >();
  for (const mov of movements) {
    const amount = Number(mov.amount);
    const signed = mov.direction === "IN" ? amount : -amount;
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

  for (const info of netByKey.values()) {
    if (info.net < 0.01) continue; // nada a estornar (já compensado)

    const shift = await tx.cashShift.findUnique({ where: { id: info.cashShiftId } });
    if (shift?.status !== "OPEN") continue; // shift fechado — não toca

    await tx.cashMovement.create({
      data: {
        cashShiftId: info.cashShiftId,
        branchId: info.branchId,
        type: "REFUND",
        direction: "OUT",
        method: info.method,
        amount: info.net,
        originType: "AccountReceivable",
        originId: accountReceivableId,
        note: `Estorno: ${description}`,
        createdByUserId: userId,
      },
    });
  }
}
