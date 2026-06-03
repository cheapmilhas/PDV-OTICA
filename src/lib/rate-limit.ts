// Rate limiter simples baseado em Map com limpeza automática.
// Para Vercel serverless, cada cold start reseta o Map — isso é aceitável
// pois o objetivo é proteger contra burst, não contra ataques distribuídos.

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  /** Número máximo de requests permitidos no intervalo */
  maxRequests: number;
  /** Intervalo em milissegundos (ex: 60000 = 1 minuto) */
  windowMs: number;
}

/**
 * Verifica rate limit para uma chave (geralmente IP ou userId).
 * Retorna { allowed: true } ou { allowed: false, retryAfterMs }.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  // Limpar entradas expiradas periodicamente (a cada ~100 checks)
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetTime) rateLimitMap.delete(k);
    }
  }

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetTime - now };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Extrai o IP do cliente dos headers (x-forwarded-for / x-real-ip).
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Rate-limit padrão para rotas administrativas sensíveis (exports,
 * reset-password, seed, fim de impersonação, MFA enroll/verify). Chaveia por
 * `<scope>:<adminId>:<ip>` para não punir um admin pelo IP de outro.
 *
 * Defaults conservadores (30 req / 5 min) — suficiente para uso humano normal,
 * mas barra scripts/abuso. Sobrescreva `config` se a rota precisar de outro.
 *
 * NOTA: o limiter é in-memory por instância serverless (reseta no cold start),
 * então é proteção contra burst, não contra ataque distribuído. Para isso seria
 * preciso um store compartilhado (Redis/Upstash) — dívida conhecida.
 */
export function adminRateLimit(
  scope: string,
  adminId: string,
  request: Request,
  config: RateLimitConfig = { maxRequests: 30, windowMs: 5 * 60 * 1000 }
): Response | null {
  return rateLimitResponse(`${scope}:${adminId}:${clientIp(request)}`, config);
}

/**
 * Helper para usar em API routes do Next.js.
 * Retorna null se permitido, ou Response com 429 se bloqueado.
 */
export function rateLimitResponse(
  key: string,
  config: RateLimitConfig
): Response | null {
  const result = checkRateLimit(key, config);
  if (result.allowed) return null;

  return new Response(
    JSON.stringify({
      success: false,
      error: "Muitas requisições. Tente novamente em alguns segundos.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
      },
    }
  );
}
