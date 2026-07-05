import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getAiConfig, updateAiConfig, QUALIFIER_MODELS } from "@/services/ai-config.service";

/**
 * GET /api/admin/ai-config
 * Retorna a visão da config de IA (hasKey + câmbio + markup + fator).
 * Nunca expõe a chave Anthropic descriptografada.
 */
export async function GET(_request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await getAiConfig();
  return NextResponse.json({ data });
}

/**
 * PUT /api/admin/ai-config
 * Atualiza campos de configuração global de IA.
 * Apenas campos com tipo correto são encaminhados para o serviço.
 */
export async function PUT(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Grava chaves de API globais (Anthropic/OpenAI), câmbio e markup que afetam
  // TODOS os tenants — só SUPER_ADMIN (mesmo padrão de auto-sync/ai-toggle-all).
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const body = await request.json();

  const patch: {
    anthropicKey?: string;
    usdBrlRate?: number;
    markupPercent?: number;
    creditTokenFactor?: number;
    qualifierModel?: string;
    lensAdvisorModel?: string;
    ocrModel?: string;
    openaiKey?: string;
  } = {};

  if (typeof body.anthropicKey === "string") patch.anthropicKey = body.anthropicKey;
  // Bounds no servidor (o min do input HTML é burlável por chamada direta):
  if (typeof body.usdBrlRate === "number" && body.usdBrlRate >= 0) patch.usdBrlRate = body.usdBrlRate;
  if (typeof body.markupPercent === "number" && body.markupPercent >= 0) patch.markupPercent = body.markupPercent;
  // creditTokenFactor é divisor (tokensToCredits = tokens/fator) → 0 daria Infinity/NaN no medidor da ótica.
  if (typeof body.creditTokenFactor === "number" && body.creditTokenFactor >= 1) patch.creditTokenFactor = body.creditTokenFactor;
  // qualifierModel: só encaminha se estiver na allowlist (o serviço também valida; aqui ignora silenciosamente como os demais campos).
  if (typeof body.qualifierModel === "string" && (QUALIFIER_MODELS as readonly string[]).includes(body.qualifierModel)) {
    patch.qualifierModel = body.qualifierModel;
  }
  // lensAdvisorModel: mesma allowlist do qualifier (o serviço também valida; aqui ignora silenciosamente como os demais campos).
  if (typeof body.lensAdvisorModel === "string" && (QUALIFIER_MODELS as readonly string[]).includes(body.lensAdvisorModel)) {
    patch.lensAdvisorModel = body.lensAdvisorModel;
  }
  // ocrModel: mesma allowlist (o serviço também valida; aqui ignora silenciosamente como os demais).
  if (typeof body.ocrModel === "string" && (QUALIFIER_MODELS as readonly string[]).includes(body.ocrModel)) {
    patch.ocrModel = body.ocrModel;
  }
  if (typeof body.openaiKey === "string") patch.openaiKey = body.openaiKey;

  const data = await updateAiConfig(patch);

  // Auditoria best-effort. NUNCA registra as chaves em claro: apenas quais campos
  // mudaram (as chaves viram booleano de "tocou/não tocou").
  await prisma.globalAudit
    .create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "AI_CONFIG_CHANGED",
        metadata: {
          changedFields: Object.keys(patch),
          anthropicKeyChanged: patch.anthropicKey !== undefined,
          openaiKeyChanged: patch.openaiKey !== undefined,
          usdBrlRate: patch.usdBrlRate,
          markupPercent: patch.markupPercent,
          creditTokenFactor: patch.creditTokenFactor,
          qualifierModel: patch.qualifierModel,
          lensAdvisorModel: patch.lensAdvisorModel,
          ocrModel: patch.ocrModel,
        },
      },
    })
    .catch(() => {});

  return NextResponse.json({ data });
}
