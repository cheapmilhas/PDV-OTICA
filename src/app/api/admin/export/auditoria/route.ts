import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { csvRow } from "@/lib/csv-safe";
import { adminRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const limited = adminRateLimit("admin-export-auditoria", admin.id, request);
  if (limited) return limited;

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
    csvRow(["data", "acao", "admin", "empresa", "detalhes"]),
    ...logs.map((l) =>
      csvRow([
        new Date(l.createdAt).toISOString(),
        l.action,
        l.adminUser?.name ?? "Sistema",
        l.company?.name ?? "",
        JSON.stringify(l.metadata ?? {}),
      ])
    ),
  ].join("\n");

  return new NextResponse(rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
