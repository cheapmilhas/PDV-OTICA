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
