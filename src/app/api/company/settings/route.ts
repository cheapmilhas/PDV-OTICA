import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const companySettingsSchema = z.object({
  displayName: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida (use formato #RRGGBB)").optional().nullable(),
  messageThankYou: z.string().optional().nullable(),
  messageQuote: z.string().optional().nullable(),
  messageReminder: z.string().optional().nullable(),
  messageBirthday: z.string().optional().nullable(),
  pdfHeaderText: z.string().optional().nullable(),
  pdfFooterText: z.string().optional().nullable(),
  defaultQuoteValidDays: z.number().int().positive().optional(),
  defaultPaymentTerms: z.string().optional().nullable(),
});

/**
 * GET /api/company/settings
 * Retorna configurações da empresa
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    let settings = await prisma.companySettings.findUnique({
      where: { companyId },
    });

    // Se não existir, criar com valores padrão
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          companyId,
          pdfFooterText: "Obrigado pela preferência!",
          defaultQuoteValidDays: 15,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/company/settings
 * Atualiza configurações da empresa
 */
export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    const data = companySettingsSchema.parse(body);

    const settings = await prisma.companySettings.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
      },
      update: data,
    });

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Configurações atualizadas com sucesso!",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
