import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { atomicStockCredit } from "@/services/stock.service";

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
          // Filial onde o estoque inicial será creditado. Sem ela não dá para
          // criar BranchStock (e a venda falharia mesmo com Product.stockQty>0).
          const branch = await prisma.branch.findFirst({
            where: { companyId },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });

          // Criar categoria padrão
          const category = await prisma.category.upsert({
            where: {
              companyId_name: { companyId, name: "Armações" },
            },
            create: { companyId, name: "Armações" },
            update: {},
          });

          // Produtos de exemplo. Preços em REAIS (Decimal 12,2) — alinhado ao
          // resto do sistema. ANTES estavam em centavos (ex: 18900), o que no
          // banco virava R$ 18.900,00 (100x o valor). costPrice ~55% do preço
          // para o CMV/DRE sair coerente.
          const sampleProducts = [
            { name: "Armação Aviador Clássico", sku: "ARM-001", salePrice: 189.0, costPrice: 95.0, stockQty: 10, type: "FRAME" as const },
            { name: "Armação Redonda Vintage", sku: "ARM-002", salePrice: 159.0, costPrice: 80.0, stockQty: 8, type: "FRAME" as const },
            { name: "Armação Quadrada Moderna", sku: "ARM-003", salePrice: 229.0, costPrice: 120.0, stockQty: 5, type: "FRAME" as const },
            { name: "Óculos de Sol Esportivo", sku: "SOL-001", salePrice: 249.0, costPrice: 130.0, stockQty: 12, type: "SUNGLASSES" as const },
            { name: "Lente CR-39 Anti-reflexo", sku: "LEN-001", salePrice: 120.0, costPrice: 60.0, stockQty: 20, type: "OPHTHALMIC_LENS" as const },
          ];

          for (const p of sampleProducts) {
            // Cria o produto com stockQty 0 — o estoque real entra via
            // atomicStockCredit (BranchStock) + InventoryLot abaixo, igual a uma
            // entrada de estoque de verdade. Setar stockQty direto deixaria o
            // cache "10" mas sem BranchStock, e a venda falharia no débito.
            const product = await prisma.product.create({
              data: {
                companyId,
                name: p.name,
                sku: p.sku,
                salePrice: p.salePrice,
                costPrice: p.costPrice,
                stockQty: 0,
                stockMin: 2,
                categoryId: category.id,
                type: p.type,
                active: true,
              },
            });

            if (branch && p.stockQty > 0) {
              // Crédito atômico no BranchStock (e atualiza o cache Product.stockQty).
              await atomicStockCredit(product.id, p.stockQty, companyId, undefined, branch.id);

              // Lote de estoque para o CMV/FIFO funcionar na venda (senão o custo
              // sai 0 e a DRE fica incorreta).
              await prisma.inventoryLot.create({
                data: {
                  companyId,
                  branchId: branch.id,
                  productId: product.id,
                  qtyIn: p.stockQty,
                  qtyRemaining: p.stockQty,
                  unitCost: p.costPrice,
                  totalCost: p.costPrice * p.stockQty,
                  acquiredAt: new Date(),
                },
              });
            }
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
