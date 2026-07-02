import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConversation: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    companySettings: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
const logAiUsageMock = vi.fn();
const getMonthlyUsageMock = vi.fn();
vi.mock("@/services/ai-usage.service", () => ({
  logAiUsage: (...a: unknown[]) => logAiUsageMock(...a),
  getMonthlyUsage: (...a: unknown[]) => getMonthlyUsageMock(...a),
}));
const qualifyTextMock = vi.fn();
vi.mock("@/lib/ai/lead-qualifier", () => ({ qualifyConversationText: (...a: unknown[]) => qualifyTextMock(...a), LEAD_QUALIFIER_MODEL: "claude-sonnet-4-6" }));
const listStagesMock = vi.fn();
vi.mock("@/services/lead-stage.service", () => ({ listStages: (...a: unknown[]) => listStagesMock(...a) }));
const createLeadMock = vi.fn();
const updateLeadAiFieldsMock = vi.fn();
vi.mock("@/services/lead.service", () => ({
  createLead: (...a: unknown[]) => createLeadMock(...a),
  updateLeadAiFields: (...a: unknown[]) => updateLeadAiFieldsMock(...a),
}));
const getBotMock = vi.fn();
vi.mock("@/services/ai-seller-user.service", () => ({ getOrCreateAiSellerUser: (...a: unknown[]) => getBotMock(...a) }));
const transcribeAudioMock = vi.fn();
vi.mock("@/services/audio-transcription.service", () => ({ transcribeAudio: (...a: unknown[]) => transcribeAudioMock(...a) }));
vi.mock("@/lib/whatsapp-instance", () => ({ instanceNameForCompany: (companyId: string) => `inst_${companyId}` }));
const getAiConfigMock = vi.fn();
vi.mock("@/services/ai-config.service", () => ({ getAiConfig: (...a: unknown[]) => getAiConfigMock(...a) }));
const matchCustomerMock = vi.fn();
vi.mock("@/services/lead-customer-match.service", () => ({ matchCustomerByPhone: (...a: unknown[]) => matchCustomerMock(...a) }));
const autoAdvanceMock = vi.fn();
vi.mock("@/services/funnel-automove.service", () => ({ maybeAutoAdvanceLead: (...a: unknown[]) => autoAdvanceMock(...a) }));
vi.mock("@/services/funnel-fewshot.service", () => ({
  getRecentIntentCorrections: vi.fn().mockResolvedValue([]),
  buildFewShotBlock: vi.fn().mockReturnValue(""),
}));

import { prisma } from "@/lib/prisma";
import { qualifyConversation, qualifyPendingConversations } from "./conversation-qualifier.service";

const conv = {
  id: "c1", companyId: "co1", isGroup: false, analyzedAt: null, needsAnalysis: false, leadId: null, analysisAttempts: 0,
  contactNumber: "5585999", contactName: "Maria",
  messages: [
    { direction: "inbound", type: "text", text: "quanto custa óculos de grau?", evolutionId: "e1", receivedAt: new Date("2026-06-15T10:00:00Z") },
    { direction: "inbound", type: "text", text: "tenho receita", evolutionId: "e2", receivedAt: new Date("2026-06-15T10:01:00Z") },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  listStagesMock.mockResolvedValue([{ id: "s_novo", name: "Novo" }]);
  getBotMock.mockResolvedValue("u_bot");
  transcribeAudioMock.mockResolvedValue(null); // sem transcrição por padrão (conversas só-texto inalteradas)
  getAiConfigMock.mockResolvedValue({ qualifierModel: "claude-haiku-4-5", hasKey: true, usdBrlRate: 5, markupPercent: 0, creditTokenFactor: 1, hasOpenaiKey: true });
  matchCustomerMock.mockResolvedValue({ kind: "none", customerId: null, customerName: null, summary: null, candidateCount: 0 });
  (prisma.whatsappConversation.updateMany as any).mockResolvedValue({ count: 1 }); // claim vence
});

describe("qualifyConversation", () => {
  it("grupo → marca analyzedAt, sem IA, sem claim", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, isGroup: true });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("group");
    expect(qualifyTextMock).not.toHaveBeenCalled();
    expect(prisma.whatsappConversation.update).toHaveBeenCalled();
  });

  it("já analisada sem needsAnalysis e sem force → no-op", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, analyzedAt: new Date(), needsAnalysis: false });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("already_analyzed");
    expect(prisma.whatsappConversation.updateMany).not.toHaveBeenCalled();
  });

  it("já analisada COM needsAnalysis → re-qualifica (R1)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, analyzedAt: new Date(), needsAnalysis: true });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    const r = await qualifyConversation("c1");
    expect(qualifyTextMock).toHaveBeenCalled();
    expect(r.isLead).toBe(false);
  });

  it("força (botão) re-analisa mesmo já analisada (force=true)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, analyzedAt: new Date(), needsAnalysis: false });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1", { force: true });
    expect(qualifyTextMock).toHaveBeenCalled();
  });

  it("claim perdido (updateMany count=0, outra execução pegou) → aborta sem IA (R5)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    (prisma.whatsappConversation.updateMany as any).mockResolvedValue({ count: 0 });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("claimed_by_other");
    expect(qualifyTextMock).not.toHaveBeenCalled();
  });

  it("pré-claim no_text (sem texto, sem áudio transcritível) → finalize sem Whisper e sem claim", async () => {
    // áudio SEM evolutionId não é transcritível → heurística barata decide no_text
    // ANTES do claim: nenhuma chamada Whisper, nenhum updateMany (claim não tentado).
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, messages: [{ direction: "inbound", type: "audio", text: null, evolutionId: null, receivedAt: new Date() }] });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("no_text");
    expect(qualifyTextMock).not.toHaveBeenCalled();
    expect(transcribeAudioMock).not.toHaveBeenCalled();
    expect(prisma.whatsappConversation.updateMany).not.toHaveBeenCalled();
  });

  it("isLead=true → claim, IA, logAiUsage, cria lead (robô), seta leadId/analyzedAt, limpa needsAnalysis", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: true, reason: "grau", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "lead1" }, duplicateWarning: false });

    const r = await qualifyConversation("c1");

    // claim incrementa attempts e limpa needsAnalysis, condicionado ao estado lido
    const claim = (prisma.whatsappConversation.updateMany as any).mock.calls[0][0];
    expect(claim.where.id).toBe("c1");
    expect(claim.data.analysisAttempts.increment).toBe(1);
    expect(claim.data.needsAnalysis).toBe(false);

    expect(getBotMock).toHaveBeenCalledWith("co1");
    const [data, companyId, userId, branchId] = createLeadMock.mock.calls[0];
    expect(data.name).toBe("Maria");
    expect(data.phone).toBe("5585999");
    expect(data.source).toBe("WHATSAPP");
    expect(data.stageId).toBe("s_novo");
    expect(companyId).toBe("co1");
    expect(userId).toBe("u_bot");
    expect(branchId).toBeNull();
    expect(logAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: "co1", feature: "lead_qualification", inputTokens: 100, model: "claude-haiku-4-5" }));
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.leadId).toBe("lead1");
    expect(upd.data.analyzedAt).toBeInstanceOf(Date);
    expect(upd.data.analysisAttempts).toBe(0); // R2-fix: sucesso zera o contador (não congela recorrente)
    // A qualificação já roda a régua; limpa needsFunnelEval p/ processFunnelReevals
    // não re-avaliar a mesma conversa no mesmo ciclo (evita duplo-avanço de estágio).
    expect(upd.data.needsFunnelEval).toBe(false);
    expect(r.leadId).toBe("lead1");
    // FIX (cards presos em Novo): o motor de auto-move roda TAMBÉM no NASCIMENTO
    // do lead, não só em re-qualificação. Com o leadId recém-criado.
    expect(autoAdvanceMock).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead1" }));
  });

  it("tráfego pago (#9): 1ª msg casa isca → lead nasce PAID_TRAFFIC", async () => {
    // conv.messages[0] (mais antiga) = "quanto custa óculos de grau?". Uso uma isca
    // que casa essa 1ª mensagem p/ provar a atribuição no nascimento.
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    (prisma.companySettings.findUnique as any).mockResolvedValue({ waAdBaitPhrases: ["quanto custa"] });
    qualifyTextMock.mockResolvedValue({ isLead: true, reason: "grau", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "leadP" }, duplicateWarning: false });

    await qualifyConversation("c1");

    expect(createLeadMock.mock.calls[0][0].source).toBe("PAID_TRAFFIC");
  });

  it("tráfego pago (#9): sem isca configurada → lead segue WHATSAPP", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    (prisma.companySettings.findUnique as any).mockResolvedValue({ waAdBaitPhrases: [] });
    qualifyTextMock.mockResolvedValue({ isLead: true, reason: "grau", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "leadW" }, duplicateWarning: false });

    await qualifyConversation("c1");

    expect(createLeadMock.mock.calls[0][0].source).toBe("WHATSAPP");
  });

  it("tráfego pago (#9): isca no ÁUDIO transcrito também casa (usa enriched, não raw)", async () => {
    // 1ª msg do cliente é um ÁUDIO (text null); a transcrição contém a isca.
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv,
      messages: [{ direction: "inbound", type: "audio", text: null, evolutionId: "eAudio", receivedAt: new Date("2026-06-15T10:00:00Z") }],
    });
    transcribeAudioMock.mockResolvedValue("oi, quero a oferta do anúncio");
    (prisma.companySettings.findUnique as any).mockResolvedValue({ waAdBaitPhrases: ["quero a oferta"] });
    qualifyTextMock.mockResolvedValue({ isLead: true, reason: "grau", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "leadA" }, duplicateWarning: false });

    await qualifyConversation("c1");

    expect(createLeadMock.mock.calls[0][0].source).toBe("PAID_TRAFFIC");
  });

  it("análise concluída (mesmo não-lead) zera analysisAttempts — cliente recorrente não congela", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, analysisAttempts: 2 });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.analysisAttempts).toBe(0);
  });

  it("isLead=false → marca analyzedAt, sem lead, loga tokens", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "horário", interest: null, stageId: null, confidence: 0.8, parseError: false, usage: { inputTokens: 50, outputTokens: 10, cacheTokens: 0 } });
    const r = await qualifyConversation("c1");
    expect(createLeadMock).not.toHaveBeenCalled();
    expect(logAiUsageMock).toHaveBeenCalled();
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.analyzedAt).toBeInstanceOf(Date);
    expect(r.leadId).toBeNull();
  });

  it("PERSISTE o resultado da análise mesmo NÃO sendo lead (motivo p/ o dono ver)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: false, intent: "OUTRO", reason: "conversa pessoal, não é cliente de ótica", interest: null, stageId: null, confidence: 0.9, parseError: false, usage: { inputTokens: 50, outputTokens: 10, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.analysisIsLead).toBe(false);
    expect(upd.data.analysisReason).toContain("conversa pessoal");
    expect(upd.data.analysisIntent).toBeTruthy(); // rótulo PT da intenção
    expect(upd.data.analysisCustomerKind).toBe("Cliente novo"); // sem match → novo
  });

  // ── Guardrail SAGRADO da reclamação (Item 1) ─────────────────────────────
  // Reclamação/cobrança é isLead=false → NÃO vira card. Sem este sinal na CONVERSA
  // o cliente furioso some no "Não-lead". finalize acende needsHumanAttention.
  it("RECLAMACAO (isLead=false) ACENDE needsHumanAttention + grava intent CRUA", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: false, intent: "RECLAMACAO", urgent: false, reason: "insatisfeito", interest: null, stageId: null, confidence: 0.8, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.needsHumanAttention).toBe(true);
    expect(upd.data.analysisIntentCode).toBe("RECLAMACAO");
  });

  it("COBRANCA_FINANCEIRO (isLead=false) ACENDE needsHumanAttention", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: false, intent: "COBRANCA_FINANCEIRO", urgent: false, reason: "boleto", interest: null, stageId: null, confidence: 0.8, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.needsHumanAttention).toBe(true);
  });

  it("urgent=true com intenção NÃO-flag (OUTRO) ainda ACENDE (rede de segurança)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: false, intent: "OUTRO", urgent: true, reason: "irritado", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.needsHumanAttention).toBe(true);
  });

  it("cliente furioso classificado como VENDA (isLead=true) + urgent → ACENDE mesmo assim", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: true, intent: "NOVA_COMPRA", urgent: true, reason: "quer comprar mas irritado", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "leadF" }, duplicateWarning: false });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.needsHumanAttention).toBe(true);
  });

  it("conversa tranquila (venda, sem urgent) NÃO escreve needsHumanAttention (preserva monotônico)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: true, intent: "NOVA_COMPRA", urgent: false, reason: "grau", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "leadQ" }, duplicateWarning: false });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    // MONOTÔNICO: a chave NÃO deve aparecer (não sobrescreve um alarme já aceso).
    expect(upd.data).not.toHaveProperty("needsHumanAttention");
  });

  it("RE-acende (reclama de novo após baixa humana) → LIMPA attentionResolvedAt/ById", async () => {
    // Estado ANTERIOR: já foi resolvido por um humano (needsHumanAttention=false,
    // resolvedAt setado). O cliente reclama DE NOVO → o alarme tem que voltar a
    // aparecer como "live" no inbox (senão a resolução antiga esconde a nova).
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv, needsHumanAttention: false, attentionResolvedAt: new Date("2026-01-01"),
    });
    qualifyTextMock.mockResolvedValue({ isLead: false, intent: "RECLAMACAO", urgent: false, reason: "de novo", interest: null, stageId: null, confidence: 0.8, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data.needsHumanAttention).toBe(true);
    // sem isso, o inbox veria a resolução antiga e esconderia a nova reclamação
    expect(upd.data.attentionResolvedAt).toBeNull();
    expect(upd.data.attentionResolvedById).toBeNull();
  });

  it("GARANTIA_CONSERTO sozinha (sem urgent) NÃO acende o alarme vermelho", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    qualifyTextMock.mockResolvedValue({ isLead: false, intent: "GARANTIA_CONSERTO", urgent: false, reason: "haste quebrou", interest: null, stageId: null, confidence: 0.8, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const upd = (prisma.whatsappConversation.update as any).mock.calls.at(-1)[0];
    expect(upd.data).not.toHaveProperty("needsHumanAttention");
    // mas a intent crua fica registrada p/ o tier suave derivar no inbox
    expect(upd.data.analysisIntentCode).toBe("GARANTIA_CONSERTO");
  });

  it("áudio transcrito (text null) → texto entra no contexto + transcribeAudio(companyId, instance, evolutionId)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv,
      messages: [{ direction: "inbound", type: "audio", text: null, evolutionId: "eAudio", receivedAt: new Date("2026-06-15T10:00:00Z") }],
    });
    transcribeAudioMock.mockResolvedValue("quero um óculos de grau");
    qualifyTextMock.mockResolvedValue({ isLead: true, reason: "grau", interest: "grau", stageId: "s_novo", confidence: 0.9, parseError: false, usage: { inputTokens: 10, outputTokens: 5, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "leadA" }, duplicateWarning: false });

    await qualifyConversation("c1");

    expect(transcribeAudioMock).toHaveBeenCalledWith("co1", "inst_co1", "eAudio");
    const [textArg] = qualifyTextMock.mock.calls[0];
    expect(textArg).toContain("quero um óculos de grau");
  });

  it("só-áudio, claim vence, transcribeAudio null → no_text APÓS o claim (finalize null, sem IA)", async () => {
    // áudio transcritível (tem evolutionId) → vence o claim, transcreve (gasta
    // Whisper), mas Whisper devolve null → buildConversationText fica vazio → no_text.
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv,
      messages: [{ direction: "inbound", type: "audio", text: null, evolutionId: "eAudio", receivedAt: new Date() }],
    });
    transcribeAudioMock.mockResolvedValue(null);
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("no_text");
    expect(prisma.whatsappConversation.updateMany).toHaveBeenCalled(); // claim foi tentado/vencido
    expect(transcribeAudioMock).toHaveBeenCalled(); // vencedor transcreveu
    expect(qualifyTextMock).not.toHaveBeenCalled();
    expect(prisma.whatsappConversation.update).toHaveBeenCalled(); // finalize(null)
  });

  it("claim PERDIDO em conversa de áudio → ZERO Whisper e ZERO IA (perdedor não gasta)", async () => {
    // Invariante D8: quem perde o CAS não pode disparar transcrição nem Anthropic.
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv,
      messages: [{ direction: "inbound", type: "audio", text: null, evolutionId: "eAudio", receivedAt: new Date() }],
    });
    (prisma.whatsappConversation.updateMany as any).mockResolvedValue({ count: 0 });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("claimed_by_other");
    expect(transcribeAudioMock).not.toHaveBeenCalled();
    expect(qualifyTextMock).not.toHaveBeenCalled();
  });

  it("múltiplos áudios → transcrições entram em ordem cronológica no texto da IA", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv,
      messages: [
        { direction: "inbound", type: "audio", text: null, evolutionId: "eA", receivedAt: new Date("2026-06-15T10:00:00Z") },
        { direction: "inbound", type: "audio", text: null, evolutionId: "eB", receivedAt: new Date("2026-06-15T10:05:00Z") },
      ],
    });
    transcribeAudioMock.mockImplementation((_co: string, _inst: string, eid: string) =>
      Promise.resolve(eid === "eA" ? "primeiro audio" : "segundo audio"),
    );
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    await qualifyConversation("c1");
    const [textArg] = qualifyTextMock.mock.calls[0];
    expect(textArg).toContain("primeiro audio");
    expect(textArg).toContain("segundo audio");
    expect(textArg.indexOf("primeiro audio")).toBeLessThan(textArg.indexOf("segundo audio"));
  });

  it("usa o modelo de getAiConfig em qualifyConversationText E em logAiUsage", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    getAiConfigMock.mockResolvedValue({ qualifierModel: "claude-opus-4-8", hasKey: true, usdBrlRate: 5, markupPercent: 0, creditTokenFactor: 1, hasOpenaiKey: true });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });

    await qualifyConversation("c1");

    expect(qualifyTextMock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), "claude-opus-4-8", null, "");
    expect(logAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-4-8" }));
  });

  it("cliente reconhecido (match único) → passa o resumo seguro como hint à IA", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    const summary = { purchaseCount: 3, daysSinceLastPurchase: 400, openServiceOrder: null, isRecurring: true };
    matchCustomerMock.mockResolvedValue({ kind: "single", customerId: "cust1", customerName: "Maria", summary, candidateCount: 1 });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });

    await qualifyConversation("c1");

    // 4º arg = o resumo seguro do cliente (hint)
    expect(qualifyTextMock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.any(String), summary, "");
  });

  it("match ambíguo (2+ fichas) → NÃO passa hint (null), não vaza resumo de ninguém", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    matchCustomerMock.mockResolvedValue({ kind: "ambiguous", customerId: null, customerName: null, summary: null, candidateCount: 2 });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });

    await qualifyConversation("c1");

    expect(qualifyTextMock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.any(String), null, "");
  });

  it("ao criar lead, persiste intent/contactNotPatient/urgent/customerMatchKind", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv });
    matchCustomerMock.mockResolvedValue({ kind: "single", customerId: "cust1", customerName: "Maria", summary: { purchaseCount: 3, daysSinceLastPurchase: 400, openServiceOrder: null, isRecurring: true }, candidateCount: 1 });
    qualifyTextMock.mockResolvedValue({ isLead: true, intent: "RENOVACAO", reason: "renova", interest: "grau", stageId: "s_novo", confidence: 0.9, contactNotPatient: false, urgent: false, parseError: false, usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 0 } });
    createLeadMock.mockResolvedValue({ lead: { id: "lead1" }, duplicateWarning: false });

    await qualifyConversation("c1");

    const aiFields = createLeadMock.mock.calls[0][4]; // 5º arg = aiFields
    expect(aiFields.intent).toBe("RENOVACAO");
    expect(aiFields.customerMatchKind).toBe("SINGLE");
    expect(aiFields.contactNotPatient).toBe(false);
    expect(aiFields.urgent).toBe(false);
  });

  it("RE-QUALIFICAÇÃO: conversa que JÁ é lead NÃO cria lead novo (evita duplicado)", async () => {
    // conv com leadId já setado + needsAnalysis (msg nova) → re-qualifica, não recria.
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv, leadId: "lead_existente", analyzedAt: new Date("2026-06-29"), needsAnalysis: true,
    });
    qualifyTextMock.mockResolvedValue({ isLead: true, intent: "NOVA_COMPRA", reason: "quer comprar", interest: "grau", stageId: "s_novo", confidence: 0.9, contactNotPatient: false, urgent: false, parseError: false, usage: { inputTokens: 10, outputTokens: 5, cacheTokens: 0 } });

    const r = await qualifyConversation("c1");

    expect(createLeadMock).not.toHaveBeenCalled(); // NÃO duplica
    expect(updateLeadAiFieldsMock).toHaveBeenCalled(); // atualiza o existente
    expect(r.leadId).toBe("lead_existente");
    // auto-move roda sobre o lead existente
    expect(autoAdvanceMock).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead_existente" }));
  });

  it("grupo → transcribeAudio NÃO é chamado (pulado como group)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv,
      isGroup: true,
      messages: [{ direction: "inbound", type: "audio", text: null, evolutionId: "eAudio", receivedAt: new Date() }],
    });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBe("group");
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("erro numa transcrição não aborta a qualificação (defensivo)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({
      ...conv,
      messages: [
        { direction: "inbound", type: "audio", text: null, evolutionId: "eBoom", receivedAt: new Date("2026-06-15T10:00:00Z") },
        { direction: "inbound", type: "text", text: "tenho receita", evolutionId: "e2", receivedAt: new Date("2026-06-15T10:01:00Z") },
      ],
    });
    transcribeAudioMock.mockRejectedValue(new Error("whisper explodiu"));
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    const r = await qualifyConversation("c1");
    expect(r.skipped).toBeUndefined();
    const [textArg] = qualifyTextMock.mock.calls[0];
    expect(textArg).toContain("tenho receita"); // texto segue mesmo com áudio falho
  });
});

describe("qualifyPendingConversations (R4 fail-closed por empresa)", () => {
  it("empresa com IA desligada → pula sem chamar IA", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", companyId: "co1" }]);
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: false, iaMonthlyTokenLimit: null });
    const r = await qualifyPendingConversations();
    expect(qualifyTextMock).not.toHaveBeenCalled();
    expect(r.skippedCompanies).toBe(1);
  });

  it("falha ao ler settings da empresa → pula a empresa (fail-CLOSED, R4)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", companyId: "co1" }]);
    (prisma.companySettings.findUnique as any).mockRejectedValue(new Error("db soluço"));
    const r = await qualifyPendingConversations();
    expect(qualifyTextMock).not.toHaveBeenCalled();
    expect(r.skippedCompanies).toBe(1);
  });

  it("empresa com cota mensal ESTOURADA → pula sem chamar IA (gate de cota no cron)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", companyId: "co1" }]);
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 500_000 });
    getMonthlyUsageMock.mockResolvedValue({ totalTokens: 500_000 }); // uso == limite → estourou
    const r = await qualifyPendingConversations();
    expect(qualifyTextMock).not.toHaveBeenCalled();
    expect(r.skippedCompanies).toBe(1);
  });

  it("empresa com cota mensal AINDA disponível → processa normalmente", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", companyId: "co1" }]);
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 500_000 });
    getMonthlyUsageMock.mockResolvedValue({ totalTokens: 100_000 }); // bem abaixo do limite
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, id: "c1", companyId: "co1" });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    const r = await qualifyPendingConversations();
    expect(getMonthlyUsageMock).toHaveBeenCalledWith("co1");
    expect(qualifyTextMock).toHaveBeenCalledOnce(); // processou de fato (não pulou)
    expect(r.skippedCompanies).toBe(0);
  });

  it("limite NULL (sem cota) → não chama getMonthlyUsage e processa", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", companyId: "co1" }]);
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: null });
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, id: "c1", companyId: "co1" });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    const r = await qualifyPendingConversations();
    expect(getMonthlyUsageMock).not.toHaveBeenCalled();
    expect(r.skippedCompanies).toBe(0);
  });

  it("cota: erro ao somar uso mensal → fail-safe deixa processar (não trava por flake)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([{ id: "c1", companyId: "co1" }]);
    (prisma.companySettings.findUnique as any).mockResolvedValue({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 500_000 });
    getMonthlyUsageMock.mockRejectedValue(new Error("usage db flake"));
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ ...conv, id: "c1", companyId: "co1" });
    qualifyTextMock.mockResolvedValue({ isLead: false, reason: "x", interest: null, stageId: null, confidence: 0.5, parseError: false, usage: { inputTokens: 1, outputTokens: 1, cacheTokens: 0 } });
    const r = await qualifyPendingConversations();
    expect(r.skippedCompanies).toBe(0); // fail-safe: não pula por erro de leitura de uso
  });

  it("findMany filtra grupo, attempts<3 e (analyzedAt null OU needsAnalysis), FIFO", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([]);
    await qualifyPendingConversations("co1");
    const arg = (prisma.whatsappConversation.findMany as any).mock.calls[0][0];
    expect(arg.where.companyId).toBe("co1");
    expect(arg.where.isGroup).toBe(false);
    expect(arg.where.analysisAttempts.lt).toBe(3);
    expect(arg.where.OR).toEqual([{ analyzedAt: null }, { needsAnalysis: true }]);
    expect(arg.orderBy).toEqual({ lastMessageAt: "asc" });
    expect(arg.take).toBeGreaterThan(0);
  });

  it("cooldownMin > 0 → filtra lastMessageAt.lt (esfriar a conversa)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([]);
    await qualifyPendingConversations("co1", { cooldownMin: 4 });
    const arg = (prisma.whatsappConversation.findMany as any).mock.calls[0][0];
    expect(arg.where.lastMessageAt).toBeDefined();
    expect(arg.where.lastMessageAt.lt).toBeInstanceOf(Date);
  });

  it("cooldownMin = 0 → NÃO filtra lastMessageAt (não-regressão do cron diário)", async () => {
    (prisma.whatsappConversation.findMany as any).mockResolvedValue([]);
    await qualifyPendingConversations("co1", { cooldownMin: 0 });
    const arg = (prisma.whatsappConversation.findMany as any).mock.calls[0][0];
    expect(arg.where.lastMessageAt).toBeUndefined();
  });
});
