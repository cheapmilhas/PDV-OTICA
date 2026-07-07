import { prisma } from "@/lib/prisma";

/**
 * Histórico de mudanças da config de IA (Central de IA, Fase 4). Lê os registros
 * de auditoria GlobalAudit com action="AI_CONFIG_CHANGED" (já gravados pela rota
 * PUT /api/admin/ai-config a cada salvamento) e os transforma numa visão amigável
 * pra tela — sem expor segredos (chaves só aparecem como "alterada", nunca o valor).
 */

/** Rótulos humanos dos campos da config de IA (pra não mostrar chave técnica crua). */
const FIELD_LABELS: Record<string, string> = {
  anthropicKey: "Chave Anthropic",
  openaiKey: "Chave OpenAI",
  usdBrlRate: "Câmbio USD→BRL",
  markupPercent: "Markup (%)",
  creditTokenFactor: "Fator de crédito",
  qualifierModel: "Modelo de qualificação",
  lensAdvisorModel: "Modelo do assistente de lentes",
  ocrModel: "Modelo do OCR",
  copilotModel: "Modelo do Copiloto",
  transcriptionModel: "Modelo de transcrição",
};

export interface AiConfigChange {
  /** Rótulo humano do campo. */
  label: string;
  /**
   * Novo valor legível. Para chaves de API é sempre "alterada" (o valor nunca é
   * auditado em claro). Para os demais, o valor novo salvo.
   */
  value: string;
}

export interface AiConfigHistoryEntry {
  id: string;
  /** ISO — a UI formata em BRT. */
  createdAt: string;
  /** Nome do admin que fez a mudança (ou "Sistema" se não resolvido). */
  actorName: string;
  /** Campos alterados nesse salvamento, já legíveis. */
  changes: AiConfigChange[];
}

type AuditMetadata = {
  changedFields?: unknown;
  anthropicKeyChanged?: unknown;
  openaiKeyChanged?: unknown;
  [k: string]: unknown;
};

/** Formata o valor novo de um campo pra exibição (chaves nunca em claro). */
function formatChange(field: string, meta: AuditMetadata): AiConfigChange | null {
  const label = FIELD_LABELS[field] ?? field;
  if (field === "anthropicKey") {
    return meta.anthropicKeyChanged ? { label, value: "alterada" } : null;
  }
  if (field === "openaiKey") {
    return meta.openaiKeyChanged ? { label, value: "alterada" } : null;
  }
  const raw = meta[field];
  if (raw === undefined || raw === null) return null;
  return { label, value: String(raw) };
}

/**
 * Últimas N mudanças da config de IA, mais recentes primeiro. Usa o índice
 * (action, createdAt) do GlobalAudit — consulta barata. Best-effort na leitura
 * do metadata: um registro com metadata inesperado vira uma linha sem mudanças
 * legíveis, nunca quebra a tela.
 */
export async function getAiConfigHistory(limit = 30): Promise<AiConfigHistoryEntry[]> {
  const rows = await prisma.globalAudit.findMany({
    where: { action: "AI_CONFIG_CHANGED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { adminUser: { select: { name: true } } },
  });

  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as AuditMetadata;
    const fields = Array.isArray(meta.changedFields)
      ? (meta.changedFields as unknown[]).filter((f): f is string => typeof f === "string")
      : [];
    const changes = fields
      .map((f) => formatChange(f, meta))
      .filter((c): c is AiConfigChange => c !== null);
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actorName: r.adminUser?.name ?? "Sistema",
      changes,
    };
  });
}
