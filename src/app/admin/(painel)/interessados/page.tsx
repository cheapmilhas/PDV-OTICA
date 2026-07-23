import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { Info } from "lucide-react";
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

  // Interessados (PlanInterest) não tem coluna de produto — filtrar por produto
  // exigiria migração (proibida na F1). O aviso deixa claro que esta tela NÃO é
  // segmentada pelo seletor de produto, para o operador não achar que o toggle a
  // filtrou. (A segmentação por produto entra numa fase futura, com migração.)
  return (
    <div>
      <div className="mx-6 mt-6 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
        <Info className="h-4 w-4 flex-shrink-0" />
        Esta lista não é segmentada por produto — mostra interessados de todos os produtos.
      </div>
      <InteressadosClient items={items} planSlug={planSlug} />
    </div>
  );
}
