import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { containsHtml } from "@/lib/validations/safe-text";
import { enqueueProvisioning, runProvisioningOnce } from "@/services/provisioning-outbox.service";
import { isPlanTier } from "@/lib/resolve-plan-for-tier";
import type { ProvisionRequest } from "@/lib/vis-provision-client";

const log = logger.child({ route: "public/register-medical" });

/**
 * POST /api/public/register-medical
 * Auto-cadastro público de CLÍNICA (VIS_MEDICAL) com trial — paridade com o
 * register da ótica, mas: (1) NÃO cria Branch/finance ótico; (2) NÃO define
 * senha (o admin recebe convite e define no Domus); (3) aloca domusClinicId e
 * dispara o provisionamento da clínica no Domus (motor do Sprint 3).
 *
 * Só planos medical self-service. CPF ou CNPJ (clínica pode ser PF).
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const blocked = rateLimitResponse(`register-medical:${ip}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 });
    if (blocked) return blocked;

    const body = await request.json();
    const { name, email, phone, companyName, document, planId } = body;

    // Obrigatórios (SEM password — a senha vem por convite).
    if (!name || !email || !companyName) {
      return NextResponse.json({ error: "Campos obrigatórios: nome, email e nome da clínica" }, { status: 400 });
    }
    if (
      typeof name !== "string" || typeof companyName !== "string" ||
      name.length > 120 || companyName.length > 120 ||
      containsHtml(name) || containsHtml(companyName)
    ) {
      return NextResponse.json({ error: "Nome ou nome da clínica inválido (não pode conter HTML)" }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    // CPF ou CNPJ (medical aceita PF). Se fornecido, valida tamanho e unicidade.
    const cleanDoc = typeof document === "string" ? document.replace(/\D/g, "") : "";
    if (cleanDoc && cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      return NextResponse.json({ error: "CPF (11) ou CNPJ (14 dígitos) inválido" }, { status: 400 });
    }

    // Email único global (o admin da clínica não pode colidir).
    const existingEmail = await prisma.company.findFirst({ where: { email: email.toLowerCase().trim() } });
    if (existingEmail) {
      return NextResponse.json({ error: "Este email já está cadastrado." }, { status: 409 });
    }
    if (cleanDoc) {
      const existingDoc = await prisma.company.findFirst({ where: { cnpj: cleanDoc } });
      if (existingDoc) {
        return NextResponse.json({ error: "Já existe um cadastro com este CPF/CNPJ." }, { status: 409 });
      }
    }

    // Plano medical self-service. Guard do P0: NUNCA serve plano de ótica aqui.
    let plan = null;
    if (planId) {
      plan = await prisma.plan.findFirst({
        where: { id: planId, isActive: true, status: "ACTIVE", platformProduct: "VIS_MEDICAL", selfServiceSelectable: true },
      });
      // Plano ESCOLHIDO e inelegível → ERRO, nunca fallback silencioso. Cair no
      // "mais barato" aqui assinaria a pessoa num plano que ela não escolheu:
      // quem clicou em "Clínica" (R$189,90) terminaria no "Profissional"
      // (R$89,90) sem ser avisado — cobrança errada e sem rastro de decisão.
      // O fallback abaixo existe só para quem NÃO escolheu nada.
      if (!plan) {
        return NextResponse.json(
          { error: "O plano selecionado não está mais disponível. Escolha outro." },
          { status: 409 },
        );
      }
    }
    if (!plan) {
      plan = await prisma.plan.findFirst({
        where: { isActive: true, status: "ACTIVE", platformProduct: "VIS_MEDICAL", selfServiceSelectable: true },
        orderBy: { priceMonthly: "asc" },
      });
    }
    if (!plan) {
      return NextResponse.json({ error: "Nenhum plano de clínica disponível no momento." }, { status: 500 });
    }

    // Fail-closed de tier: tier vazio/desconhecido abriria TUDO no gating do
    // Domus (isModuleEnabled é fail-open lá). Um plano medical sem tier é erro
    // de configuração — não provisionar. Ver plan.tier (nullable) no schema.
    if (!isPlanTier(plan.tier ?? "")) {
      return NextResponse.json(
        { error: "Plano de clínica sem tier configurado. Contate o suporte." },
        { status: 500 },
      );
    }

    // Slug único.
    const baseSlug = companyName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.company.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);
    const clinicId = randomUUID();
    let payload: ProvisionRequest | null = null;

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName.trim(),
          tradeName: companyName.trim(),
          cnpj: cleanDoc || null,
          phone: phone?.trim() || null,
          email: email.toLowerCase().trim(),
          slug,
          platformProduct: "VIS_MEDICAL",
          domusClinicId: clinicId,
          onboardingStatus: "PENDING_INVITE",
          maxUsers: plan.maxUsers,
          maxProducts: plan.maxProducts,
          maxBranches: plan.maxBranches,
          // Medical não tem health derivado de sinais óticos (F1).
          healthScore: null,
          healthCategory: null,
        },
      });

      await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: plan.id,
          status: "TRIAL",
          trialStartedAt: now,
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          billingCycle: "MONTHLY",
        },
      });

      // Enfileira o provisionamento da clínica no Domus (mesma tx).
      payload = {
        eventId: `provision:${clinicId}`,
        requestId: randomUUID(),
        requestedByAdminId: "public-signup", // ator: cadastro público
        clinicId,
        visCompanyId: company.id,
        clinicName: companyName.trim(),
        admin: { email: email.toLowerCase().trim(), name: name.trim(), role: "admin" },
        // planTier já validado como tier conhecido acima (fail-closed) — nunca "".
        entitlement: { writeAllowed: true, planTier: plan.tier as string, sourceRevision: "0" },
      };
      await enqueueProvisioning(tx, company.id, payload, randomUUID());

      await tx.globalAudit.create({
        data: {
          actorType: "USER",
          actorId: null,
          companyId: company.id,
          action: "SELF_REGISTRATION",
          metadata: { product: "VIS_MEDICAL", planId: plan.id, planName: plan.name },
        },
      });

      return { company };
    });

    // Fast-path síncrono (best-effort; worker reconcilia se falhar).
    let provisioningState: string | null = null;
    if (payload) {
      provisioningState = await runProvisioningOnce(result.company.id).catch((err) => {
        log.error("fast-path de provisionamento falhou (worker reconcilia)", {
          companyId: result.company.id, error: err instanceof Error ? err.message : String(err),
        });
        return "PROVISIONING";
      });

      // Despacha a fila de e-mail NA HORA. O provisionamento acabou de
      // enfileirar o convite; sem isto ele só sairia no próximo tick do cron —
      // e um convite de cadastro que chega horas depois é um cadastro perdido
      // (a pessoa fecha a aba achando que não funcionou).
      //
      // Best-effort e isolado: o cron horário continua sendo a rede de
      // segurança, então falhar aqui atrasa o e-mail, não perde. Limite baixo
      // porque o objetivo é despachar ESTE convite, não drenar a fila inteira
      // dentro do request de alguém.
      try {
        const { processEmailQueue } = await import("@/services/email-queue.service");
        await processEmailQueue(5);
      } catch (err) {
        log.error("fast-path de e-mail falhou (cron reenvia)", {
          companyId: result.company.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Clínica criada! Você receberá um convite para definir sua senha e acessar.",
      companyId: result.company.id,
      provisioningState,
    });
  } catch (error: unknown) {
    log.error("Erro no cadastro medical", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro ao criar cadastro." }, { status: 500 });
  }
}
