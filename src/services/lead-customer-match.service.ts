import { prisma } from "@/lib/prisma";
import { phoneMatchKey } from "@/lib/lead-phone-match";

/**
 * Reconhecimento de cliente para o funil de IA: dado o telefone de um contato
 * de WhatsApp, tenta achar o Customer da MESMA empresa e montar um RESUMO SEGURO
 * (só agregados, nunca PII) para a IA classificar melhor a intenção.
 *
 * Regras (do plano, validadas adversarialmente):
 * - SEMPRE filtra por companyId (multi-tenant).
 * - Casa por chave canônica de telefone (DDD+8díg), em phoneNormalized E
 *   phone2Normalized. Exclui ficha inativa/anonimizada/deletada (LGPD).
 * - 1 ficha → match "revisável" (vendedor confirma). 2+ → ambíguo (não casa).
 * - Resumo: purchaseCount, daysSinceLastPurchase, OS aberta (rótulo fixo),
 *   selo VIP/ticket (faixa). NUNCA CPF/grau/R$/endereço/saldo no resumo da IA.
 */

export type MatchKind = "none" | "single" | "ambiguous";

export interface SafeCustomerSummary {
  purchaseCount: number;
  daysSinceLastPurchase: number | null;
  /** Rótulo fixo do nosso código, nunca número de OS. */
  openServiceOrder: "em_producao" | "pronta_para_retirada" | null;
  isRecurring: boolean;
}

export interface CustomerMatchResult {
  kind: MatchKind;
  /** Preenchido só quando kind === "single". */
  customerId: string | null;
  customerName: string | null;
  /** Resumo seguro p/ a IA — só quando match único. */
  summary: SafeCustomerSummary | null;
  /** Quantas fichas casaram (p/ a UI mostrar lista no caso ambíguo). */
  candidateCount: number;
}

const OPEN_OS_STATUSES = ["SENT_TO_LAB", "IN_PROGRESS", "READY"] as const;

function osLabel(status: string): SafeCustomerSummary["openServiceOrder"] {
  if (status === "READY") return "pronta_para_retirada";
  if (status === "SENT_TO_LAB" || status === "IN_PROGRESS") return "em_producao";
  return null;
}

/**
 * Acha o cliente pelo telefone do contato (canônico) dentro da empresa.
 * Retorna kind=single só quando há EXATAMENTE uma ficha ativa casando.
 */
export async function matchCustomerByPhone(
  companyId: string,
  contactPhone: string,
): Promise<CustomerMatchResult> {
  const key = phoneMatchKey(contactPhone);
  if (!key) return { kind: "none", customerId: null, customerName: null, summary: null, candidateCount: 0 };

  const candidates = await prisma.customer.findMany({
    where: {
      companyId,
      active: true,
      deletedAt: null,
      anonymizedAt: null,
      OR: [{ phoneNormalized: key }, { phone2Normalized: key }],
    },
    select: { id: true, name: true },
    take: 5,
  });

  if (candidates.length === 0) {
    return { kind: "none", customerId: null, customerName: null, summary: null, candidateCount: 0 };
  }
  if (candidates.length > 1) {
    return { kind: "ambiguous", customerId: null, customerName: null, summary: null, candidateCount: candidates.length };
  }

  const c = candidates[0];
  const summary = await buildSafeSummary(companyId, c.id);
  return { kind: "single", customerId: c.id, customerName: c.name, summary, candidateCount: 1 };
}

/**
 * Monta o resumo SEGURO de um cliente (só agregados). 1 conjunto de queries
 * escopadas por companyId. NUNCA inclui PII/grau/R$ no objeto devolvido à IA.
 */
export async function buildSafeSummary(companyId: string, customerId: string): Promise<SafeCustomerSummary> {
  const [purchaseCount, lastSale, openOs] = await Promise.all([
    prisma.sale.count({ where: { companyId, customerId, status: "COMPLETED" } }),
    prisma.sale.findFirst({
      where: { companyId, customerId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.serviceOrder.findFirst({
      where: { companyId, customerId, status: { in: [...OPEN_OS_STATUSES] } },
      orderBy: { promisedDate: "asc" },
      select: { status: true },
    }),
  ]);

  const daysSinceLastPurchase = lastSale
    ? Math.floor((Date.now() - lastSale.createdAt.getTime()) / 86_400_000)
    : null;

  return {
    purchaseCount,
    daysSinceLastPurchase,
    openServiceOrder: openOs ? osLabel(openOs.status) : null,
    isRecurring: purchaseCount >= 2,
  };
}
