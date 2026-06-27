import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { prescriptionService } from "@/services/prescription.service";

interface Params {
  params: Promise<{ customerId: string }>;
}

// GET - Listar receitas do cliente
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    // LGPD: receita é dado clínico sensível — exige permissão de leitura.
    await requirePermission("prescriptions.view");
    const companyId = await getCompanyId();
    const { customerId } = await params;

    const prescriptions = await prescriptionService.listByCustomer(customerId, companyId);
    const evolution = await prescriptionService.getGradeEvolution(customerId, companyId);

    return NextResponse.json({
      success: true,
      data: {
        prescriptions,
        evolution,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
