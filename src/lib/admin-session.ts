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
/**
 * Segredo do cookie de admin. SEGURANÇA (pentest 2026-06-27): admin e tenant
 * assinavam JWT com o MESMO segredo (AUTH_SECRET), então quem o obtivesse podia
 * forjar um cookie de admin. Agora preferimos um ADMIN_JWT_SECRET dedicado; o
 * fallback para AUTH_SECRET mantém a compatibilidade até a env nova ser setada
 * em produção (rotação sem downtime). Defina ADMIN_JWT_SECRET ≠ AUTH_SECRET na
 * Vercel e invalide os cookies admin antigos.
 */
export function getAdminJwtSecret(): Uint8Array {
  const secret =
    process.env.ADMIN_JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET (ou AUTH_SECRET) é obrigatório");
  return new TextEncoder().encode(secret);
}

// Mantido como alias interno para minimizar o diff nas funções abaixo.
function getJwtSecret(): Uint8Array {
  return getAdminJwtSecret();
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

/**
 * Status HTTP + mensagem padronizados para falha de autorização de admin.
 * Use o campo `status` para montar a resposta na rota (mantém este módulo
 * desacoplado de NextResponse e testável sem o runtime do Next).
 */
export interface AdminAuthFailure {
  ok: false;
  status: 401 | 403;
  message: string;
}

export interface AdminAuthSuccess {
  ok: true;
  admin: { id: string; role: string };
}

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure;

/**
 * Combina autenticação de admin + verificação de escopo de empresa numa única
 * chamada. Fecha a classe inteira de bugs "esqueci o requireCompanyScope":
 * uma rota por-empresa passa a precisar de UMA linha em vez de copiar o bloco
 * de 5 linhas (que foi aplicado em algumas rotas e esquecido em muitas).
 *
 * - `mode: "scope"` (default) exige papel ADMIN/SUPER_ADMIN (ações sensíveis).
 * - `mode: "support"` aceita também SUPPORT/BILLING (operações de suporte).
 *
 * Retorna `{ ok: true, admin }` ou `{ ok: false, status, message }`. A rota
 * converte a falha em NextResponse — ex.:
 *   const r = await requireAdminAndScope(companyId);
 *   if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
 */
export async function requireAdminAndScope(
  companyId: string,
  mode: "scope" | "support" = "scope"
): Promise<AdminAuthResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, status: 401, message: "Não autorizado" };
  const scoped =
    mode === "support"
      ? await requireSupportScope(session.id, companyId)
      : await requireCompanyScope(session.id, companyId);
  if (!scoped) return { ok: false, status: 403, message: "Sem permissão para esta empresa" };
  return { ok: true, admin: scoped };
}
