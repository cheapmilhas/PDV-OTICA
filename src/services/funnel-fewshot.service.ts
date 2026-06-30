/**
 * Few-shot por ótica (Funil Inteligente — Fatia 3) — a "colinha das correções".
 *
 * Quando o humano corrige a intenção de um lead, fica registrado intentPredicted
 * (o palpite da IA) vs intent (a verdade). Esta camada lê as N correções mais
 * recentes DAQUELA ótica e as transforma num bloco de exemplos p/ injetar no
 * prompt — assim a IA "vê seus erros recentes" e tende a não repeti-los NAQUELA
 * ótica (few-shot = memória curta no contexto, NÃO fine-tuning).
 *
 * LGPD por construção: o par é (intenção_predita → intenção_correta), ambos
 * ENUMS — zero texto livre, zero PII. Não há nome, telefone nem dado de saúde.
 * Multi-tenant: companyId obrigatório no filtro (não vaza exemplo entre óticas).
 */
import { prisma } from "@/lib/prisma";
import type { ContactIntent } from "@/lib/ai/lead-qualifier";

export interface IntentCorrection {
  predicted: ContactIntent;
  correct: ContactIntent;
}

/**
 * Últimas correções de intenção daquela ótica (predito != corrigido), recentes
 * primeiro. Só pares com divergência REAL e ambos não-nulos.
 */
export async function getRecentIntentCorrections(
  companyId: string,
  limit: number,
): Promise<IntentCorrection[]> {
  const rows = await prisma.lead.findMany({
    where: { companyId, intentCorrectedAt: { not: null } },
    orderBy: { intentCorrectedAt: "desc" },
    take: limit,
    select: { intentPredicted: true, intent: true },
  });

  const out: IntentCorrection[] = [];
  for (const r of rows) {
    if (!r.intentPredicted || !r.intent) continue;
    if (r.intentPredicted === r.intent) continue; // sem divergência → não ensina nada
    out.push({ predicted: r.intentPredicted as ContactIntent, correct: r.intent as ContactIntent });
  }
  return out;
}

/**
 * Transforma as correções num bloco de texto p/ o prompt. Vazio → "" (não
 * injeta nada). Só rótulos de intenção (enums) — seguro p/ LGPD.
 */
export function buildFewShotBlock(corrections: IntentCorrection[]): string {
  if (corrections.length === 0) return "";
  const lines = corrections.map((c) => `- quando parecia "${c.predicted}", o correto era "${c.correct}"`);
  return (
    `\nCORREÇÕES RECENTES NESTA ÓTICA (aprenda com elas — não repita estes erros de classificação):\n` +
    lines.join("\n") +
    `\n`
  );
}
