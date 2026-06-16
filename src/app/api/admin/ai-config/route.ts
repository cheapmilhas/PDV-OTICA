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
  if (typeof body.usdBrlRate === "number") patch.usdBrlRate = body.usdBrlRate;
  if (typeof body.markupPercent === "number") patch.markupPercent = body.markupPercent;
  if (typeof body.creditTokenFactor === "number") patch.creditTokenFactor = body.creditTokenFactor;

  const data = await updateAiConfig(patch);
  return NextResponse.json({ data });
}
