import { NextResponse } from "next/server";
import { supplierService } from "@/services/supplier.service";
import {
  updateSupplierSchema,
  sanitizeSupplierDTO,
  type UpdateSupplierDTO,
} from "@/lib/validations/supplier.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { okResponse } from "@/lib/api-response";

/**
 * GET /api/suppliers/[id]
 * Retorna detalhes de um fornecedor específico
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const supplier = await supplierService.getById(params.id, companyId);

    return okResponse(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/suppliers/[id]
 * Atualiza um fornecedor
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    const data = updateSupplierSchema.parse(body);
    const sanitizedData = sanitizeSupplierDTO(data) as UpdateSupplierDTO;

    const supplier = await supplierService.update(
      params.id,
      sanitizedData,
      companyId
    );

    return okResponse(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/suppliers/[id]
 * Desativa (soft delete) um fornecedor
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    await supplierService.delete(params.id, companyId);

    return okResponse({ message: "Fornecedor desativado com sucesso" });
  } catch (error) {
    return handleApiError(error);
  }
}
