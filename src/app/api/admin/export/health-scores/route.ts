import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const scores = await prisma.healthScore.findMany({
    orderBy: { calculatedAt: "desc" },
    include: { company: { select: { name: true, email: true } } },
    distinct: ["companyId"],
  });

  const rows = [
    "empresa,email,score,categoria,calculado_em",
    ...scores.map((s) =>
      [
        `"${s.company.name}"`,
        s.company.email ?? "",
        s.score,
        s.category,
        new Date(s.calculatedAt).toISOString(),
      ].join(",")
    ),
  ].join("\n");

  return new NextResponse(rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="health-scores_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
