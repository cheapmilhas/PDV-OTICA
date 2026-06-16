import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logAiUsage } from "@/services/ai-usage.service";
import { qualifyConversationText } from "@/lib/ai/lead-qualifier";
import { listStages } from "@/services/lead-stage.service";
import { createLead } from "@/services/lead.service";
import { getOrCreateAiSellerUser } from "@/services/ai-seller-user.service";
import { transcribeAudio } from "@/services/audio-transcription.service";
import { instanceNameForCompany } from "@/lib/whatsapp-instance";
import { getAiConfig } from "@/services/ai-config.service";

const log = logger.child({ service: "conversation-qualifier" });
const MAX_ATTEMPTS = 3;
const SCAN_LIMIT = 200;

export interface QualifyResult {
  conversationId: string;
  skipped?: "group" | "already_analyzed" | "no_text" | "not_found" | "claimed_by_other";
  isLead?: boolean;
  leadId: string | null;
}

interface ConvMessage { direction: string; type: string; text: string | null; evolutionId: string | null; receivedAt: Date }

function buildConversationText(messages: { direction: string; type: string; text: string | null; receivedAt: Date }[]): string {
  return messages
    .filter((m) => m.direction === "inbound" && typeof m.text === "string" && m.text.trim().length > 0)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .map((m) => m.text!.trim())
    .join("\n");
}

/**
 * Qualifica UMA conversa. Pré-condição: quem chama já validou tenant (rota) ou
 * é o cron (system). Grupo / sem texto → marca analyzedAt (não-lead). Já analisada
 * sem needsAnalysis e sem force → no-op. Senão: claim otimista (R5) → IA → logAiUsage
 * → cria lead (robô) se isLead. analysisAttempts é incrementado no claim (R2): se a
 * IA/createLead falhar depois, a conversa não re-chama o Claude além de MAX_ATTEMPTS.
 */
export async function qualifyConversation(conversationId: string, opts?: { force?: boolean }): Promise<QualifyResult> {
  const conv = await prisma.whatsappConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, companyId: true, isGroup: true, analyzedAt: true, needsAnalysis: true, leadId: true, analysisAttempts: true,
      contactNumber: true, contactName: true,
      // Teto de mensagens: pega só as N mais recentes p/ não estourar o context
      // window do Claude numa conversa longa (HIGH-1). buildConversationText
      // reordena cronologicamente depois. 80 msgs cobrem o contexto de qualificação.
      messages: {
        select: { direction: true, type: true, text: true, evolutionId: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
        take: 80,
      },
    },
  });
  if (!conv) return { conversationId, skipped: "not_found", leadId: null };

  // finalize = sucesso (a IA rodou e concluímos). Zera analysisAttempts (R2-fix):
  // o contador é anti-loop de FALHA — 3 falhas SEM finalizar congelam a conversa,
  // mas um ciclo que conclui (lead ou não-lead) reseta p/ que clientes recorrentes
  // legítimos (que vão e voltam) sigam sendo re-qualificados pelo cron (R1).
  const finalize = (leadId: string | null) =>
    prisma.whatsappConversation.update({
      where: { id: conv.id },
      data: { analyzedAt: new Date(), needsAnalysis: false, analysisAttempts: 0, ...(leadId ? { leadId } : {}) },
    });

  if (conv.isGroup) { await finalize(null); return { conversationId, skipped: "group", leadId: null }; }

  const force = opts?.force === true;
  if (conv.analyzedAt && !conv.needsAnalysis && !force) {
    return { conversationId, skipped: "already_analyzed", leadId: conv.leadId };
  }

  // Passe de transcrição (D8): áudios inbound sem texto viram texto via Whisper
  // ANTES de montar o contexto, p/ que o check de no_text "enxergue" o áudio.
  // Roda só aqui (após already_analyzed, antes do claim) — nunca p/ grupo (já
  // finalizado acima) nem p/ conversa que vamos pular. transcribeAudio é fail-safe
  // (retorna null), mas blindamos cada chamada: um áudio com erro não pode abortar
  // a qualificação. Enriquecemos uma CÓPIA local; não persiste no banco.
  const instanceName = instanceNameForCompany(conv.companyId);
  const enriched: ConvMessage[] = await Promise.all(
    (conv.messages as ConvMessage[]).map(async (m) => {
      const needsTranscription =
        m.direction === "inbound" && m.type === "audio" && (m.text == null || m.text.trim().length === 0) && !!m.evolutionId;
      if (!needsTranscription) return m;
      try {
        const transcript = await transcribeAudio(conv.companyId, instanceName, m.evolutionId!);
        if (transcript && transcript.trim().length > 0) return { ...m, text: transcript };
        return m; // null → fica sem texto, filtrado por buildConversationText (fail-safe)
      } catch (e) {
        log.error("falha ao transcrever áudio (segue sem ele)", { conversationId, evolutionId: m.evolutionId, error: e });
        return m;
      }
    }),
  );

  const text = buildConversationText(enriched);
  if (!text) { await finalize(null); return { conversationId, skipped: "no_text", leadId: null }; }

  // R5: claim otimista — reivindica a conversa condicionado ao estado lido.
  // Incrementa attempts (R2) e limpa needsAnalysis. Se outra execução já pegou
  // (count 0), aborta antes de gastar IA.
  const claim = await prisma.whatsappConversation.updateMany({
    where: { id: conv.id, analysisAttempts: conv.analysisAttempts },
    data: { analysisAttempts: { increment: 1 }, needsAnalysis: false },
  });
  if (claim.count === 0) return { conversationId, skipped: "claimed_by_other", leadId: null };

  // NOTA: assertAiAllowed NÃO é chamado aqui — a checagem de IA é feita
  // fail-CLOSED por empresa em qualifyPendingConversations (R4). A rota manual
  // chama assertAiAllowed antes (ver Task 7) para o caminho 1-a-1.
  const stages = await listStages(conv.companyId);
  // Modelo configurável (D8): o super admin escolhe o modelo do qualificador na
  // config global de IA. Usado tanto na chamada quanto no logAiUsage (p/ o custo
  // ser calculado com a tabela de preço do modelo realmente usado).
  const cfg = await getAiConfig();
  const result = await qualifyConversationText(text, stages.map((s) => ({ id: s.id, name: s.name })), cfg.qualifierModel);

  await logAiUsage({
    companyId: conv.companyId, feature: "lead_qualification", provider: "anthropic", model: cfg.qualifierModel,
    inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cacheTokens: result.usage.cacheTokens,
  });

  if (!result.isLead) { await finalize(null); return { conversationId, isLead: false, leadId: null }; }

  const sellerUserId = await getOrCreateAiSellerUser(conv.companyId);
  const { lead } = await createLead(
    {
      name: conv.contactName ?? conv.contactNumber,
      phone: conv.contactNumber,
      source: "WHATSAPP",
      interest: result.interest ?? undefined,
      stageId: result.stageId ?? undefined,
      notes: `Lead criado pela IA do funil. Motivo: ${result.reason}`.slice(0, 500),
    },
    conv.companyId, sellerUserId, null
  );
  await finalize(lead.id);
  log.info("lead criado pela IA", { conversationId, leadId: lead.id, companyId: conv.companyId });
  return { conversationId, isLead: true, leadId: lead.id };
}

/**
 * Varre conversas pendentes (1:1, attempts<3, analyzedAt null OU needsAnalysis), FIFO.
 * R4: checa as flags de IA UMA vez por empresa (fail-CLOSED: erro de leitura OU
 * desligada → pula a empresa). Erro numa conversa não interrompe as outras.
 */
export async function qualifyPendingConversations(companyId?: string): Promise<{ processed: number; leads: number; errors: number; skippedCompanies: number }> {
  const pending = await prisma.whatsappConversation.findMany({
    where: {
      isGroup: false,
      analysisAttempts: { lt: MAX_ATTEMPTS },
      OR: [{ analyzedAt: null }, { needsAnalysis: true }],
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true, companyId: true },
    orderBy: { lastMessageAt: "asc" }, // R5: FIFO, evita starvation
    take: SCAN_LIMIT,
  });

  // Agrupa por empresa para checar a flag 1× (R4).
  const byCompany = new Map<string, string[]>();
  for (const c of pending) {
    const arr = byCompany.get(c.companyId) ?? [];
    arr.push(c.id);
    byCompany.set(c.companyId, arr);
  }

  let leads = 0, errors = 0, skippedCompanies = 0, processed = 0;
  for (const [cid, ids] of byCompany) {
    // R4: fail-CLOSED. Erro de leitura OU IA indisponível/desligada → pula a empresa.
    let settings;
    try {
      settings = await prisma.companySettings.findUnique({
        where: { companyId: cid },
        select: { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: true },
      });
    } catch (e) {
      skippedCompanies++;
      log.error("falha ao ler settings — pulando empresa (fail-closed)", { companyId: cid, error: e });
      continue;
    }
    if (!settings || !settings.iaAvailable || !settings.iaEnabled) { skippedCompanies++; continue; }
    // (cota mensal: o logAiUsage acumula; uma checagem de cota fina pode somar
    //  getMonthlyUsage aqui no futuro. v1 confia na flag + teto de attempts/scan.)

    for (const id of ids) {
      processed++;
      try {
        const r = await qualifyConversation(id);
        if (r.leadId) leads++;
      } catch (e) {
        errors++;
        log.error("falha ao qualificar conversa (segue)", { conversationId: id, error: e });
      }
    }
  }
  return { processed, leads, errors, skippedCompanies };
}
