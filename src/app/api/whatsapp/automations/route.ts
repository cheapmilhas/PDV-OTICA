import { NextResponse } from "next/server";
import { z } from "zod";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { DEFAULT_AUTOMATION_TEMPLATES } from "@/lib/whatsapp-automation-templates";
import { prisma } from "@/lib/prisma";

/**
 * GET/PUT /api/whatsapp/automations
 *
 * Liga/desliga as 4 automações de WhatsApp por ótica + templates customizáveis.
 * Gated por settings.edit + feature flag por empresa.
 */

const AUTOMATION_SELECT = {
  waOsReadyEnabled: true,
  waPostSaleEnabled: true,
  waBirthdayEnabled: true,
  waInstallmentDueEnabled: true,
  waOsReadyTemplate: true,
  waPostSaleTemplate: true,
  waBirthdayTemplate: true,
  waInstallmentDueTemplate: true,
  waPostSaleDays: true,
} as const;

export async function GET() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const s = await prisma.companySettings.findUnique({
      where: { companyId },
      select: AUTOMATION_SELECT,
    });

    return NextResponse.json({
      success: true,
      data: {
        osReady: { enabled: s?.waOsReadyEnabled ?? false, template: s?.waOsReadyTemplate ?? null },
        postSale: { enabled: s?.waPostSaleEnabled ?? false, template: s?.waPostSaleTemplate ?? null, days: s?.waPostSaleDays ?? 7 },
        birthday: { enabled: s?.waBirthdayEnabled ?? false, template: s?.waBirthdayTemplate ?? null },
        installmentDue: { enabled: s?.waInstallmentDueEnabled ?? false, template: s?.waInstallmentDueTemplate ?? null },
        defaults: DEFAULT_AUTOMATION_TEMPLATES,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  osReady: z.object({ enabled: z.boolean(), template: z.string().max(2000).nullable().optional() }).optional(),
  postSale: z.object({ enabled: z.boolean(), template: z.string().max(2000).nullable().optional(), days: z.number().int().min(1).max(90).optional() }).optional(),
  birthday: z.object({ enabled: z.boolean(), template: z.string().max(2000).nullable().optional() }).optional(),
  installmentDue: z.object({ enabled: z.boolean(), template: z.string().max(2000).nullable().optional() }).optional(),
});

export async function PUT(request: Request) {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const body = updateSchema.parse(await request.json());

    // Normaliza template vazio → null (usa o padrão do sistema).
    const norm = (t?: string | null) => (t && t.trim() ? t : null);

    const data: Record<string, unknown> = {};
    if (body.osReady) {
      data.waOsReadyEnabled = body.osReady.enabled;
      data.waOsReadyTemplate = norm(body.osReady.template);
    }
    if (body.postSale) {
      data.waPostSaleEnabled = body.postSale.enabled;
      data.waPostSaleTemplate = norm(body.postSale.template);
      if (body.postSale.days !== undefined) data.waPostSaleDays = body.postSale.days;
    }
    if (body.birthday) {
      data.waBirthdayEnabled = body.birthday.enabled;
      data.waBirthdayTemplate = norm(body.birthday.template);
    }
    if (body.installmentDue) {
      data.waInstallmentDueEnabled = body.installmentDue.enabled;
      data.waInstallmentDueTemplate = norm(body.installmentDue.template);
    }

    // upsert: cria CompanySettings se ainda não existir.
    await prisma.companySettings.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
