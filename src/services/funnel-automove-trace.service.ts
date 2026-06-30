/**
 * Trilha de auditoria do auto-move do funil (Funil Inteligente — Fatia 3).
 *
 * Grava UMA linha append-only (`FunnelAutoMoveLog`) por decisão INTERESSANTE do
 * motor (moveu / hold com sinal / erro). Existe porque o cron async da Vercel NÃO
 * entrega logs de forma confiável — esta tabela é o canal de leitura confiável
 * ("por que o card moveu/não moveu") E a base da métrica futura de acurácia
 * ("IA moveu vs humano corrigiu").
 *
 * AWAIT-BUT-SWALLOW: a escrita é AGUARDADA (em serverless um write não-awaited
 * pode não dar flush antes de a função congelar — perderíamos justo a linha de
 * erro), mas QUALQUER falha é engolida — a telemetria nunca pode quebrar o cron
 * fail-safe nem desfazer um movimento já aplicado.
 *
 * Multi-tenant: companyId obrigatório em toda gravação.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "funnel-automove-trace" });

/** Ações auditáveis na trilha. "error" = exceção capturada (motor ou wiring). */
export type AutoMoveAction = "move" | "hold" | "flag" | "error";

export interface AutoMoveTraceInput {
  companyId: string;
  leadId: string;
  action: AutoMoveAction;
  moved: boolean;
  reason: string;
  killSwitchOn?: boolean;
  intent?: string | null;
  confidence?: number | null;
  /** "set" | "unset" — estado da env no runtime (prova de propagação). */
  envSeen?: string | null;
  /** Só quando action="error". Fica SÓ no banco, nunca no HTTP. */
  error?: string | null;
}

export async function recordAutoMoveTrace(input: AutoMoveTraceInput): Promise<void> {
  try {
    await prisma.funnelAutoMoveLog.create({
      data: {
        companyId: input.companyId,
        leadId: input.leadId,
        action: input.action,
        moved: input.moved,
        // Trunca (defensivo, padrão da casa): hoje reason é curto, mas se um dia
        // vier de saída de IA/usuário não estoura a linha.
        reason: input.reason.slice(0, 500),
        killSwitchOn: input.killSwitchOn ?? false,
        intent: input.intent ?? null,
        confidence: input.confidence ?? null,
        envSeen: input.envSeen ?? null,
        error: input.error ? input.error.slice(0, 1000) : null,
      },
    });
  } catch (e) {
    // Nunca propaga: telemetria não pode quebrar o cron nem desfazer um move.
    log.error("falha ao gravar trilha de auto-move (ignorado)", {
      leadId: input.leadId, companyId: input.companyId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
