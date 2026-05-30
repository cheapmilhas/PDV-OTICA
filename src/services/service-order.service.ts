import { prisma } from "@/lib/prisma";
import { ServiceOrderStatus, Prisma } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { dateOnlyToUTC } from "@/lib/date-utils";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { ServiceOrderQuery, CreateServiceOrderDTO, UpdateServiceOrderDTO } from "@/lib/validations/service-order.schema";
import { getNextSequence } from "@/lib/counter";

/**
 * Service para operações de Ordens de Serviço
 *
 * Fluxo de status:
 * DRAFT → APPROVED → SENT_TO_LAB → IN_PROGRESS → READY → DELIVERED
 * Qualquer status → CANCELED
 */
export class ServiceOrderService {

  /**
   * Gera número sequencial atômico via tabela Counter (race condition safe)
   */
  private async getNextNumber(companyId: string, tx: any): Promise<number> {
    return getNextSequence(companyId, "service_order", tx);
  }

  /**
   * Lista OS com paginação, busca e filtros
   */
  async list(query: ServiceOrderQuery, companyId: string, branchId?: string | null) {
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
      filter,
    } = query;

    const now = new Date();

    const where: Prisma.ServiceOrderWhereInput = {
      companyId,
      ...(branchId && { branchId }),
      ...(status === "ativos" && !filter && { status: { not: "CANCELED" } }),
      ...(status === "inativos" && !filter && { status: "CANCELED" }),
      ...(customerId && { customerId }),
      ...(orderStatus && { status: orderStatus }),
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
      // Filtros especiais de prazo
      ...(filter === "atrasadas" && {
        status: { notIn: ["DELIVERED", "CANCELED"] },
        OR: [
          { promisedDate: { lt: now } },
          { isDelayed: true },
        ],
      }),
      ...(filter === "vencendo" && {
        promisedDate: { gte: now, lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["DELIVERED", "CANCELED"] },
      }),
    };

    if (search) {
      const searchConditions = [
        { customer: { name: { contains: search, mode: "insensitive" as const } } },
        { customer: { cpf: { contains: search, mode: "insensitive" as const } } },
        { customer: { phone: { contains: search, mode: "insensitive" as const } } },
      ];
      // Se já tem OR (filtro de atrasadas), combina com AND
      if (where.OR) {
        where.AND = [{ OR: where.OR as any }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
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
          branch: {
            select: { id: true, name: true },
          },
          customer: {
            select: { id: true, name: true, cpf: true, phone: true },
          },
          laboratory: {
            select: { id: true, name: true },
          },
          sale: {
            select: { id: true },
          },
          originalOrder: {
            select: { number: true },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
      prisma.serviceOrder.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);

    // Flag computado para a UI sinalizar "Sem receita" sem trafegar o JSON
    // inteiro de prescrição na listagem (pode ser grande). Substituímos
    // prescriptionData pelo booleano hasPrescription.
    const dataWithFlags = data.map((o) => {
      const { prescriptionData, ...rest } = o;
      return {
        ...rest,
        hasPrescription: !!prescriptionData || !!o.prescriptionImageUrl,
      };
    });

    return { data: dataWithFlags, pagination };
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
        sale: {
          select: { id: true },
        },
        originalOrder: {
          select: { id: true, number: true, status: true },
        },
        reworkOrders: {
          select: {
            id: true, number: true, status: true,
            isWarranty: true, isRework: true, isMedicalError: true,
            warrantySeq: true, createdAt: true,
            originalOrder: { select: { number: true } },
          },
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
    const { customerId, branchId, laboratoryId, items, expectedDate, prescription, prescriptionImageUrl, lensType, lensDescription, lensColoring, treatments, notes } = data;

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
          // Usa dateOnlyToUTC para garantir que "23/03" em SP não vire "22/03" no banco
          promisedDate: expectedDate ? dateOnlyToUTC(expectedDate) : undefined,
          createdByUserId: userId,
          notes: notes || undefined,
          prescriptionData: prescriptionData || undefined,
          prescriptionImageUrl: prescriptionImageUrl || undefined,
          lensType: lensType || undefined,
          lensDescription: lensDescription || undefined,
          lensColoring: lensColoring || undefined,
          treatments: treatments || [],
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
        // Concatenar observações na descrição (schema não tem campo observations)
        const fullDescription = item.observations
          ? `${item.description} | Obs: ${item.observations}`
          : item.description;

        await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: newOrder.id,
            productId: item.productId || undefined,
            description: fullDescription,
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
    }, { timeout: 30_000 });

    return this.getById(order.id, companyId, true);
  }

  /** Tipos de produto que caracterizam uma lente (geram OS). */
  static readonly LENS_PRODUCT_TYPES = ["OPHTHALMIC_LENS", "CONTACT_LENS", "LENS_SERVICE"];

  /**
   * Cria uma OS a partir de uma venda já existente (fluxo Venda → OS).
   *
   * - Só cria se a venda tiver ao menos 1 item de lente e um cliente vinculado.
   * - Idempotente: se a venda já tem serviceOrderId, retorna a OS existente.
   * - A OS NÃO carrega valores (unitPrice 0) — o laboratório não usa preço.
   * - Status DRAFT, pendente de receita + impressão.
   * - Vincula Sale.serviceOrderId.
   *
   * Deve ser chamado PÓS-COMMIT da venda (nunca dentro da transação da venda),
   * em try/catch que não reverte a venda.
   */
  async createFromSale(
    saleId: string,
    companyId: string,
    userId: string
  ): Promise<{ created: boolean; serviceOrderId: string | null; number: number | null }> {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId },
      select: {
        id: true,
        customerId: true,
        branchId: true,
        serviceOrderId: true,
        items: {
          select: {
            qty: true,
            description: true,
            product: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    if (!sale) {
      throw notFoundError("Venda não encontrada");
    }

    // Idempotência: já tem OS vinculada.
    if (sale.serviceOrderId) {
      const existing = await prisma.serviceOrder.findUnique({
        where: { id: sale.serviceOrderId },
        select: { id: true, number: true },
      });
      return { created: false, serviceOrderId: existing?.id ?? sale.serviceOrderId, number: existing?.number ?? null };
    }

    // Filtra itens de lente.
    const lensItems = sale.items.filter(
      (it) => it.product?.type && ServiceOrderService.LENS_PRODUCT_TYPES.includes(it.product.type)
    );

    if (lensItems.length === 0) {
      return { created: false, serviceOrderId: null, number: null };
    }

    if (!sale.customerId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Venda com lente exige um cliente vinculado para gerar a Ordem de Serviço.",
        400
      );
    }

    const customerId = sale.customerId;
    const branchId = sale.branchId;

    try {
    const order = await prisma.$transaction(async (tx) => {
      const number = await this.getNextNumber(companyId, tx);

      const newOrder = await tx.serviceOrder.create({
        data: {
          number,
          companyId,
          customerId,
          branchId,
          status: "DRAFT",
          createdByUserId: userId,
          notes: `Gerada automaticamente da venda #${sale.id.substring(0, 8)}`,
        },
      });

      for (const it of lensItems) {
        await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: newOrder.id,
            productId: it.product?.id || undefined,
            description: it.description || it.product?.name || "Lente",
            qty: it.qty,
            unitPrice: 0, // OS não carrega valores — laboratório não usa preço.
            discount: 0,
            lineTotal: 0,
          },
        });
      }

      await tx.serviceOrderHistory.create({
        data: {
          serviceOrderId: newOrder.id,
          action: "CREATED",
          toStatus: "DRAFT",
          note: `OS gerada automaticamente da venda #${sale.id.substring(0, 8)}`,
          changedByUserId: userId,
        },
      });

      // Vincula a venda à OS (FK fica na Sale, @unique).
      await tx.sale.update({
        where: { id: sale.id },
        data: { serviceOrderId: newOrder.id },
      });

      return newOrder;
    }, { timeout: 30_000 });

    return { created: true, serviceOrderId: order.id, number: order.number };
    } catch (err) {
      // Race: a auto-criação (pós-venda) e o clique manual "Gerar OS" podem
      // passar pela checagem de idempotência ao mesmo tempo. O @unique em
      // Sale.serviceOrderId garante que só uma vença; a outra recebe P2002.
      // Nesse caso, devolvemos a OS já criada como resultado idempotente.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const refreshed = await prisma.sale.findUnique({
          where: { id: saleId },
          select: { serviceOrder: { select: { id: true, number: true } } },
        });
        return {
          created: false,
          serviceOrderId: refreshed?.serviceOrder?.id ?? null,
          number: refreshed?.serviceOrder?.number ?? null,
        };
      }
      throw err;
    }
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

    const { laboratoryId, items, expectedDate, prescription, prescriptionImageUrl, lensType, lensDescription, lensColoring, treatments, notes, labNotes, labOrderNumber } = data;

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
        ...(expectedDate && { promisedDate: dateOnlyToUTC(expectedDate) }),
        ...(hasPrescription && { prescriptionData: prescriptionData || null }),
        ...(prescriptionImageUrl !== undefined && { prescriptionImageUrl: prescriptionImageUrl || null }),
        ...(lensType !== undefined && { lensType: lensType || null }),
        ...(lensDescription !== undefined && { lensDescription: lensDescription || null }),
        ...(lensColoring !== undefined && { lensColoring: lensColoring || null }),
        ...(treatments !== undefined && { treatments }),
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
          const fullDescription = item.observations
            ? `${item.description} | Obs: ${item.observations}`
            : item.description;

          await tx.serviceOrderItem.create({
            data: {
              serviceOrderId: id,
              productId: item.productId || undefined,
              description: fullDescription,
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
    }, { timeout: 30_000 });

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
    }, { timeout: 30_000 });

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
    }, { timeout: 30_000 });

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
    }, { timeout: 30_000 });

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
    }, { timeout: 30_000 });

    return this.getById(id, companyId, true);
  }

  /**
   * Cria OS de garantia, retrabalho ou erro médico a partir de uma OS existente.
   *
   * O `number` interno continua sequencial/único (não viola @@unique). A camada
   * de exibição usa o número da OS ORIGINAL + letra + sequência:
   *   garantia -> #1234-G1, #1234-G2;  retrabalho -> #1234-RT1;  erro médico -> #1234-M1.
   * `warrantySeq` é calculado contando os filhos do mesmo tipo da OS original.
   *
   * Aceita `type` ("warranty" | "rework" | "medical_error"). Os booleanos
   * isWarranty/isRework/isMedicalError são derivados de `type` (mantidos por
   * compatibilidade com a UI existente).
   */
  async createWarranty(
    originalId: string,
    companyId: string,
    userId: string,
    branchId: string,
    options: {
      type: "warranty" | "rework" | "medical_error";
      reason: string;
      copyData: boolean;
    }
  ) {
    const original = await this.getById(originalId, companyId, true);

    if (!["DELIVERED", "READY"].includes(original.status)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Só é possível criar garantia/retrabalho de OS já entregue ou pronta",
        400
      );
    }

    const isWarranty = options.type === "warranty";
    const isRework = options.type === "rework";
    const isMedicalError = options.type === "medical_error";
    const tipoLabel = isMedicalError ? "ERRO MÉDICO" : isRework ? "RETRABALHO" : "GARANTIA";

    const order = await prisma.$transaction(async (tx) => {
      const number = await this.getNextNumber(companyId, tx);

      // Lock na OS original para serializar criações concorrentes de garantia
      // da mesma OS — sem isso, dois requests simultâneos contariam o mesmo
      // valor e gerariam #1234-G1 duplicado (count é SELECT, não bloqueia).
      await tx.$queryRaw`SELECT id FROM "ServiceOrder" WHERE id = ${originalId} FOR UPDATE`;

      // Sequência de exibição por (original + tipo): conta filhos do mesmo
      // tipo já existentes e soma 1. Protegido pelo FOR UPDATE acima.
      const sameTypeCount = await tx.serviceOrder.count({
        where: {
          originalOrderId: originalId,
          ...(isMedicalError
            ? { isMedicalError: true }
            : isRework
            ? { isRework: true }
            : { isWarranty: true }),
        },
      });
      const warrantySeq = sameTypeCount + 1;

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
          notes: `${tipoLabel}: ${options.reason}`,
          prescriptionData: options.copyData ? (original.prescriptionData as any) : undefined,
          isWarranty,
          isRework,
          isMedicalError,
          warrantyReason: isWarranty ? options.reason : undefined,
          reworkReason: isRework ? options.reason : undefined,
          medicalErrorReason: isMedicalError ? options.reason : undefined,
          warrantySeq,
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
          note: `${tipoLabel} da OS #${original.number}: ${options.reason}`,
          changedByUserId: userId,
          metadata: { originalOrderId: originalId, originalNumber: original.number, warrantySeq },
        },
      });

      return newOrder;
    }, { timeout: 30_000 });

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

    // Agrupa por delayDays e roda 1 updateMany por bucket (substitui N+1)
    const byDelayDays = new Map<number, string[]>();
    for (const order of delayed) {
      const days = differenceInCalendarDays(today, order.promisedDate!);
      const arr = byDelayDays.get(days) ?? [];
      arr.push(order.id);
      byDelayDays.set(days, arr);
    }

    await Promise.all(
      Array.from(byDelayDays.entries()).map(([delayDays, ids]) =>
        prisma.serviceOrder.updateMany({
          where: { id: { in: ids } },
          data: { isDelayed: true, delayDays },
        }),
      ),
    );

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

  /**
   * Valida que a OS pode ser convertida em venda.
   * Retorna dados da OS com itens e produto para popular o PDV.
   */
  async validateForSale(serviceOrderId: string, companyId: string) {
    const order = await prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, companyId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                salePrice: true,
                stockQty: true,
                stockControlled: true,
              },
            },
          },
        },
        customer: { select: { id: true, name: true, cpf: true, phone: true } },
        sale: { select: { id: true } },
      },
    });

    if (!order) {
      throw notFoundError("Ordem de serviço não encontrada");
    }

    if (!["READY", "DELIVERED"].includes(order.status)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `OS deve estar "Pronta" ou "Entregue" para gerar venda. Status atual: ${order.status}`,
        400
      );
    }

    if (order.sale) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Esta OS já possui uma venda vinculada",
        409
      );
    }

    if (order.items.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "OS não possui itens/serviços para gerar venda",
        400
      );
    }

    return order;
  }
}

export const serviceOrderService = new ServiceOrderService();
