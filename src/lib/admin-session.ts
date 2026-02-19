import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { redirect } from "next/navigation";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-change-me"
);

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
