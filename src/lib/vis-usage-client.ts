import { randomUUID } from "crypto";

import { signVisProvision } from "@/lib/vis-provision-hmac";

/**
 * Cliente de LEITURA do uso agregado da clínica, Vis → Domus (N6).
 *
 * Irmão de `vis-support-audit-client.ts`: mesma primitiva HMAC, mesmo formato
 * (GET com o `clinicId` ocupando o slot do corpo), outro path — e **outro
 * segredo**, deliberadamente.
 *
 * 🔑 `VIS_DOMUS_USAGE_SECRET`, nunca o do suporte. Aquele autentica também o
 * resgate de código, que cunha grant de acesso a PHI: um segredo de telemetria
 * comercial não pode ser chave de prontuário.
 */

const PATH = "/api/internal/vis/usage";
const TIMEOUT_MS = 5000;

/** Espelha a projeção do Domus. Todo campo é escalar — nada identifica pessoa. */
export interface ClinicUsage {
  doctorsActive: number;
  staffActive: number;
  patients: number;
  appointments: number;
  appointmentsLast30d: number;
  medicalRecords: number;
  workingHoursDays: number;
  onlineBookingEnabled: number;
  legalFieldsFilled: number;
}

export type ClinicUsageResult =
  | { kind: "ok"; usage: ClinicUsage }
  /** Domus fora, lento, canal desligado ou mal configurado. A tela AVISA. */
  | { kind: "unavailable"; reason: string };

/** Chaves obrigatórias. Uma resposta parcial é indisponibilidade, não dado. */
const CAMPOS: (keyof ClinicUsage)[] = [
  "doctorsActive",
  "staffActive",
  "patients",
  "appointments",
  "appointmentsLast30d",
  "medicalRecords",
  "workingHoursDays",
  "onlineBookingEnabled",
  "legalFieldsFilled",
];

/**
 * Valida a resposta em FORMA, não só em presença.
 *
 * 🔥 Aqui NÃO se herda o fallback permissivo do irmão do N7, que converte
 * `truncated` ausente em `false`. Naquele canal o campo é acessório; aqui todo
 * campo É o dado. Um número que chegue como string, null, negativo, NaN ou
 * ausente vira "desconhecido" — jamais um zero silencioso, que a tela leria
 * como "a clínica não usa o produto".
 */
function parseUsage(raw: unknown): ClinicUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out = {} as ClinicUsage;
  for (const campo of CAMPOS) {
    const v = obj[campo];
    // `typeof v === "number"` sozinho aceitaria NaN e Infinity.
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    out[campo] = v;
  }
  return out;
}

export async function getClinicUsageFromDomus(clinicId: string): Promise<ClinicUsageResult> {
  const secret = process.env.VIS_DOMUS_USAGE_SECRET ?? "";
  // Barra no fim vira "//api/..." na URL, mas a ASSINATURA é sobre o PATH com
  // UMA barra — o Domus recusaria e o operador leria `http_401` como "segredo
  // errado", indo rotacionar um segredo intacto. Normaliza ANTES de assinar.
  const baseUrl = (process.env.DOMUS_WEBHOOK_URL ?? "").replace(/\/+$/, "");
  if (!secret || !baseUrl) {
    return { kind: "unavailable", reason: "canal_nao_configurado" };
  }

  const ts = Date.now();
  const nonce = randomUUID();
  const signature = signVisProvision(secret, {
    version: 1,
    method: "GET",
    path: PATH,
    nonce,
    ts,
    // O clinicId ocupa o lugar do corpo: é GET, o corpo é vazio.
    body: clinicId,
  });

  try {
    const res = await fetch(`${baseUrl}${PATH}`, {
      method: "GET",
      headers: {
        "x-vis-timestamp": String(ts),
        "x-vis-nonce": nonce,
        "x-vis-signature": signature,
        "x-vis-clinic-id": clinicId,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      // 503 é o canal desligado (flag off no Domus) — caso esperado enquanto a
      // feature não foi habilitada, não incidente. Distinguir ajuda quem lê o
      // log; a tela colapsa tudo em "não foi possível consultar".
      return {
        kind: "unavailable",
        reason: res.status === 503 ? "canal_desligado" : `http_${res.status}`,
      };
    }

    const json = (await res.json()) as { usage?: unknown };
    const usage = parseUsage(json.usage);
    if (!usage) {
      return { kind: "unavailable", reason: "resposta_invalida" };
    }
    return { kind: "ok", usage };
  } catch (err) {
    // Timeout, DNS, TLS, corpo ilegível — tudo indisponibilidade para quem lê a
    // tela, por isso um `kind` só. NUNCA devolver zeros aqui.
    //
    // A causa vai junto como campo de DIAGNÓSTICO (a rota não a renderiza):
    // "falha_de_rede" sem detalhe não distingue timeout de TLS quando alguém
    // for ler o log depois.
    return {
      kind: "unavailable",
      reason: err instanceof Error ? `falha_de_rede: ${err.message}` : "falha_de_rede",
    };
  }
}
