import { prisma } from "@/lib/prisma";
import type { PrescriptionDTO } from "@/lib/validations/prescription.schema";
import { addMonths } from "date-fns";

export const prescriptionService = {
  /**
   * Criar nova receita
   */
  async create(data: PrescriptionDTO, companyId: string) {
    // Calcular data de expiração (12 meses após a data da receita)
    const expiresAt = addMonths(new Date(data.issuedAt), 12);

    return prisma.prescription.create({
      data: {
        companyId,
        customerId: data.customerId,
        doctorId: data.doctorId || undefined,
        issuedAt: new Date(data.issuedAt),
        expiresAt,
        prescriptionType: data.prescriptionType || undefined,
        notes: data.notes || undefined,
        imageUrl: data.imageUrl || undefined,
        values: data.values
          ? {
              create: {
                odSph: data.values.odSph || undefined,
                odCyl: data.values.odCyl || undefined,
                odAxis: data.values.odAxis || undefined,
                odAdd: data.values.odAdd || undefined,
                odPrism: data.values.odPrism || undefined,
                odBase: data.values.odBase || undefined,
                oeSph: data.values.oeSph || undefined,
                oeCyl: data.values.oeCyl || undefined,
                oeAxis: data.values.oeAxis || undefined,
                oeAdd: data.values.oeAdd || undefined,
                oePrism: data.values.oePrism || undefined,
                oeBase: data.values.oeBase || undefined,
                pdFar: data.values.pdFar || undefined,
                pdNear: data.values.pdNear || undefined,
                fittingHeightOd: data.values.fittingHeightOd || undefined,
                fittingHeightOe: data.values.fittingHeightOe || undefined,
                pantoscopicAngle: data.values.pantoscopicAngle || undefined,
                vertexDistance: data.values.vertexDistance || undefined,
                frameCurvature: data.values.frameCurvature || undefined,
              },
            }
          : undefined,
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
        doctor: {
          select: { id: true, name: true, crm: true },
        },
        values: true,
      },
    });
  },

  /**
   * Buscar receita por ID
   */
  async getById(id: string, companyId: string) {
    return prisma.prescription.findFirst({
      where: { id, companyId },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        doctor: {
          select: { id: true, name: true, crm: true },
        },
        values: true,
      },
    });
  },

  /**
   * Listar receitas do cliente
   */
  async listByCustomer(customerId: string, companyId: string) {
    return prisma.prescription.findMany({
      where: { customerId, companyId },
      orderBy: { issuedAt: "desc" },
      include: {
        doctor: {
          select: { id: true, name: true, crm: true },
        },
        values: true,
      },
    });
  },

  /**
   * Listar receitas com paginação
   */
  async list(companyId: string, page = 1, pageSize = 10, customerId?: string) {
    const where = {
      companyId,
      ...(customerId && { customerId }),
    };

    const [data, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { issuedAt: "desc" },
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
          doctor: {
            select: { id: true, name: true },
          },
          values: true,
        },
      }),
      prisma.prescription.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  },

  /**
   * Atualizar receita
   */
  async update(id: string, data: Partial<PrescriptionDTO>, companyId: string) {
    // Se mudou a data da receita, recalcular expiração
    const updateData: any = {
      ...(data.customerId && { customerId: data.customerId }),
      ...(data.doctorId !== undefined && { doctorId: data.doctorId || null }),
      ...(data.prescriptionType !== undefined && {
        prescriptionType: data.prescriptionType || null,
      }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
    };

    if (data.issuedAt) {
      updateData.issuedAt = new Date(data.issuedAt);
      updateData.expiresAt = addMonths(new Date(data.issuedAt), 12);
    }

    // Atualizar valores se fornecidos
    if (data.values) {
      // Primeiro verificar se já existe PrescriptionValues
      const existing = await prisma.prescription.findUnique({
        where: { id },
        include: { values: true },
      });

      if (existing?.values) {
        // Atualizar existente
        updateData.values = {
          update: {
            odSph: data.values.odSph || undefined,
            odCyl: data.values.odCyl || undefined,
            odAxis: data.values.odAxis || undefined,
            odAdd: data.values.odAdd || undefined,
            odPrism: data.values.odPrism || undefined,
            odBase: data.values.odBase || undefined,
            oeSph: data.values.oeSph || undefined,
            oeCyl: data.values.oeCyl || undefined,
            oeAxis: data.values.oeAxis || undefined,
            oeAdd: data.values.oeAdd || undefined,
            oePrism: data.values.oePrism || undefined,
            oeBase: data.values.oeBase || undefined,
            pdFar: data.values.pdFar || undefined,
            pdNear: data.values.pdNear || undefined,
            fittingHeightOd: data.values.fittingHeightOd || undefined,
            fittingHeightOe: data.values.fittingHeightOe || undefined,
            pantoscopicAngle: data.values.pantoscopicAngle || undefined,
            vertexDistance: data.values.vertexDistance || undefined,
            frameCurvature: data.values.frameCurvature || undefined,
          },
        };
      } else {
        // Criar novo
        updateData.values = {
          create: {
            odSph: data.values.odSph || undefined,
            odCyl: data.values.odCyl || undefined,
            odAxis: data.values.odAxis || undefined,
            odAdd: data.values.odAdd || undefined,
            odPrism: data.values.odPrism || undefined,
            odBase: data.values.odBase || undefined,
            oeSph: data.values.oeSph || undefined,
            oeCyl: data.values.oeCyl || undefined,
            oeAxis: data.values.oeAxis || undefined,
            oeAdd: data.values.oeAdd || undefined,
            oePrism: data.values.oePrism || undefined,
            oeBase: data.values.oeBase || undefined,
            pdFar: data.values.pdFar || undefined,
            pdNear: data.values.pdNear || undefined,
            fittingHeightOd: data.values.fittingHeightOd || undefined,
            fittingHeightOe: data.values.fittingHeightOe || undefined,
            pantoscopicAngle: data.values.pantoscopicAngle || undefined,
            vertexDistance: data.values.vertexDistance || undefined,
            frameCurvature: data.values.frameCurvature || undefined,
          },
        };
      }
    }

    return prisma.prescription.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: { id: true, name: true },
        },
        doctor: {
          select: { id: true, name: true },
        },
        values: true,
      },
    });
  },

  /**
   * Deletar receita
   */
  async delete(id: string, companyId: string) {
    return prisma.prescription.deleteMany({
      where: { id, companyId },
    });
  },

  /**
   * Buscar receitas vencendo (para lembretes)
   */
  async getExpiringPrescriptions(companyId: string, daysAhead: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return prisma.prescription.findMany({
      where: {
        companyId,
        expiresAt: {
          gte: today,
          lte: futureDate,
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        values: true,
      },
      orderBy: { expiresAt: "asc" },
    });
  },

  /**
   * Buscar última receita do cliente
   */
  async getLatestByCustomer(customerId: string, companyId: string) {
    return prisma.prescription.findFirst({
      where: { customerId, companyId },
      orderBy: { issuedAt: "desc" },
      include: {
        values: true,
      },
    });
  },

  /**
   * Verificar validade da receita do cliente
   */
  async checkExpiry(customerId: string, companyId: string) {
    const latest = await this.getLatestByCustomer(customerId, companyId);

    if (!latest) {
      return { hasValid: false, message: "Cliente não possui receita válida" };
    }

    const now = Date.now();
    const daysUntilExpiry = Math.ceil(
      (latest.expiresAt.getTime() - now) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 0) {
      return {
        hasValid: false,
        message: `Receita vencida há ${Math.abs(daysUntilExpiry)} dias`,
        prescription: latest,
      };
    }

    if (daysUntilExpiry <= 30) {
      return {
        hasValid: true,
        expiringSoon: true,
        daysUntilExpiry,
        message: `Receita expira em ${daysUntilExpiry} dias`,
        prescription: latest,
      };
    }

    return { hasValid: true, expiringSoon: false, prescription: latest };
  },

  /**
   * Comparar evolução do grau
   */
  async getGradeEvolution(customerId: string, companyId: string) {
    const prescriptions = await prisma.prescription.findMany({
      where: { customerId, companyId },
      orderBy: { issuedAt: "asc" },
      include: {
        values: true,
      },
    });

    return prescriptions.map((p) => ({
      date: p.issuedAt,
      od: {
        spherical: p.values?.odSph ? Number(p.values.odSph) : null,
        cylindrical: p.values?.odCyl ? Number(p.values.odCyl) : null,
        axis: p.values?.odAxis || null,
      },
      oe: {
        spherical: p.values?.oeSph ? Number(p.values.oeSph) : null,
        cylindrical: p.values?.oeCyl ? Number(p.values.oeCyl) : null,
        axis: p.values?.oeAxis || null,
      },
      prescriptionType: p.prescriptionType,
    }));
  },
};
