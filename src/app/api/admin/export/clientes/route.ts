import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { csvRow } from "@/lib/csv-safe";
import { adminRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const limited = adminRateLimit("admin-export-clientes", admin.id, request);
  if (limited) return limited;

  const companies = await prisma.company.findMany({
    include: {
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
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
    c.tradeName || "",
    c.name || "",
    c.cnpj || "",
    c.email || "",
    c.phone || "",
    c.city || "",
    c.state || "",
    c.subscriptions[0]?.plan?.name || "",
    c.healthScore || "",
    new Date(c.createdAt).toLocaleDateString("pt-BR"),
  ]);

  const csv = [csvRow(headers), ...rows.map((r) => csvRow(r))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
