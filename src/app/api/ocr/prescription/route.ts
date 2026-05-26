import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

const anthropic = new Anthropic();

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
    await requireAuth();

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

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
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
