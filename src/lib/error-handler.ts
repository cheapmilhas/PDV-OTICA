import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/**
 * Códigos de erro padronizados
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE: "DUPLICATE",
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Interface padronizada para erros da aplicação
 */
export interface ErrorDetail {
  field?: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

/**
 * Classe de erro customizada para a aplicação
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number,
    public details?: ErrorDetail[]
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Mapeia Prisma error codes para status HTTP
 */
function getPrismaErrorStatus(code: string): number {
  const statusMap: Record<string, number> = {
    P2002: 409, // Unique constraint violation
    P2025: 404, // Record not found
    P2003: 400, // Foreign key constraint failed
    P2014: 400, // Invalid relation
  };
  return statusMap[code] || 500;
}

/**
 * Extrai nome do campo de unique constraint do Prisma
 */
function extractPrismaField(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  if (error.code === "P2002" && error.meta?.target) {
    const target = error.meta.target as string[];
    return target[0];
  }
  return undefined;
}

/**
 * Handler centralizado de erros para API routes
 *
 * Converte diferentes tipos de erro em respostas HTTP padronizadas
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   try {
 *     // ... lógica
 *   } catch (error) {
 *     return handleApiError(error)
 *   }
 * }
 * ```
 */
export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  // AppError - nosso erro customizado
  if (error instanceof AppError) {
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.statusCode }
    );
  }

  // ZodError - validação de schema
  if (error instanceof ZodError) {
    const details: ErrorDetail[] = (error as any).issues.map((e: any) => ({
      field: e.path.join("."),
      message: e.message,
    }));

    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Dados inválidos",
          details,
        },
      },
      { status: 400 }
    );
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const status = getPrismaErrorStatus(error.code);

    if (error.code === "P2002") {
      const field = extractPrismaField(error);
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: ERROR_CODES.DUPLICATE,
            message: field
              ? `Já existe um registro com este ${field}`
              : "Registro duplicado",
            details: field ? [{ field, message: "Valor já cadastrado" }] : undefined,
          },
        },
        { status }
      );
    }

    if (error.code === "P2025") {
      return NextResponse.json<ErrorResponse>(
        {
          error: {
            code: ERROR_CODES.NOT_FOUND,
            message: "Registro não encontrado",
          },
        },
        { status }
      );
    }

    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: ERROR_CODES.BUSINESS_RULE_VIOLATION,
          message: "Erro de regra de negócio",
        },
      },
      { status }
    );
  }

  // Error genérico do JavaScript
  if (error instanceof Error) {
    console.error("Unexpected error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: process.env.NODE_ENV === "development"
            ? error.message
            : "Erro interno do servidor",
        },
      },
      { status: 500 }
    );
  }

  // Erro completamente desconhecido
  console.error("Unknown error:", error);
  return NextResponse.json<ErrorResponse>(
    {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Erro interno do servidor",
      },
    },
    { status: 500 }
  );
}

/**
 * Helper para criar erro de não autorizado (401)
 */
export function unauthorizedError(message = "Não autenticado"): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);
}

/**
 * Helper para criar erro de proibido (403)
 */
export function forbiddenError(message = "Acesso negado"): AppError {
  return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
}

/**
 * Helper para criar erro de não encontrado (404)
 */
export function notFoundError(message = "Recurso não encontrado"): AppError {
  return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
}

/**
 * Helper para criar erro de duplicado (409)
 */
export function duplicateError(message: string, field?: string): AppError {
  return new AppError(
    ERROR_CODES.DUPLICATE,
    message,
    409,
    field ? [{ field, message }] : undefined
  );
}

/**
 * Helper para criar erro de regra de negócio (400)
 */
export function businessRuleError(message: string): AppError {
  return new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, message, 400);
}
