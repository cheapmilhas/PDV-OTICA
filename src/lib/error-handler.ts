import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";

const log = logger.child({ module: "error-handler" });

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
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // Negativas de PDV que podem ser autorizadas por um admin/gerente (override).
  // O frontend usa estes códigos para exibir o alerta certo e oferecer a
  // autorização do gerente. Ver Fase B (override com senha).
  CREDIT_LIMIT_EXCEEDED: "CREDIT_LIMIT_EXCEEDED",
  CUSTOMER_OVERDUE: "CUSTOMER_OVERDUE",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  // Grupo D: fraude de preço. Desconto acima do teto do papel do vendedor, ou
  // venda abaixo do custo — ambos exigem override de gerente.
  DISCOUNT_EXCEEDS_LIMIT: "DISCOUNT_EXCEEDS_LIMIT",
  PRICE_BELOW_COST: "PRICE_BELOW_COST",
  // Grupo F: assinatura inadimplente/suspensa/expirada bloqueia operações de
  // escrita. O frontend usa o código para abrir o aviso de regularização.
  SUBSCRIPTION_BLOCKED: "SUBSCRIPTION_BLOCKED",
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
    // Fase 4: id de correlação para erros inesperados (5xx). O cliente vê este
    // id e, ao reportar, permite achar o log/Sentry exato na hora. Ausente em
    // erros esperados (validação, 404, 409) que não precisam de rastreio.
    errorId?: string;
  };
}

/**
 * Gera um id curto de correlação de erro (Fase 4 — observabilidade).
 * Ex.: "err_a1b2c3d4". Vai ao log, ao Sentry e à resposta — o mesmo id nos três.
 */
function newErrorId(): string {
  return "err_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
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

    // Outros erros Prisma conhecidos (P2028 timeout, P2024 pool, P2010 query, etc).
    // Antes mascarado como "Erro de regra de negócio" genérico — escondia
    // problemas críticos (ex.: timeout do $transaction). Sempre logamos a stack
    // server-side; o cliente vê código DATABASE_ERROR + detalhe com o código
    // Prisma real para diagnóstico.
    const errorId = newErrorId();
    log.error("Prisma error", {
      errorId,
      code: error.code,
      message: error.message,
      meta: error.meta,
    });
    void captureException(error, { errorId, source: "prisma", code: error.code });
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: ERROR_CODES.DATABASE_ERROR,
          message:
            process.env.NODE_ENV === "development"
              ? `${error.code}: ${error.message}`
              : "Erro de banco de dados ao processar sua requisição. Tente novamente em instantes.",
          details: [{ field: "prismaCode", message: error.code }],
          errorId,
        },
      },
      { status }
    );
  }

  // Error genérico do JavaScript
  if (error instanceof Error) {
    const errorId = newErrorId();
    log.error("Unexpected error", { errorId, message: error.message, stack: error.stack });
    void captureException(error, { errorId, source: "api" });
    return NextResponse.json<ErrorResponse>(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: process.env.NODE_ENV === "development"
            ? error.message
            : "Erro interno do servidor",
          errorId,
        },
      },
      { status: 500 }
    );
  }

  // Erro completamente desconhecido
  const errorId = newErrorId();
  log.error("Unknown error", { errorId, error: String(error) });
  void captureException(error, { errorId, source: "unknown" });
  return NextResponse.json<ErrorResponse>(
    {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Erro interno do servidor",
        errorId,
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
