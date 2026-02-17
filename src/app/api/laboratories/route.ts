import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse, successResponse } from "@/lib/api-response";
import { z } from "zod";

/**
 * Schema de validação para query params (GET)
 */
const laboratoriesQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ativos", "inativos", "todos"]).default("ativos"),
});

/**
 * Schema de validação para criação (POST)
 */
const createLaboratorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  code: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  orderEmail: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  website: z.string().optional().nullable().or(z.literal("")), // Removido .url() pois pode ser apenas domínio
  contactPerson: z.string().optional().nullable(),
  defaultLeadTimeDays: z.coerce.number().int().min(1).default(7),
  urgentLeadTimeDays: z.coerce.number().int().min(1).default(3),
  paymentTermDays: z.coerce.number().int().min(0).default(30),
  defaultDiscount: z.coerce.number().min(0).max(100).default(0),
});

/**
 * GET /api/laboratories
 * Lista laboratórios com paginação e filtros
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const query = laboratoriesQuerySchema.parse(Object.fromEntries(searchParams));

    // Construir filtros
    const where: any = {
      companyId,
    };

    // Filtro de status
    if (query.status === "ativos") {
      where.active = true;
    } else if (query.status === "inativos") {
      where.active = false;
    }

    // Filtro de busca
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
        { contactPerson: { contains: query.search, mode: "insensitive" } },
      ];
    }

    // Calcular paginação
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    // Buscar laboratórios
    const [data, total] = await Promise.all([
      prisma.lab.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          cnpj: true,
          phone: true,
          email: true,
          orderEmail: true,
          website: true,
          contactPerson: true,
          defaultLeadTimeDays: true,
          urgentLeadTimeDays: true,
          paymentTermDays: true,
          defaultDiscount: true,
          qualityRating: true,
          totalOrders: true,
          totalReworks: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { serviceOrders: true },
          },
        },
      }),
      prisma.lab.count({ where }),
    ]);

    // Serializar Decimals e usar contagem real de OS
    const serializedData = data.map(({ _count, ...lab }) => ({
      ...lab,
      defaultDiscount: Number(lab.defaultDiscount),
      qualityRating: lab.qualityRating ? Number(lab.qualityRating) : null,
      totalOrders: _count.serviceOrders,
    }));

    const totalPages = Math.ceil(total / query.pageSize);
    return paginatedResponse(serializedData, {
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevious: query.page > 1,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/laboratories
 * Cria novo laboratório
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    const data = createLaboratorySchema.parse(body);

    const laboratory = await prisma.lab.create({
      data: {
        companyId,
        ...data,
        email: data.email || undefined,
        orderEmail: data.orderEmail || undefined,
        website: data.website || undefined,
      },
    });

    // Serializar Decimals
    const serialized = {
      ...laboratory,
      defaultDiscount: Number(laboratory.defaultDiscount),
      qualityRating: laboratory.qualityRating ? Number(laboratory.qualityRating) : null,
    };

    return createdResponse(serialized);
  } catch (error) {
    return handleApiError(error);
  }
}
