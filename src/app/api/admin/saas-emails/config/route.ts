import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import {
  getSaasEmailConfig,
  updateSaasEmailConfig,
  getSaasEmailSenderView,
  updateSaasEmailSender,
  type SaasEmailConfigPatch,
} from "@/services/saas-email-config.service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/saas-emails/config" });

// Toggles/flags do SaaS (config de comportamento).
const TOGGLE_KEYS = [
  "masterEnabled",
  "testMode",
  "testEmail",
  "welcomeEnabled",
  "trialEndingEnabled",
  "trialExpiredEnabled",
  "invoiceOverdueEnabled",
  "paymentConfirmedEnabled",
  "subscriptionSuspendedEnabled",
  "subscriptionCanceledEnabled",
  "invoiceGenerationEnabled",
  "invoiceCreatedEnabled",
  "invoiceDueSoonEnabled",
] as const;

// Aceita "email@x.com" OU "Nome <email@x.com>" (o From/Reply-To do Resend).
const emailOrNameAddr = z
  .string()
  .trim()
  .max(320)
  .refine(
    (v) => {
      const inAngles = /<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>\s*$/.exec(v);
      const addr = inAngles ? inAngles[1] : v;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
    },
    { message: "E-mail inválido (use email@dominio ou Nome <email@dominio>)" }
  );

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
    invoiceGenerationEnabled: z.boolean().optional(),
    invoiceCreatedEnabled: z.boolean().optional(),
    invoiceDueSoonEnabled: z.boolean().optional(),
    // Remetente + chave (config de credenciais). A chave nunca é reexibida.
    // emailFrom/emailReplyTo aceitam email puro OU "Nome <email@x.com>" (formato
    // RFC 5322 que o Resend usa e que o placeholder da UI mostra) — por isso
    // NÃO usar z.string().email() (que rejeita o display name).
    resendApiKey: z.string().optional(),
    emailFrom: emailOrNameAddr.nullable().optional(),
    emailReplyTo: emailOrNameAddr.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nada para atualizar" });

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const [config, sender] = await Promise.all([getSaasEmailConfig(), getSaasEmailSenderView()]);
  return NextResponse.json({ success: true, data: config, sender });
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

  // Separa credenciais (sender) dos toggles — cada um vai pro seu updater.
  const { resendApiKey, emailFrom, emailReplyTo, ...rest } = parsed.data;
  const togglePatch: SaasEmailConfigPatch = {};
  for (const k of TOGGLE_KEYS) {
    if (k in rest) (togglePatch as Record<string, unknown>)[k] = (rest as Record<string, unknown>)[k];
  }
  const hasToggles = Object.keys(togglePatch).length > 0;
  const hasSender = resendApiKey !== undefined || emailFrom !== undefined || emailReplyTo !== undefined;

  try {
    if (hasSender) {
      await updateSaasEmailSender({ resendApiKey, emailFrom, emailReplyTo }, admin.id);
    }
    const config = hasToggles
      ? await updateSaasEmailConfig(togglePatch, admin.id)
      : await getSaasEmailConfig();
    const sender = await getSaasEmailSenderView();
    // Auditoria best-effort: a config JÁ mudou (e updatedBy registra quem);
    // falha do audit não pode virar 500 mascarando um update bem-sucedido.
    // ⚠️ NUNCA logar a chave — só o booleano de que ela mudou.
    try {
      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          action: "SAAS_EMAILS_CONFIG_CHANGED",
          metadata: {
            ...togglePatch,
            ...(emailFrom !== undefined ? { emailFrom } : {}),
            ...(emailReplyTo !== undefined ? { emailReplyTo } : {}),
            resendKeyChanged: !!(resendApiKey && resendApiKey.trim().length > 0),
            adminEmail: admin.email,
          },
        },
      });
    } catch (auditError) {
      log.error("Falha ao auditar SAAS_EMAILS_CONFIG_CHANGED (config foi alterada)", {
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
    return NextResponse.json({ success: true, data: config, sender });
  } catch (error) {
    log.error("Erro ao alterar config de emails do SaaS", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
