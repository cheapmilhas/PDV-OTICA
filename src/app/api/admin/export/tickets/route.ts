import { NextResponse } from "next/server";
import { getAdminSession, getAccessibleCompanyIds } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { csvRow } from "@/lib/csv-safe";
import { adminRateLimit } from "@/lib/rate-limit";
import { getProductContext, productWhereFilter, notDeletedFilter } from "@/lib/admin-product-context";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const limited = adminRateLimit("admin-export-tickets", admin.id, request);
  if (limited) return limited;

  // M5: admin restrito só exporta tickets das empresas no seu escopo.
  // null = sem restrição (SUPER_ADMIN ou scopeAllCompanies); [] = nenhuma.
  const accessible = await getAccessibleCompanyIds(admin.id);
  // Produto ativo — mesmo critério da tela de tickets (via relação company).
  const product = await getProductContext();

  const tickets = await prisma.supportTicket.findMany({
    where: {
      AND: [
        accessible === null ? {} : { companyId: { in: accessible } },
        productWhereFilter(product, { via: "company" }),
        notDeletedFilter({ via: "company" }),
      ],
    },
    include: {
      company: { select: { tradeName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const headers = [
    "Número",
    "Cliente",
    "Assunto",
    "Categoria",
    "Prioridade",
    "Status",
    "Criado em",
    "Atualizado em",
  ];

  const rows = tickets.map((t) => [
    t.number,
    t.company.tradeName,
    t.subject,
    t.category,
    t.priority,
    t.status,
    new Date(t.createdAt).toLocaleDateString("pt-BR"),
    new Date(t.updatedAt).toLocaleDateString("pt-BR"),
  ]);

  const csv = [csvRow(headers), ...rows.map((r) => csvRow(r))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
