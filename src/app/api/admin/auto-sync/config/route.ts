import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { updateAutoSyncConfig } from "@/services/auto-sync-config.service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/auto-sync/config" });

const bodySchema = z
  .object({
    isEnabled: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((b) => b.isEnabled !== undefined || b.dryRun !== undefined, {
    message: "Nada para atualizar",
  });

export async function PATCH(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Liga/desliga da sincronização global é decisão de dono — só SUPER_ADMIN.
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const config = await updateAutoSyncConfig(parsed.data, admin.id);
    // Auditoria best-effort: a config JÁ mudou (e config.updatedBy registra quem);
    // falha do audit não pode virar 500 mascarando um update bem-sucedido.
    try {
      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          action: "AUTO_SYNC_TOGGLED",
          metadata: { ...parsed.data, adminEmail: admin.email },
        },
      });
    } catch (auditError) {
      log.error("Falha ao auditar AUTO_SYNC_TOGGLED (config foi alterada)", {
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
    log.info("Auto-sync config alterada", { ...parsed.data, adminId: admin.id });
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    log.error("Erro ao alterar auto-sync config", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
