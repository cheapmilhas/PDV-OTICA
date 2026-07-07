import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { aiGlobalConfig: { findUnique: vi.fn(), upsert: vi.fn() } } }));
const encMock = vi.fn((s: string) => `enc(${s})`);
const decMock = vi.fn((s: string) => s.replace(/^enc\(|\)$/g, ""));
vi.mock("@/lib/secret-cipher", () => ({ encryptSecret: (s: string) => encMock(s), decryptSecret: (s: string) => decMock(s) }));
import { prisma } from "@/lib/prisma";
import { getAiConfig, updateAiConfig, getAnthropicKey, getOpenaiKey, QUALIFIER_MODELS, getPricingOverrides, invalidatePricingCache } from "./ai-config.service";

beforeEach(() => { vi.clearAllMocks(); delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; });

describe("ai-config.service", () => {
  it("getAiConfig cria singleton com defaults se não existe", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null });
    const c = await getAiConfig();
    expect(c.creditTokenFactor).toBe(1000);
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.where).toEqual({ id: "global" });
  });
  it("getAiConfig NÃO expõe a key (só hasKey)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: "enc(sk-secreta)" });
    const c = await getAiConfig();
    expect(c.hasKey).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/sk-secreta|anthropicKeyEnc/);
  });
  it("updateAiConfig cifra a key quando uma nova é passada", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.7", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: "enc(sk-ant-novo)" });
    await updateAiConfig({ anthropicKey: "sk-ant-novo", usdBrlRate: 5.7 });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(encMock).toHaveBeenCalledWith("sk-ant-novo");
    expect(arg.update.anthropicKeyEnc).toBe("enc(sk-ant-novo)");
    expect(Number(arg.update.usdBrlRate)).toBe(5.7);
  });
  it("updateAiConfig NÃO toca a key se anthropicKey vier vazio/undefined", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "6", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null });
    await updateAiConfig({ usdBrlRate: 6 });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.anthropicKeyEnc).toBeUndefined();
    expect(encMock).not.toHaveBeenCalled();
  });
  it("getAnthropicKey decifra a key do banco", async () => {
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ anthropicKeyEnc: "enc(sk-ant-db)" });
    expect(await getAnthropicKey()).toBe("sk-ant-db");
  });
  it("getAnthropicKey cai na env se banco não tem key", async () => {
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ anthropicKeyEnc: null });
    process.env.ANTHROPIC_API_KEY = "sk-ant-env";
    expect(await getAnthropicKey()).toBe("sk-ant-env");
  });

  // --- D3: qualifierModel + openaiKey ---
  it("getAiConfig retorna qualifierModel (default haiku) e hasOpenaiKey false", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null });
    const c = await getAiConfig();
    expect(c.qualifierModel).toBe("claude-haiku-4-5");
    expect(c.hasOpenaiKey).toBe(false);
  });
  it("getAiConfig retorna hasOpenaiKey true quando openaiKeyEnc presente", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-sonnet-4-6", openaiKeyEnc: "enc(sk-openai)" });
    const c = await getAiConfig();
    expect(c.qualifierModel).toBe("claude-sonnet-4-6");
    expect(c.hasOpenaiKey).toBe(true);
  });
  it("getAiConfig NÃO expõe a openai key (só hasOpenaiKey)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: "enc(sk-openai-secreta)" });
    const c = await getAiConfig();
    expect(JSON.stringify(c)).not.toMatch(/sk-openai-secreta|openaiKeyEnc|openaiKey/);
  });
  it("updateAiConfig seta qualifierModel quando é um valor da allowlist", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-opus-4-8", openaiKeyEnc: null });
    await updateAiConfig({ qualifierModel: "claude-opus-4-8" });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.qualifierModel).toBe("claude-opus-4-8");
    expect(QUALIFIER_MODELS).toContain("claude-opus-4-8");
  });
  it("updateAiConfig IGNORA qualifierModel inválido (fora da allowlist)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null });
    await updateAiConfig({ qualifierModel: "gpt-4" });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.qualifierModel).toBeUndefined();
  });
  it("updateAiConfig cifra a openaiKey quando uma nova é passada", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: "enc(sk-openai-novo)" });
    await updateAiConfig({ openaiKey: "sk-openai-novo" });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(encMock).toHaveBeenCalledWith("sk-openai-novo");
    expect(arg.update.openaiKeyEnc).toBe("enc(sk-openai-novo)");
  });
  it("updateAiConfig NÃO toca a openaiKey se vier vazio/whitespace", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null });
    await updateAiConfig({ openaiKey: "   " });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.openaiKeyEnc).toBeUndefined();
    expect(encMock).not.toHaveBeenCalled();
  });
  it("getOpenaiKey decifra a key do banco", async () => {
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ openaiKeyEnc: "enc(sk-openai-db)" });
    expect(await getOpenaiKey()).toBe("sk-openai-db");
  });
  it("getOpenaiKey cai na env se banco não tem key", async () => {
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ openaiKeyEnc: null });
    process.env.OPENAI_API_KEY = "sk-openai-env";
    expect(await getOpenaiKey()).toBe("sk-openai-env");
  });
  it("getOpenaiKey cai na env (e loga) se decifrar falhar", async () => {
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ openaiKeyEnc: "corrompida" });
    decMock.mockImplementationOnce(() => { throw new Error("bad cipher"); });
    process.env.OPENAI_API_KEY = "sk-openai-env-fallback";
    expect(await getOpenaiKey()).toBe("sk-openai-env-fallback");
  });

  // --- Task 6: lensAdvisorModel (mesma allowlist QUALIFIER_MODELS) ---
  it("getAiConfig retorna lensAdvisorModel (default haiku)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null, lensAdvisorModel: "claude-haiku-4-5" });
    const c = await getAiConfig();
    expect(c.lensAdvisorModel).toBe("claude-haiku-4-5");
  });
  it("updateAiConfig seta lensAdvisorModel quando é um valor da allowlist", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null, lensAdvisorModel: "claude-sonnet-4-6" });
    await updateAiConfig({ lensAdvisorModel: "claude-sonnet-4-6" });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.lensAdvisorModel).toBe("claude-sonnet-4-6");
    expect(QUALIFIER_MODELS).toContain("claude-sonnet-4-6");
  });
  it("updateAiConfig IGNORA lensAdvisorModel inválido (fora da allowlist)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null, lensAdvisorModel: "claude-haiku-4-5" });
    await updateAiConfig({ lensAdvisorModel: "gpt-4" });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.lensAdvisorModel).toBeUndefined();
  });

  // --- Task F4: ocrModel (mesma allowlist QUALIFIER_MODELS) ---
  it("getAiConfig retorna ocrModel do registro", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null, lensAdvisorModel: "claude-haiku-4-5", ocrModel: "claude-opus-4-8" });
    const c = await getAiConfig();
    expect(c.ocrModel).toBe("claude-opus-4-8");
  });
  it("updateAiConfig seta ocrModel quando é um valor da allowlist", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null, lensAdvisorModel: "claude-haiku-4-5", ocrModel: "claude-sonnet-4-6" });
    await updateAiConfig({ ocrModel: "claude-sonnet-4-6" });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.ocrModel).toBe("claude-sonnet-4-6");
    expect(QUALIFIER_MODELS).toContain("claude-sonnet-4-6");
  });
  it("updateAiConfig IGNORA ocrModel inválido (fora da allowlist)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null, lensAdvisorModel: "claude-haiku-4-5", ocrModel: "claude-sonnet-4-6" });
    await updateAiConfig({ ocrModel: "modelo-invalido" });
    const arg = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0];
    expect(arg.update.ocrModel).toBeUndefined();
  });

  // --- Fase 3: copilotModel (allowlist Claude) + transcriptionModel (allowlist própria) ---
  const rowWith = (extra: Record<string, unknown>) => ({ id: "global", usdBrlRate: "5.5", markupPercent: "0", creditTokenFactor: 1000, anthropicKeyEnc: null, qualifierModel: "claude-haiku-4-5", openaiKeyEnc: null, lensAdvisorModel: "claude-haiku-4-5", ocrModel: "claude-sonnet-4-6", copilotModel: "claude-sonnet-4-6", transcriptionModel: "whisper-1", ...extra });

  it("getAiConfig retorna copilotModel e transcriptionModel", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({ copilotModel: "claude-opus-4-8", transcriptionModel: "whisper-1" }));
    const c = await getAiConfig();
    expect(c.copilotModel).toBe("claude-opus-4-8");
    expect(c.transcriptionModel).toBe("whisper-1");
  });
  it("updateAiConfig seta copilotModel da allowlist Claude", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({ copilotModel: "claude-opus-4-8" }));
    await updateAiConfig({ copilotModel: "claude-opus-4-8" });
    expect((prisma.aiGlobalConfig.upsert as any).mock.calls[0][0].update.copilotModel).toBe("claude-opus-4-8");
  });
  it("updateAiConfig IGNORA copilotModel fora da allowlist (ex: whisper-1)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({}));
    await updateAiConfig({ copilotModel: "whisper-1" });
    expect((prisma.aiGlobalConfig.upsert as any).mock.calls[0][0].update.copilotModel).toBeUndefined();
  });
  it("updateAiConfig seta transcriptionModel da allowlist própria (whisper-1)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({ transcriptionModel: "whisper-1" }));
    await updateAiConfig({ transcriptionModel: "whisper-1" });
    expect((prisma.aiGlobalConfig.upsert as any).mock.calls[0][0].update.transcriptionModel).toBe("whisper-1");
  });
  it("updateAiConfig IGNORA transcriptionModel Claude (não roda por QUALIFIER_MODELS)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({}));
    await updateAiConfig({ transcriptionModel: "claude-haiku-4-5" });
    expect((prisma.aiGlobalConfig.upsert as any).mock.calls[0][0].update.transcriptionModel).toBeUndefined();
  });

  // --- Fase 4b: preços editáveis ---
  it("getAiConfig monta modelPricing com os 4 modelos default (sem override)", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({ modelPricingJson: null }));
    const c = await getAiConfig();
    const haiku = c.modelPricing.find((p) => p.model === "claude-haiku-4-5");
    expect(haiku).toBeDefined();
    expect(haiku!.inputPerMillion).toBe(1); // default do haiku
    expect(haiku!.overridden).toBe(false);
  });
  it("getAiConfig aplica override no modelPricing e marca overridden", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({ modelPricingJson: { "claude-haiku-4-5": { inputPerMillion: 9 } } }));
    const c = await getAiConfig();
    const haiku = c.modelPricing.find((p) => p.model === "claude-haiku-4-5")!;
    expect(haiku.inputPerMillion).toBe(9);
    expect(haiku.overridden).toBe(true);
    // outro campo segue default
    expect(haiku.outputPerMillion).toBe(5);
  });
  it("updateAiConfig sanitiza modelPricing: descarta modelo desconhecido e campo negativo", async () => {
    (prisma.aiGlobalConfig.upsert as any).mockResolvedValue(rowWith({}));
    await updateAiConfig({ modelPricing: {
      "claude-haiku-4-5": { inputPerMillion: 3, outputPerMillion: -1 },
      "modelo-fantasma": { inputPerMillion: 5 },
    } as any });
    const written = (prisma.aiGlobalConfig.upsert as any).mock.calls[0][0].update.modelPricingJson;
    expect(written["claude-haiku-4-5"]).toEqual({ inputPerMillion: 3 }); // output -1 caiu
    expect(written["modelo-fantasma"]).toBeUndefined(); // modelo desconhecido caiu
  });

  it("getPricingOverrides cacheia (2ª chamada não consulta o banco de novo)", async () => {
    invalidatePricingCache();
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ modelPricingJson: { "claude-haiku-4-5": { inputPerMillion: 2 } } });
    const t = 1_000_000;
    const a = await getPricingOverrides(t);
    const b = await getPricingOverrides(t + 30_000); // dentro do TTL de 60s
    expect(a).toEqual({ "claude-haiku-4-5": { inputPerMillion: 2 } });
    expect(b).toBe(a); // mesma referência = veio do cache
    expect((prisma.aiGlobalConfig.findUnique as any)).toHaveBeenCalledTimes(1);
  });
  it("getPricingOverrides recarrega após o TTL", async () => {
    invalidatePricingCache();
    (prisma.aiGlobalConfig.findUnique as any).mockResolvedValue({ modelPricingJson: {} });
    const t = 2_000_000;
    await getPricingOverrides(t);
    await getPricingOverrides(t + 61_000); // além do TTL
    expect((prisma.aiGlobalConfig.findUnique as any)).toHaveBeenCalledTimes(2);
  });
});
