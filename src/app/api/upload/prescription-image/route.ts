import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getSupabaseAdmin, PRESCRIPTION_IMAGES_BUCKET } from "@/lib/supabase";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Nenhum arquivo enviado" } },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Tipo de arquivo não suportado. Use JPEG, PNG, WebP ou HEIC.",
          },
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Arquivo muito grande. Tamanho máximo: 10MB.",
          },
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const fileName = `${companyId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const supabase = getSupabaseAdmin();

    const { error: uploadError } = await supabase.storage
      .from(PRESCRIPTION_IMAGES_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao fazer upload da imagem. Verifique a configuração do Supabase Storage.",
          },
        },
        { status: 500 }
      );
    }

    // Generate short-lived signed URL (LGPD: prescription images are health PII —
    // bucket must be private; access goes through signed URLs only).
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(PRESCRIPTION_IMAGES_BUCKET)
      .createSignedUrl(fileName, 300); // 5 min

    if (signedUrlError || !signedUrlData) {
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao gerar URL assinada da imagem.",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        url: signedUrlData.signedUrl,
        fileName, // persist this; render via /api/prescription-image/[...path] to get a fresh signed URL
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
