import { prisma } from "@/lib/prisma";

interface CardFeeCalculation {
  grossAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  settlementDate: Date;
  settlementDays: number;
}

export async function calculateCardFee(
  companyId: string,
  brand: string,
  paymentType: "CREDIT" | "DEBIT" | "PIX",
  installments: number,
  grossAmount: number
): Promise<CardFeeCalculation | null> {
  const rule = await prisma.cardFeeRule.findFirst({
    where: {
      companyId,
      brand: brand.toUpperCase(),
      paymentType,
      installments,
      active: true,
    },
  });

  if (!rule) {
    const genericRule = await prisma.cardFeeRule.findFirst({
      where: {
        companyId,
        brand: brand.toUpperCase(),
        paymentType,
        installments: 1,
        active: true,
      },
    });

    if (!genericRule) return null;

    const adjustedDays = genericRule.settlementDays + (installments - 1) * 30;
    return calculateFromRule(genericRule, grossAmount, adjustedDays);
  }

  return calculateFromRule(rule, grossAmount, rule.settlementDays);
}

function calculateFromRule(
  rule: { feePercent: any; feeFixed: any; settlementDays: number },
  grossAmount: number,
  settlementDays: number
): CardFeeCalculation {
  const feePercent = Number(rule.feePercent);
  const feeFixed = Number(rule.feeFixed || 0);
  const feeAmount = grossAmount * feePercent + feeFixed;
  const netAmount = grossAmount - feeAmount;

  const settlementDate = new Date();
  settlementDate.setDate(settlementDate.getDate() + settlementDays);

  return {
    grossAmount,
    feePercent,
    feeAmount: Math.round(feeAmount * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
    settlementDate,
    settlementDays,
  };
}

export async function getCardFeeRules(companyId: string) {
  return prisma.cardFeeRule.findMany({
    where: { companyId, active: true },
    orderBy: [{ brand: "asc" }, { paymentType: "asc" }, { installments: "asc" }],
  });
}

export async function createDefaultCardFeeRules(companyId: string) {
  const defaults = [
    // Débito
    { brand: "VISA", paymentType: "DEBIT", installments: 1, feePercent: 0.0149, settlementDays: 1 },
    { brand: "MASTERCARD", paymentType: "DEBIT", installments: 1, feePercent: 0.0149, settlementDays: 1 },
    { brand: "ELO", paymentType: "DEBIT", installments: 1, feePercent: 0.0199, settlementDays: 1 },
    // Crédito à vista
    { brand: "VISA", paymentType: "CREDIT", installments: 1, feePercent: 0.0199, settlementDays: 30 },
    { brand: "MASTERCARD", paymentType: "CREDIT", installments: 1, feePercent: 0.0199, settlementDays: 30 },
    { brand: "ELO", paymentType: "CREDIT", installments: 1, feePercent: 0.0249, settlementDays: 30 },
    // Crédito parcelado
    { brand: "VISA", paymentType: "CREDIT", installments: 2, feePercent: 0.0299, settlementDays: 30 },
    { brand: "VISA", paymentType: "CREDIT", installments: 3, feePercent: 0.0349, settlementDays: 30 },
    { brand: "VISA", paymentType: "CREDIT", installments: 6, feePercent: 0.0399, settlementDays: 30 },
    { brand: "VISA", paymentType: "CREDIT", installments: 12, feePercent: 0.0499, settlementDays: 30 },
    // PIX
    { brand: "PIX", paymentType: "PIX", installments: 1, feePercent: 0.0099, settlementDays: 0 },
  ];

  for (const rule of defaults) {
    await prisma.cardFeeRule.upsert({
      where: {
        companyId_brand_paymentType_installments: {
          companyId,
          brand: rule.brand,
          paymentType: rule.paymentType,
          installments: rule.installments,
        },
      },
      create: { ...rule, companyId, feeFixed: 0 },
      update: {},
    });
  }
}
