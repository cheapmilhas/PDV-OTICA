import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { saveGradeToBook } from "@/services/save-grade-to-book.service";
import { gradeSchema } from "@/lib/validations/grade-book.schema";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH - Digitar/editar o grau de uma receita do Livro (writer único).
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    await requirePermission("prescriptions.edit");
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const data = gradeSchema.parse(body);

    const result = await saveGradeToBook(id, companyId, data);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
