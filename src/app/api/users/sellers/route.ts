import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");

    // Busca apenas vendedores reais (exclui logins do sistema como PACAJUS)
    const sellers = await prisma.user.findMany({
      where: {
        companyId,
        active: true,
        role: "VENDEDOR",
        // Exclui logins do sistema (@login) e funcionários internos (@funcionario.interno)
        NOT: [
          { email: { endsWith: "@login" } },
          { email: { endsWith: "@funcionario.interno" } },
        ],
        // Filtrar por branch se informado
        ...(branchId && branchId !== "ALL" && {
          branches: { some: { branchId } },
        }),
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: sellers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
