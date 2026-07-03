import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logAiUsage, getMonthlyUsage } from "@/services/ai-usage.service";
import { qualifyConversationText } from "@/lib/ai/lead-qualifier";
import { listStages } from "@/services/lead-stage.service";
import { createLead, updateLeadAiFields } from "@/services/lead.service";
import { getOrCreateAiSellerUser } from "@/services/ai-seller-user.service";
import { transcribeAudio } from "@/services/audio-transcription.service";
import { instanceNameForCompany } from "@/lib/whatsapp-instance";
import { getAiConfig } from "@/services/ai-config.service";
import { matchCustomerByPhone } from "@/services/lead-customer-match.service";
import { customerKind } from "@/lib/customer-kind-label";
import { intentLabel } from "@/lib/contact-intent-label";
import { sanitizeAiReason } from "@/lib/sanitize-ai-reason";
import { maybeAutoAdvanceLead } from "@/services/funnel-automove.service";
import { recordAutoMoveTrace } from "@/services/funnel-automove-trace.service";
import { getRecentIntentCorrections, buildFewShotBlock } from "@/services/funnel-fewshot.service";
import { conversationNeedsHumanAttention } from "@/lib/conversation-attention";
import { isPaidTrafficMessage } from "@/lib/paid-traffic-detect";
import type { ContactIntent } from "@/lib/ai/lead-qualifier";

const log = logger.child({ service: "conversation-qualifier" });
const MAX_ATTEMPTS = 3;
const SCAN_LIMIT = 200;
// S3: a cada quantas conversas o cron reverifica a cota mensal DENTRO do lote,
// para que crons sobrepostos não estourem o limite (ver qualifyPendingConversations).
const QUOTA_RECHECK_EVERY = 20;
// Few-shot (Fatia 3): qtde de correções recentes da ótica injetadas no prompt.
// Teto baixo p/ controlar custo de tokens (a crítica alertou: +input por chamada).
const FEWSHOT_LIMIT = 8;
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
  // Heartbeat do auto-move (Fatia 3): preenchido quando o motor foi AVALIADO nesta
  // qualificação (re-qualificação com leadId). Bubbla até o JSON do cron — canal
  // de leitura zero-DB que prova "o loop rodou" sem depender de logs do cron.
  autoMove?: { evaluated: boolean; moved: boolean; errored: boolean };
}

interface ConvMessage { direction: string; type: string; text: string | null; evolutionId: string | null; receivedAt: Date }

function buildConversationText(messages: { direction: string; type: string; text: string | null; receivedAt: Date }[]): string {
  return messages
    .filter((m) => m.direction === "inbound" && typeof m.text === "string" && m.text.trim().length > 0)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .map((m) => m.text!.trim())
    .join("\n");
}

/** Texto da PRIMEIRA (mais antiga) mensagem do cliente com conteúdo, ou null. */
function firstInboundText(messages: ReadonlyArray<ConvMessage>): string | null {
  const inbound = messages
    .filter((m) => m.direction === "inbound" && typeof m.text === "string" && m.text.trim().length > 0)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  return inbound.length > 0 ? inbound[0].text!.trim() : null;
}

/**
 * Origem do lead no NASCIMENTO (#9). Lê as frases-isca da ótica e, se a 1ª
 * mensagem do cliente casa alguma, devolve "PAID_TRAFFIC" (sinal APROXIMADO de
 * anúncio, nunca ROI). Senão devolve null (o chamador cai no default WHATSAPP).
 * Fail-safe: erro de leitura das settings → null (não trava a criação do lead).
 */
async function detectLeadSource(
  companyId: string,
  messages: ReadonlyArray<ConvMessage>,
): Promise<"PAID_TRAFFIC" | null> {
  try {
    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { waAdBaitPhrases: true },
    });
    const baits = settings?.waAdBaitPhrases ?? [];
    if (baits.length === 0) return null; // detecção desligada p/ esta ótica
    return isPaidTrafficMessage(firstInboundText(messages), baits) ? "PAID_TRAFFIC" : null;
  } catch (e) {
    log.warn("falha ao detectar tráfego pago (fail-safe → WHATSAPP)", { companyId, error: e });
    return null;
  }
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
    analysis?: {
      isLead: boolean;
      intent?: string | null;
      // Intenção CRUA (enum) — o sinal máquina-legível que deriva o guardrail.
      // Separado do `intent` (rótulo de exibição) de propósito (ver schema).
      intentCode?: ContactIntent | null;
      urgent?: boolean | null;
      customerKind?: string | null;
      reason?: string | null;
    },
  ) => {
    // Guardrail SAGRADO (Item 1): a conversa "acende" quando é reclamação/cobrança
    // OU tom irritado (fonte única, pura, = a que o eval usa). MONOTÔNICO-PRA-CIMA:
    // só escrevemos `true` — NUNCA voltamos p/ false numa re-qualificação (senão o
    // cliente desarma o alarme mandando "ok obrigado"). A baixa é ação humana à parte.
    const shouldFlag = analysis
      ? conversationNeedsHumanAttention({ intent: analysis.intentCode ?? null, urgent: analysis.urgent })
      : false;
    return prisma.whatsappConversation.update({
      where: { id: conv.id },
      data: {
        analyzedAt: new Date(),
        needsAnalysis: false,
        // A qualificação JÁ roda a régua (maybeAutoAdvanceLead, abaixo) com o intent
        // fresco. Limpar needsFunnelEval aqui evita que processFunnelReevals re-rode
        // a régua na MESMA conversa no mesmo ciclo do cron (duplo-avanço de estágio a
        // partir de um único evento). Se um novo outbound chegar depois, re-arma.
        needsFunnelEval: false,
        analysisAttempts: 0,
        ...(leadId ? { leadId } : {}),
        ...(analysis
          ? {
              analysisIsLead: analysis.isLead,
              analysisIntent: analysis.intent ?? null,
              analysisIntentCode: analysis.intentCode ?? null,
              analysisCustomerKind: analysis.customerKind ?? null,
              analysisReason: analysis.reason ? analysis.reason.slice(0, 500) : null,
              // Só marca true; a ausência da chave quando shouldFlag=false PRESERVA
              // um alarme já aceso (monotônico). Baixa só via resolver humano.
              // Ao RE-acender (cliente reclama DE NOVO após um humano ter dado baixa),
              // LIMPA a baixa anterior — senão o inbox ("live" = aceso E resolvedAt
              // null) veria a resolução antiga e esconderia a nova reclamação (buraco
              // de recall). Reabrir o alarme reabre a pendência de tratativa.
              ...(shouldFlag
                ? { needsHumanAttention: true, attentionResolvedAt: null, attentionResolvedById: null }
                : {}),
            }
          : {}),
      },
    });
  };

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
  // Few-shot por ótica (Fatia 3): injeta as últimas correções de intenção desta
  // ótica (só pares de enum, sem PII) p/ a IA não repetir erros recentes.
  const corrections = await getRecentIntentCorrections(conv.companyId, FEWSHOT_LIMIT);
  const fewShotBlock = buildFewShotBlock(corrections);
  const result = await qualifyConversationText(
    text,
    stages.map((s) => ({ id: s.id, name: s.name, order: s.order, isWon: s.isWon, isLost: s.isLost })),
    cfg.qualifierModel,
    match.kind === "single" ? match.summary : null,
    fewShotBlock,
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
    // Caminho NÃO-lead: aqui vivem RECLAMACAO/COBRANCA (isLead=false). finalize
    // recebe a intenção CRUA + urgent e ACENDE o guardrail sagrado se preciso —
    // FORA do kill-switch, p/ TODAS as óticas. Era exatamente o que o retorno
    // precoce daqui matava antes (o flag da régua era código morto p/ reclamação).
    await finalize(null, {
      isLead: false, intent: intentLbl, intentCode: result.intent, urgent: result.urgent,
      customerKind: customerKindLabel, reason: safeReason,
    });
    return { conversationId, isLead: false, leadId: null };
  }

  // RE-QUALIFICAÇÃO vs criação. Se a conversa JÁ é lead (conv.leadId), atualiza
  // o existente — NÃO cria de novo (corrige bug pré-existente de lead duplicado
  // a cada ciclo do cron). Senão, cria o lead.
  let leadId: string;
  if (conv.leadId) {
    await updateLeadAiFields(conv.leadId, conv.companyId, {
      intent: result.intent,
      contactNotPatient: result.contactNotPatient,
      urgent: result.urgent,
      confidence: result.confidence,
    });
    leadId = conv.leadId;
    log.info("lead re-qualificado pela IA", { conversationId, leadId, companyId: conv.companyId });
  } else {
    const sellerUserId = await getOrCreateAiSellerUser(conv.companyId);
    // Mapeia o kind do match (minúsculo no serviço) → enum do banco (maiúsculo).
    const matchKind = match.kind === "single" ? "SINGLE" : match.kind === "ambiguous" ? "AMBIGUOUS" : "NONE";
    // Tráfego pago APROXIMADO (#9): só no NASCIMENTO do lead. Se a PRIMEIRA
    // mensagem do cliente casa uma frase-isca do anúncio, o lead nasce
    // PAID_TRAFFIC. Usa `enriched` (não `messages`) p/ enxergar a isca também em
    // ÁUDIO já transcrito — a 1ª msg do cliente pode ser um áudio "quero a oferta".
    // firstInboundText() reordena asc internamente, então funciona qualquer que
    // seja a ordem em que as mensagens chegaram. Não é ROI — sinal aproximado.
    const source = (await detectLeadSource(conv.companyId, enriched)) ?? "WHATSAPP";
    const { lead } = await createLead(
      {
        name: conv.contactName ?? conv.contactNumber,
        phone: conv.contactNumber,
        source,
        interest: result.interest ?? undefined,
        stageId: result.stageId ?? undefined,
        notes: `Lead criado pela IA do funil. Motivo: ${safeReason}`.slice(0, 500),
      },
      conv.companyId, sellerUserId, null,
      {
        intent: result.intent,
        contactNotPatient: result.contactNotPatient,
        urgent: result.urgent,
        confidence: result.confidence,
        customerMatchKind: matchKind,
        // Guarda o candidato (match único) p/ o vendedor confirmar com 1 clique.
        suggestedCustomerId: match.kind === "single" ? match.customerId : null,
      },
    );
    leadId = lead.id;
    log.info("lead criado pela IA", { conversationId, leadId, companyId: conv.companyId });
  }
  // Caminho LEAD: também passa intent CRUA + urgent. Cobre o buraco do architect —
  // um cliente furioso que a IA classificou como intenção de VENDA (isLead=true)
  // ainda acende o guardrail via `urgent` (finalize decide, ortogonal ao isLead).
  await finalize(leadId, {
    isLead: true, intent: intentLbl, intentCode: result.intent, urgent: result.urgent,
    customerKind: customerKindLabel, reason: safeReason,
  });

  // Funil Inteligente — Fatia 3: auto-move. Roda em TODA qualificação — inclusive
  // no NASCIMENTO do lead (não só re-qualificação). É SEGURO avaliar no nascimento
  // porque a régua de Novo→Em atendimento exige que a ÓTICA TENHA RESPONDIDO: um
  // lead recém-nascido sem resposta da ótica fica em "Novo" corretamente; só move
  // quando há atendimento real. (Antes só rodava em re-qualificação `if conv.leadId`,
  // e leads sem mensagem nova depois ficavam presos em "Novo" pra sempre — o bug.)
  // O motor é fail-safe (não propaga) e gateado por kill-switch por ótica (OFF por
  // padrão). A observabilidade vive na trilha `FunnelAutoMoveLog`. Try/catch
  // DEDICADO cobre o caso raro de o motor lançar passando do próprio catch interno.
  let autoMove: QualifyResult["autoMove"];
  try {
    const r = await maybeAutoAdvanceLead({
      conversationId, leadId, companyId: conv.companyId,
      intent: result.intent, confidence: result.confidence,
    });
    autoMove = { evaluated: true, moved: r.moved, errored: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("auto-move lançou (segue, não quebra a qualificação)", { conversationId, leadId, error: msg });
    await recordAutoMoveTrace({
      companyId: conv.companyId, leadId, action: "error", moved: false,
      reason: "exceção fora do motor (qualifier)", error: msg,
      envSeen: process.env.FUNNEL_AUTOMOVE_COMPANIES ? "set" : "unset",
    });
    autoMove = { evaluated: true, moved: false, errored: true };
  }
  return { conversationId, isLead: true, leadId, autoMove };
}

/**
 * Varre conversas pendentes (1:1, attempts<3, analyzedAt null OU needsAnalysis), FIFO.
 * R4: checa as flags de IA UMA vez por empresa (fail-CLOSED: erro de leitura OU
 * desligada → pula a empresa). Erro numa conversa não interrompe as outras.
 */
export async function qualifyPendingConversations(
  companyId?: string,
  opts?: { cooldownMin?: number },
): Promise<{
  processed: number; leads: number; errors: number; skippedCompanies: number;
  // Heartbeat do auto-move (Fatia 3) p/ o JSON do cron — SEM escrita extra no
  // banco. `leadsEvaluated`>0 prova que o loop rodou e CHAMOU o motor; `moves` =
  // cards movidos no ciclo. `errors` conta só exceções que ESCAPARAM do motor
  // (raro: o motor é fail-safe) — o canal de erro REAL é a linha action="error"
  // na trilha `FunnelAutoMoveLog`, não este contador.
  autoMove: { leadsEvaluated: number; moves: number; errors: number };
}> {
  // Cooldown: ignora conversas com mensagem nos últimos N min (ainda "quentes").
  const cooldownMin = opts?.cooldownMin ?? COOLDOWN_MIN;
  const coldBefore = new Date(Date.now() - cooldownMin * 60_000);
  const pending = await prisma.whatsappConversation.findMany({
    where: {
      isGroup: false,
      // Troca de número: conversa arquivada (número antigo) NÃO é re-qualificada
      // pela IA — não gastar cota com quem saiu do funil ativo.
      archivedAt: null,
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
  let amEvaluated = 0, amMoves = 0, amErrors = 0; // heartbeat do auto-move
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

    // Gate de cota mensal (mesma regra do assertAiAllowed). Fecha o furo de o
    // cron estourar a cota — o Atacadão já estourou uma vez. Fail-SAFE no erro
    // de leitura do uso: deixa processar (não trava a feature por flake de banco).
    //
    // S3 (auditoria 2026-07-02): a checagem NÃO é mais só 1× no início. Antes,
    // dois crons sobrepostos (cron-job.org roda a cada 1-2min; um lote de até
    // 200 conversas pode não terminar antes do próximo disparar) liam a cota no
    // começo e cada um gastava seu lote inteiro sem ver o gasto do outro,
    // estourando o limite. Agora reverificamos a cota a cada QUOTA_RECHECK_EVERY
    // conversas: assim que o uso acumulado (incluindo o de uma execução
    // concorrente) cruza o limite, o lote para. Pooler-safe (sem lock de sessão).
    const quotaLimit = settings.iaMonthlyTokenLimit;
    const checkOverQuota = async (): Promise<boolean> => {
      if (quotaLimit == null) return false;
      try {
        const usage = await getMonthlyUsage(cid);
        return usage.totalTokens >= quotaLimit;
      } catch (e) {
        // fail-safe: erro de leitura do uso → não trava (deixa processar).
        log.error("falha ao somar uso mensal no cron — deixando processar (fail-safe)", { companyId: cid, error: e });
        return false;
      }
    };

    if (await checkOverQuota()) {
      skippedCompanies++;
      log.warn("cota mensal de IA atingida — pulando empresa no cron", { companyId: cid });
      continue;
    }

    let sinceQuotaCheck = 0;
    for (const id of ids) {
      // Reverifica a cota periodicamente dentro do lote (S3).
      if (quotaLimit != null && sinceQuotaCheck >= QUOTA_RECHECK_EVERY) {
        sinceQuotaCheck = 0;
        if (await checkOverQuota()) {
          log.warn("cota mensal de IA atingida no meio do lote — interrompendo empresa", { companyId: cid });
          break;
        }
      }
      processed++;
      sinceQuotaCheck++;
      try {
        const r = await qualifyConversation(id);
        if (r.leadId) leads++;
        if (r.autoMove?.evaluated) {
          amEvaluated++;
          if (r.autoMove.moved) amMoves++;
          if (r.autoMove.errored) amErrors++;
        }
      } catch (e) {
        errors++;
        log.error("falha ao qualificar conversa (segue)", { conversationId: id, error: e });
      }
    }
  }
  return {
    processed, leads, errors, skippedCompanies,
    autoMove: { leadsEvaluated: amEvaluated, moves: amMoves, errors: amErrors },
  };
}
