import { requireAdmin, getAccessibleCompanyIds } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
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
  const admin = await requireAdmin();
  // Escopo: admin restrito só enxerga empresas do seu escopo (null = irrestrito).
  // Alinha a página à API /api/admin/clientes, que já filtra por escopo.
  const accessible = await getAccessibleCompanyIds(admin.id);
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
        accessible === null ? {} : { id: { in: accessible } },
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

  // Total real (respeitando os MESMOS filtros) — para o subtítulo não mentir
  // quando a lista é truncada em 100 ("mostrando 100 de N").
  const totalCount = await prisma.company.count({
    where: {
      AND: [
        accessible === null ? {} : { id: { in: accessible } },
        search
          ? { OR: [
              { name: { contains: search, mode: "insensitive" } },
              { cnpj: { contains: search } },
              { email: { contains: search, mode: "insensitive" } },
            ]}
          : {},
        statusFilter ? { subscriptions: { some: { status: statusFilter as any } } } : {},
        healthFilter ? { healthCategory: healthFilter as any } : {},
        onboardingFilter ? { onboardingStatus: onboardingFilter as any } : {},
        segmentFilter ? { segment: segmentFilter as any } : {},
        tagFilter ? { companyTags: { some: { tagId: tagFilter } } } : {},
      ],
    },
  });

  // Contagens para filtros de status (respeitando o escopo do admin)
  const statusCounts = await prisma.subscription.groupBy({
    by: ["status"],
    _count: true,
    where: accessible === null ? undefined : { companyId: { in: accessible } },
  });
  const counts = statusCounts.reduce(
    (acc, item) => ({ ...acc, [item.status]: item._count }),
    {} as Record<string, number>
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Empresas"
        subtitle={
          totalCount > companies.length
            ? `Mostrando ${companies.length} de ${totalCount} empresas — refine os filtros para ver as demais`
            : `${totalCount} empresa${totalCount !== 1 ? "s" : ""} encontrada${totalCount !== 1 ? "s" : ""}`
        }
        actions={
          <Button asChild>
            <Link href="/admin/clientes/novo">
              <UserPlus className="h-4 w-4" />
              Nova Empresa
            </Link>
          </Button>
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
