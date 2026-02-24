import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { z } from "zod";

/**
 * Schema de validação para atualização (PUT)
 */
const updateLaboratorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional(),
  code: z.string().optional(),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  orderEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
  contactPerson: z.string().optional(),
  defaultLeadTimeDays: z.coerce.number().int().min(1).optional(),
  urgentLeadTimeDays: z.coerce.number().int().min(1).optional(),
  paymentTermDays: z.coerce.number().int().min(0).optional(),
  defaultDiscount: z.coerce.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

/**
 * GET /api/laboratories/[id]
 * Retorna um laboratório específico
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const laboratory = await prisma.lab.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!laboratory) {
      return NextResponse.json(
        { error: "Laboratório não encontrado" },
        { status: 404 }
      );
    }

    // Serializar Decimals
    const serialized = {
      ...laboratory,
      defaultDiscount: Number(laboratory.defaultDiscount),
      qualityRating: laboratory.qualityRating ? Number(laboratory.qualityRating) : null,
    };

    return successResponse(serialized);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/laboratories/[id]
 * Atualiza laboratório
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("laboratories.manage");
    const companyId = await getCompanyId();
    const { id } = await params;

    // Verificar se existe
    const existing = await prisma.lab.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Laboratório não encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data = updateLaboratorySchema.parse(body);

    const laboratory = await prisma.lab.update({
      where: { id },
      data: {
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

    return successResponse(serialized);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/laboratories/[id]
 * Desativa laboratório (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("laboratories.manage");
    const companyId = await getCompanyId();
    const { id } = await params;

    // Verificar se existe
    const existing = await prisma.lab.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Laboratório não encontrado" },
        { status: 404 }
      );
    }

    // Soft delete - apenas desativa
    await prisma.lab.update({
      where: { id },
      data: { active: false },
    });

    return successResponse({ message: "Laboratório desativado com sucesso" });
  } catch (error) {
    return handleApiError(error);
  }
}
