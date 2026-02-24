import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";

const createTreatmentSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Preço deve ser maior ou igual a zero"),
  active: z.boolean().optional().default(true),
});

/**
 * GET /api/lens-treatments
 * Lista tratamentos de lentes
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const active = searchParams.get("active");

    const where: any = { companyId };

    if (active !== null) {
      where.active = active === "true";
    }

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const treatments = await prisma.lensTreatment.findMany({
      where,
      orderBy: { name: "asc" },
    });

    // Serializar Decimals
    const serialized = treatments.map((t) => ({
      ...t,
      price: Number(t.price),
    }));

    return NextResponse.json({
      success: true,
      data: serialized,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/lens-treatments
 * Cria novo tratamento
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("products.edit");
    const companyId = await getCompanyId();

    const body = await request.json();
    const data = createTreatmentSchema.parse(body);

    // Verificar se já existe com mesmo nome
    const existing = await prisma.lensTreatment.findUnique({
      where: {
        companyId_name: {
          companyId,
          name: data.name,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Já existe um tratamento com este nome" },
        { status: 400 }
      );
    }

    const treatment = await prisma.lensTreatment.create({
      data: {
        companyId,
        ...data,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...treatment,
        price: Number(treatment.price),
      },
      message: "Tratamento criado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
