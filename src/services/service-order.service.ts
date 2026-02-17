import { prisma } from "@/lib/prisma";
import { ServiceOrderStatus, Prisma } from "@prisma/client";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { ServiceOrderQuery, CreateServiceOrderDTO, UpdateServiceOrderDTO } from "@/lib/validations/service-order.schema";

/**
 * Service para operações de Ordens de Serviço
 *
 * Fluxo de status:
 * DRAFT → APPROVED → SENT_TO_LAB → IN_PROGRESS → READY → DELIVERED
 * Qualquer status → CANCELED
 */
export class ServiceOrderService {

  /**
   * Gera número sequencial por empresa (dentro da transaction)
   */
  private async getNextNumber(companyId: string, tx: any): Promise<number> {
    const last = await tx.serviceOrder.findFirst({
      where: { companyId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return (last?.number || 0) + 1;
  }

  /**
   * Lista OS com paginação, busca e filtros
   */
  async list(query: ServiceOrderQuery, companyId: string) {
    const {
      search = "",
      page = 1,
      pageSize = 20,
      status = "ativos",
      customerId,
      orderStatus,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const where: Prisma.ServiceOrderWhereInput = {
      companyId,
      ...(status === "ativos" && { status: { not: "CANCELED" } }),
      ...(status === "inativos" && { status: "CANCELED" }),
      ...(customerId && { customerId }),
      ...(orderStatus && { status: orderStatus }),
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
    };

    if (search) {
      where.OR = [
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { cpf: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
      ];
    }

    const { skip, take } = getPaginationParams(page, pageSize);

    let orderBy: Prisma.ServiceOrderOrderByWithRelationInput = {};
    if (sortBy === "customer") {
      orderBy = { customer: { name: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const [data, total] = await Promise.all([
      prisma.serviceOrder.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          customer: {
            select: { id: true, name: true, cpf: true, phone: true },
          },
          laboratory: {
            select: { id: true, name: true },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
      prisma.serviceOrder.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);

    return { data, pagination };
  }

  /**
   * Busca OS por ID
   */
  async getById(id: string, companyId: string, includeInactive = false) {
    const order = await prisma.serviceOrder.findFirst({
      where: {
        id,
        companyId,
        ...(includeInactive ? {} : {}), // Sempre retorna, inclusive canceladas
      },
      include: {
        customer: true,
        items: {
          orderBy: { createdAt: "asc" },
        },
        branch: {
          select: { id: true, name: true },
        },
        laboratory: {
          select: { id: true, name: true },
        },
        createdByUser: {
          select: { id: true, name: true },
        },
        deliveredByUser: {
          select: { id: true, name: true },
        },
        history: {
          orderBy: { createdAt: "desc" },
          include: {
            changedByUser: {
              select: { id: true, name: true },
            },
          },
        },
        originalOrder: {
          select: { id: true, number: true, status: true },
        },
        reworkOrders: {
          select: { id: true, number: true, status: true, isWarranty: true, isRework: true, createdAt: true },
        },
      },
    });

    if (!order) {
      throw notFoundError("Ordem de serviço não encontrada");
    }

    return order;
  }

  /**
   * Cria nova OS
   */
  async create(data: CreateServiceOrderDTO, companyId: string, userId: string) {
    const { customerId, branchId, laboratoryId, items, expectedDate, prescription, notes } = data;

    if (!items || items.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Ordem de serviço deve ter pelo menos 1 item/serviço",
        400
      );
    }

    let prescriptionData: any = undefined;
    if (prescription) {
      try { prescriptionData = JSON.parse(prescription); } catch { /* string plain */ }
    }

    const order = await prisma.$transaction(async (tx) => {
      const number = await this.getNextNumber(companyId, tx);

      const newOrder = await tx.serviceOrder.create({
        data: {
          number,
          companyId,
          customerId,
          branchId,
          laboratoryId: laboratoryId || undefined,
          status: "DRAFT",
          promisedDate: expectedDate ? new Date(expectedDate) : undefined,
          createdByUserId: userId,
          notes: notes || undefined,
          prescriptionData: prescriptionData || undefined,
        },
      });

      for (const item of items) {
        let unitPrice = 0;
        if (item.productId) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { salePrice: true },
          });
          unitPrice = product ? Number(product.salePrice) : 0;
        }
        const qty = item.qty || 1;
        await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: newOrder.id,
            productId: item.productId || undefined,
            description: item.description,
            qty,
            unitPrice,
            discount: 0,
            lineTotal: unitPrice * qty,
          },
        });
      }

      // Registrar histórico
      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: newOrder.id,
          action: "CREATED",
          toStatus: "DRAFT",
          note: "OS criada",
          changedByUserId: userId,
        },
      });

      return newOrder;
    });

    return this.getById(order.id, companyId, true);
  }

  /**
   * Atualiza OS (dados, itens, receita, laboratório)
   */
  async update(id: string, data: UpdateServiceOrderDTO, companyId: string, userId?: string) {
    const existing = await this.getById(id, companyId, true);

    if (existing.status === "DELIVERED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não é possível atualizar OS já entregue",
        400
      );
    }

    const { laboratoryId, items, expectedDate, prescription, notes, labNotes, labOrderNumber } = data;

    let prescriptionData: any = undefined;
    let hasPrescription = false;
    if (prescription !== undefined) {
      hasPrescription = true;
      if (prescription) {
        try { prescriptionData = JSON.parse(prescription); } catch { /* string plain */ }
      }
    }

    await prisma.$transaction(async (tx) => {
      const updateData: any = {
        ...(laboratoryId !== undefined && { laboratoryId: laboratoryId || null }),
        ...(expectedDate && { promisedDate: new Date(expectedDate) }),
        ...(hasPrescription && { prescriptionData: prescriptionData || null }),
        ...(notes !== undefined && { notes }),
        ...(labNotes !== undefined && { labNotes }),
        ...(labOrderNumber !== undefined && { labOrderNumber }),
      };

      if (items && items.length > 0) {
        await tx.serviceOrderItem.deleteMany({ where: { serviceOrderId: id } });
        for (const item of items) {
          let unitPrice = 0;
          if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              select: { salePrice: true },
            });
            unitPrice = product ? Number(product.salePrice) : 0;
          }
          const qty = item.qty || 1;
          await tx.serviceOrderItem.create({
            data: {
              serviceOrderId: id,
              productId: item.productId || undefined,
              description: item.description,
              qty,
              unitPrice,
              discount: 0,
              lineTotal: unitPrice * qty,
            },
          });
        }
      }

      await tx.serviceOrder.update({ where: { id }, data: updateData });

      // Histórico
      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: id,
          action: "EDITED",
          toStatus: existing.status,
          note: "OS atualizada",
          changedByUserId: userId,
        },
      });
    });

    return this.getById(id, companyId, true);
  }

  /**
   * Muda status da OS com registros de data por etapa
   */
  async updateStatus(
    id: string,
    status: ServiceOrderStatus,
    companyId: string,
    userId: string,
    statusNotes?: string
  ) {
    const existing = await this.getById(id, companyId, true);

    if (existing.status === "DELIVERED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "OS já foi entregue. Use 'reverter' se necessário.",
        400
      );
    }
    if (existing.status === "CANCELED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "OS cancelada não pode mudar de status",
        400
      );
    }

    const updateData: any = { status };

    // Registrar timestamps por etapa
    if (status === "SENT_TO_LAB") updateData.sentToLabAt = new Date();
    if (status === "READY") updateData.readyAt = new Date();
    if (status === "DELIVERED") {
      updateData.deliveredAt = new Date();
      // Marcar como não atrasada se entregue
      updateData.isDelayed = false;
    }

    if (statusNotes) updateData.notes = statusNotes;

    await prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({ where: { id }, data: updateData });
      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: id,
          action: "STATUS_CHANGED",
          fromStatus: existing.status,
          toStatus: status,
          note: statusNotes,
          changedByUserId: userId,
        },
      });
    });

    return this.getById(id, companyId, true);
  }

  /**
   * Entrega com dados completos (rating, notas, quem entregou)
   */
  async deliver(
    id: string,
    companyId: string,
    userId: string,
    options?: {
      deliveryNotes?: string;
      qualityRating?: number;
      qualityNotes?: string;
    }
  ) {
    const existing = await this.getById(id, companyId, true);

    if (existing.status === "DELIVERED") {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, "OS já foi entregue", 400);
    }
    if (existing.status !== "READY") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "OS precisa estar 'Pronta' para ser entregue",
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: { id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          deliveredByUserId: userId,
          isDelayed: false,
          deliveryNotes: options?.deliveryNotes,
          qualityRating: options?.qualityRating,
          qualityNotes: options?.qualityNotes,
        },
      });
      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: id,
          action: "DELIVERED",
          fromStatus: existing.status,
          toStatus: "DELIVERED",
          note: options?.deliveryNotes,
          changedByUserId: userId,
          metadata: options?.qualityRating ? { qualityRating: options.qualityRating } : undefined,
        },
      });
    });

    return this.getById(id, companyId, true);
  }

  /**
   * Reverte status (requer permissão especial)
   */
  async revert(
    id: string,
    companyId: string,
    userId: string,
    targetStatus: ServiceOrderStatus,
    reason: string
  ) {
    const existing = await this.getById(id, companyId, true);

    if (!reason || reason.trim().length < 5) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Motivo da reversão é obrigatório (mínimo 5 caracteres)",
        400
      );
    }

    const revertibleFrom: Partial<Record<ServiceOrderStatus, ServiceOrderStatus[]>> = {
      DELIVERED: ["READY"],
      READY: ["IN_PROGRESS", "SENT_TO_LAB"],
      IN_PROGRESS: ["SENT_TO_LAB", "APPROVED", "DRAFT"],
      SENT_TO_LAB: ["APPROVED", "DRAFT"],
      APPROVED: ["DRAFT"],
    };

    const allowed = revertibleFrom[existing.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Não é possível reverter de '${existing.status}' para '${targetStatus}'`,
        400
      );
    }

    const clearData: any = {};
    if (existing.status === "DELIVERED") {
      clearData.deliveredAt = null;
      clearData.deliveredByUserId = null;
    }
    if (["DELIVERED", "READY"].includes(existing.status)) {
      clearData.readyAt = null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: { id },
        data: {
          status: targetStatus,
          ...clearData,
        },
      });
      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: id,
          action: "REVERTED",
          fromStatus: existing.status,
          toStatus: targetStatus,
          note: reason,
          changedByUserId: userId,
        },
      });
    });

    return this.getById(id, companyId, true);
  }

  /**
   * Cancela OS
   */
  async cancel(id: string, companyId: string, userId: string, reason?: string) {
    const existing = await this.getById(id, companyId, true);

    if (existing.status === "CANCELED") {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, "OS já está cancelada", 400);
    }
    if (existing.status === "DELIVERED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não é possível cancelar OS já entregue",
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: { id },
        data: {
          status: "CANCELED",
          canceledAt: new Date(),
          notes: reason ? `CANCELADA: ${reason}` : existing.notes,
        },
      });
      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: id,
          action: "CANCELED",
          fromStatus: existing.status,
          toStatus: "CANCELED",
          note: reason || "OS cancelada",
          changedByUserId: userId,
        },
      });
    });

    return this.getById(id, companyId, true);
  }

  /**
   * Cria OS de garantia ou retrabalho a partir de uma OS existente
   */
  async createWarranty(
    originalId: string,
    companyId: string,
    userId: string,
    branchId: string,
    options: {
      isWarranty: boolean;
      isRework: boolean;
      reason: string;
      copyData: boolean;
    }
  ) {
    const original = await this.getById(originalId, companyId, true);

    if (!["DELIVERED", "READY"].includes(original.status)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Só é possível criar garantia de OS já entregue ou pronta",
        400
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      const number = await this.getNextNumber(companyId, tx);

      const newOrder = await tx.serviceOrder.create({
        data: {
          number,
          companyId,
          customerId: original.customerId,
          branchId,
          laboratoryId: options.copyData ? original.laboratoryId : undefined,
          status: "DRAFT",
          promisedDate: undefined,
          createdByUserId: userId,
          notes: `${options.isWarranty ? "GARANTIA" : "RETRABALHO"}: ${options.reason}`,
          prescriptionData: options.copyData ? (original.prescriptionData as any) : undefined,
          isWarranty: options.isWarranty,
          isRework: options.isRework,
          warrantyReason: options.isWarranty ? options.reason : undefined,
          reworkReason: options.isRework ? options.reason : undefined,
          originalOrderId: originalId,
        },
      });

      // Copiar itens se solicitado
      if (options.copyData && original.items.length > 0) {
        for (const item of original.items) {
          await tx.serviceOrderItem.create({
            data: {
              serviceOrderId: newOrder.id,
              productId: item.productId || undefined,
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discount: 0,
              lineTotal: item.lineTotal,
            },
          });
        }
      }

      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: newOrder.id,
          action: "CREATED",
          toStatus: "DRAFT",
          note: `${options.isWarranty ? "Garantia" : "Retrabalho"} da OS #${original.number}: ${options.reason}`,
          changedByUserId: userId,
          metadata: { originalOrderId: originalId, originalNumber: original.number },
        },
      });

      return newOrder;
    });

    return this.getById(order.id, companyId, true);
  }

  /**
   * Marca OS atrasadas automaticamente (chamado por job)
   */
  async checkAndMarkDelayed(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const delayed = await prisma.serviceOrder.findMany({
      where: {
        companyId,
        promisedDate: { lt: today },
        status: { notIn: ["DELIVERED", "CANCELED"] },
        isDelayed: false,
      },
      select: { id: true, promisedDate: true },
    });

    for (const order of delayed) {
      const diffMs = today.getTime() - order.promisedDate!.getTime();
      const delayDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      await prisma.serviceOrder.update({
        where: { id: order.id },
        data: { isDelayed: true, delayDays },
      });
    }

    return delayed.length;
  }

  /**
   * Lista OS de um cliente
   */
  async getByCustomer(customerId: string, companyId: string) {
    return prisma.serviceOrder.findMany({
      where: { customerId, companyId },
      include: {
        items: { select: { id: true, description: true, qty: true } },
        laboratory: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Conta OS por status
   */
  async countByStatus(companyId: string) {
    const result = await prisma.serviceOrder.groupBy({
      by: ["status"],
      where: { companyId },
      _count: true,
    });

    const delayed = await prisma.serviceOrder.count({
      where: { companyId, isDelayed: true, status: { notIn: ["DELIVERED", "CANCELED"] } },
    });

    const counts = result.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    return { ...counts, DELAYED: delayed };
  }

  async countActive(companyId: string): Promise<number> {
    return prisma.serviceOrder.count({
      where: { companyId, status: { not: "CANCELED" } },
    });
  }
}

export const serviceOrderService = new ServiceOrderService();
