import { prisma } from "@/lib/prisma";
import type {
  ReminderConfigDTO,
  UpdateReminderDTO,
  CreateContactDTO,
  ReminderQueryDTO
} from "@/lib/validations/reminder.schema";
import {
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  differenceInDays
} from "date-fns";

export const reminderService = {
  // =====================
  // CONFIGURAÇÃO
  // =====================

  async getConfig(branchId: string) {
    let config = await prisma.reminderConfig.findUnique({
      where: { branchId },
    });

    if (!config) {
      config = await prisma.reminderConfig.create({
        data: { branchId },
      });
    }

    return config;
  },

  async updateConfig(branchId: string, data: ReminderConfigDTO) {
    return prisma.reminderConfig.upsert({
      where: { branchId },
      update: data,
      create: { branchId, ...data },
    });
  },

  // =====================
  // GERAR LEMBRETES
  // =====================

  async generatePrescriptionReminders(branchId: string, companyId: string) {
    const config = await this.getConfig(branchId);

    if (!config.prescriptionReminderEnabled) {
      return { generated: 0 };
    }

    const today = startOfDay(new Date());
    const reminderDate = addDays(today, config.prescriptionReminderDays);

    const prescriptions = await prisma.prescription.findMany({
      where: {
        companyId,
        expiresAt: {
          gte: today,
          lte: reminderDate,
        },
        customer: {
          phone: { not: null },
          reminders: {
            none: {
              type: "PRESCRIPTION_REMINDER",
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
          },
        },
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    let generated = 0;

    for (const prescription of prescriptions) {
      if (!prescription.customer.phone) continue;

      await prisma.reminder.create({
        data: {
          branchId,
          customerId: prescription.customerId,
          type: "PRESCRIPTION_REMINDER",
          scheduledFor: today,
          metadata: {
            prescriptionId: prescription.id,
            expiresAt: prescription.expiresAt,
            daysUntilExpiration: differenceInDays(prescription.expiresAt!, today),
          },
        },
      });
      generated++;
    }

    return { generated };
  },

  async generateBirthdayReminders(branchId: string, companyId: string) {
    const config = await this.getConfig(branchId);

    if (!config.birthdayReminderEnabled) {
      return { generated: 0 };
    }

    const today = new Date();
    const targetDate = addDays(today, config.birthdayReminderDaysBefore);
    const targetMonth = targetDate.getMonth() + 1;
    const targetDay = targetDate.getDate();

    const customers = await prisma.customer.findMany({
      where: {
        companyId,
        birthDate: { not: null },
        phone: { not: null },
        reminders: {
          none: {
            type: "BIRTHDAY_GREETING",
            status: { in: ["PENDING", "IN_PROGRESS", "COMPLETED"] },
            createdAt: {
              gte: new Date(today.getFullYear(), 0, 1),
            },
          },
        },
      },
    });

    let generated = 0;

    for (const customer of customers) {
      if (!customer.birthDate) continue;

      const birthMonth = customer.birthDate.getMonth() + 1;
      const birthDay = customer.birthDate.getDate();

      if (birthMonth === targetMonth && birthDay === targetDay) {
        await prisma.reminder.create({
          data: {
            branchId,
            customerId: customer.id,
            type: "BIRTHDAY_GREETING",
            scheduledFor: targetDate,
            metadata: {
              birthDate: customer.birthDate,
            },
          },
        });
        generated++;
      }
    }

    return { generated };
  },

  async generateInactiveReminders(branchId: string, companyId: string) {
    const config = await this.getConfig(branchId);

    if (!config.inactiveReminderEnabled) {
      return { generated: 0 };
    }

    const today = startOfDay(new Date());
    const inactiveDate = subDays(today, config.inactiveAfterDays);

    const customers = await prisma.customer.findMany({
      where: {
        companyId,
        phone: { not: null },
        sales: {
          some: {},
        },
        reminders: {
          none: {
            type: "INACTIVE_REACTIVATION",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        },
      },
      include: {
        sales: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, total: true },
        },
      },
    });

    let generated = 0;

    for (const customer of customers) {
      const lastSale = customer.sales[0];
      if (!lastSale) continue;

      if (lastSale.createdAt < inactiveDate) {
        const daysSinceLastSale = differenceInDays(today, lastSale.createdAt);

        await prisma.reminder.create({
          data: {
            branchId,
            customerId: customer.id,
            type: "INACTIVE_REACTIVATION",
            scheduledFor: today,
            metadata: {
              lastSaleDate: lastSale.createdAt,
              lastSaleTotal: lastSale.total,
              daysSinceLastSale,
            },
          },
        });
        generated++;
      }
    }

    return { generated };
  },

  async generateCashbackExpiringReminders(branchId: string) {
    const config = await this.getConfig(branchId);

    if (!config.cashbackExpiringReminderEnabled) {
      return { generated: 0 };
    }

    const today = startOfDay(new Date());
    const futureDate = addDays(today, config.cashbackExpiringDaysBefore);

    // Buscar movimentos de cashback expirando
    const expiringMovements = await prisma.cashbackMovement.findMany({
      where: {
        type: "CREDIT",
        expired: false,
        expiresAt: {
          gte: today,
          lte: futureDate,
        },
        customerCashback: {
          branchId,
        },
      },
      include: {
        customerCashback: {
          include: {
            customer: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
      },
    });

    let generated = 0;

    // Agrupar por cliente
    const byCustomer = new Map<string, typeof expiringMovements>();
    for (const mov of expiringMovements) {
      const customerId = mov.customerCashback.customerId;
      const existing = byCustomer.get(customerId) || [];
      existing.push(mov);
      byCustomer.set(customerId, existing);
    }

    for (const [customerId, movements] of byCustomer) {
      // Verificar se já existe lembrete pendente
      const existingReminder = await prisma.reminder.findFirst({
        where: {
          customerId,
          type: "CASHBACK_EXPIRING",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });

      if (existingReminder) continue;

      const totalExpiring = movements.reduce((sum, m) => sum + Number(m.amount), 0);
      const earliestExpiry = movements.reduce((earliest, m) =>
        m.expiresAt && m.expiresAt < earliest ? m.expiresAt : earliest,
        movements[0].expiresAt!
      );

      await prisma.reminder.create({
        data: {
          branchId,
          customerId,
          type: "CASHBACK_EXPIRING",
          scheduledFor: today,
          metadata: {
            amount: totalExpiring,
            expiresAt: earliestExpiry,
            daysUntilExpiration: differenceInDays(earliestExpiry, today),
          },
        },
      });
      generated++;
    }

    return { generated };
  },

  async generateAllReminders(branchId: string, companyId: string) {
    const [prescription, birthday, inactive, cashback] = await Promise.all([
      this.generatePrescriptionReminders(branchId, companyId),
      this.generateBirthdayReminders(branchId, companyId),
      this.generateInactiveReminders(branchId, companyId),
      this.generateCashbackExpiringReminders(branchId),
    ]);

    return {
      prescription: prescription.generated,
      birthday: birthday.generated,
      inactive: inactive.generated,
      cashback: cashback.generated,
      total: prescription.generated + birthday.generated + inactive.generated + cashback.generated,
    };
  },

  // =====================
  // LISTAR LEMBRETES
  // =====================

  async getTodayReminders(branchId: string, type?: string) {
    const endToday = endOfDay(new Date());

    const where: any = {
      branchId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      scheduledFor: {
        lte: endToday,
      },
    };

    if (type) {
      where.type = type;
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            birthDate: true,
            cashback: {
              where: { branchId },
              select: { balance: true },
            },
          },
        },
      },
      orderBy: [
        { type: "asc" },
        { scheduledFor: "asc" },
      ],
    });

    // Agrupar por tipo
    const grouped: Record<string, typeof reminders> = {
      PRESCRIPTION_REMINDER: [],
      BIRTHDAY_GREETING: [],
      INACTIVE_REACTIVATION: [],
      CASHBACK_EXPIRING: [],
      CASHBACK_AVAILABLE: [],
    };

    for (const reminder of reminders) {
      if (grouped[reminder.type]) {
        grouped[reminder.type].push(reminder);
      }
    }

    return {
      all: reminders,
      grouped,
      counts: {
        PRESCRIPTION_REMINDER: grouped.PRESCRIPTION_REMINDER.length,
        BIRTHDAY_GREETING: grouped.BIRTHDAY_GREETING.length,
        INACTIVE_REACTIVATION: grouped.INACTIVE_REACTIVATION.length,
        CASHBACK_EXPIRING: grouped.CASHBACK_EXPIRING.length,
        total: reminders.length,
      },
    };
  },

  async listReminders(branchId: string, query: ReminderQueryDTO) {
    const where: any = { branchId };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      prisma.reminder.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
        },
        orderBy: { scheduledFor: "desc" },
      }),
      prisma.reminder.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },

  // =====================
  // ATUALIZAR LEMBRETE
  // =====================

  async updateReminder(id: string, data: UpdateReminderDTO, userId: string) {
    const updateData: any = {
      status: data.status,
    };

    if (data.status === "DISMISSED") {
      updateData.dismissedAt = new Date();
      updateData.dismissedByUserId = userId;
      updateData.dismissReason = data.dismissReason;
    }

    return prisma.reminder.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
    });
  },

  async startReminder(id: string) {
    return prisma.reminder.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
    });
  },

  // =====================
  // CONTATOS
  // =====================

  async createContact(data: CreateContactDTO, branchId: string, userId: string) {
    const contact = await prisma.customerContact.create({
      data: {
        customerId: data.customerId,
        branchId,
        type: data.type,
        channel: data.channel,
        status: data.status,
        message: data.message,
        notes: data.notes,
        reminderId: data.reminderId,
        executedByUserId: userId,
        executedAt: new Date(),
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    // Se tem reminderId, atualizar status do lembrete
    if (data.reminderId) {
      await prisma.reminder.update({
        where: { id: data.reminderId },
        data: {
          status: data.status === "SENT" || data.status === "CONFIRMED"
            ? "COMPLETED"
            : "DISMISSED",
        },
      });
    }

    return contact;
  },

  async getCustomerContacts(customerId: string, branchId: string) {
    return prisma.customerContact.findMany({
      where: { customerId, branchId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        executedByUser: {
          select: { id: true, name: true },
        },
      },
    });
  },

  // =====================
  // RELATÓRIOS
  // =====================

  async getSummary(branchId: string) {
    const today = startOfDay(new Date());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [pending, completedThisMonth, config] = await Promise.all([
      prisma.reminder.count({
        where: {
          branchId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      }),
      prisma.reminder.count({
        where: {
          branchId,
          status: "COMPLETED",
          updatedAt: { gte: startOfMonth },
        },
      }),
      this.getConfig(branchId),
    ]);

    return {
      pendingReminders: pending,
      completedThisMonth,
      config,
    };
  },
};
