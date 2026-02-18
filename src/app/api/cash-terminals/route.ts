import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const branchId = await getBranchId().catch(() => null);

    const where: Record<string, unknown> = { companyId, active: true };
    if (branchId) where.branchId = branchId;

    const registers = await prisma.cashRegister.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        cashShifts: {
          where: { status: "OPEN" },
          select: {
            id: true,
            openedAt: true,
            openedByUser: { select: { name: true } },
          },
          take: 1,
        },
      },
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ data: registers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const register = await prisma.cashRegister.create({
      data: {
        companyId,
        branchId: body.branchId,
        name: body.name,
        code: (body.code as string).toUpperCase(),
        description: body.description,
        allowNegative: body.allowNegative || false,
        requireBlind: body.requireBlind || false,
        printerType: body.printerType,
        printerAddress: body.printerAddress,
      },
    });

    return NextResponse.json({ data: register }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
