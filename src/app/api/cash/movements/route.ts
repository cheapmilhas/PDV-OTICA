import { NextResponse } from "next/server";
import { cashService } from "@/services/cash.service";
import { cashMovementSchema, type CashMovementDTO } from "@/lib/validations/cash.schema";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";
import { auth } from "@/auth";

/**
 * GET /api/cash/movements?shiftId={id}
 * Lista movimentos de um turno de caixa
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get("shiftId");

    if (!shiftId) {
      throw new Error("shiftId é obrigatório");
    }

    const movements = await cashService.getShiftMovements(shiftId, companyId);

    // Serializar Decimals
    const serializedMovements = movements.map((m) => ({
      ...m,
      amount: Number(m.amount),
    }));

    return NextResponse.json({ data: serializedMovements }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/cash/movements
 * Cria movimento de caixa (sangria/suprimento)
 *
 * Body: { type: "SUPPLY" | "WITHDRAWAL", amount, method?, note? }
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    const branchId = await getBranchId();
    const userId = session.user.id;

    const body = await request.json();
    const data = cashMovementSchema.parse(body) as CashMovementDTO;

    const movement = await cashService.createMovement(data, companyId, branchId, userId);

    // Serializar Decimals
    const serializedMovement = {
      ...movement,
      amount: Number(movement.amount),
    };

    return createdResponse(serializedMovement);
  } catch (error) {
    return handleApiError(error);
  }
}
