import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessCompany } from "@/lib/admin-scope";

const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!authSecret) throw new Error("AUTH_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(authSecret);

export interface AdminPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  isAdmin: boolean;
}

export async function getAdminSession(): Promise<AdminPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin.session-token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.isAdmin) return null;
    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminPayload> {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireAdminRole(allowedRoles: string[]): Promise<AdminPayload> {
  const admin = await requireAdmin();
  if (!allowedRoles.includes(admin.role)) redirect("/admin?error=unauthorized");
  return admin;
}

/**
 * Carrega o admin do banco (revalida active) e checa escopo para companyId.
 * Retorna o admin se ok, ou null se não autorizado / inativo / fora de escopo.
 */
export async function requireCompanyScope(
  adminId: string,
  companyId: string
): Promise<{ id: string; role: string } | null> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, role: true, active: true, scopeAllCompanies: true, scopedCompanyIds: true },
  });
  if (!admin || !admin.active) return null;
  if (!canAccessCompany(admin, companyId)) return null;
  return { id: admin.id, role: admin.role };
}
