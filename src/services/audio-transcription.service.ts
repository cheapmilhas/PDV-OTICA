import { getOpenaiKey } from "@/services/ai-config.service";
import { evolution, type EvolutionMediaBase64 } from "@/lib/evolution";
import { logAiUsage } from "@/services/ai-usage.service";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "audio-transcription" });

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-1";

interface WhisperResponse {
  text?: string;
  /** Só presente com response_format=verbose_json. Duração do áudio em segundos. */
  duration?: number;
}

/**
 * Baixa um áudio de WhatsApp (via Evolution) e o transcreve com o OpenAI Whisper.
 *
 * FAIL-SAFE TOTAL: qualquer falha (sem key, download, HTTP, parse, erro inesperado)
 * é logada e vira `null`. A conversa SEMPRE continua só com o texto — a transcrição
 * é um "extra"; ela nunca pode derrubar o fluxo de qualificação/atendimento.
 *
 * @returns o texto transcrito (trim) ou `null` se não houver transcrição utilizável.
 */
export async function transcribeAudio(
  companyId: string,
  instanceName: string,
  evolutionId: string,
): Promise<string | null> {
  try {
    // 1. Key da OpenAI — sem ela não há transcrição (não chamamos a API).
    const key = await getOpenaiKey();
    if (!key) {
      log.warn("sem OPENAI key — pulando transcrição", { companyId });
      return null;
    }

    // 2. Baixa a mídia em base64 pela Evolution (pode lançar → fail-safe).
    let media: EvolutionMediaBase64;
    try {
      media = await evolution.getMediaBase64(instanceName, evolutionId);
    } catch (err) {
      log.warn("falha ao baixar mídia da Evolution — sem transcrição", {
        err: err instanceof Error ? { message: err.message, name: err.name } : String(err),
        companyId,
        evolutionId,
      });
      return null;
    }
    if (!media?.base64) {
      log.warn("mídia sem base64 — sem transcrição", { companyId, evolutionId });
      return null;
    }

    // 3. Decodifica o base64 para um Buffer.
    const buffer = Buffer.from(media.base64, "base64");

    // 4. POST multipart/form-data ao Whisper. NÃO setamos Content-Type: deixamos o
    //    fetch montar o boundary do multipart sozinho.
    const form = new FormData();
    const blob = new Blob([buffer], { type: media.mimetype ?? "audio/ogg" });
    form.append("file", blob, "audio.ogg");
    form.append("model", WHISPER_MODEL);
    // verbose_json traz o campo `duration` (segundos) — necessário para medir o
    // custo real (Whisper é cobrado por minuto). Sem isso, o custo caía sempre a $0.
    form.append("response_format", "verbose_json");

    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn("Whisper respondeu não-ok — sem transcrição", { status: res.status, body: body.slice(0, 200), companyId });
      return null;
    }

    // 5. Lê a resposta e extrai o texto transcrito.
    const data = (await res.json()) as WhisperResponse;
    const text = (data.text ?? "").trim();
    if (!text) {
      log.warn("Whisper retornou texto vazio — sem transcrição", { companyId, evolutionId });
      return null;
    }

    // 6. Registra o uso. logAiUsage é fail-safe internamente, mas o chamamos sempre
    //    que houve uma transcrição real (linha de custo: provider/model/feature).
    //    audioSeconds: vem do `duration` do verbose_json. Whisper cobra por minuto,
    //    então arredondamos para cima (Math.ceil) o segundo — nunca sub-reporta o
    //    custo. Fallback defensivo a 0 se, por qualquer razão, `duration` faltar.
    const audioSeconds =
      typeof data.duration === "number" && Number.isFinite(data.duration) && data.duration > 0
        ? Math.ceil(data.duration)
        : 0;
    await logAiUsage({
      companyId,
      feature: "audio_transcription",
      provider: "openai",
      model: WHISPER_MODEL,
      audioSeconds,
    });

    // 7. Texto transcrito (já trimado).
    return text;
  } catch (err) {
    // Qualquer erro inesperado: loga e segue só com texto.
    log.warn("erro inesperado na transcrição — sem transcrição", {
      err: err instanceof Error ? { message: err.message, name: err.name } : String(err),
      companyId,
      evolutionId,
    });
    return null;
  }
}
