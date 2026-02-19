import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tickets = await prisma.supportTicket.findMany({
    include: {
      company: { select: { tradeName: true } },
    },
    orderBy: { createdAt: "desc" },
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
    `"${t.company.tradeName}"`,
    `"${t.subject}"`,
    t.category,
    t.priority,
    t.status,
    new Date(t.createdAt).toLocaleDateString("pt-BR"),
    new Date(t.updatedAt).toLocaleDateString("pt-BR"),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
