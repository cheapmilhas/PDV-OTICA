import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { getSaasEmailConfig, updateSaasEmailConfig } from "@/services/saas-email-config.service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/saas-emails/config" });

const bodySchema = z
  .object({
    masterEnabled: z.boolean().optional(),
    testMode: z.boolean().optional(),
    testEmail: z.string().email().nullable().optional(),
    welcomeEnabled: z.boolean().optional(),
    trialEndingEnabled: z.boolean().optional(),
    trialExpiredEnabled: z.boolean().optional(),
    invoiceOverdueEnabled: z.boolean().optional(),
    paymentConfirmedEnabled: z.boolean().optional(),
    subscriptionSuspendedEnabled: z.boolean().optional(),
    subscriptionCanceledEnabled: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nada para atualizar" });

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const config = await getSaasEmailConfig();
  return NextResponse.json({ success: true, data: config });
}

export async function PATCH(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const config = await updateSaasEmailConfig(parsed.data, admin.id);
    // Auditoria best-effort: a config JÁ mudou (e config.updatedBy registra quem);
    // falha do audit não pode virar 500 mascarando um update bem-sucedido.
    try {
      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          action: "SAAS_EMAILS_CONFIG_CHANGED",
          metadata: { ...parsed.data, adminEmail: admin.email },
        },
      });
    } catch (auditError) {
      log.error("Falha ao auditar SAAS_EMAILS_CONFIG_CHANGED (config foi alterada)", {
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    log.error("Erro ao alterar config de emails do SaaS", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
