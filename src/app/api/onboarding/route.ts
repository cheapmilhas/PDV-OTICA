import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/onboarding
 * Retorna o status do onboarding da empresa
 */
export async function GET() {
  try {
    const companyId = await getCompanyId();

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        onboardingStep: true,
        onboardingDoneAt: true,
        onboardingStatus: true,
        onboardingCompletedAt: true,
        name: true,
        tradeName: true,
        cnpj: true,
        phone: true,
        email: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ onboarding: company });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/onboarding
 * Atualiza o onboarding (step-by-step)
 */
export async function PUT(request: Request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const { step, data } = body;

    if (typeof step !== "number" || step < 1 || step > 4) {
      return NextResponse.json(
        { error: "Step inválido (deve ser 1-4)" },
        { status: 400 }
      );
    }

    // Step 1: Dados da empresa (address, phone, etc.)
    if (step === 1) {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          tradeName: data.tradeName || undefined,
          cnpj: data.cnpj || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          zipCode: data.zipCode || undefined,
          onboardingStep: 1,
        },
      });

      // Criar ou atualizar CompanySettings
      await prisma.companySettings.upsert({
        where: { companyId },
        create: {
          companyId,
          displayName: data.tradeName || undefined,
          cnpj: data.cnpj || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          zipCode: data.zipCode || undefined,
        },
        update: {
          displayName: data.tradeName || undefined,
          cnpj: data.cnpj || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          zipCode: data.zipCode || undefined,
        },
      });
    }

    // Step 2: Produtos iniciais (sample data)
    if (step === 2) {
      if (data.addSampleProducts) {
        // Verificar se já existem produtos
        const count = await prisma.product.count({ where: { companyId } });
        if (count === 0) {
          // Criar categoria padrão
          const category = await prisma.category.upsert({
            where: {
              companyId_name: { companyId, name: "Armações" },
            },
            create: { companyId, name: "Armações" },
            update: {},
          });

          // Criar alguns produtos de exemplo
          const sampleProducts = [
            { name: "Armação Aviador Clássico", sku: "ARM-001", salePrice: 18900, stockQty: 10, type: "FRAME" as const },
            { name: "Armação Redonda Vintage", sku: "ARM-002", salePrice: 15900, stockQty: 8, type: "FRAME" as const },
            { name: "Armação Quadrada Moderna", sku: "ARM-003", salePrice: 22900, stockQty: 5, type: "FRAME" as const },
            { name: "Óculos de Sol Esportivo", sku: "SOL-001", salePrice: 24900, stockQty: 12, type: "SUNGLASSES" as const },
            { name: "Lente CR-39 Anti-reflexo", sku: "LEN-001", salePrice: 12000, stockQty: 20, type: "OPHTHALMIC_LENS" as const },
          ];

          for (const p of sampleProducts) {
            await prisma.product.create({
              data: {
                companyId,
                name: p.name,
                sku: p.sku,
                salePrice: p.salePrice,
                stockQty: p.stockQty,
                stockMin: 2,
                categoryId: category.id,
                type: p.type,
                active: true,
              },
            });
          }
        }
      }

      await prisma.company.update({
        where: { id: companyId },
        data: { onboardingStep: 2 },
      });
    }

    // Step 3: Formas de pagamento (configurações)
    if (step === 3) {
      // Salvar preferências de pagamento nas settings
      const currentSettings = await prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });

      const settings = (currentSettings?.settings as Record<string, unknown>) || {};

      await prisma.company.update({
        where: { id: companyId },
        data: {
          onboardingStep: 3,
          settings: {
            ...settings,
            paymentMethods: data.paymentMethods || [],
          },
        },
      });
    }

    // Step 4: Conclusão
    if (step === 4) {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          onboardingStep: 4,
          onboardingDoneAt: new Date(),
          onboardingCompletedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, step });
  } catch (error) {
    return handleApiError(error);
  }
}
