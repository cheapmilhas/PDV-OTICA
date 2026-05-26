import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getSupabaseAdmin, PRESCRIPTION_IMAGES_BUCKET } from "@/lib/supabase";

/**
 * GET /api/prescription-image/<companyId>/<filename>
 *
 * Returns a 302 redirect to a short-lived (5 min) Supabase signed URL.
 *
 * LGPD: prescription images are sensitive health data (Art. 11). The bucket
 * must be private. Direct access via public URL is forbidden — clients must
 * fetch through this authenticated proxy, which scopes access to the caller's
 * companyId.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    await requireAuth();
    const callerCompanyId = await getCompanyId();
    const { path } = await params;

    if (!path || path.length < 2) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Path inválido" } },
        { status: 400 }
      );
    }

    const [pathCompanyId, ...rest] = path;
    const fileName = `${pathCompanyId}/${rest.join("/")}`;

    // Cross-tenant guard: caller may only fetch images from their own company
    if (pathCompanyId !== callerCompanyId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Acesso negado" } },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(PRESCRIPTION_IMAGES_BUCKET)
      .createSignedUrl(fileName, 300);

    if (error || !data) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Imagem não encontrada" } },
        { status: 404 }
      );
    }

    return NextResponse.redirect(data.signedUrl, 302);
  } catch (error) {
    return handleApiError(error);
  }
}
