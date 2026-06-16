import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getAiConfig, updateAiConfig } from "@/services/ai-config.service";

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

  const body = await request.json();

  const patch: {
    anthropicKey?: string;
    usdBrlRate?: number;
    markupPercent?: number;
    creditTokenFactor?: number;
  } = {};

  if (typeof body.anthropicKey === "string") patch.anthropicKey = body.anthropicKey;
  // Bounds no servidor (o min do input HTML é burlável por chamada direta):
  if (typeof body.usdBrlRate === "number" && body.usdBrlRate >= 0) patch.usdBrlRate = body.usdBrlRate;
  if (typeof body.markupPercent === "number" && body.markupPercent >= 0) patch.markupPercent = body.markupPercent;
  // creditTokenFactor é divisor (tokensToCredits = tokens/fator) → 0 daria Infinity/NaN no medidor da ótica.
  if (typeof body.creditTokenFactor === "number" && body.creditTokenFactor >= 1) patch.creditTokenFactor = body.creditTokenFactor;

  const data = await updateAiConfig(patch);
  return NextResponse.json({ data });
}
