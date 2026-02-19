import { authAdmin } from "@/auth-admin";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminDashboard from "./dashboard/AdminDashboard";

export default async function AdminPage() {
  const session = await authAdmin();

  if (!session || !(session.user as any)?.isAdmin) {
    redirect("/admin/login");
  }

  // Métricas gerais do sistema
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
      admin={{ name: session.user?.name ?? "Admin", email: session.user?.email ?? "", role: (session.user as any)?.role }}
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
