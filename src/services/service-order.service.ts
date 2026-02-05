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
 * - Soft delete (active boolean)
 * - Status flow: PENDENTE -> EM_ANDAMENTO -> PRONTO -> ENTREGUE
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
      ...(status === "ativos" && { active: true }),
      ...(status === "inativos" && { active: false }),
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
              type: true,
              description: true,
              price: true,
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
        ...(includeInactive ? {} : { active: true }),
      },
      include: {
        customer: true,
        items: {
          orderBy: { createdAt: "asc" },
        },
        branch: {
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
  async create(data: CreateServiceOrderDTO, companyId: string) {
    const { customerId, branchId, items, expectedDate, prescription, notes } = data;

    if (!items || items.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Ordem de serviço deve ter pelo menos 1 item/serviço",
        400
      );
    }

    const total = items.reduce((sum, item) => sum + item.price, 0);

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.serviceOrder.create({
        data: {
          companyId,
          customerId,
          branchId,
          status: "PENDENTE",
          total,
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
          prescription,
          notes,
          active: true,
        },
      });

      for (const item of items) {
        await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: newOrder.id,
            type: item.type,
            description: item.description,
            price: item.price,
            observations: item.observations,
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

    if (existing.status === "ENTREGUE") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não é possível atualizar ordem de serviço já entregue",
        400
      );
    }

    const { items, expectedDate, prescription, notes } = data;

    const order = await prisma.$transaction(async (tx) => {
      let updateData: any = {
        ...(expectedDate && { expectedDate: new Date(expectedDate) }),
        ...(prescription !== undefined && { prescription }),
        ...(notes !== undefined && { notes }),
      };

      if (items && items.length > 0) {
        const total = items.reduce((sum, item) => sum + item.price, 0);
        updateData.total = total;

        await tx.serviceOrderItem.deleteMany({
          where: { serviceOrderId: id },
        });

        for (const item of items) {
          await tx.serviceOrderItem.create({
            data: {
              serviceOrderId: id,
              type: item.type,
              description: item.description,
              price: item.price,
              observations: item.observations,
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
   * Flow: PENDENTE -> EM_ANDAMENTO -> PRONTO -> ENTREGUE
   */
  async updateStatus(
    id: string,
    status: ServiceOrderStatus,
    companyId: string,
    statusNotes?: string
  ) {
    const existing = await this.getById(id, companyId);

    if (existing.status === "ENTREGUE") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Ordem de serviço já foi entregue",
        400
      );
    }

    const updateData: any = { status };

    if (status === "ENTREGUE") {
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

    if (!existing.active) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Ordem de serviço já está cancelada",
        400
      );
    }

    if (existing.status === "ENTREGUE") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não é possível cancelar ordem de serviço já entregue",
        400
      );
    }

    await prisma.serviceOrder.update({
      where: { id },
      data: {
        active: false,
        status: "PENDENTE",
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
        active: true,
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
        active: true,
        status: { in: ["PENDENTE", "EM_ANDAMENTO"] },
        ...(branchId && { branchId }),
      },
      include: {
        customer: {
          select: { name: true, phone: true },
        },
        items: true,
      },
      orderBy: { expectedDate: "asc" },
    });
  }

  /**
   * Conta OS ativas
   */
  async countActive(companyId: string): Promise<number> {
    return prisma.serviceOrder.count({
      where: { companyId, active: true },
    });
  }

  /**
   * Conta OS por status
   */
  async countByStatus(companyId: string) {
    const result = await prisma.serviceOrder.groupBy({
      by: ["status"],
      where: { companyId, active: true },
      _count: true,
    });

    return result.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<ServiceOrderStatus, number>);
  }
}

export const serviceOrderService = new ServiceOrderService();
