import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requireAuth, canSeeCanceled } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: laboratoryId } = await params;

    // Verificar se o laboratório pertence à empresa
    const lab = await prisma.lab.findFirst({
      where: { id: laboratoryId, companyId },
      select: { id: true, name: true },
    });

    if (!lab) {
      return NextResponse.json(
        { error: "Laboratório não encontrado" },
        { status: 404 }
      );
    }

    // Decisão do dono (Rotina de Testes Óticas Ultra): admin/gerente vê OS
    // canceladas (com badge); vendedor não. Filtro ESCALAR no where.status.
    // NOTA: o _count/totalOrders em laboratories/route.ts NÃO é filtrado de
    // propósito — esconder cancelados de lá distorceria a taxa de sucesso do lab.
    const where: Prisma.ServiceOrderWhereInput = {
      laboratoryId,
      companyId,
    };
    if (!(await canSeeCanceled())) {
      where.status = { not: "CANCELED" };
    }

    const orders = await prisma.serviceOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        priority: true,
        promisedDate: true,
        isDelayed: true,
        delayDays: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, phone: true },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: orders, laboratory: lab });
  } catch (error) {
    return handleApiError(error);
  }
}
