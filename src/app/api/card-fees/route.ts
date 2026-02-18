import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getCardFeeRules, createDefaultCardFeeRules } from "@/services/card-fee.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const rules = await getCardFeeRules(companyId);
    return NextResponse.json({ data: rules });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    if (body.createDefaults) {
      await createDefaultCardFeeRules(companyId);
      const rules = await getCardFeeRules(companyId);
      return NextResponse.json({ data: rules, message: "Regras padrão criadas" });
    }

    const rule = await prisma.cardFeeRule.create({
      data: {
        companyId,
        brand: body.brand,
        paymentType: body.paymentType,
        installments: body.installments || 1,
        feePercent: body.feePercent,
        feeFixed: body.feeFixed || 0,
        settlementDays: body.settlementDays,
      },
    });

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
