import { NextResponse } from "next/server";
import { productService } from "@/services/product.service";
import {
  updateProductSchema,
  sanitizeProductDTO,
} from "@/lib/validations/product.schema";
import { requireAuth, requireRole, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, deletedResponse } from "@/lib/api-response";

/**
 * GET /api/products/[id]
 * Busca produto por ID
 *
 * Retorna: Product (com category, brand, color, shape)
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

    // Busca produto
    const product = await productService.getById(id, companyId);

    return successResponse(product);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/products/[id]
 * Atualiza produto existente
 *
 * Body: UpdateProductDTO
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
    const data = updateProductSchema.parse(body);

    // Sanitiza dados
    const sanitizedData = sanitizeProductDTO(data);

    // Atualiza produto
    const product = await productService.update(
      id,
      sanitizedData,
      companyId
    );

    return successResponse(product);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/products/[id]
 * Deleta produto (soft delete)
 *
 * RBAC: Requer ADMIN ou GERENTE
 * Regra: Não permite deletar produto com estoque > 0
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

    // Soft delete (service valida se tem estoque)
    await productService.softDelete(id, companyId);

    // Retorna 204 No Content
    return deletedResponse();
  } catch (error) {
    return handleApiError(error);
  }
}
