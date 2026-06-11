import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { renderEmailTemplate } from "@/lib/emails/templates";
import { SAAS_EMAIL_CATALOG } from "@/lib/emails/saas-email-catalog";
import { logger } from "@/lib/logger";
import type { SaasEmailType } from "@prisma/client";

const log = logger.child({ route: "admin/saas-emails/preview" });

const SAMPLE: Record<SaasEmailType, Record<string, unknown>> = {
  WELCOME: { name: "João Silva", loginUrl: "https://app.vis.app.br/login" },
  TRIAL_ENDING: { name: "João Silva", daysLeft: 3, subscribeUrl: "https://app.vis.app.br/dashboard/upgrade" },
  TRIAL_EXPIRED: { name: "João Silva", subscribeUrl: "https://app.vis.app.br/dashboard/upgrade" },
  INVOICE_OVERDUE: { name: "João Silva", daysOverdue: 7, payUrl: "https://app.vis.app.br/dashboard/configuracoes" },
  PAYMENT_CONFIRMED: { name: "João Silva", amountLabel: "R$ 149,90" },
  SUBSCRIPTION_SUSPENDED: { name: "João Silva", payUrl: "https://app.vis.app.br/dashboard/configuracoes" },
  SUBSCRIPTION_CANCELED: { name: "João Silva", reactivateUrl: "https://app.vis.app.br/dashboard/upgrade" },
};

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const type = new URL(request.url).searchParams.get("type") as SaasEmailType | null;
  // Object.hasOwn (não `in`): `in` é truthy p/ chaves do protótipo ("__proto__",
  // "constructor", ...) → passariam e quebrariam o render com 500.
  if (!type || !Object.hasOwn(SAAS_EMAIL_CATALOG, type)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  try {
    const { html } = renderEmailTemplate(SAAS_EMAIL_CATALOG[type].template, SAMPLE[type]);
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    log.error("Erro ao renderizar preview de email", {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro ao renderizar template" }, { status: 500 });
  }
}
