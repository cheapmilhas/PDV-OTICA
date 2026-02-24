import { NextResponse } from "next/server";
import { supplierService } from "@/services/supplier.service";
import {
  supplierQuerySchema,
  createSupplierSchema,
  sanitizeSupplierDTO,
  type CreateSupplierDTO,
} from "@/lib/validations/supplier.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";

/**
 * GET /api/suppliers
 * Lista fornecedores com paginação, busca e filtros
 *
 * Query params:
 * - search: string (busca em nome, razão social, cnpj, email)
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - status: "ativos" | "inativos" | "todos" (default: "ativos")
 * - sortBy: "name" | "createdAt" | "city" (default: "name")
 * - sortOrder: "asc" | "desc" (default: "asc")
 */
export async function GET(request: Request) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida query params
    const { searchParams } = new URL(request.url);
    const query = supplierQuerySchema.parse(Object.fromEntries(searchParams));

    // Busca suppliers via service
    const result = await supplierService.list(query, companyId);

    // Retorna resposta paginada
    return paginatedResponse(result.data, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/suppliers
 * Cria novo fornecedor
 *
 * Body: CreateSupplierDTO
 */
export async function POST(request: Request) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");

    // Parse e valida body
    const body = await request.json();
    const data = createSupplierSchema.parse(body);

    // Sanitiza dados (remove strings vazias)
    const sanitizedData = sanitizeSupplierDTO(data) as CreateSupplierDTO;

    // Cria supplier via service
    const supplier = await supplierService.create(sanitizedData, companyId);

    // Retorna 201 Created
    return createdResponse(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}
