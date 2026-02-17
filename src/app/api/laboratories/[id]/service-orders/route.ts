import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const orders = await prisma.serviceOrder.findMany({
      where: {
        laboratoryId,
        companyId,
      },
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
