import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { saveGradeToBook } from "@/services/save-grade-to-book.service";
import { z } from "zod";

interface Params {
  params: Promise<{ id: string }>;
}

const eyeSchema = z
  .object({
    esf: z.string().optional().nullable(),
    cil: z.string().optional().nullable(),
    eixo: z.string().optional().nullable(),
    dnp: z.string().optional().nullable(),
    altura: z.string().optional().nullable(),
    add: z.string().optional().nullable(),
    prisma: z.string().optional().nullable(),
    base: z.string().optional().nullable(),
  })
  .optional()
  .nullable();

const gradeSchema = z.object({
  od: eyeSchema,
  oe: eyeSchema,
  adicao: z.string().optional().nullable(),
  isDependente: z.boolean().optional(),
  patientName: z.string().max(120).optional().nullable(),
  patientBirthDate: z.coerce.date().optional().nullable(),
});

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
