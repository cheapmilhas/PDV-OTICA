import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
      i.subtotal.toString(),
      i.discount.toString(),
      i.total.toString(),
      i.dueDate?.toISOString().split("T")[0] || "",
      i.paidAt?.toISOString().split("T")[0] || "",
      i.paymentMethod || "",
      i.issuedAt.toISOString().split("T")[0],
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="faturas_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao gerar CSV de faturas:", error);

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
