import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/brands
 * Lista marcas ativas da empresa
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const brands = await prisma.brand.findMany({
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
      data: brands,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const createBrandSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da marca").max(120),
});

/**
 * Gera um `code` único por empresa a partir do nome (Brand exige `code` e tem
 * @@unique([companyId, code])). Ex.: "Ray-Ban" -> "RAY-BAN". Em colisão,
 * adiciona sufixo numérico.
 */
function slugCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return base || "MARCA";
}

/**
 * POST /api/brands
 * Cria uma marca por nome (scoped à empresa). Anti-duplicado por nome.
 */
export async function POST(request: Request) {
  try {
    await auth();
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("products.create");

    const body = await request.json();
    const { name } = createBrandSchema.parse(body);

    // Anti-duplicado por nome (case-insensitive) dentro da empresa.
    const existing = await prisma.brand.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new AppError(
        ERROR_CODES.DUPLICATE,
        "Já existe uma marca com esse nome",
        409
      );
    }

    // Gera code único por empresa (até 20 tentativas com sufixo).
    const baseCode = slugCode(name);
    let code = baseCode;
    for (let i = 1; i <= 20; i++) {
      const clash = await prisma.brand.findFirst({
        where: { companyId, code },
        select: { id: true },
      });
      if (!clash) break;
      code = `${baseCode}-${i}`;
    }

    const brand = await prisma.brand.create({
      data: { companyId, name, code, active: true },
      select: { id: true, name: true },
    });

    return createdResponse(brand);
  } catch (error) {
    return handleApiError(error);
  }
}
