import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logAiUsage, getMonthlyUsage } from "@/services/ai-usage.service";
import { qualifyConversationText } from "@/lib/ai/lead-qualifier";
import { listStages } from "@/services/lead-stage.service";
import { createLead } from "@/services/lead.service";
import { getOrCreateAiSellerUser } from "@/services/ai-seller-user.service";
import { transcribeAudio } from "@/services/audio-transcription.service";
import { instanceNameForCompany } from "@/lib/whatsapp-instance";
import { getAiConfig } from "@/services/ai-config.service";
import { matchCustomerByPhone } from "@/services/lead-customer-match.service";
import { customerKind } from "@/lib/customer-kind-label";
import { intentLabel } from "@/lib/contact-intent-label";
import { sanitizeAiReason } from "@/lib/sanitize-ai-reason";

const log = logger.child({ service: "conversation-qualifier" });
const MAX_ATTEMPTS = 3;
const SCAN_LIMIT = 200;
// "Esfriar a conversa" (debounce): quando o cron roda em alta frequência (ex.
// cron-job.org a cada 1-2 min), não queremos qualificar no MEIO de uma rajada de
// mensagens — o cliente ainda está digitando. Só consideramos uma conversa pronta
// quando a última mensagem tem mais de WHATSAPP_QUALIFY_COOLDOWN_MIN minutos.
// Default 3 min. Setar 0 reproduz o comportamento antigo (sem cooldown) — usado
// pelo cron diário, onde o atraso é irrelevante.
const COOLDOWN_MIN = (() => {
  // ATENÇÃO: Number("") === 0. Uma env AUSENTE/VAZIA (a Vercel deixa Sensitive
  // como "" ao remover) NÃO pode ser lida como 0 (que desligaria o cooldown).
  // Só aceitamos um número quando há texto não-vazio; senão default 3 min.
  const rawStr = process.env.WHATSAPP_QUALIFY_COOLDOWN_MIN?.trim();
  if (!rawStr) return 3;
  const raw = Number(rawStr);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3;
})();
// D8: teto de chamadas Whisper SIMULTÂNEAS por conversa. Com até 80 mensagens,
// um Promise.all sobre todos os áudios dispararia 80 requisições de uma vez.
// Processamos em lotes deste tamanho, preservando a ORDEM das mensagens.
const TRANSCRIBE_CONCURRENCY = 4;

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
  // analysis = resultado p/ o dono ver no inbox (motivo/intenção/tipo cliente),
  // preenchido SEMPRE — inclusive quando NÃO vira lead (era descartado antes).
  const finalize = (
    leadId: string | null,
    analysis?: { isLead: boolean; intent?: string | null; customerKind?: string | null; reason?: string | null },
  ) =>
    prisma.whatsappConversation.update({
      where: { id: conv.id },
      data: {
        analyzedAt: new Date(),
        needsAnalysis: false,
        analysisAttempts: 0,
        ...(leadId ? { leadId } : {}),
        ...(analysis
          ? {
              analysisIsLead: analysis.isLead,
              analysisIntent: analysis.intent ?? null,
              analysisCustomerKind: analysis.customerKind ?? null,
              analysisReason: analysis.reason ? analysis.reason.slice(0, 500) : null,
            }
          : {}),
      },
    });

  if (conv.isGroup) {
    await finalize(null, { isLead: false, reason: "Conversa em grupo — não vira lead." });
    return { conversationId, skipped: "group", leadId: null };
  }

  const force = opts?.force === true;
  if (conv.analyzedAt && !conv.needsAnalysis && !force) {
    return { conversationId, skipped: "already_analyzed", leadId: conv.leadId };
  }

  // Heurística pré-claim BARATA (D8): SEM Whisper, SEM IA, SEM rede. Decide se a
  // conversa PODE produzir texto. Uma conversa que não tem texto inbound nem áudio
  // transcritível NUNCA gerará contexto → finaliza como no_text sem gastar Whisper
  // e SEM queimar um claim. transcribeAudio só roda DEPOIS de vencer o claim, p/
  // que o perdedor da corrida gaste ZERO (Whisper e Anthropic).
  const messages = conv.messages as ConvMessage[];
  const hasText = messages.some(
    (m) => m.direction === "inbound" && typeof m.text === "string" && m.text.trim().length > 0,
  );
  const hasTranscribableAudio = messages.some(
    (m) => m.direction === "inbound" && m.type === "audio" && !!m.evolutionId,
  );
  if (!hasText && !hasTranscribableAudio) {
    await finalize(null);
    return { conversationId, skipped: "no_text", leadId: null };
  }

  // R5: claim otimista — reivindica a conversa condicionado ao estado lido.
  // Incrementa attempts (R2) e limpa needsAnalysis. Se outra execução já pegou
  // (count 0), aborta antes de gastar Whisper/IA. O claim vem ANTES da transcrição:
  // o perdedor da corrida não dispara nenhuma chamada paga.
  const claim = await prisma.whatsappConversation.updateMany({
    where: { id: conv.id, analysisAttempts: conv.analysisAttempts },
    data: { analysisAttempts: { increment: 1 }, needsAnalysis: false },
  });
  if (claim.count === 0) return { conversationId, skipped: "claimed_by_other", leadId: null };

  // Passe de transcrição (D8): SÓ o vencedor do claim chega aqui. Áudios inbound
  // sem texto viram texto via Whisper p/ que o contexto "enxergue" o áudio.
  // transcribeAudio é fail-safe (retorna null), mas blindamos cada chamada: um
  // áudio com erro não pode abortar a qualificação. Enriquecemos uma CÓPIA local;
  // não persiste no banco. Concorrência limitada a TRANSCRIBE_CONCURRENCY: em vez
  // de disparar todos os áudios de uma vez, processamos em lotes, aguardando cada
  // lote. O fatiamento sequencial preserva a ORDEM das mensagens.
  const instanceName = instanceNameForCompany(conv.companyId);
  const transcribeOne = async (m: ConvMessage): Promise<ConvMessage> => {
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
  };
  const enriched: ConvMessage[] = [];
  for (let i = 0; i < messages.length; i += TRANSCRIBE_CONCURRENCY) {
    const chunk = messages.slice(i, i + TRANSCRIBE_CONCURRENCY);
    const done = await Promise.all(chunk.map(transcribeOne));
    enriched.push(...done);
  }

  // Após transcrever, monta o texto. Se nada saiu (todo áudio transcreveu p/ nada),
  // finaliza como no_text — o vencedor JÁ gastou Whisper, então é correto queimar
  // o attempt; finalize() zera os attempts no sucesso de qualquer forma.
  const text = buildConversationText(enriched);
  if (!text) { await finalize(null); return { conversationId, skipped: "no_text", leadId: null }; }

  // NOTA: assertAiAllowed NÃO é chamado aqui — a checagem de IA é feita
  // fail-CLOSED por empresa em qualifyPendingConversations (R4). A rota manual
  // chama assertAiAllowed antes (ver Task 7) para o caminho 1-a-1.
  const stages = await listStages(conv.companyId);
  // Modelo configurável (D8): o super admin escolhe o modelo do qualificador na
  // config global de IA. Usado tanto na chamada quanto no logAiUsage (p/ o custo
  // ser calculado com a tabela de preço do modelo realmente usado).
  const cfg = await getAiConfig();
  // Reconhecimento de cliente (Fase 1): casa o telefone do contato com um
  // Customer da MESMA empresa e passa um resumo SEGURO (só agregados) à IA p/
  // classificar melhor (renovação vs nova compra etc.). Match único = sugestão
  // revisável; o vínculo customerId só grava após confirmação humana (writer
  // dedicado), NÃO aqui — aqui o resumo é só dica de classificação.
  const match = await matchCustomerByPhone(conv.companyId, conv.contactNumber);
  const result = await qualifyConversationText(
    text,
    stages.map((s) => ({ id: s.id, name: s.name })),
    cfg.qualifierModel,
    match.kind === "single" ? match.summary : null,
  );

  await logAiUsage({
    companyId: conv.companyId, feature: "lead_qualification", provider: "anthropic", model: cfg.qualifierModel,
    inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cacheTokens: result.usage.cacheTokens,
  });

  // Tipo de cliente p/ exibição. single → deriva das compras; ambiguous → há
  // 2+ fichas conhecidas (NÃO é "novo" — seria factualmente errado); none → novo.
  const customerKindLabel =
    match.kind === "single"
      ? customerKind(match.summary?.purchaseCount ?? 0).label
      : match.kind === "ambiguous"
        ? "Múltiplos clientes"
        : customerKind(0).label;
  const intentLbl = intentLabel(result.intent)?.label ?? null;
  // LGPD: sanitiza o motivo (vem livre da IA, pode capturar PII/valor) antes de
  // persistir/exibir no inbox a todo usuário com acesso a leads.
  const safeReason = sanitizeAiReason(result.reason);

  if (!result.isLead) {
    await finalize(null, { isLead: false, intent: intentLbl, customerKind: customerKindLabel, reason: safeReason });
    return { conversationId, isLead: false, leadId: null };
  }

  const sellerUserId = await getOrCreateAiSellerUser(conv.companyId);
  // Mapeia o kind do match (minúsculo no serviço) → enum do banco (maiúsculo).
  const matchKind = match.kind === "single" ? "SINGLE" : match.kind === "ambiguous" ? "AMBIGUOUS" : "NONE";
  const { lead } = await createLead(
    {
      name: conv.contactName ?? conv.contactNumber,
      phone: conv.contactNumber,
      source: "WHATSAPP",
      interest: result.interest ?? undefined,
      stageId: result.stageId ?? undefined,
      notes: `Lead criado pela IA do funil. Motivo: ${safeReason}`.slice(0, 500),
    },
    conv.companyId, sellerUserId, null,
    {
      intent: result.intent,
      contactNotPatient: result.contactNotPatient,
      urgent: result.urgent,
      customerMatchKind: matchKind,
      // Guarda o candidato (match único) p/ o vendedor confirmar com 1 clique.
      suggestedCustomerId: match.kind === "single" ? match.customerId : null,
    },
  );
  await finalize(lead.id, { isLead: true, intent: intentLbl, customerKind: customerKindLabel, reason: safeReason });
  log.info("lead criado pela IA", { conversationId, leadId: lead.id, companyId: conv.companyId });
  return { conversationId, isLead: true, leadId: lead.id };
}

/**
 * Varre conversas pendentes (1:1, attempts<3, analyzedAt null OU needsAnalysis), FIFO.
 * R4: checa as flags de IA UMA vez por empresa (fail-CLOSED: erro de leitura OU
 * desligada → pula a empresa). Erro numa conversa não interrompe as outras.
 */
export async function qualifyPendingConversations(
  companyId?: string,
  opts?: { cooldownMin?: number },
): Promise<{ processed: number; leads: number; errors: number; skippedCompanies: number }> {
  // Cooldown: ignora conversas com mensagem nos últimos N min (ainda "quentes").
  const cooldownMin = opts?.cooldownMin ?? COOLDOWN_MIN;
  const coldBefore = new Date(Date.now() - cooldownMin * 60_000);
  const pending = await prisma.whatsappConversation.findMany({
    where: {
      isGroup: false,
      analysisAttempts: { lt: MAX_ATTEMPTS },
      OR: [{ analyzedAt: null }, { needsAnalysis: true }],
      ...(cooldownMin > 0 ? { lastMessageAt: { lt: coldBefore } } : {}),
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

    // Gate de cota mensal (mesma regra do assertAiAllowed, 1× por empresa aqui
    // p/ não somar por conversa). Fecha o furo de o cron estourar a cota — o
    // Atacadão já estourou uma vez. Fail-SAFE no erro de leitura do uso: deixa
    // processar (não trava a feature por flake de banco), igual ao guard manual.
    if (settings.iaMonthlyTokenLimit != null) {
      let overQuota = false;
      try {
        const usage = await getMonthlyUsage(cid);
        overQuota = usage.totalTokens >= settings.iaMonthlyTokenLimit;
      } catch (e) {
        log.error("falha ao somar uso mensal no cron — deixando processar (fail-safe)", { companyId: cid, error: e });
      }
      if (overQuota) {
        skippedCompanies++;
        log.warn("cota mensal de IA atingida — pulando empresa no cron", { companyId: cid });
        continue;
      }
    }

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
