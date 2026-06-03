import { prisma } from "@/lib/prisma";
import { CustomerSegment, ContactResult, CrmReminderStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { notFoundError } from "@/lib/error-handler";
import { classifyCustomerSegments, TIME_BASED_SEGMENTS } from "@/lib/crm-segments";

const log = logger.child({ service: "crm" });

// ============================================
// GERAÇÃO DE LEMBRETES
// ============================================

export async function generateReminders(companyId: string) {
  const settings = await getOrCreateSettings(companyId);
  const today = new Date();

  // Buscar todos os clientes com suas últimas compras
  const customers = await prisma.customer.findMany({
    where: { companyId, active: true },
    include: {
      sales: {
        // H16: só vendas COMPLETED contam para CRM. Antes era `not CANCELED`,
        // que deixava passar REFUNDED (devolvida) e OPEN — inflando última
        // compra e totalSpent (cliente que devolveu tudo virava VIP). REFUNDED
        // não é receita realizada; OPEN não é venda fechada.
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  // Buscar totais de vendas por cliente em uma única query (evita N+1)
  const customerIds = customers.map((c) => c.id);
  const saleTotals = await prisma.sale.groupBy({
    by: ["customerId"],
    where: {
      customerId: { in: customerIds },
      // H16: mesma regra — só COMPLETED soma no total gasto / contagem.
      status: "COMPLETED",
    },
    _count: { _all: true },
    _sum: { total: true },
  });

  const saleTotalsMap = new Map(
    saleTotals.map((s) => [
      s.customerId,
      { count: s._count._all, total: Number(s._sum.total || 0) },
    ])
  );

  // Cashback agregado por cliente (soma branches). Q6.2.
  const cashbacks = await prisma.customerCashback.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customerIds } },
    _sum: { balance: true },
  });
  const cashbackMap = new Map(
    cashbacks.map((c) => [c.customerId, Number(c._sum.balance || 0)]),
  );

  const reminders: any[] = [];
  // Clientes em mês de aniversário neste ciclo: seus lembretes ativos de
  // pós-venda/inatividade precisam ser CANCELADOS para liberar o índice único
  // parcial (companyId,customerId,segment WHERE status ativo). Sem isso, o
  // POST_SALE antigo ficaria PENDING preso e o skipDuplicates impediria o
  // cliente de voltar à aba Pós-Venda quando o mês de aniversário passasse.
  const birthdayCustomerIds: string[] = [];

  for (const customer of customers) {
    const lastSale = customer.sales[0];
    const lastSaleDate = lastSale?.createdAt;
    const daysSinceLastPurchase = lastSaleDate
      ? Math.floor((today.getTime() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const customerSaleTotals = saleTotalsMap.get(customer.id);
    const totalPurchases = customerSaleTotals?.count ?? 0;
    const totalSpent = customerSaleTotals?.total ?? 0;

    const cashbackBalance = cashbackMap.get(customer.id) ?? 0;

    // Dados comuns
    const baseData = {
      companyId,
      customerId: customer.id,
      lastPurchaseDate: lastSaleDate,
      lastPurchaseAmount: lastSale?.total,
      lastPurchaseProduct: lastSale?.items[0]?.product?.name,
      daysSinceLastPurchase,
      totalPurchases,
      totalSpent,
      cashbackBalance,
      status: "PENDING" as CrmReminderStatus,
      generatedAt: today,
    };

    // Aniversário tem PRIORIDADE: no mês de aniversário, o cliente recebe só
    // BIRTHDAY (+VIP); os segmentos de pós-venda/inatividade são pulados.
    // Antes BIRTHDAY/VIP eram `if` solto e a inatividade `else if` interno —
    // então um aniversariante 30-90d sem comprar caía em BIRTHDAY *e*
    // POST_SALE_30_DAYS, aparecendo nas duas abas (bug). A regra de exclusão
    // vive em classifyCustomerSegments (pura/testada).
    const isBirthdayMonth = customer.birthDate
      ? new Date(customer.birthDate).getMonth() === today.getMonth()
      : false;
    if (isBirthdayMonth) birthdayCustomerIds.push(customer.id);

    const assignments = classifyCustomerSegments(
      {
        isBirthdayMonth,
        daysSinceLastPurchase,
        totalPurchases,
        totalSpent: Number(totalSpent),
      },
      {
        postSaleDays2: settings.postSaleDays2,
        postSaleDays3: settings.postSaleDays3,
        inactiveDays6Months: settings.inactiveDays6Months,
        inactiveDays1Year: settings.inactiveDays1Year,
        inactiveDays2Years: settings.inactiveDays2Years,
        inactiveDays3Years: settings.inactiveDays3Years,
        vipMinPurchases: settings.vipMinPurchases,
        vipMinTotalSpent: Number(settings.vipMinTotalSpent),
      }
    );

    for (const { segment, priority } of assignments) {
      reminders.push({
        ...baseData,
        segment,
        priority,
        // BIRTHDAY expira no fim do mês corrente; demais sem expiração.
        ...(segment === "BIRTHDAY"
          ? { expiresAt: new Date(today.getFullYear(), today.getMonth() + 1, 0) }
          : {}),
      });
    }
  }

  // Aniversário tem prioridade: cancela os lembretes ATIVOS de pós-venda/
  // inatividade dos aniversariantes deste ciclo. Libera o índice único parcial
  // para que (a) eles não apareçam na aba Pós-Venda durante o mês e (b) quando
  // o mês passar, o POST_SALE possa ser recriado (sem registro ativo travando
  // o skipDuplicates). VIP e BIRTHDAY não são tocados.
  if (birthdayCustomerIds.length > 0) {
    await prisma.customerReminder.updateMany({
      where: {
        companyId,
        customerId: { in: birthdayCustomerIds },
        segment: { in: [...TIME_BASED_SEGMENTS] },
        status: { in: ["PENDING", "IN_PROGRESS", "SCHEDULED"] },
      },
      data: { status: "CANCELLED" },
    });
  }

  // M8: era N+1 (findFirst + create por lembrete) — com milhares de lembretes
  // virava ~2N queries seriais e dava timeout. Agora: 1 query busca os ativos
  // existentes, monta um Set de chaves (customerId|segment), filtra os novos e
  // insere em LOTE (createMany). generateReminders roda p/ um único companyId,
  // então a chave de dedup é (customerId, segment).
  const existing = await prisma.customerReminder.findMany({
    where: {
      companyId,
      status: { in: ["PENDING", "IN_PROGRESS", "SCHEDULED"] },
    },
    select: { customerId: true, segment: true },
  });
  const seen = new Set(existing.map((e) => `${e.customerId}|${e.segment}`));

  // Dedup interno também (o array pode ter o mesmo customer+segment 2x).
  const toCreate: any[] = [];
  for (const reminder of reminders) {
    const key = `${reminder.customerId}|${reminder.segment}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toCreate.push(reminder);
  }

  let created = 0;
  if (toCreate.length > 0) {
    try {
      const result = await prisma.customerReminder.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      created = result.count;
    } catch (error) {
      log.error("Erro ao criar lembretes em lote", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { generated: created, total: reminders.length };
}

// ============================================
// BUSCAR LEMBRETES
// ============================================

export async function getReminders(
  companyId: string,
  filters: {
    segment?: CustomerSegment;
    status?: CrmReminderStatus;
    assignedToId?: string;
    customerId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const { segment, status, assignedToId, customerId, search, page = 1, pageSize = 20 } = filters;

  const where: any = {
    companyId,
    ...(segment && { segment }),
    // Sem status específico, mostrar apenas lembretes ATIVOS. Antes a lista
    // exibia também CANCELLED/COMPLETED — por isso um lembrete de venda
    // cancelada continuava aparecendo mesmo já marcado CANCELLED (a escrita
    // estava correta; a leitura é que não filtrava). Os badges de contagem
    // (getSegmentCounts) já filtram PENDING, daí a inconsistência observada.
    ...(status
      ? { status }
      : { status: { in: ["PENDING", "IN_PROGRESS", "SCHEDULED"] } }),
    ...(assignedToId && { assignedToId }),
    ...(customerId && { customerId }),
    ...(search && {
      customer: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      },
    }),
  };

  const [reminders, total] = await Promise.all([
    prisma.customerReminder.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            birthDate: true,
          },
        },
        contacts: {
          orderBy: { contactedAt: "desc" },
          take: 1,
          include: {
            contactedBy: {
              select: { name: true },
            },
          },
        },
        assignedTo: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ priority: "desc" }, { generatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customerReminder.count({ where }),
  ]);

  return {
    data: reminders,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ============================================
// CONTAGEM POR SEGMENTO
// ============================================

export async function getSegmentCounts(companyId: string) {
  const counts = await prisma.customerReminder.groupBy({
    by: ["segment"],
    where: {
      companyId,
      status: "PENDING",
    },
    _count: true,
  });

  return counts.reduce(
    (acc, item) => {
      acc[item.segment] = item._count;
      return acc;
    },
    {} as Record<string, number>
  );
}

// ============================================
// LISTAR CONTATOS POR CLIENTE
// ============================================

export async function getContactsByCustomer(
  companyId: string,
  customerId: string,
  limit = 50
) {
  return prisma.crmContact.findMany({
    where: { companyId, customerId },
    include: {
      contactedBy: { select: { name: true } },
    },
    orderBy: { contactedAt: "desc" },
    take: limit,
  });
}

// ============================================
// REGISTRAR CONTATO
// ============================================

export async function registerContact(data: {
  companyId: string;
  customerId: string;
  reminderId?: string;
  contactedById: string;
  channel: string;
  segment: CustomerSegment;
  result: ContactResult;
  notes?: string;
  scheduleFollowUp?: boolean;
  followUpDate?: Date;
  followUpNotes?: string;
  saleId?: string;
  saleAmount?: number;
}) {
  // E2 (Grupo E): validar que o cliente pertence à empresa do chamador antes
  // de criar o contato — sem isto, era possível registrar contato com
  // customerId/reminderId de OUTRA empresa (write leak multi-tenant).
  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, companyId: data.companyId },
    select: { id: true },
  });
  if (!customer) {
    throw notFoundError("Cliente não encontrado");
  }

  // Se há reminderId, ele também precisa ser da mesma empresa.
  if (data.reminderId) {
    const reminder = await prisma.customerReminder.findFirst({
      where: { id: data.reminderId, companyId: data.companyId },
      select: { id: true },
    });
    if (!reminder) {
      throw notFoundError("Lembrete não encontrado");
    }
  }

  const contact = await prisma.crmContact.create({
    data: {
      companyId: data.companyId,
      customerId: data.customerId,
      reminderId: data.reminderId,
      contactedById: data.contactedById,
      channel: data.channel,
      segment: data.segment,
      result: data.result,
      notes: data.notes,
      scheduleFollowUp: data.scheduleFollowUp || false,
      followUpDate: data.followUpDate,
      followUpNotes: data.followUpNotes,
      resultedInSale: data.result === "CAME_BACK_PURCHASED",
      saleId: data.saleId,
      saleAmount: data.saleAmount,
    },
  });

  // Atualizar status do lembrete — scoped por companyId (updateMany não
  // atravessa tenant; mesmo que o id existisse noutra empresa, count=0).
  if (data.reminderId) {
    await prisma.customerReminder.updateMany({
      where: { id: data.reminderId, companyId: data.companyId },
      data: {
        status: data.scheduleFollowUp ? "SCHEDULED" : "COMPLETED",
        scheduledFor: data.followUpDate,
      },
    });
  }

  return contact;
}

// ============================================
// TEMPLATES
// ============================================

export async function getTemplates(companyId: string) {
  return prisma.messageTemplate.findMany({
    where: { companyId },
    orderBy: { segment: "asc" },
  });
}

export async function upsertTemplate(data: {
  companyId: string;
  segment: CustomerSegment;
  name: string;
  message: string;
  channel?: string;
  isActive?: boolean;
  createdById: string;
}) {
  return prisma.messageTemplate.upsert({
    where: {
      companyId_segment: {
        companyId: data.companyId,
        segment: data.segment,
      },
    },
    create: {
      companyId: data.companyId,
      segment: data.segment,
      name: data.name,
      message: data.message,
      channel: data.channel || "whatsapp",
      isActive: data.isActive ?? true,
      createdById: data.createdById,
    },
    update: {
      name: data.name,
      message: data.message,
      channel: data.channel,
      isActive: data.isActive,
    },
  });
}

// ============================================
// PROCESSAR TEMPLATE COM VARIÁVEIS
// ============================================

export function processTemplate(
  template: string,
  customer: {
    name: string;
    birthDate?: Date | null;
  },
  data: {
    lastPurchaseDate?: Date | null;
    daysSinceLastPurchase?: number | null;
    cashbackBalance?: number;
    lastPurchaseProduct?: string | null;
    lastPurchaseAmount?: number | null;
  }
): string {
  const firstName = customer.name.split(" ")[0];

  return template
    .replace(/\{\{nome\}\}/g, customer.name)
    .replace(/\{\{primeiro_nome\}\}/g, firstName)
    .replace(
      /\{\{ultima_compra\}\}/g,
      data.lastPurchaseDate ? data.lastPurchaseDate.toLocaleDateString("pt-BR") : "N/A"
    )
    .replace(/\{\{dias_sem_comprar\}\}/g, String(data.daysSinceLastPurchase || 0))
    .replace(
      /\{\{valor_cashback\}\}/g,
      (data.cashbackBalance || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    )
    .replace(/\{\{produto_comprado\}\}/g, data.lastPurchaseProduct || "")
    .replace(
      /\{\{valor_ultima_compra\}\}/g,
      (data.lastPurchaseAmount || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })
    )
    .replace(
      /\{\{data_aniversario\}\}/g,
      customer.birthDate ? customer.birthDate.toLocaleDateString("pt-BR") : ""
    );
}

// ============================================
// METAS
// ============================================

export async function getGoalProgress(companyId: string, userId?: string) {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [dailyCount, weeklyCount, monthlyCount, settings] = await Promise.all([
    // Contatos hoje
    prisma.crmContact.count({
      where: {
        companyId,
        ...(userId && { contactedById: userId }),
        contactedAt: { gte: startOfDay },
      },
    }),
    // Contatos esta semana
    prisma.crmContact.count({
      where: {
        companyId,
        ...(userId && { contactedById: userId }),
        contactedAt: { gte: startOfWeek },
      },
    }),
    // Contatos este mês
    prisma.crmContact.count({
      where: {
        companyId,
        ...(userId && { contactedById: userId }),
        contactedAt: { gte: startOfMonth },
      },
    }),
    // Settings
    getOrCreateSettings(companyId),
  ]);

  return {
    daily: { current: dailyCount, target: settings.defaultDailyGoal },
    weekly: { current: weeklyCount, target: settings.defaultWeeklyGoal },
    monthly: { current: monthlyCount, target: settings.defaultMonthlyGoal },
  };
}

// ============================================
// RELATÓRIOS
// ============================================

export async function getCrmReport(companyId: string, startDate: Date, endDate: Date) {
  const [totalContacts, contactsByResult, contactsBySegment, salesFromCrm] = await Promise.all([
    // Total de contatos
    prisma.crmContact.count({
      where: {
        companyId,
        contactedAt: { gte: startDate, lte: endDate },
      },
    }),

    // Por resultado
    prisma.crmContact.groupBy({
      by: ["result"],
      where: {
        companyId,
        contactedAt: { gte: startDate, lte: endDate },
      },
      _count: true,
    }),

    // Por segmento
    prisma.crmContact.groupBy({
      by: ["segment"],
      where: {
        companyId,
        contactedAt: { gte: startDate, lte: endDate },
      },
      _count: true,
    }),

    // Vendas geradas pelo CRM
    prisma.crmContact.aggregate({
      where: {
        companyId,
        contactedAt: { gte: startDate, lte: endDate },
        resultedInSale: true,
      },
      _count: true,
      _sum: { saleAmount: true },
    }),
  ]);

  const returnRate =
    totalContacts > 0 ? ((salesFromCrm._count || 0) / totalContacts) * 100 : 0;

  return {
    totalContacts,
    salesCount: salesFromCrm._count || 0,
    salesAmount: Number(salesFromCrm._sum.saleAmount || 0),
    returnRate: returnRate.toFixed(1),
    byResult: contactsByResult,
    bySegment: contactsBySegment,
  };
}

// ============================================
// CONFIGURAÇÕES
// ============================================

export async function getOrCreateSettings(companyId: string) {
  let settings = await prisma.crmSettings.findUnique({
    where: { companyId },
  });

  if (!settings) {
    settings = await prisma.crmSettings.create({
      data: { companyId },
    });
  }

  return settings;
}

export async function updateSettings(companyId: string, data: any) {
  return prisma.crmSettings.upsert({
    where: { companyId },
    create: { companyId, ...data },
    update: data,
  });
}
