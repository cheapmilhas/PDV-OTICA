import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const companies = await prisma.company.findMany({
    include: {
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "ID",
    "Nome Fantasia",
    "Razão Social",
    "CNPJ",
    "Email",
    "Telefone",
    "Cidade",
    "UF",
    "Plano",
    "Health Score",
    "Criado em",
  ];

  const rows = companies.map((c) => [
    c.id,
    `"${c.tradeName || ""}"`,
    `"${c.name || ""}"`,
    c.cnpj || "",
    c.email || "",
    c.phone || "",
    c.city || "",
    c.state || "",
    c.subscriptions[0]?.plan?.name || "",
    c.healthScore || "",
    new Date(c.createdAt).toLocaleDateString("pt-BR"),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
