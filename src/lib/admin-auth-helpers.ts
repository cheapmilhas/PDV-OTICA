import { authAdmin } from "@/auth-admin";
import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";

export interface AdminSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    isAdmin: boolean;
  };
}

/**
 * Requer que o requisitante seja um AdminUser autenticado.
 * Retorna a session de admin ou lança resposta 401/403.
 */
export async function requireAdminAuth(): Promise<AdminSession> {
  const session = await authAdmin();

  if (!session || !session.user || !(session.user as any).isAdmin) {
    throw Object.assign(new Error("Não autorizado"), { status: 401 });
  }

  return session as unknown as AdminSession;
}

/**
 * Requer que o admin tenha um dos roles especificados.
 */
export async function requireAdminRole(allowedRoles: AdminRole[]): Promise<AdminSession> {
  const session = await requireAdminAuth();

  if (!allowedRoles.includes(session.user.role)) {
    throw Object.assign(
      new Error(`Requer uma das roles: ${allowedRoles.join(", ")}`),
      { status: 403 }
    );
  }

  return session;
}

/**
 * Wrapper para rotas de API admin: retorna NextResponse de erro em vez de lançar.
 */
export async function withAdminAuth(
  handler: (session: AdminSession) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const session = await requireAdminAuth();
    return await handler(session);
  } catch (err: any) {
    const status = err.status ?? 500;
    return NextResponse.json(
      { error: { code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: err.message } },
      { status }
    );
  }
}
