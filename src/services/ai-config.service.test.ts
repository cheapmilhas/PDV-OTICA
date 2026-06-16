import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { aiGlobalConfig: { findUnique: vi.fn(), upsert: vi.fn() } } }));
const encMock = vi.fn((s: string) => `enc(${s})`);
const decMock = vi.fn((s: string) => s.replace(/^enc\(|\)$/g, ""));
vi.mock("@/lib/secret-cipher", () => ({ encryptSecret: (s: string) => encMock(s), decryptSecret: (s: string) => decMock(s) }));
import { prisma } from "@/lib/prisma";
import { getAiConfig, updateAiConfig, getAnthropicKey } from "./ai-config.service";

beforeEach(() => { vi.clearAllMocks(); delete process.env.ANTHROPIC_API_KEY; });

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
});
