import { formatInTimeZone } from "date-fns-tz";

import { TIMEZONE } from "@/lib/date-utils";
import type { SupportAuditEventFromDomus } from "@/lib/vis-support-audit-client";

/**
 * Junção das DUAS trilhas do acesso de suporte (N7).
 *
 * São complementares: o Domus tem o ciclo completo mas é cego às tentativas que
 * falharam antes de virar acesso; o Vis registra essas recusas e nada do que veio
 * depois. Junta-se em memória, no request — nada é replicado.
 *
 * ⚠️ DOIS RELÓGIOS. Vis e Domus são deployments independentes e a camada HMAC
 * tolera ±5min de diferença. Ordenar tudo por timestamp cru poderia inverter
 * causa e efeito. Por isso: agrupa por DIA, e dentro do dia o horário ordena;
 * o rank lógico só desempata quando o horário é IDÊNTICO (caso garantido:
 * code_redeemed × token_issued, gravados na mesma transação).
 *
 * ⚠️ LIMITES CONHECIDOS desta ordenação — ela reduz inversão causal, não a
 * elimina:
 *  (a) ENTRE origens, dentro do mesmo dia, compara-se timestamp cru. Vis e
 *      Domus têm relógios independentes (a camada HMAC tolera ±5min), então uma
 *      linha local pode aparecer antes do evento do Domus que a causou. Sem
 *      relógio compartilhado não há como fechar isso.
 *  (b) Na VIRADA DO DIA a ordem se inverte por desenho: dias descem, eventos
 *      sobem dentro do dia — então um efeito às 00:01 aparece ACIMA da causa às
 *      23:59 do dia anterior. É o preço de abrir a lista no que acabou de
 *      acontecer.
 * A trilha é autoritativa DENTRO de cada origem; entre origens é aproximada.
 */

/**
 * Ordem lógica do ciclo. Só entra em jogo com `createdAt` IDÊNTICO.
 *
 * `access_denied` está deliberadamente FORA: ele pode ocorrer DEPOIS de
 * `pending_access_revoked` para o mesmo grant (o cliente revoga enquanto o
 * operador abre o link), e um rank fixo o colocaria antes da sua própria causa.
 * Como ambos vêm do Domus, sob um relógio só, o horário já os ordena.
 */
const RANK: Record<string, number> = {
  code_generated: 1,
  code_redeemed: 2,
  token_issued: 3,
  session_activated: 4,
  pending_access_revoked: 5,
  session_revoked: 7,
};

const RANK_DESCONHECIDO = 99;

export interface TrailItem {
  id: string;
  origem: "medical" | "vis";
  event: string;
  createdAt: string;
  /** Nome real quando resolvido localmente; ref opaco como fallback; null quando o ato é do cliente. */
  operador: string | null;
  grantId: string | null;
  reason: string | null;
  /** Dia (YYYY-MM-DD) para agrupar na tela. */
  dia: string;
}

export interface VisAuditRow {
  id: string;
  action: string;
  createdAt: Date;
  supportGrantId: string | null;
  operatorName: string | null;
}

/**
 * O DIA em que o operador (humano, no Brasil) enxerga o evento — não o dia UTC.
 *
 * Cortar a string ISO daria o dia do SERVIDOR: a Vercel roda em UTC, então um
 * acesso às 22h de São Paulo cairia sob o cabeçalho do dia SEGUINTE. Numa trilha
 * de consentimento, data errada não é detalhe estético. Este projeto já tomou
 * esse bug em métricas e fixou `formatInTimeZone` como fonte única (ver
 * admin-metrics.ts e admin-metrics.series.utc.test.ts).
 */
function diaDe(iso: string): string {
  return formatInTimeZone(new Date(iso), TIMEZONE, "yyyy-MM-dd");
}

export function mergeSupportTrail(input: {
  domus: SupportAuditEventFromDomus[];
  vis: VisAuditRow[];
}): TrailItem[] {
  // Mapa grant → operador real. O nome vem do GlobalAudit, que já grava actorId
  // e adminEmail em CLARO. NÃO se recomputa HMAC de todo admin para montar mapa
  // reverso: isso materializaria uma tabela pseudônimo→nome de toda a equipe.
  //
  // ⚠️ CONFLITO NÃO ESCOLHE VENCEDOR. Nada garante unicidade de
  // `metadata.supportGrantId` (é campo JSON sem índice), então retry, backfill
  // ou escrita manual podem repetir o grant com operadores DIFERENTES. Um `set`
  // simples deixaria a última linha processada vencer — atribuindo a um humano
  // um acesso a PHI que talvez não tenha sido dele. Num artefato de auditoria,
  // nome CONFIANTEMENTE ERRADO é pior que nome nenhum: o evento cai para o ref
  // opaco do Domus, que é verdadeiro.
  const operadorPorGrant = new Map<string, string>();
  const grantsAmbiguos = new Set<string>();
  for (const v of input.vis) {
    if (!v.supportGrantId || !v.operatorName) continue;
    const jaVisto = operadorPorGrant.get(v.supportGrantId);
    if (jaVisto !== undefined && jaVisto !== v.operatorName) {
      grantsAmbiguos.add(v.supportGrantId);
      continue;
    }
    operadorPorGrant.set(v.supportGrantId, v.operatorName);
  }

  /** Nome real só quando o grant resolve para UM operador; senão, o ref opaco. */
  const resolverOperador = (grantId: string, visOperatorRef: string | null) =>
    grantsAmbiguos.has(grantId)
      ? visOperatorRef
      : operadorPorGrant.get(grantId) ?? visOperatorRef;

  const doDomus: TrailItem[] = input.domus.map((e) => ({
    id: e.id,
    origem: "medical" as const,
    event: e.event,
    createdAt: e.createdAt,
    // Sem grant (code_generated) o ato é do CLIENTE — não há operador a exibir.
    operador: e.grantId ? resolverOperador(e.grantId, e.visOperatorRef) : null,
    grantId: e.grantId,
    reason: e.details?.reason ?? null,
    dia: diaDe(e.createdAt),
  }));

  const doVis: TrailItem[] = input.vis.map((v) => {
    const iso = v.createdAt.toISOString();
    return {
      id: v.id,
      origem: "vis" as const,
      event: v.action,
      createdAt: iso,
      operador: v.operatorName,
      grantId: v.supportGrantId,
      reason: null,
      dia: diaDe(iso),
    };
  });

  return [...doDomus, ...doVis].sort((a, b) => {
    // (1) DIA mais recente primeiro — a tela abre no que acabou de acontecer.
    if (a.dia !== b.dia) return a.dia < b.dia ? 1 : -1;

    // (2) DENTRO do dia, ordem CRONOLÓGICA (mais antigo primeiro). É o que
    // permite ler o ciclo como narrativa: autorizou → resgatou → entrou → saiu.
    // Inverter aqui poria todo efeito antes da sua causa.
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;

    // (3) Horário IDÊNTICO: só aqui o rank lógico decide. Caso garantido pelo
    // Postgres: code_redeemed e token_issued saem na mesma transação, e
    // DEFAULT now() é transaction_timestamp() — timestamps byte-idênticos.
    const ra = RANK[a.event] ?? RANK_DESCONHECIDO;
    const rb = RANK[b.event] ?? RANK_DESCONHECIDO;
    return ra - rb;
  });
}
