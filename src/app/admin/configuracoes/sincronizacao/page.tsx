import { requireAdminRole } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getAutoSyncConfig } from "@/services/auto-sync-config.service";
import { SincronizacaoClient } from "./sincronizacao-client";

export default async function SincronizacaoPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  const config = await getAutoSyncConfig();
  const audits = await prisma.globalAudit.findMany({
    where: { action: { in: ["COMPANY_AUTO_SYNCED", "COMPANY_RESYNCED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { company: { select: { name: true } } },
  });

  return (
    <SincronizacaoClient
      config={{
        isEnabled: config.isEnabled,
        dryRun: config.dryRun,
        lastRunAt: config.lastRunAt?.toISOString() ?? null,
        lastRunSummary: (config.lastRunSummary as Record<string, unknown> | null) ?? null,
      }}
      audits={audits.map((a) => ({
        id: a.id,
        companyName: a.company?.name ?? a.companyId ?? "—",
        createdAt: a.createdAt.toISOString(),
        metadata: (a.metadata as Record<string, unknown> | null) ?? null,
      }))}
    />
  );
}
