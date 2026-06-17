import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
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
  return NextResponse.json({ data });
}
