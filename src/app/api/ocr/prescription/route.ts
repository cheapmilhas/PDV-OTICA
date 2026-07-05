import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { logAiUsage } from "@/services/ai-usage.service";
import { getAnthropicKey, getAiConfig } from "@/services/ai-config.service";
import { rateLimitResponse } from "@/lib/rate-limit";

// Limite de tamanho de base64: ~8MB de imagem (cobre fotos de receita de boa qualidade
// mas previne DoS por payload gigante consumir API Anthropic caro)
const MAX_BASE64_BYTES = 8 * 1024 * 1024 * 1.4; // ~11.5MB base64 = ~8MB binário

const OCR_PROMPT = `Você é um especialista em leitura de receitas oftalmológicas.
Analise esta imagem de receita médica e extraia os dados da prescrição.

Retorne SOMENTE um JSON válido (sem markdown, sem texto extra) com a seguinte estrutura:
{
  "od": {
    "esf": null,
    "cil": null,
    "eixo": null,
    "dnp": null,
    "altura": null,
    "add": null,
    "prisma": null,
    "base": null
  },
  "oe": {
    "esf": null,
    "cil": null,
    "eixo": null,
    "dnp": null,
    "altura": null,
    "add": null,
    "prisma": null,
    "base": null
  },
  "piLonge": null,
  "piPerto": null,
  "doctorName": null,
  "doctorCrm": null,
  "observations": null
}

Regras:
- "esf" = esférico/grau (pode ser positivo +1.00 ou negativo -2.50)
- "cil" = cilíndrico (sempre negativo, ex: -0.75)
- "eixo" = eixo em graus (0-180)
- "dnp" = distância naso-pupilar em mm
- "altura" = altura da montagem em mm
- "add" = adição para perto (sempre positivo)
- "prisma" = valor do prisma em dioptrias prismáticas
- "base" = base do prisma (NASAL, TEMPORAL, SUPERIOR, INFERIOR)
- "piLonge" = distância pupilar para longe (DP longe) em mm
- "piPerto" = distância pupilar para perto (DP perto) em mm
- "doctorName" = nome do médico/oftalmologista se visível
- "doctorCrm" = CRM do médico se visível
- "observations" = qualquer observação adicional relevante
- OD = olho direito, OE = olho esquerdo
- Valores numéricos devem ser números (não strings)
- Se não conseguir ler um campo, deixe null
- NÃO invente valores que não estão na imagem`;

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Rate limit por usuário (não IP — usuário autenticado e custo alto por chamada)
    const userId = (session.user as { id?: string }).id ?? "anon";
    const limited = rateLimitResponse(`ocr-prescription:${userId}`, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000, // 10 OCRs por hora por usuário
    });
    if (limited) return limited;

    const body = await request.json();
    const { imageBase64, mimeType } = body as {
      imageBase64: string;
      mimeType: string;
    };

    if (!imageBase64) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Imagem não enviada" } },
        { status: 400 }
      );
    }

    if (imageBase64.length > MAX_BASE64_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Imagem muito grande. Reduza para menos de 8MB.",
          },
        },
        { status: 413 }
      );
    }

    const allowedMimeTypes: ImageMediaType[] = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const mediaType: ImageMediaType = allowedMimeTypes.includes(
      mimeType as ImageMediaType
    )
      ? (mimeType as ImageMediaType)
      : "image/jpeg";

    // Para medição de IA (não bloqueia — só registra). getCompanyId lê a mesma
    // sessão já validada por requireAuth(); fica APÓS a validação de input para
    // não fazer a leitura extra em requisições rejeitadas (400/413).
    const companyId = await getCompanyId();

    // getAnthropicKey ANTES de getAiConfig: se não há chave, devolve 503 sem pagar
    // o upsert do getAiConfig (que criaria o singleton). Reordenar mascara o 503.
    const apiKey = await getAnthropicKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: {
            code: "AI_NOT_CONFIGURED",
            message:
              "IA não configurada. Cadastre a chave Anthropic no painel do super admin.",
          },
        },
        { status: 503 }
      );
    }
    const anthropic = new Anthropic({ apiKey });
    const { ocrModel } = await getAiConfig();

    const response = await anthropic.messages.create({
      model: ocrModel,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: OCR_PROMPT,
            },
          ],
        },
      ],
    });

    // Medição de tokens (C1) — fail-safe, não bloqueia o OCR.
    await logAiUsage({
      companyId,
      feature: "ocr_prescription",
      provider: "anthropic",
      model: ocrModel,
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cacheTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "OCR não retornou resultado de texto",
          },
        },
        { status: 500 }
      );
    }

    let prescriptionData;
    try {
      const jsonText = textBlock.text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      prescriptionData = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Não foi possível interpretar os dados da receita. Tente com uma foto mais nítida.",
          },
          rawText: textBlock.text,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      data: prescriptionData,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
