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

export default async function InteressadosPage() {
  await requireAdmin();

  let items: InteressadoItem[] = [];
  try {
    const records = await prisma.planInterest.findMany({
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

  return <InteressadosClient initial={items} />;
}
