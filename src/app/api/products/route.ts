import { NextResponse } from "next/server";
import { productService } from "@/services/product.service";
import {
  productQuerySchema,
  createProductSchema,
  sanitizeProductDTO,
  type CreateProductDTO,
} from "@/lib/validations/product.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
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

    // Retorna resposta paginada
    return paginatedResponse(result.data, result.pagination);
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

    // Parse e valida body
    const body = await request.json();
    console.log("📦 [API] Body recebido:", JSON.stringify(body, null, 2));

    const data = createProductSchema.parse(body);
    console.log("✅ [API] Validação passou!");

    // Sanitiza dados (remove strings vazias)
    const sanitizedData = sanitizeProductDTO(data) as CreateProductDTO;

    // Cria produto via service
    const product = await productService.create(sanitizedData, companyId);

    // Retorna 201 Created
    return createdResponse(product);
  } catch (error) {
    console.error("❌ [API] Erro ao criar produto:", error);
    if (error instanceof Error && 'issues' in error) {
      console.error("🔍 [API] Detalhes da validação Zod:", JSON.stringify((error as any).issues, null, 2));
    }
    return handleApiError(error);
  }
}
