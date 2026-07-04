import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { csvRow } from "@/lib/csv-safe";

/**
 * GET /api/admin/plan-interests
 * Lista os interessados em planos "Em breve" (tabela PlanInterest).
 * Aceita ?planSlug=<slug> para filtrar e ?format=csv para exportar.
 */
export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const url = new URL(request.url);
  const planSlug = url.searchParams.get("planSlug") || undefined;
  const format = url.searchParams.get("format");

  const items = await prisma.planInterest.findMany({
    where: planSlug ? { planSlug } : undefined,
    orderBy: { createdAt: "desc" },
  });

  if (format === "csv") {
    // csvRow neutraliza injeção de fórmula (=+-@) — os campos vêm de formulário
    // público, então um interessado poderia enviar name = "=HYPERLINK(...)".
    const header = csvRow(["nome", "email", "telefone", "empresa", "plano", "data"]);
    const rows = items
      .map((i) =>
        csvRow([i.name, i.email, i.phone ?? "", i.companyName ?? "", i.planSlug, i.createdAt.toISOString()])
      )
      .join("\n");
    return new NextResponse(header + "\n" + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="interessados.csv"`,
      },
    });
  }

  return NextResponse.json({ items });
}
