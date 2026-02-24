import { NextResponse } from "next/server";
import { supplierService } from "@/services/supplier.service";
import {
  updateSupplierSchema,
  sanitizeSupplierDTO,
  type UpdateSupplierDTO,
} from "@/lib/validations/supplier.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

/**
 * GET /api/suppliers/[id]
 * Retorna detalhes de um fornecedor específico
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Incluir fornecedores inativos também
    const supplier = await supplierService.getById(id, companyId, true);

    return successResponse(supplier);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    const { id } = await params;

    const body = await request.json();
    const data = updateSupplierSchema.parse(body);
    const sanitizedData = sanitizeSupplierDTO(data) as UpdateSupplierDTO;

    const supplier = await supplierService.update(
      id,
      sanitizedData,
      companyId
    );

    return successResponse(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/suppliers/[id]
 * Desativa (soft delete) um fornecedor
 * Se ?permanent=true, deleta permanentemente do banco de dados
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    const { id } = await params;

    // Verifica se é delete permanente
    const { searchParams } = new URL(request.url);
    const isPermanent = searchParams.get("permanent") === "true";

    if (isPermanent) {
      await supplierService.hardDelete(id, companyId);
      return successResponse({ message: "Fornecedor excluído permanentemente" });
    } else {
      await supplierService.delete(id, companyId);
      return successResponse({ message: "Fornecedor desativado com sucesso" });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
