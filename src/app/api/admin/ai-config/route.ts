import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import {
  getAiConfig,
  updateAiConfig,
  QUALIFIER_MODELS,
  TRANSCRIPTION_MODELS,
} from "@/services/ai-config.service";

/**
 * Schema de validação da config de IA. TODOS os campos são opcionais (PUT parcial),
 * mas quando presentes DEVEM ser válidos — antes a rota descartava valor inválido
 * em silêncio e devolvia 200 (o admin achava que salvou câmbio/modelo e não salvou).
 * Agora valor inválido → 400 com a lista de erros.
 */
const aiConfigSchema = z.object({
  anthropicKey: z.string().optional(),
  openaiKey: z.string().optional(),
  usdBrlRate: z.number().nonnegative().optional(),
  markupPercent: z.number().nonnegative().optional(),
  // Divisor (tokensToCredits = tokens/fator) → 0 daria Infinity/NaN no medidor.
  creditTokenFactor: z.number().int().min(1).optional(),
  qualifierModel: z.enum(QUALIFIER_MODELS).optional(),
  lensAdvisorModel: z.enum(QUALIFIER_MODELS).optional(),
  ocrModel: z.enum(QUALIFIER_MODELS).optional(),
  copilotModel: z.enum(QUALIFIER_MODELS).optional(),
  transcriptionModel: z.enum(TRANSCRIPTION_MODELS).optional(),
});

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

  // JSON malformado → 400 (antes estourava 500 não tratado).
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido no corpo da requisição" }, { status: 400 });
  }

  // Valor inválido → 400 (antes: descartado em silêncio + 200).
  const parsed = aiConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const patch = parsed.data;

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
          copilotModel: patch.copilotModel,
          transcriptionModel: patch.transcriptionModel,
        },
      },
    })
    .catch(() => {});

  return NextResponse.json({ data });
}
