import { NextResponse } from "next/server";
import { userService } from "@/services/user.service";
import {
  userQuerySchema,
  createUserSchema,
  type CreateUserDTO,
} from "@/lib/validations/user.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

/**
 * GET /api/users
 * Lista usuários com paginação, busca e filtros
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const query = userQuerySchema.parse({
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page") || undefined,
      pageSize: searchParams.get("pageSize") || undefined,
      status: searchParams.get("status") || undefined,
      role: searchParams.get("role") || undefined,
      sortBy: searchParams.get("sortBy") || undefined,
      sortOrder: searchParams.get("sortOrder") || undefined,
    });

    const result = await userService.list(query, companyId);

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/users
 * Cria um novo usuário
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    console.log("[API] Body recebido:", body);
    console.log("[API] CompanyId:", companyId);

    const data = createUserSchema.parse(body) as CreateUserDTO;
    console.log("[API] Dados validados:", data);

    const user = await userService.create(data, companyId);
    console.log("[API] Usuário criado:", user);

    return successResponse(user, 201);
  } catch (error) {
    console.error("[API] Erro ao criar usuário:", error);
    return handleApiError(error);
  }
}
