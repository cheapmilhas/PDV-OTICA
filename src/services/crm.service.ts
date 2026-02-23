import { prisma } from "@/lib/prisma";
import { CustomerSegment, ContactResult, CrmReminderStatus } from "@prisma/client";

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
        where: { status: { not: "CANCELED" } },
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

  const reminders: any[] = [];

  for (const customer of customers) {
    const lastSale = customer.sales[0];
    const lastSaleDate = lastSale?.createdAt;
    const daysSinceLastPurchase = lastSaleDate
      ? Math.floor((today.getTime() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Calcular totais
    const allSales = await prisma.sale.findMany({
      where: { customerId: customer.id, status: { not: "CANCELED" } },
      select: { total: true },
    });

    const totalPurchases = allSales.length;
    const totalSpent = allSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

    // TODO: Buscar cashback do cliente
    const cashbackBalance = 0;

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

    // === ANIVERSÁRIO ===
    if (customer.birthDate) {
      const birthday = new Date(customer.birthDate);
      if (birthday.getMonth() === today.getMonth()) {
        reminders.push({
          ...baseData,
          segment: "BIRTHDAY" as CustomerSegment,
          priority: 100,
          expiresAt: new Date(today.getFullYear(), today.getMonth() + 1, 0),
        });
      }
    }

    // === SEGMENTOS POR TEMPO SEM COMPRAR ===
    if (daysSinceLastPurchase !== null) {
      // Pós-venda 30 dias
      if (
        daysSinceLastPurchase >= settings.postSaleDays2 &&
        daysSinceLastPurchase < settings.postSaleDays3
      ) {
        reminders.push({
          ...baseData,
          segment: "POST_SALE_30_DAYS" as CustomerSegment,
          priority: 80,
        });
      }
      // Pós-venda 90 dias
      else if (
        daysSinceLastPurchase >= settings.postSaleDays3 &&
        daysSinceLastPurchase < settings.inactiveDays6Months
      ) {
        reminders.push({
          ...baseData,
          segment: "POST_SALE_90_DAYS" as CustomerSegment,
          priority: 70,
        });
      }
      // 6 meses
      else if (
        daysSinceLastPurchase >= settings.inactiveDays6Months &&
        daysSinceLastPurchase < settings.inactiveDays1Year
      ) {
        reminders.push({
          ...baseData,
          segment: "INACTIVE_6_MONTHS" as CustomerSegment,
          priority: 60,
        });
      }
      // 1 ano
      else if (
        daysSinceLastPurchase >= settings.inactiveDays1Year &&
        daysSinceLastPurchase < settings.inactiveDays2Years
      ) {
        reminders.push({
          ...baseData,
          segment: "INACTIVE_1_YEAR" as CustomerSegment,
          priority: 50,
        });
      }
      // 2 anos
      else if (
        daysSinceLastPurchase >= settings.inactiveDays2Years &&
        daysSinceLastPurchase < settings.inactiveDays3Years
      ) {
        reminders.push({
          ...baseData,
          segment: "INACTIVE_2_YEARS" as CustomerSegment,
          priority: 40,
        });
      }
      // 3+ anos
      else if (daysSinceLastPurchase >= settings.inactiveDays3Years) {
        reminders.push({
          ...baseData,
          segment: "INACTIVE_3_YEARS" as CustomerSegment,
          priority: 30,
        });
      }
    }

    // === VIP ===
    if (
      totalPurchases >= settings.vipMinPurchases &&
      totalSpent >= Number(settings.vipMinTotalSpent)
    ) {
      reminders.push({
        ...baseData,
        segment: "VIP_CUSTOMER" as CustomerSegment,
        priority: 90,
      });
    }
  }

  // Inserir lembretes (upsert para evitar duplicados)
  let created = 0;
  for (const reminder of reminders) {
    try {
      // Verifica se já existe lembrete similar
      const existing = await prisma.customerReminder.findFirst({
        where: {
          companyId: reminder.companyId,
          customerId: reminder.customerId,
          segment: reminder.segment,
          status: { in: ["PENDING", "IN_PROGRESS", "SCHEDULED"] },
        },
      });

      if (!existing) {
        await prisma.customerReminder.create({ data: reminder });
        created++;
      }
    } catch (error) {
      console.error("Erro ao criar lembrete:", error);
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
    ...(status && { status }),
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

  // Atualizar status do lembrete
  if (data.reminderId) {
    await prisma.customerReminder.update({
      where: { id: data.reminderId },
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
