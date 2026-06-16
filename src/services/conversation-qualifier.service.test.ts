import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConversation: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    companySettings: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
const logAiUsageMock = vi.fn();
vi.mock("@/services/ai-usage.service", () => ({ logAiUsage: (...a: unknown[]) => logAiUsageMock(...a) }));
const qualifyTextMock = vi.fn();
vi.mock("@/lib/ai/lead-qualifier", () => ({ qualifyConversationText: (...a: unknown[]) => qualifyTextMock(...a), LEAD_QUALIFIER_MODEL: "claude-sonnet-4-6" }));
const listStagesMock = vi.fn();
vi.mock("@/services/lead-stage.service", () => ({ listStages: (...a: unknown[]) => listStagesMock(...a) }));
const createLeadMock = vi.fn();
vi.mock("@/services/lead.service", () => ({ createLead: (...a: unknown[]) => createLeadMock(...a) }));
const getBotMock = vi.fn();
vi.mock("@/services/ai-seller-user.service", () => ({ getOrCreateAiSellerUser: (...a: unknown[]) => getBotMock(...a) }));
const transcribeAudioMock = vi.fn();
vi.mock("@/services/audio-transcription.service", () => ({ transcribeAudio: (...a: unknown[]) => transcribeAudioMock(...a) }));
vi.mock("@/lib/whatsapp-instance", () => ({ instanceNameForCompany: (companyId: string) => `inst_${companyId}` }));
const getAiConfigMock = vi.fn();
vi.mock("@/services/ai-config.service", () => ({ getAiConfig: (...a: unknown[]) => getAiConfigMock(...a) }));

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
    expect(r.leadId).toBe("lead1");
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

    expect(qualifyTextMock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), "claude-opus-4-8");
    expect(logAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-4-8" }));
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
});
