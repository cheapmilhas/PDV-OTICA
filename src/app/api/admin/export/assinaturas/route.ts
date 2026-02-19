import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        company: {
          select: {
            tradeName: true,
            cnpj: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Gerar CSV
    const headers = [
      "ID",
      "Cliente",
      "CNPJ",
      "Plano",
      "Status",
      "Ciclo de Cobrança",
      "Data Início",
      "Fim do Trial",
      "Período Atual Início",
      "Período Atual Fim",
      "Data Criação",
    ];

    const rows = subscriptions.map((s) => [
      s.id,
      s.company.tradeName,
      s.company.cnpj,
      s.plan.name,
      s.status,
      s.billingCycle,
      s.activatedAt?.toISOString().split("T")[0] || "",
      s.trialEndsAt?.toISOString().split("T")[0] || "",
      s.currentPeriodStart?.toISOString().split("T")[0] || "",
      s.currentPeriodEnd?.toISOString().split("T")[0] || "",
      s.createdAt.toISOString().split("T")[0],
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="assinaturas_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao gerar CSV de assinaturas:", error);

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
