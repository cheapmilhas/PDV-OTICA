import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import AdminDashboard from "./dashboard/AdminDashboard";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-change-me"
);

async function getAdminFromToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin.session-token")?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.isAdmin) return null;
    return payload as { id: string; email: string; name: string; role: string; isAdmin: boolean };
  } catch {
    return null;
  }
}

export default async function AdminPage() {
  const admin = await getAdminFromToken();

  if (!admin) {
    redirect("/admin/login");
  }

  const [
    totalCompanies,
    activeSubscriptions,
    trialSubscriptions,
    totalRevenueCents,
    recentCompanies,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIAL" } }),
    prisma.invoice.aggregate({
      where: { status: "PAID" },
      _sum: { total: true },
    }),
    prisma.company.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        subscriptions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: { plan: { select: { name: true, slug: true } } },
        },
      },
    }),
  ]);

  const totalRevenue = ((totalRevenueCents._sum?.total) ?? 0) / 100;

  return (
    <AdminDashboard
      admin={{ name: admin.name, email: admin.email, role: admin.role }}
      metrics={{ totalCompanies, activeSubscriptions, trialSubscriptions, totalRevenue }}
      recentCompanies={recentCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? "",
        createdAt: c.createdAt.toISOString(),
        plan: c.subscriptions[0]?.plan?.name ?? "—",
        status: c.subscriptions[0]?.status ?? "—",
      }))}
    />
  );
}
