import { getOpenaiKey } from "@/services/ai-config.service";
import { evolution, type EvolutionMediaBase64 } from "@/lib/evolution";
import { logAiUsage } from "@/services/ai-usage.service";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "audio-transcription" });

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-1";

interface WhisperResponse {
  text?: string;
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
    //    audioSeconds: LIMITAÇÃO v1 — pedimos o JSON default do Whisper (sem o campo
    //    `duration`, que só vem em verbose_json) e estimar a duração pelo tamanho do
    //    buffer é pouco confiável entre codecs. Por ora logamos 0 (decisão do plano);
    //    revisitar em v2 com verbose_json se a precisão de custo de áudio importar.
    await logAiUsage({
      companyId,
      feature: "audio_transcription",
      provider: "openai",
      model: WHISPER_MODEL,
      audioSeconds: 0,
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
