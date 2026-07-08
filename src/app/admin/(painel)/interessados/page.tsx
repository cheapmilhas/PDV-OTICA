import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { InteressadosClient } from "./interessados-client";

export interface InteressadoItem {
  id: string;
  planSlug: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  createdAt: string;
}

export default async function InteressadosPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  await requireAdmin();

  // Filtro por plano vive na URL (?plan=slug) e é aplicado NO SERVIDOR — mesmo
  // padrão de assinaturas/faturas (chips como Link). Antes o interessados
  // filtrava via <select> + fetch client-side, um 3º padrão divergente.
  const { plan } = await searchParams;
  const planSlug = plan ?? "";

  let items: InteressadoItem[] = [];
  try {
    const records = await prisma.planInterest.findMany({
      where: planSlug ? { planSlug } : undefined,
      orderBy: { createdAt: "desc" },
    });
    items = records.map((r) => ({
      id: r.id,
      planSlug: r.planSlug,
      name: r.name,
      email: r.email,
      phone: r.phone,
      companyName: r.companyName,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    // Resiliência: se a tabela/coluna ainda não existir no banco (build/prerender),
    // renderiza a tela vazia em vez de quebrar.
    items = [];
  }

  return <InteressadosClient items={items} planSlug={planSlug} />;
}
