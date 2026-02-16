import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { notFoundError } from "@/lib/error-handler";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/laboratories/[id]
 * Atualiza um laboratorio
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Verifica se o lab pertence a empresa
    const existing = await prisma.lab.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw notFoundError("Laboratorio nao encontrado");
    }

    const body = await request.json();

    // Campos permitidos para atualizacao
    const updateData: Record<string, unknown> = {};

    const stringFields = [
      "name", "code", "cnpj", "phone", "email", "orderEmail",
      "website", "contactPerson", "integrationType", "apiUrl",
      "apiKey", "clientCode",
    ];

    for (const field of stringFields) {
      if (field in body) {
        const value = body[field];
        updateData[field] = typeof value === "string" && value.trim() !== ""
          ? value.trim()
          : null;
      }
    }

    // name nao pode ser null
    if ("name" in updateData && !updateData.name) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Nome e obrigatorio" } },
        { status: 400 }
      );
    }

    const intFields = [
      "defaultLeadTimeDays", "urgentLeadTimeDays", "paymentTermDays",
    ];

    for (const field of intFields) {
      if (field in body) {
        const value = parseInt(body[field]);
        if (!isNaN(value)) {
          updateData[field] = value;
        }
      }
    }

    if ("defaultDiscount" in body) {
      const value = parseFloat(body.defaultDiscount);
      if (!isNaN(value)) {
        updateData.defaultDiscount = value;
      }
    }

    if ("active" in body) {
      updateData.active = Boolean(body.active);
    }

    const lab = await prisma.lab.update({
      where: { id },
      data: updateData,
    });

    const serializedLab = {
      ...lab,
      defaultDiscount: Number(lab.defaultDiscount),
      qualityRating: lab.qualityRating ? Number(lab.qualityRating) : null,
    };

    return NextResponse.json({
      success: true,
      data: serializedLab,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/laboratories/[id]
 * Toggle status ativo/inativo do laboratorio
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Verifica se o lab pertence a empresa
    const existing = await prisma.lab.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw notFoundError("Laboratorio nao encontrado");
    }

    const lab = await prisma.lab.update({
      where: { id },
      data: { active: !existing.active },
    });

    const serializedLab = {
      ...lab,
      defaultDiscount: Number(lab.defaultDiscount),
      qualityRating: lab.qualityRating ? Number(lab.qualityRating) : null,
    };

    return NextResponse.json({
      success: true,
      data: serializedLab,
      message: lab.active ? "Laboratorio ativado" : "Laboratorio desativado",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/laboratories/[id]
 * Soft delete - desativa o laboratorio (active = false)
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Verifica se o lab pertence a empresa
    const existing = await prisma.lab.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw notFoundError("Laboratorio nao encontrado");
    }

    await prisma.lab.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({
      success: true,
      message: "Laboratorio desativado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
