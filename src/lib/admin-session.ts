import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessCompany } from "@/lib/admin-scope";

/**
 * Lê o segredo JWT em TEMPO DE REQUISIÇÃO (não no carregamento do módulo).
 * Lazy de propósito: o `next build` importa este módulo ao coletar dados das
 * páginas/rotas, mas NÃO executa os handlers — então um throw aqui no top-level
 * quebrava o build em ambientes sem o secret (ex.: Preview da Vercel). Movendo a
 * checagem pra dentro da função, a segurança em runtime é idêntica (ainda lança
 * se o secret faltar quando a rota roda) e o build não precisa mais do secret.
 */
function getJwtSecret(): Uint8Array {
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!authSecret) throw new Error("AUTH_SECRET environment variable is required");
  return new TextEncoder().encode(authSecret);
}

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
    const { payload } = await jwtVerify(token, getJwtSecret());
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
  // Revalida o papel do banco (fecha a janela de JWT desatualizado: admin
  // rebaixado para SUPPORT/BILLING não impersona mesmo com cookie antigo).
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) return null;
  if (!canAccessCompany(admin, companyId)) return null;
  return { id: admin.id, role: admin.role };
}

/**
 * Valida que o admin (revalidado no banco, active) pode acessar a empresa —
 * SEM exigir papel ADMIN/SUPER_ADMIN. Usado no suporte, onde a role SUPPORT
 * é legítima e não deve ser barrada (diferente de requireCompanyScope, que é
 * para ações sensíveis como impersonate). Retorna o admin ou null.
 */
export async function requireSupportScope(
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

/**
 * Lista os companyIds que o admin pode acessar para filtrar listagens/exports.
 * Retorna null = sem restrição (SUPER_ADMIN ou scopeAllCompanies).
 * Retorna [] = não acessa nenhuma. Caso contrário, a lista escopada.
 */
export async function getAccessibleCompanyIds(adminId: string): Promise<string[] | null> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { role: true, active: true, scopeAllCompanies: true, scopedCompanyIds: true },
  });
  if (!admin || !admin.active) return [];
  if (admin.role === "SUPER_ADMIN" || admin.scopeAllCompanies) return null;
  return admin.scopedCompanyIds;
}
