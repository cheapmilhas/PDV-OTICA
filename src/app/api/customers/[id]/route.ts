import { NextResponse } from "next/server";
import { customerService } from "@/services/customer.service";
import {
  updateCustomerSchema,
  sanitizeCustomerDTO,
} from "@/lib/validations/customer.schema";
import { requireAuth, requireRole, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, deletedResponse } from "@/lib/api-response";

/**
 * GET /api/customers/[id]
 * Busca cliente por ID
 *
 * Retorna: Customer
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Busca cliente
    const customer = await customerService.getById(id, companyId);

    return successResponse(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/customers/[id]
 * Atualiza cliente existente
 *
 * Body: UpdateCustomerDTO
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Parse e valida body
    const body = await request.json();
    const data = updateCustomerSchema.parse(body);

    // Sanitiza dados
    const sanitizedData = sanitizeCustomerDTO(data);

    // Atualiza cliente
    const customer = await customerService.update(
      id,
      sanitizedData,
      companyId
    );

    return successResponse(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/customers/[id]
 * Deleta cliente (soft delete)
 *
 * RBAC: Requer ADMIN ou GERENTE
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Requer role ADMIN ou GERENTE
    await requireRole(["ADMIN", "GERENTE"]);

    // Soft delete
    await customerService.softDelete(id, companyId);

    // Retorna 204 No Content
    return deletedResponse();
  } catch (error) {
    return handleApiError(error);
  }
}
