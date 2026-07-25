import { randomUUID } from "crypto";
import { signVisProvision } from "@/lib/vis-provision-hmac";

/**
 * Cliente do canal de RESGATE de código de suporte Vis → Domus (Entrega 3).
 * Assina e POSTa ao endpoint `/api/internal/vis/support/redeem` do Domus.
 *
 * Reusa a PRIMITIVA HMAC path-bound do F2 (signVisProvision assina
 * version.method.path.nonce.ts.body), mas com um SEGREDO PRÓPRIO
 * (VIS_DOMUS_SUPPORT_SECRET, separado do provisionamento) para que o vazamento de
 * um segredo não comprometa o outro canal.
 *
 * A classificação do retorno é o ponto delicado: o código do cliente é
 * SINGLE-USE, então o chamador precisa saber se a falha aconteceu ANTES ou
 * DEPOIS do consumo — é isso que decide entre "tente de novo", "peça outro
 * código" e "não peça nada, acione a engenharia".
 */

const PATH = "/api/internal/vis/support/redeem";
const TIMEOUT_MS = 5000;

export interface SupportRedeemRequest {
  /** Código de autorização que o admin da clínica gerou no Domus. */
  code: string;
  /**
   * Clínica alvo. Sai do CADASTRO do Vis (`Company.domusClinicId`), nunca do
   * input do operador — é o que amarra o resgate à empresa que o admin pode ver.
   * O Domus valida que é UUID e rejeita 400 caso contrário.
   */
  clinicId: string;
  /** UUID de correlação cross-DB — some no grant e na auditoria dos 2 lados. */
  supportGrantId: string;
  /** Referência OPACA do operador Vis (nunca o ID interno; nunca FK no Domus). */
  visOperatorRef: string;
}

export type SupportRedeemResult =
  /** Código aceito; `magicUrl` é o link de ativação (uso único, curto). */
  | { kind: "ok"; magicUrl: string; grantId: string; expiresAt: string | null }
  /** Recusa definitiva — retentar com o MESMO código não adianta. */
  | { kind: "rejected"; status: number; error: string }
  /**
   * O código do cliente FOI consumido, mas o Domus não emitiu o link. O grant
   * existe (`grantId`) e é reemitível — não peça outro código ao cliente.
   */
  | { kind: "activation_unavailable"; grantId: string | null }
  /** Falha de canal/config — nada foi consumido, pode retentar. */
  | { kind: "transient"; reason: string };

export async function postSupportRedeem(
  req: SupportRedeemRequest,
): Promise<SupportRedeemResult> {
  const secret = process.env.VIS_DOMUS_SUPPORT_SECRET;
  const url = process.env.DOMUS_WEBHOOK_URL;
  if (!secret || !url) {
    return { kind: "transient", reason: "config ausente (secret/url)" };
  }

  const body = JSON.stringify(req);
  const ts = Date.now();
  const nonce = randomUUID();
  const signature = signVisProvision(secret, {
    version: 1,
    method: "POST",
    path: PATH,
    nonce,
    ts,
    body,
  });

  let res: Response;
  try {
    res = await fetch(`${url}${PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vis-timestamp": String(ts),
        "x-vis-nonce": nonce,
        "x-vis-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { kind: "transient", reason: err instanceof Error ? err.message : String(err) };
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    magicUrl?: string;
    grantId?: string;
    expiresAt?: string;
  };

  if (res.ok) {
    // Sem magicUrl USÁVEL não há acesso. Tratar como sucesso deixaria a UI
    // dizendo "autorizado" com um link que não leva a lugar nenhum — e o código
    // do cliente já foi queimado.
    //
    // O link precisa ser ABSOLUTO: se o BETTER_AUTH_URL não estiver configurado
    // no Domus, ele devolve "/suporte/ativar#t=..." (relativo). A UI abriria
    // isso no domínio do VIS, onde a rota não existe — o operador veria um 404 e
    // o código teria sido consumido à toa. Validar aqui transforma um fracasso
    // silencioso num estado recuperável (o grant existe e é reemitível).
    if (!data.magicUrl || !isAbsoluteHttpUrl(data.magicUrl)) {
      return { kind: "activation_unavailable", grantId: data.grantId ?? null };
    }
    return {
      kind: "ok",
      magicUrl: data.magicUrl,
      grantId: data.grantId ?? "",
      expiresAt: data.expiresAt ?? null,
    };
  }

  // 500 activation_unavailable: o código JÁ foi consumido sem sair link. Desde a
  // F3.7 o Domus emite o token na MESMA transação do resgate, então este estado
  // não deve mais nascer — mas a checagem fica porque um Domus mais antigo em
  // produção (deploys independentes) ainda pode respondê-lo, e classificá-lo
  // como transitório faria a UI mandar retentar um código já queimado.
  if (res.status === 500 && data.error === "activation_unavailable") {
    return { kind: "activation_unavailable", grantId: data.grantId ?? null };
  }

  // 400 (payload), 401 (assinatura/replay/código), 403 (host), 409 (já usado),
  // 413 (corpo), 422, 429 (rate limit) → rejeição definitiva: o operador vê o
  // erro e não retenta cegamente.
  if ([400, 401, 403, 409, 413, 422, 429].includes(res.status)) {
    return { kind: "rejected", status: res.status, error: data.error ?? "rejected" };
  }

  // 503 → transitório, e nos DOIS casos o código do cliente segue válido:
  //  - `not_enabled`: o Domus checa a flag antes de consumir qualquer coisa;
  //  - `activation_unavailable` (F3.7): a emissão do token falhou DENTRO da
  //    transação do resgate, que reverteu — o código nem chegou a ser gasto.
  // Por isso a orientação certa é "tente de novo", não "peça outro código".
  return { kind: "transient", reason: data.error ?? `http ${res.status}` };
}

/**
 * O link de ativação só serve se for absoluto e http(s): um caminho relativo
 * seria resolvido contra o domínio do Vis (onde a rota não existe), e um esquema
 * exótico (javascript:, data:) não tem por que aparecer aqui.
 */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
