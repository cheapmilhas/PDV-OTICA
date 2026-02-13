import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prescriptionService } from "@/services/prescription.service";
import { prescriptionSchema } from "@/lib/validations/prescription.schema";

interface Params {
  params: Promise<{ id: string }>;
}

// GET - Buscar receita por ID
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const prescription = await prescriptionService.getById(id, companyId);

    if (!prescription) {
      return NextResponse.json(
        { success: false, message: "Receita não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: prescription,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT - Atualizar receita
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const data = prescriptionSchema.partial().parse(body);

    const prescription = await prescriptionService.update(id, data, companyId);

    return NextResponse.json({
      success: true,
      data: prescription,
      message: "Receita atualizada com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE - Deletar receita
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    await prescriptionService.delete(id, companyId);

    return NextResponse.json({
      success: true,
      message: "Receita removida com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
