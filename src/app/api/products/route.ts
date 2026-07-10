import { NextResponse } from "next/server";
import { productService } from "@/services/product.service";
import {
  productQuerySchema,
  createProductSchema,
  sanitizeProductDTO,
  type CreateProductDTO,
} from "@/lib/validations/product.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { checkPlanLimit } from "@/lib/plan-limits";
import { getProductPrice } from "@/lib/product-price";
import { requireWriteAccess } from "@/lib/subscription";

/**
 * GET /api/products
 * Lista produtos com paginação, busca e filtros
 *
 * Query params:
 * - search: string (busca em nome, sku, barcode, marca)
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - status: "ativos" | "inativos" | "todos" (default: "ativos")
 * - type: ProductType (filtro por tipo)
 * - categoryId: string (filtro por categoria)
 * - brandId: string (filtro por marca)
 * - inStock: boolean (filtro por em estoque)
 * - lowStock: boolean (filtro por estoque baixo)
 * - featured: boolean (filtro por destaque)
 * - launch: boolean (filtro por lançamento)
 * - abcClass: "A" | "B" | "C" (filtro por classificação ABC)
 * - sortBy: "name" | "sku" | "salePrice" | "stockQty" | "createdAt" (default: "createdAt")
 * - sortOrder: "asc" | "desc" (default: "desc")
 */
export async function GET(request: Request) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida query params
    const { searchParams } = new URL(request.url);
    const query = productQuerySchema.parse(Object.fromEntries(searchParams));
    const branchIdFilter = searchParams.get("branchId");

    // Busca produtos via service
    const result = await productService.list(query, companyId);

    // Serializa Decimals para number e resolve preços por filial se aplicável
    const serializedData = result.data.map((product: any) => {
      const branchStocks = (product.branchStocks || []).map((bs: any) => ({
        ...bs,
        costPrice: bs.costPrice != null ? Number(bs.costPrice) : null,
        salePrice: bs.salePrice != null ? Number(bs.salePrice) : null,
        promoPrice: bs.promoPrice != null ? Number(bs.promoPrice) : null,
        marginPercent: bs.marginPercent != null ? Number(bs.marginPercent) : null,
      }));

      // Resolver preço por filial quando branchId fornecido
      let resolvedPrices = null;
      if (branchIdFilter && branchIdFilter !== "ALL") {
        const branchStock = branchStocks.find((bs: any) => bs.branchId === branchIdFilter);
        resolvedPrices = getProductPrice(product, branchStock);
      }

      return {
        ...product,
        costPrice: Number(product.costPrice),
        salePrice: Number(product.salePrice),
        promoPrice: product.promoPrice ? Number(product.promoPrice) : null,
        marginPercent: product.marginPercent ? Number(product.marginPercent) : null,
        branchStocks,
        // Preços resolvidos para filial ativa (null se branchId não foi passado)
        branchCostPrice: resolvedPrices?.costPrice ?? null,
        branchSalePrice: resolvedPrices?.salePrice ?? null,
        branchPromoPrice: resolvedPrices?.promoPrice ?? null,
      };
    });

    // Retorna resposta paginada
    return paginatedResponse(serializedData, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/products
 * Cria novo produto
 *
 * Body: CreateProductDTO
 */
export async function POST(request: Request) {
  try {
    // Requer autenticação
    const session = await requireAuth();
    const companyId = await getCompanyId();
    // F1/F2: bloqueia cadastro com assinatura inadimplente/suspensa.
    await requireWriteAccess(companyId);
    await requirePermission("products.create");
    await checkPlanLimit(companyId, "products");

    // Parse e valida body
    const body = await request.json();
    const data = createProductSchema.parse(body);

    // Sanitiza dados (remove strings vazias)
    const sanitizedData = sanitizeProductDTO(data) as CreateProductDTO;

    // Cria produto via service
    const product = await productService.create(sanitizedData, companyId, {
      role: session.user.role,
      userBranchId: session.user.branchId ?? null,
    });

    // Serializa Decimals para number
    const serializedProduct = {
      ...product,
      costPrice: Number(product.costPrice),
      salePrice: Number(product.salePrice),
      promoPrice: product.promoPrice ? Number(product.promoPrice) : null,
      marginPercent: product.marginPercent ? Number(product.marginPercent) : null,
    };

    // Retorna 201 Created
    return createdResponse(serializedProduct);
  } catch (error) {
    return handleApiError(error);
  }
}
