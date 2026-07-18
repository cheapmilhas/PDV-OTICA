import { requireAdmin, getAccessibleCompanyIds } from "@/lib/admin-session";
import { getProductContext, productWhereFilter, notDeletedFilter } from "@/lib/admin-product-context";
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
  // Produto ativo do painel (cookie): segmenta a lista igual ao dashboard.
  // É contexto de UX, não autorização — o escopo acima é a fronteira real.
  const product = await getProductContext();
  const params = await searchParams;
  const search = params.search ?? "";
  const statusFilter = params.status ?? "";
  const healthFilter = params.health ?? "";
  const onboardingFilter = params.onboarding ?? "";
  const segmentFilter = params.segment ?? "";
  const tagFilter = params.tag ?? "";

  // Buscar todas as tags para o filtro
  const allTags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  // where único: findMany e count NÃO podem divergir, senão o subtítulo mente.
  const where = {
    AND: [
      accessible === null ? {} : { id: { in: accessible } },
      productWhereFilter(product),
      // Esconde empresas "excluídas" pelo super admin (soft-delete: a ação
      // `delete` marca blockedReason='DELETED', não apaga a linha). Helper
      // compartilhado com o dashboard — mesmo critério nos dois (senão a lista
      // e as contagens divergem, como divergiam antes).
      notDeletedFilter(),
      search
        ? { OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { cnpj: { contains: search } },
            { email: { contains: search, mode: "insensitive" as const } },
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
  };

  const companies = await prisma.company.findMany({
    where,
    include: companyInclude,
    // tiebreaker por id: createdAt não é único → truncamento em 100 estável.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  // Total real (respeitando os MESMOS filtros) — para o subtítulo não mentir
  // quando a lista é truncada em 100 ("mostrando 100 de N").
  const totalCount = await prisma.company.count({ where });

  // Contagens para filtros de status (mesmo escopo e mesmo produto da lista —
  // Subscription não tem platformProduct, filtra pela relação company).
  const statusCounts = await prisma.subscription.groupBy({
    by: ["status"],
    _count: true,
    where: {
      AND: [
        accessible === null ? {} : { companyId: { in: accessible } },
        productWhereFilter(product, { via: "company" }),
        // Mesmo escopo da lista: assinatura de empresa excluída não conta nos
        // filtros de status (a `delete` marca a Company, não cancela a sub).
        notDeletedFilter({ via: "company" }),
      ],
    },
  });
  const counts = statusCounts.reduce(
    (acc, item) => ({ ...acc, [item.status]: item._count }),
    {} as Record<string, number>
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Clientes"
        subtitle={
          totalCount > companies.length
            ? `Mostrando ${companies.length} de ${totalCount} clientes — refine os filtros para ver os demais`
            : `${totalCount} cliente${totalCount !== 1 ? "s" : ""} encontrado${totalCount !== 1 ? "s" : ""}`
        }
        actions={
          <Button asChild>
            <Link href="/admin/clientes/novo">
              <UserPlus className="h-4 w-4" />
              Novo Cliente
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
