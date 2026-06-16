import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
const getOpenaiKeyMock = vi.fn();
vi.mock("@/services/ai-config.service", () => ({ getOpenaiKey: (...a: unknown[]) => getOpenaiKeyMock(...a) }));
const getMediaBase64Mock = vi.fn();
vi.mock("@/lib/evolution", () => ({ evolution: { getMediaBase64: (...a: unknown[]) => getMediaBase64Mock(...a) } }));
const logAiUsageMock = vi.fn();
vi.mock("@/services/ai-usage.service", () => ({ logAiUsage: (...a: unknown[]) => logAiUsageMock(...a) }));

import { transcribeAudio } from "./audio-transcription.service";

// base64 de um conteúdo qualquer (não precisa ser áudio real para o teste).
const SAMPLE_BASE64 = Buffer.from("fake-audio-bytes").toString("base64");

function okJson(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcribeAudio", () => {
  it("happy path: transcreve o áudio e registra o uso", async () => {
    getOpenaiKeyMock.mockResolvedValue("sk-test");
    getMediaBase64Mock.mockResolvedValue({ base64: SAMPLE_BASE64, mimetype: "audio/ogg" });
    fetchMock.mockResolvedValue(okJson({ text: "olá quanto custa" }));

    const result = await transcribeAudio("co1", "inst1", "evo1");

    expect(result).toBe("olá quanto custa");
    expect(getMediaBase64Mock).toHaveBeenCalledWith("inst1", "evo1");

    // chamou o Whisper com a URL certa, FormData e Authorization
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    // NÃO seta Content-Type manualmente (fetch monta o boundary)
    expect(init.headers["Content-Type"]).toBeUndefined();

    // registrou uso uma vez com os campos certos
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
    expect(logAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "co1",
        feature: "audio_transcription",
        provider: "openai",
        model: "whisper-1",
      }),
    );
  });

  it("sem key OpenAI: retorna null e NÃO chama OpenAI nem baixa mídia", async () => {
    getOpenaiKeyMock.mockResolvedValue(undefined);

    const result = await transcribeAudio("co1", "inst1", "evo1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getMediaBase64Mock).not.toHaveBeenCalled();
    expect(logAiUsageMock).not.toHaveBeenCalled();
  });

  it("getMediaBase64 lança: retorna null (fail-safe), sem propagar erro", async () => {
    getOpenaiKeyMock.mockResolvedValue("sk-test");
    getMediaBase64Mock.mockRejectedValue(new Error("download falhou"));

    const result = await transcribeAudio("co1", "inst1", "evo1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logAiUsageMock).not.toHaveBeenCalled();
  });

  it("resposta do Whisper não-ok: retorna null", async () => {
    getOpenaiKeyMock.mockResolvedValue("sk-test");
    getMediaBase64Mock.mockResolvedValue({ base64: SAMPLE_BASE64, mimetype: "audio/ogg" });
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve("unauthorized") });

    const result = await transcribeAudio("co1", "inst1", "evo1");

    expect(result).toBeNull();
    expect(logAiUsageMock).not.toHaveBeenCalled();
  });

  it("Whisper retorna texto vazio: retorna null", async () => {
    getOpenaiKeyMock.mockResolvedValue("sk-test");
    getMediaBase64Mock.mockResolvedValue({ base64: SAMPLE_BASE64, mimetype: "audio/ogg" });
    fetchMock.mockResolvedValue(okJson({ text: "   " }));

    const result = await transcribeAudio("co1", "inst1", "evo1");

    expect(result).toBeNull();
  });
});
