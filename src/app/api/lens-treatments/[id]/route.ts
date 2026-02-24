import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";

const updateTreatmentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
});

/**
 * GET /api/lens-treatments/[id]
 * Retorna um tratamento específico
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const treatment = await prisma.lensTreatment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!treatment) {
      return NextResponse.json(
        { error: "Tratamento não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...treatment,
        price: Number(treatment.price),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/lens-treatments/[id]
 * Atualiza tratamento
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products.edit");
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const data = updateTreatmentSchema.parse(body);

    // Verificar se existe
    const existing = await prisma.lensTreatment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tratamento não encontrado" },
        { status: 404 }
      );
    }

    // Se mudou o nome, verificar duplicata
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.lensTreatment.findUnique({
        where: {
          companyId_name: {
            companyId,
            name: data.name,
          },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "Já existe um tratamento com este nome" },
          { status: 400 }
        );
      }
    }

    const treatment = await prisma.lensTreatment.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...treatment,
        price: Number(treatment.price),
      },
      message: "Tratamento atualizado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/lens-treatments/[id]
 * Desativa tratamento (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("products.edit");
    const companyId = await getCompanyId();
    const { id } = await params;

    const existing = await prisma.lensTreatment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tratamento não encontrado" },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.lensTreatment.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({
      success: true,
      message: "Tratamento desativado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
