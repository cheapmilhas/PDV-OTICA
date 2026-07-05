import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import {
  getWhatsappGlobalConfig,
  updateWhatsappGlobalConfig,
  validateWhatsappLimits,
} from "@/services/whatsapp-config.service";

/**
 * GET /api/admin/whatsapp-config
 * Config GLOBAL das travas anti-bloqueio (super admin). Defaults = Fase 1.
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await getWhatsappGlobalConfig();
  return NextResponse.json({ data });
}

/**
 * PUT /api/admin/whatsapp-config
 * Atualiza a config global. Valida bounds no servidor (o min do input HTML é
 * burlável por chamada direta).
 */
export async function PUT(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Config GLOBAL anti-bloqueio afeta o disparo de TODOS os tenants — decisão de
  // dono, só SUPER_ADMIN (mesmo padrão de auto-sync/ai-toggle-all).
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const body = await request.json();

  const patch: {
    openHour?: number;
    closeHour?: number;
    dailyCap?: number;
    skipSaturday?: boolean;
  } = {};
  if (typeof body.openHour === "number") patch.openHour = body.openHour;
  if (typeof body.closeHour === "number") patch.closeHour = body.closeHour;
  if (typeof body.dailyCap === "number") patch.dailyCap = body.dailyCap;
  if (typeof body.skipSaturday === "boolean") patch.skipSaturday = body.skipSaturday;

  // Valida contra os valores atuais (p/ a regra closeHour > openHour).
  const current = await getWhatsappGlobalConfig();
  const err = validateWhatsappLimits(patch, current);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const data = await updateWhatsappGlobalConfig(patch);

  // Auditoria best-effort (config global mutável precisa de trilha; nunca derruba a ação).
  await prisma.globalAudit
    .create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "WHATSAPP_CONFIG_CHANGED",
        metadata: { patch },
      },
    })
    .catch(() => {});

  return NextResponse.json({ data });
}
