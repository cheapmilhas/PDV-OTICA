import { Prisma } from "@prisma/client";

/**
 * Converte recursivamente Prisma Decimal e Date em primitivos JSON-friendly.
 *
 * - `Decimal` → `number` (precisão dupla padrão JS; suficiente para R$ até bilhões)
 * - `Date`    → ISO string
 * - `BigInt`  → number quando seguro, string caso contrário
 *
 * Substitui os 312+ `Number(...)` manuais e os 25 `JSON.parse(JSON.stringify())`
 * espalhados nas API routes. Aplicar uma vez no payload de retorno é seguro.
 *
 * Limitação: não preserva referências cíclicas (raríssimo em respostas Prisma).
 */
export function serializePrisma<T>(value: T): T {
  if (value === null || value === undefined) return value;

  // Prisma.Decimal
  if (Prisma.Decimal.isDecimal(value as unknown as Prisma.Decimal)) {
    return (value as unknown as Prisma.Decimal).toNumber() as unknown as T;
  }

  if (value instanceof Date) {
    return value.toISOString() as unknown as T;
  }

  if (typeof value === "bigint") {
    return (value <= Number.MAX_SAFE_INTEGER && value >= -Number.MAX_SAFE_INTEGER
      ? Number(value)
      : value.toString()) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map(serializePrisma) as unknown as T;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializePrisma(v);
    }
    return out as T;
  }

  return value;
}

/**
 * Versão "fits-all" para casos onde o consumidor não importa tipo exato.
 * Útil em handlers que serializam blobs grandes para JSON.
 */
export function toJSON<T>(value: T): unknown {
  return serializePrisma(value);
}
