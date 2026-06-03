import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
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
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("products.create");

    const body = await request.json();
    const { name } = createBrandSchema.parse(body);

    // Brand NÃO tem @@unique([companyId, name]) (só em code), então a checagem
    // de nome é feita dentro de uma transação para reduzir a janela TOCTOU; em
    // corrida residual o P2002 do code dá o erro amigável. Category, por ter o
    // unique de nome, não precisa disto.
    const baseCode = slugCode(name);

    const brand = await prisma.$transaction(async (tx) => {
      // Anti-duplicado por nome (case-insensitive) dentro da empresa.
      const existing = await tx.brand.findFirst({
        where: { companyId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        throw new AppError(
          ERROR_CODES.DUPLICATE,
          "Já existe uma marca com esse nome",
          409
        );
      }

      // Gera code único por empresa (até 20 tentativas com sufixo).
      let code = baseCode;
      for (let i = 1; i <= 20; i++) {
        const clash = await tx.brand.findFirst({
          where: { companyId, code },
          select: { id: true },
        });
        if (!clash) break;
        code = `${baseCode}-${i}`;
      }

      return tx.brand.create({
        data: { companyId, name, code, active: true },
        select: { id: true, name: true },
      });
    });

    return createdResponse(brand);
  } catch (error) {
    // P2002 (code duplicado em corrida concorrente) → mensagem amigável.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return handleApiError(
        new AppError(
          ERROR_CODES.DUPLICATE,
          "Já existe uma marca com esse nome",
          409
        )
      );
    }
    return handleApiError(error);
  }
}
