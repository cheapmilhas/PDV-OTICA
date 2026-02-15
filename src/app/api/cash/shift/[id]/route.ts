import { NextResponse } from "next/server";
import { cashService } from "@/services/cash.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/cash/shift/[id]
 * Retorna dados de um turno de caixa específico por ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: shiftId } = await params;

    const shift = await cashService.getShiftById(shiftId, companyId);

    if (!shift) {
      return NextResponse.json(
        { error: { message: "Caixa não encontrado" } },
        { status: 404 }
      );
    }

    // Serializar Decimals
    const serializedShift = {
      ...shift,
      openingFloatAmount: Number(shift.openingFloatAmount),
      closingDeclaredCash: shift.closingDeclaredCash
        ? Number(shift.closingDeclaredCash)
        : null,
      closingExpectedCash: shift.closingExpectedCash
        ? Number(shift.closingExpectedCash)
        : null,
      differenceCash: shift.differenceCash ? Number(shift.differenceCash) : null,
      movements:
        (shift as any).movements?.map((m: any) => ({
          ...m,
          amount: Number(m.amount),
        })) || [],
    };

    return NextResponse.json({ shift: serializedShift }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
