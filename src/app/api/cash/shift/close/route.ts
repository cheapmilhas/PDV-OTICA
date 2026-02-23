import { NextResponse } from "next/server";
import { cashService } from "@/services/cash.service";
import { closeShiftSchema, type CloseShiftDTO } from "@/lib/validations/cash.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
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
    await requirePermission("cash_shift.close");
    const userId = session.user.id;

    const body = await request.json();
    console.log("📥 Request body recebido:", JSON.stringify(body, null, 2));

    const { shiftId, ...data } = body;

    if (!shiftId) {
      throw new Error("shiftId é obrigatório");
    }

    console.log("📋 Dados para validação:", JSON.stringify(data, null, 2));
    const closeData = closeShiftSchema.parse(data) as CloseShiftDTO;
    console.log("✅ Validação passou, dados parseados:", JSON.stringify(closeData, null, 2));

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
    console.error("❌ Erro ao fechar caixa:", error);
    if (error instanceof Error) {
      console.error("❌ Mensagem do erro:", error.message);
      console.error("❌ Stack:", error.stack);
    }
    return handleApiError(error);
  }
}
