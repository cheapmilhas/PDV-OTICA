import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { csvRow } from "@/lib/csv-safe";

const log = logger.child({ route: "admin/export/assinaturas" });

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

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
      take: 5000,
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
      csvRow(headers),
      ...rows.map((row) => csvRow(row)),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="assinaturas_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    log.error("Erro ao gerar CSV de assinaturas", { error: error instanceof Error ? error.message : String(error) });

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
