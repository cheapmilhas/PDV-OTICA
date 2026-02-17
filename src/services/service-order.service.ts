import { prisma } from "@/lib/prisma";
import { ServiceOrder, ServiceOrderStatus, Prisma } from "@prisma/client";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { ServiceOrderQuery, CreateServiceOrderDTO, UpdateServiceOrderDTO } from "@/lib/validations/service-order.schema";

/**
 * Service para operações de Ordens de Serviço
 *
 * Características:
 * - Multi-tenancy (companyId filter)
 * - Status-based filtering (CANCELED represents inactive)
 * - Status flow: DRAFT -> APPROVED -> SENT_TO_LAB -> IN_PROGRESS -> READY -> DELIVERED
 * - Não permite editar/deletar OS entregue
 */
export class ServiceOrderService {
  /**
   * Lista ordens de serviço com paginação, busca e filtros
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
    } else if (sortBy === "status") {
      orderBy = { status: sortOrder };
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
          items: {
            select: {
              id: true,
              description: true,
            },
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
   * Busca ordem de serviço por ID
   */
  async getById(id: string, companyId: string, includeInactive = false) {
    const order = await prisma.serviceOrder.findFirst({
      where: {
        id,
        companyId,
        ...(includeInactive ? {} : { status: { not: "CANCELED" } }),
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
      },
    });

    if (!order) {
      throw notFoundError("Ordem de serviço não encontrada");
    }

    return order;
  }

  /**
   * Cria nova ordem de serviço
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

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.serviceOrder.create({
        data: {
          companyId,
          customerId,
          branchId,
          laboratoryId: laboratoryId || undefined,
          status: "DRAFT",
          promisedDate: expectedDate ? new Date(expectedDate) : undefined,
          createdByUserId: userId,
        },
      });

      for (const item of items) {
        // Buscar preço do produto se productId for fornecido
        let unitPrice = 0;
        if (item.productId) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { salePrice: true },
          });
          unitPrice = product ? Number(product.salePrice) : 0;
        }

        const qty = item.qty || 1;
        const lineTotal = unitPrice * qty;

        await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: newOrder.id,
            productId: item.productId || undefined,
            description: item.description,
            qty,
            unitPrice,
            discount: 0,
            lineTotal,
          },
        });
      }

      return newOrder;
    });

    return this.getById(order.id, companyId);
  }

  /**
   * Atualiza ordem de serviço
   *
   * Não permite atualizar OS entregue
   */
  async update(id: string, data: UpdateServiceOrderDTO, companyId: string) {
    const existing = await this.getById(id, companyId);

    if (existing.status === "DELIVERED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não é possível atualizar ordem de serviço já entregue",
        400
      );
    }

    const { laboratoryId, items, expectedDate, prescription, notes } = data;

    const order = await prisma.$transaction(async (tx) => {
      let updateData: any = {
        ...(laboratoryId !== undefined && { laboratoryId: laboratoryId || null }),
        ...(expectedDate && { promisedDate: new Date(expectedDate) }),
        ...(prescription !== undefined && { prescription }),
        ...(notes !== undefined && { notes }),
      };

      if (items && items.length > 0) {
        await tx.serviceOrderItem.deleteMany({
          where: { serviceOrderId: id },
        });

        for (const item of items) {
          // Buscar preço do produto se productId for fornecido
          let unitPrice = 0;
          if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              select: { salePrice: true },
            });
            unitPrice = product ? Number(product.salePrice) : 0;
          }

          const qty = item.qty || 1;
          const lineTotal = unitPrice * qty;

          await tx.serviceOrderItem.create({
            data: {
              serviceOrderId: id,
              productId: item.productId || undefined,
              description: item.description,
              qty,
              unitPrice,
              discount: 0,
              lineTotal,
            },
          });
        }
      }

      return tx.serviceOrder.update({
        where: { id },
        data: updateData,
      });
    });

    return this.getById(id, companyId);
  }

  /**
   * Atualiza status da ordem de serviço
   *
   * Flow: DRAFT -> APPROVED -> SENT_TO_LAB -> IN_PROGRESS -> READY -> DELIVERED
   */
  async updateStatus(
    id: string,
    status: ServiceOrderStatus,
    companyId: string,
    statusNotes?: string
  ) {
    const existing = await this.getById(id, companyId);

    if (existing.status === "DELIVERED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Ordem de serviço já foi entregue",
        400
      );
    }

    const updateData: any = { status };

    if (status === "DELIVERED") {
      updateData.deliveredAt = new Date();
    }

    if (statusNotes) {
      updateData.notes = statusNotes;
    }

    await prisma.serviceOrder.update({
      where: { id },
      data: updateData,
    });

    return this.getById(id, companyId);
  }

  /**
   * Cancela ordem de serviço (soft delete)
   *
   * Não permite cancelar OS entregue
   */
  async cancel(id: string, companyId: string, reason?: string) {
    const existing = await this.getById(id, companyId);

    if (existing.status === "CANCELED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Ordem de serviço já está cancelada",
        400
      );
    }

    if (existing.status === "DELIVERED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não é possível cancelar ordem de serviço já entregue",
        400
      );
    }

    await prisma.serviceOrder.update({
      where: { id },
      data: {
        status: "CANCELED",
        notes: reason ? `CANCELADA: ${reason}` : "CANCELADA",
      },
    });

    return this.getById(id, companyId, true);
  }

  /**
   * Busca ordens de serviço de um cliente
   */
  async getByCustomer(customerId: string, companyId: string) {
    return prisma.serviceOrder.findMany({
      where: {
        customerId,
        companyId,
        status: { not: "CANCELED" },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Busca ordens de serviço pendentes
   */
  async getPending(companyId: string, branchId?: string) {
    return prisma.serviceOrder.findMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "APPROVED", "SENT_TO_LAB", "IN_PROGRESS"] },
        ...(branchId && { branchId }),
      },
      include: {
        customer: {
          select: { name: true, phone: true },
        },
        items: true,
      },
      orderBy: { promisedDate: "asc" },
    });
  }

  /**
   * Conta OS ativas
   */
  async countActive(companyId: string): Promise<number> {
    return prisma.serviceOrder.count({
      where: { companyId, status: { not: "CANCELED" } },
    });
  }

  /**
   * Conta OS por status
   */
  async countByStatus(companyId: string) {
    const result = await prisma.serviceOrder.groupBy({
      by: ["status"],
      where: { companyId, status: { not: "CANCELED" } },
      _count: true,
    });

    return result.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<ServiceOrderStatus, number>);
  }
}

export const serviceOrderService = new ServiceOrderService();
