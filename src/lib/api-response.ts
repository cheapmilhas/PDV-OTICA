import { NextResponse } from "next/server";

/**
 * Metadados de paginação padronizados
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Response padrão para listas paginadas
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Response padrão para dados únicos
 */
export interface DataResponse<T> {
  data: T;
}

/**
 * Helper para criar resposta de sucesso com dados únicos
 *
 * @example
 * ```ts
 * const customer = await customerService.getById(id)
 * return successResponse(customer)
 * // { data: { id: '1', name: 'João', ... } }
 * ```
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse<DataResponse<T>> {
  return NextResponse.json<DataResponse<T>>({ data }, { status });
}

/**
 * Helper para criar resposta de lista paginada
 *
 * @example
 * ```ts
 * const result = await customerService.list(query, companyId)
 * return paginatedResponse(result.data, result.pagination)
 * // {
 * //   data: [...],
 * //   pagination: { page: 1, pageSize: 20, total: 100, ... }
 * // }
 * ```
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  status: number = 200
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json<PaginatedResponse<T>>(
    { data, pagination },
    { status }
  );
}

/**
 * Helper para criar metadados de paginação
 *
 * @example
 * ```ts
 * const total = 150
 * const page = 2
 * const pageSize = 20
 *
 * const pagination = createPaginationMeta(page, pageSize, total)
 * // {
 * //   page: 2,
 * //   pageSize: 20,
 * //   total: 150,
 * //   totalPages: 8,
 * //   hasNext: true,
 * //   hasPrevious: true
 * // }
 * ```
 */
export function createPaginationMeta(
  page: number,
  pageSize: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Helper para calcular skip/take do Prisma baseado em page/pageSize
 *
 * @example
 * ```ts
 * const { skip, take } = getPaginationParams(2, 20)
 * // skip: 20, take: 20
 *
 * const customers = await prisma.customer.findMany({
 *   skip,
 *   take,
 *   // ...
 * })
 * ```
 */
export function getPaginationParams(page: number, pageSize: number) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Helper para resposta de criação (201 Created)
 *
 * @example
 * ```ts
 * const customer = await customerService.create(data, companyId)
 * return createdResponse(customer)
 * // Status: 201
 * // { data: { id: '1', ... } }
 * ```
 */
export function createdResponse<T>(data: T): NextResponse<DataResponse<T>> {
  return successResponse(data, 201);
}

/**
 * Helper para resposta de deleção (204 No Content)
 *
 * @example
 * ```ts
 * await customerService.softDelete(id, companyId)
 * return deletedResponse()
 * // Status: 204
 * // (sem body)
 * ```
 */
export function deletedResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
