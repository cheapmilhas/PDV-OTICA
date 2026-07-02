import { prisma } from "@/lib/prisma";
import { ServiceOrderStatus, Prisma } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { dateOnlyToUTC } from "@/lib/date-utils";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { ServiceOrderQuery, CreateServiceOrderDTO, UpdateServiceOrderDTO } from "@/lib/validations/service-order.schema";
import { getNextSequence } from "@/lib/counter";
import { saleDisplayNumber } from "@/lib/sale-number";
import { resolveRootOrderId } from "@/lib/os-root";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "service-order" });

/**
 * H1: máquina de estados das transições PARA FRENTE de uma OS.
 *
 * O updateStatus antes aceitava QUALQUER transição (DRAFT→DELIVERED direto,
 * pulando aprovação/laboratório/pronto e sem deliveredByUserId). Aqui definimos
 * o que cada status pode virar. Reversões (voltar etapa) passam por revert(),
 * que tem sua própria tabela e exige motivo. CANCELED é permitido de quase
 * todo estado ativo. DELIVERED/CANCELED são terminais (avançam só via revert).
 *
 * Nem toda OS passa por SENT_TO_LAB (serviço interno sem laboratório), por isso
 * APPROVED e SENT_TO_LAB podem ir direto a IN_PROGRESS/READY. O que NÃO se
 * permite é saltar para READY/DELIVERED sem percorrer a cadeia de produção.
 */
const FORWARD_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  DRAFT: ["APPROVED"],
  APPROVED: ["SENT_TO_LAB", "IN_PROGRESS"],
  SENT_TO_LAB: ["IN_PROGRESS", "READY"],
  IN_PROGRESS: ["READY"],
  READY: ["DELIVERED"],
  DELIVERED: [], // terminal — usar revert()
  CANCELED: [], // terminal
};
// CANCELED NÃO entra no FORWARD: cancelar tem rota própria (cancel(), via
// DELETE com guard ADMIN/GERENTE) que escreve canceledAt + motivo e reverte
// efeitos colaterais. Permitir CANCELED por updateStatus pularia tudo isso e
// burlaria o guard de role.

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

    // Fila "Prontos pra avisar" (OS pronta parada): OS prontas, NÃO entregues,
    // que a ótica ainda NÃO avisou o cliente e não foram adiadas ("ocultar por
    // hoje"). "Avisado" = fonte canônica no WhatsappMessageLog type=OS_READY
    // (PENDING=na fila ou SENT=enviado) — não re-avisar manualmente o que a
    // automação já cobriu (evita mensagem duplicada no número compartilhado).
    // FAILED/SKIPPED NÃO contam como avisado → o manual cobre esses casos.
    // Subquery porque não há relação ServiceOrder↔WhatsappMessageLog modelada.
    let notifiedOsIds: string[] = [];
    if (status === "prontos_avisar") {
      const notifiedLogs = await prisma.whatsappMessageLog.findMany({
        where: { companyId, type: "OS_READY", status: { in: ["PENDING", "SENT"] }, referenceId: { not: null } },
        select: { referenceId: true },
      });
      notifiedOsIds = notifiedLogs.map((l) => l.referenceId!).filter(Boolean);
    }

    const where: Prisma.ServiceOrderWhereInput = {
      companyId,
      ...(branchId && { branchId }),
      ...(status === "ativos" && !filter && { status: { not: "CANCELED" } }),
      ...(status === "inativos" && !filter && { status: "CANCELED" }),
      // Prontos pra avisar: READY, não entregue, snooze expirado/ausente, não avisado.
      ...(status === "prontos_avisar" && {
        status: "READY",
        deliveredAt: null,
        readyAt: { not: null }, // sem data de "pronto" não dá pra priorizar por tempo
        OR: [{ notifySnoozedUntil: null }, { notifySnoozedUntil: { lt: now } }],
        ...(notifiedOsIds.length > 0 && { id: { notIn: notifiedOsIds } }),
      }),
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
    if (status === "prontos_avisar") {
      // Mais esquecido primeiro (pronto há mais tempo no topo da fila).
      orderBy = { readyAt: "asc" };
    } else if (sortBy === "customer") {
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
            // status p/ a fila "prontos pra avisar" sinalizar "pagamento pendente"
            // (não trafegamos total: seria o valor cheio, não o saldo em aberto).
            select: { id: true, status: true },
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
            // Campos para o histórico/timeline (prazo + motivo + datas).
            promisedDate: true, deliveredAt: true, isDelayed: true, delayDays: true,
            warrantyReason: true, reworkReason: true, medicalErrorReason: true,
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

    // Livro de Receitas: OS criada manualmente já com grau → espelhar.
    if (prescriptionData) {
      await this.mirrorPrescriptionToBook(order.id, companyId, prescriptionData, userId);
    }

    return this.getById(order.id, companyId, true);
  }

  /** Tipos de produto que caracterizam uma lente (GATILHO: só geram OS se houver lente). */
  static readonly LENS_PRODUCT_TYPES = ["OPHTHALMIC_LENS", "CONTACT_LENS", "LENS_SERVICE"];

  /**
   * Tipos de produto que ENTRAM na OS uma vez que ela é criada (CONTEÚDO).
   * Inclui as lentes (gatilho) + a armação: FRAME (armação de grau) e SUNGLASSES
   * (óculos de sol com grau, tratado como armação no sistema). O laboratório
   * precisa saber qual armação recebeu para não perder/trocar a peça do cliente.
   * Importante: FRAME/SUNGLASSES NÃO estão em LENS_PRODUCT_TYPES de propósito —
   * uma venda de armação avulsa (sem lente) continua NÃO gerando OS. Aqui só
   * enriquecemos o conteúdo de uma OS que já vai ser criada por causa da lente.
   */
  static readonly OS_INCLUDED_PRODUCT_TYPES = [...ServiceOrderService.LENS_PRODUCT_TYPES, "FRAME", "SUNGLASSES"];

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
        number: true,
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

    // GATILHO: só geramos OS se houver pelo menos uma lente na venda.
    const lensItems = sale.items.filter(
      (it) => it.product?.type && ServiceOrderService.LENS_PRODUCT_TYPES.includes(it.product.type)
    );

    if (lensItems.length === 0) {
      return { created: false, serviceOrderId: null, number: null };
    }

    // CONTEÚDO: uma vez que a OS vai ser criada, ela leva as lentes E a armação
    // (FRAME). Assim o laboratório vê qual armação foi enviada. Outros itens
    // (acessórios etc.) continuam de fora — decisão do dono.
    const osItems = sale.items.filter(
      (it) => it.product?.type && ServiceOrderService.OS_INCLUDED_PRODUCT_TYPES.includes(it.product.type)
    );

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
          notes: `Gerada automaticamente da venda ${saleDisplayNumber(sale)}`,
        },
      });

      for (const it of osItems) {
        const isArmacao = it.product?.type === "FRAME" || it.product?.type === "SUNGLASSES";
        await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: newOrder.id,
            productId: it.product?.id || undefined,
            description: it.description || it.product?.name || (isArmacao ? "Armação" : "Lente"),
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
          note: `OS gerada automaticamente da venda ${saleDisplayNumber(sale)}`,
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

    // Livro de Receitas: a receita pertence à VENDA (criada no fechamento da
    // venda, ANTES desta OS). Aqui a OS passa a APONTAR pra essa receita.
    // À prova de falha — não bloqueia a criação da OS.
    try {
      const rx = await prisma.prescription.findUnique({
        where: { saleId: sale.id },
        select: { id: true },
      });
      if (rx) {
        await prisma.serviceOrder.update({
          where: { id: order.id },
          data: { prescriptionId: rx.id },
        });
      }
    } catch (rxErr) {
      log.error("Falha ao vincular OS à receita do Livro (OS segue)", { serviceOrderId: order.id, err: String(rxErr) });
    }

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

    // Livro de Receitas: se o grau foi (re)digitado, espelhar na receita.
    if (hasPrescription && prescriptionData) {
      await this.mirrorPrescriptionToBook(id, companyId, prescriptionData, userId);
    }

    return this.getById(id, companyId, true);
  }

  /**
   * Espelha o grau digitado numa OS para a receita do Livro (relacional).
   * Resolve a receita por `saleId` (origem = venda) ou, se a OS não tem venda,
   * por `serviceOrderId`. À prova de falha — nunca quebra o save da OS.
   */
  private async mirrorPrescriptionToBook(
    serviceOrderId: string,
    companyId: string,
    prescriptionData: { od?: unknown; oe?: unknown; adicao?: unknown },
    userId?: string
  ) {
    try {
      const os = await prisma.serviceOrder.findUnique({
        where: { id: serviceOrderId },
        select: { customerId: true, branchId: true, sale: { select: { id: true } } },
      });
      if (!os) return;

      const saleId = os.sale?.id ?? null;
      // Resolve a receita-alvo: por venda (preferido) ou pela própria OS.
      const existing = saleId
        ? await prisma.prescription.findUnique({ where: { saleId }, select: { id: true } })
        : await prisma.prescription.findFirst({ where: { serviceOrderId, companyId }, select: { id: true } });

      const { upsertPrescription } = await import("./livro-receitas.service");
      await upsertPrescription({
        id: existing?.id ?? undefined,
        companyId,
        customerId: os.customerId,
        branchId: os.branchId,
        saleId: saleId ?? undefined,
        serviceOrderId: saleId ? undefined : serviceOrderId,
        createdByUserId: userId,
        od: (prescriptionData.od ?? undefined) as never,
        oe: (prescriptionData.oe ?? undefined) as never,
        adicao: (prescriptionData.adicao ?? undefined) as never,
      });
    } catch (err) {
      log.error("Falha ao espelhar grau da OS no Livro (OS segue)", { serviceOrderId, err: String(err) });
    }
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

    // H1: cancelamento NÃO passa por updateStatus — tem rota dedicada (cancel())
    // que escreve canceledAt + motivo, reverte efeitos colaterais e exige role
    // ADMIN/GERENTE. Aceitar CANCELED aqui pularia tudo isso + o guard de role.
    if (status === "CANCELED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Para cancelar a OS use a ação de cancelamento (exige autorização).",
        400
      );
    }

    // H1: valida a transição contra a máquina de estados. Sem isso, dava pra
    // pular etapas (DRAFT→DELIVERED) burlando produção e rastreabilidade.
    // No-op (mesmo status) é permitido p/ idempotência de clique repetido.
    if (status !== existing.status) {
      const allowed = FORWARD_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Transição inválida: '${existing.status}' → '${status}'. Avance pela ordem correta (ou use 'reverter' para voltar etapas).`,
          400
        );
      }
    }

    const updateData: any = { status };

    // Registrar timestamps por etapa
    if (status === "SENT_TO_LAB") updateData.sentToLabAt = new Date();
    if (status === "READY") updateData.readyAt = new Date();
    if (status === "DELIVERED") {
      updateData.deliveredAt = new Date();
      // H1: registra QUEM entregou (antes só deliver() registrava; via
      // updateStatus a entrega ficava sem responsável). Mantém auditoria.
      updateData.deliveredByUserId = userId;
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

    // Toda derivação aponta à OS-RAIZ (não ao pai imediato), p/ compartilharem
    // o número-base: #000015, #000015-RT, #000015-G. Criar garantia a partir de
    // um retrabalho herdaria o número do retrabalho se apontasse ao pai.
    const rootId = resolveRootOrderId(original);

    const order = await prisma.$transaction(async (tx) => {
      const number = await this.getNextNumber(companyId, tx);

      // Lock na OS-RAIZ para serializar criações concorrentes de derivação da
      // mesma família — sem isso, dois requests simultâneos contariam o mesmo
      // valor e gerariam #000015-G2 duplicado (count é SELECT, não bloqueia).
      await tx.$queryRaw`SELECT id FROM "ServiceOrder" WHERE id = ${rootId} FOR UPDATE`;

      // Sequência de exibição por (RAIZ + tipo): conta derivações do mesmo tipo
      // já existentes sob a raiz e soma 1. Protegido pelo FOR UPDATE acima.
      const sameTypeCount = await tx.serviceOrder.count({
        where: {
          originalOrderId: rootId,
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
          originalOrderId: rootId,
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
          // originalOrderId reflete o FK REAL gravado (a RAIZ); immediateParentId
          // preserva de qual OS a derivação foi criada (pai imediato, p/ trilha).
          metadata: { originalOrderId: rootId, immediateParentId: originalId, originalNumber: original.number, warrantySeq },
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

  /**
   * Contagem da fila "Prontos pra avisar" — mesma regra do filtro em list()
   * (READY, não entregue, snooze expirado, cliente ainda não avisado via
   * WhatsappMessageLog OS_READY). Isolado p/ o badge do botão poder buscar só
   * o número sem carregar a lista. Multi-tenant: companyId em todo filtro.
   */
  async countProntosAvisar(companyId: string, branchId?: string | null): Promise<number> {
    const notifiedLogs = await prisma.whatsappMessageLog.findMany({
      where: { companyId, type: "OS_READY", status: { in: ["PENDING", "SENT"] }, referenceId: { not: null } },
      select: { referenceId: true },
    });
    const notifiedOsIds = notifiedLogs.map((l) => l.referenceId!).filter(Boolean);
    return prisma.serviceOrder.count({
      where: {
        companyId,
        ...(branchId && { branchId }),
        status: "READY",
        deliveredAt: null,
        readyAt: { not: null },
        OR: [{ notifySnoozedUntil: null }, { notifySnoozedUntil: { lt: new Date() } }],
        ...(notifiedOsIds.length > 0 && { id: { notIn: notifiedOsIds } }),
      },
    });
  }

  /**
   * "Ocultar por hoje" na fila "Prontos pra avisar": adia a OS até amanhã 06h
   * (horário de Brasília). NÃO é status — a OS continua READY; só some da fila
   * até a data e reaparece se ainda não tiver sido avisada/entregue. Multi-tenant:
   * só adia OS da própria empresa (findFirst por companyId antes de escrever).
   */
  async snoozeNotify(id: string, companyId: string) {
    const os = await prisma.serviceOrder.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!os) throw notFoundError("Ordem de serviço não encontrada");

    // Amanhã 06:00 BRT (UTC-3) = 09:00 UTC. Base "agora" em UTC + avança pro
    // próximo dia às 09:00Z, garantindo que reapareça na manhã seguinte.
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 9, 0, 0));

    return prisma.serviceOrder.update({
      where: { id },
      data: { notifySnoozedUntil: tomorrow },
      select: { id: true, notifySnoozedUntil: true },
    });
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

    // OS de garantia/retrabalho/erro médico é correção gratuita — não gera venda.
    if (order.isWarranty || order.isRework || order.isMedicalError) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "OS de garantia/retrabalho/erro médico é uma correção gratuita e não gera venda.",
        400
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
