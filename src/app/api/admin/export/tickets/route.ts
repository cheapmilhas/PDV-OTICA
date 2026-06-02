import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { csvRow } from "@/lib/csv-safe";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const tickets = await prisma.supportTicket.findMany({
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
