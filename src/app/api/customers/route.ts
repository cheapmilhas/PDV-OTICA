import { NextResponse } from "next/server";
import { customerService } from "@/services/customer.service";
import {
  customerQuerySchema,
  createCustomerSchema,
  sanitizeCustomerDTO,
  type CreateCustomerDTO,
} from "@/lib/validations/customer.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";

/**
 * GET /api/customers
 * Lista clientes com paginação, busca e filtros
 *
 * Query params:
 * - search: string (busca em nome, email, cpf, telefone)
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - status: "ativos" | "inativos" | "todos" (default: "ativos")
 * - city: string (filtro por cidade)
 * - referralSource: string (filtro por origem)
 * - sortBy: "name" | "createdAt" | "city" (default: "createdAt")
 * - sortOrder: "asc" | "desc" (default: "desc")
 */
export async function GET(request: Request) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida query params
    const { searchParams } = new URL(request.url);
    const query = customerQuerySchema.parse(Object.fromEntries(searchParams));

    // Busca clientes via service
    const result = await customerService.list(query, companyId);

    // Retorna resposta paginada
    return paginatedResponse(result.data, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/customers
 * Cria novo cliente
 *
 * Body: CreateCustomerDTO
 */
export async function POST(request: Request) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida body
    const body = await request.json();
    const data = createCustomerSchema.parse(body);

    // Sanitiza dados (remove strings vazias)
    const sanitizedData = sanitizeCustomerDTO(data) as CreateCustomerDTO;

    // Cria cliente via service
    const customer = await customerService.create(sanitizedData, companyId);

    // Retorna 201 Created
    return createdResponse(customer);
  } catch (error) {
    return handleApiError(error);
  }
}
