import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const logs = await prisma.globalAudit.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: {
      company: { select: { name: true } },
      adminUser: { select: { name: true, email: true } },
    },
    take: 5000,
  });

  const rows = [
    "data,acao,admin,empresa,detalhes",
    ...logs.map((l) =>
      [
        new Date(l.createdAt).toISOString(),
        l.action,
        `"${l.adminUser?.name ?? "Sistema"}"`,
        `"${l.company?.name ?? ""}"`,
        `"${JSON.stringify(l.metadata ?? {}).replace(/"/g, "'")}"`,
      ].join(",")
    ),
  ].join("\n");

  return new NextResponse(rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
