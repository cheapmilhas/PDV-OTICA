/**
 * Logger estruturado leve.
 *
 * Substitui console.log/error/warn pelo código. Em produção emite JSON
 * (parseable por Vercel Logs / Sentry / Datadog); em dev mantém formato
 * humano. Em testes (NODE_ENV=test) silencia para não poluir output.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: Level =
  (process.env.LOG_LEVEL as Level) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

function emit(level: Level, message: string, ctx?: Record<string, unknown>) {
  if (isTest) return;
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  if (isProd) {
    const payload = {
      level,
      msg: message,
      time: new Date().toISOString(),
      ...(ctx ?? {}),
    };
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : console.log)(JSON.stringify(payload));
    return;
  }

  // Dev: humano
  // eslint-disable-next-line no-console
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (ctx && Object.keys(ctx).length > 0) {
    fn(`[${level}]`, message, ctx);
  } else {
    fn(`[${level}]`, message);
  }
}

export const logger = {
  debug: (message: string, ctx?: Record<string, unknown>) => emit("debug", message, ctx),
  info: (message: string, ctx?: Record<string, unknown>) => emit("info", message, ctx),
  warn: (message: string, ctx?: Record<string, unknown>) => emit("warn", message, ctx),
  error: (message: string, ctx?: Record<string, unknown>) => emit("error", message, ctx),

  /**
   * Cria um logger com contexto pré-fixado (útil em services).
   * Ex: const log = logger.child({ service: "sale" });
   */
  child(baseContext: Record<string, unknown>) {
    return {
      debug: (message: string, ctx?: Record<string, unknown>) =>
        emit("debug", message, { ...baseContext, ...(ctx ?? {}) }),
      info: (message: string, ctx?: Record<string, unknown>) =>
        emit("info", message, { ...baseContext, ...(ctx ?? {}) }),
      warn: (message: string, ctx?: Record<string, unknown>) =>
        emit("warn", message, { ...baseContext, ...(ctx ?? {}) }),
      error: (message: string, ctx?: Record<string, unknown>) =>
        emit("error", message, { ...baseContext, ...(ctx ?? {}) }),
    };
  },
};
