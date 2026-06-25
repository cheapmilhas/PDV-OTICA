import { NextResponse } from "next/server";
import { cashService } from "@/services/cash.service";
import { closeShiftSchema, type CloseShiftDTO } from "@/lib/validations/cash.schema";
import { requireAuth, getCompanyId, getBranchId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, unauthorizedError } from "@/lib/error-handler";
import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "cash/shift/close" });

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
      throw unauthorizedError("Sua sessão expirou. Faça login novamente.");
    }

    // Rate limit: 10 fechamentos de caixa por minuto por usuário
    const rlBlocked = rateLimitResponse(`cash-shift-close:${session.user.id}`, { maxRequests: 10, windowMs: 60_000 });
    if (rlBlocked) return rlBlocked;

    const companyId = await getCompanyId();
    const branchId = await getBranchId();
    await requirePermission("cash_shift.close");
    const userId = session.user.id;

    const body = await request.json();
    const { shiftId, ...data } = body;

    if (!shiftId) {
      throw new Error("shiftId é obrigatório");
    }

    const closeData = closeShiftSchema.parse(data) as CloseShiftDTO;

    const shift = await cashService.closeShift(shiftId, closeData, companyId, userId, branchId);

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
    log.error("Erro ao fechar caixa", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return handleApiError(error);
  }
}
