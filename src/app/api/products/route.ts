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

    // Busca produtos via service
    const result = await productService.list(query, companyId);

    // Serializa Decimals para number
    const serializedData = result.data.map((product) => ({
      ...product,
      costPrice: Number(product.costPrice),
      salePrice: Number(product.salePrice),
      promoPrice: product.promoPrice ? Number(product.promoPrice) : null,
      marginPercent: product.marginPercent ? Number(product.marginPercent) : null,
    }));

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
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("products.create");

    // Parse e valida body
    const body = await request.json();
    const data = createProductSchema.parse(body);

    // Sanitiza dados (remove strings vazias)
    const sanitizedData = sanitizeProductDTO(data) as CreateProductDTO;

    // Cria produto via service
    const product = await productService.create(sanitizedData, companyId);

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
