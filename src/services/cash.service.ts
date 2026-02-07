import { prisma } from "@/lib/prisma";
import { CashShift, CashMovement, Prisma } from "@prisma/client";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import type { OpenShiftDTO, CloseShiftDTO, CashMovementDTO } from "@/lib/validations/cash.schema";

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

    // Criar turno + movimento de abertura em transação
    const shift = await prisma.$transaction(async (tx) => {
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
    });

    return shift;
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

    // Buscar turno
    const shift = await prisma.cashShift.findFirst({
      where: {
        id: shiftId,
        companyId,
        status: "OPEN",
      },
      include: {
        movements: true,
      },
    });

    if (!shift) {
      throw notFoundError("Turno de caixa não encontrado ou já fechado");
    }

    // Calcular valor esperado
    const cashMovements = shift.movements.filter((m) => m.method === "CASH");
    const totalIn = cashMovements
      .filter((m) => m.direction === "IN")
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const totalOut = cashMovements
      .filter((m) => m.direction === "OUT")
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const closingExpectedCash = totalIn - totalOut;

    // Calcular diferença
    const differenceCash = closingDeclaredCash - closingExpectedCash;

    // Validar justificativa se há diferença
    if (Math.abs(differenceCash) > 0.01 && !differenceJustification) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Há uma diferença de R$ ${differenceCash.toFixed(2)}. Informe a justificativa.`,
        400
      );
    }

    // Fechar turno
    const closedShift = await prisma.cashShift.update({
      where: { id: shiftId },
      data: {
        status: "CLOSED",
        closedByUserId: userId,
        closedAt: new Date(),
        closingDeclaredCash,
        closingExpectedCash,
        differenceCash,
        differenceJustification,
        notes: notes || shift.notes,
      },
      include: {
        movements: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

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

    // Criar movimento
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
        },
        openedByUser: {
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
}

export const cashService = new CashService();
