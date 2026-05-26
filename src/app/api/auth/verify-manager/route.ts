import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { rateLimitResponse } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/error-handler";

const inputSchema = z.object({
  password: z.string().min(1),
});

/**
 * POST /api/auth/verify-manager
 *
 * Valida que a senha pertence a um usuário com role ADMIN ou MANAGER da mesma
 * empresa do solicitante. Usado para aprovar operações sensíveis (descontos
 * acima do limite, cancelamentos, etc).
 *
 * Rate limit: 5 tentativas por 5min por usuário.
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();

    // Rate limit por usuário (evita brute-force de senha de gerente)
    const limited = rateLimitResponse(`verify-manager:${session.user.id}`, {
      maxRequests: 5,
      windowMs: 5 * 60 * 1000,
    });
    if (limited) return limited;

    const body = await request.json();
    const { password } = inputSchema.parse(body);

    // Busca todos managers/admins da empresa
    const candidates = await prisma.user.findMany({
      where: { companyId, role: { in: ["ADMIN", "GERENTE"] } },
      select: { id: true, passwordHash: true },
    });

    // Compara senha com bcrypt em cada candidato — slow path mas seguro
    for (const u of candidates) {
      if (u.passwordHash && (await bcrypt.compare(password, u.passwordHash))) {
        return NextResponse.json({
          success: true,
          data: { approvedByUserId: u.id },
        });
      }
    }

    return NextResponse.json(
      { error: { code: "INVALID_MANAGER_PASSWORD", message: "Senha incorreta" } },
      { status: 401 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
