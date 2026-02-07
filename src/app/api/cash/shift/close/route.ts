import { NextResponse } from "next/server";
import { cashService } from "@/services/cash.service";
import { closeShiftSchema, type CloseShiftDTO } from "@/lib/validations/cash.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { auth } from "@/auth";

/**
 * POST /api/cash/shift/close
 * Fecha o turno de caixa aberto
 *
 * Body: { shiftId, closingDeclaredCash, differenceJustification?, notes? }
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
    const { shiftId, ...data } = body;

    if (!shiftId) {
      throw new Error("shiftId é obrigatório");
    }

    const closeData = closeShiftSchema.parse(data) as CloseShiftDTO;

    const shift = await cashService.closeShift(shiftId, closeData, companyId, userId);

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

    return NextResponse.json(serializedShift, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
