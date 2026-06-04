import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { csvRow } from "@/lib/csv-safe";

import { adminRateLimit } from "@/lib/rate-limit";

const log = logger.child({ route: "admin/export/faturas" });

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const limited = adminRateLimit("admin-export-faturas", admin.id, request);
  if (limited) return limited;

  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        subscription: {
          select: {
            company: {
              select: {
                tradeName: true,
                cnpj: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    // Gerar CSV
    const headers = [
      "ID",
      "Número",
      "Cliente",
      "CNPJ",
      "Status",
      "Subtotal",
      "Desconto",
      "Total",
      "Vencimento",
      "Pagamento",
      "Método",
      "Data Emissão",
    ];

    const rows = invoices.map((i) => [
      i.id,
      i.number,
      i.subscription.company.tradeName,
      i.subscription.company.cnpj || "",
      i.status,
      i.subtotal,
      i.discount,
      i.total,
      i.dueDate?.toISOString().split("T")[0] || "",
      i.paidAt?.toISOString().split("T")[0] || "",
      i.paymentMethod || "",
      i.issuedAt.toISOString().split("T")[0],
    ]);

    const csv = [
      csvRow(headers),
      ...rows.map((row) => csvRow(row)),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="faturas_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    log.error("Erro ao gerar CSV de faturas", { error: error instanceof Error ? error.message : String(error) });

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao gerar CSV",
        },
      },
      { status: 500 }
    );
  }
}
