import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClientesFilters } from "./ClientesFilters";
import { ClientesTable } from "./ClientesTable";

// Include compartilhado entre a query e o tipo da prop do ClientesTable
export const companyInclude = {
  subscriptions: {
    take: 1,
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  },
  onboardingChecklist: {
    include: { steps: { where: { isRequired: true } } },
  },
  companyTags: { include: { tag: true }, take: 3 },
  _count: { select: { users: true, sales: true } },
} satisfies import("@prisma/client").Prisma.CompanyInclude;

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    health?: string;
    onboarding?: string;
    segment?: string;
    tag?: string;
    quick?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const search = params.search ?? "";
  const statusFilter = params.status ?? "";
  const healthFilter = params.health ?? "";
  const onboardingFilter = params.onboarding ?? "";
  const segmentFilter = params.segment ?? "";
  const tagFilter = params.tag ?? "";

  // Buscar todas as tags para o filtro
  const allTags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  const companies = await prisma.company.findMany({
    where: {
      AND: [
        search
          ? { OR: [
              { name: { contains: search, mode: "insensitive" } },
              { cnpj: { contains: search } },
              { email: { contains: search, mode: "insensitive" } },
            ]}
          : {},
        statusFilter
          ? { subscriptions: { some: { status: statusFilter as any } } }
          : {},
        healthFilter
          ? { healthCategory: healthFilter as any }
          : {},
        onboardingFilter
          ? { onboardingStatus: onboardingFilter as any }
          : {},
        segmentFilter
          ? { segment: segmentFilter as any }
          : {},
        tagFilter
          ? { companyTags: { some: { tagId: tagFilter } } }
          : {},
      ],
    },
    include: companyInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Contagens para filtros de status
  const statusCounts = await prisma.subscription.groupBy({ by: ["status"], _count: true });
  const counts = statusCounts.reduce(
    (acc, item) => ({ ...acc, [item.status]: item._count }),
    {} as Record<string, number>
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Empresas"
        subtitle={`${companies.length} empresa${companies.length !== 1 ? "s" : ""} encontrada${companies.length !== 1 ? "s" : ""}`}
        actions={
          <Link
            href="/admin/clientes/novo"
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Nova Empresa
          </Link>
        }
      />

      <ClientesFilters
        search={search}
        statusFilter={statusFilter}
        healthFilter={healthFilter}
        onboardingFilter={onboardingFilter}
        segmentFilter={segmentFilter}
        tagFilter={tagFilter}
        counts={counts}
        allTags={allTags}
      />

      <ClientesTable companies={companies} />
    </div>
  );
}
