import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, getAccessibleCompanyIds } from "@/lib/admin-session";
import { csvRow } from "@/lib/csv-safe";
import { adminRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const limited = adminRateLimit("admin-export-health-scores", admin.id, request);
  if (limited) return limited;

  // Escopo: admin restrito só exporta health-scores do seu escopo (null = irrestrito).
  const accessible = await getAccessibleCompanyIds(admin.id);

  const scores = await prisma.healthScore.findMany({
    where: accessible === null ? undefined : { companyId: { in: accessible } },
    orderBy: { calculatedAt: "desc" },
    include: { company: { select: { name: true, email: true } } },
    distinct: ["companyId"],
    take: 5000,
  });

  const rows = [
    csvRow(["empresa", "email", "score", "categoria", "calculado_em"]),
    ...scores.map((s) =>
      csvRow([
        s.company.name,
        s.company.email ?? "",
        s.score,
        s.category,
        new Date(s.calculatedAt).toISOString(),
      ])
    ),
  ].join("\n");

  return new NextResponse(rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="health-scores_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
