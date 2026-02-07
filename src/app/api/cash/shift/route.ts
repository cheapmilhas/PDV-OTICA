import { NextResponse } from "next/server";
import { cashService } from "@/services/cash.service";
import { openShiftSchema, type OpenShiftDTO } from "@/lib/validations/cash.schema";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";
import { auth } from "@/auth";

/**
 * GET /api/cash/shift
 * Retorna o turno de caixa aberto da filial (se existir)
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const branchId = await getBranchId();

    const shift = await cashService.getCurrentShift(branchId, companyId);

    if (!shift) {
      return NextResponse.json({ shift: null }, { status: 200 });
    }

    // Serializar Decimals
    const serializedShift = {
      ...shift,
      openingFloatAmount: Number(shift.openingFloatAmount),
      closingDeclaredCash: shift.closingDeclaredCash ? Number(shift.closingDeclaredCash) : null,
      closingExpectedCash: shift.closingExpectedCash ? Number(shift.closingExpectedCash) : null,
      differenceCash: shift.differenceCash ? Number(shift.differenceCash) : null,
      movements: (shift as any).movements?.map((m: any) => ({
        ...m,
        amount: Number(m.amount),
      })) || [],
    };

    return NextResponse.json({ shift: serializedShift }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/cash/shift
 * Abre um novo turno de caixa
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    const userId = session.user.id;

    const body = await request.json();
    const data = openShiftSchema.parse(body) as OpenShiftDTO;

    const shift = await cashService.openShift(data, companyId, userId);

    // Serializar Decimals
    const serializedShift = {
      ...shift,
      openingFloatAmount: Number(shift.openingFloatAmount),
    };

    return createdResponse(serializedShift);
  } catch (error) {
    return handleApiError(error);
  }
}
