import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/categories
 * Lista categorias ativas da empresa
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const categories = await prisma.category.findMany({
      where: {
        companyId,
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da categoria").max(120),
});

/**
 * POST /api/categories
 * Cria uma categoria por nome (scoped à empresa). Anti-duplicado por nome.
 */
export async function POST(request: Request) {
  try {
    await auth();
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("products.create");

    const body = await request.json();
    const { name } = createCategorySchema.parse(body);

    // Anti-duplicado por nome (case-insensitive). Há @@unique([companyId, name]),
    // mas a checagem prévia dá mensagem amigável em vez de P2002 cru.
    const existing = await prisma.category.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new AppError(
        ERROR_CODES.DUPLICATE,
        "Já existe uma categoria com esse nome",
        409
      );
    }

    const category = await prisma.category.create({
      data: { companyId, name, active: true },
      select: { id: true, name: true },
    });

    return createdResponse(category);
  } catch (error) {
    return handleApiError(error);
  }
}
