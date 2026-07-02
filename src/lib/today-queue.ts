/**
 * "Fila de Hoje" (Sprint 2, #4) — a ÚNICA lista priorizada que a atendente
 * precisa olhar. Agrega 4 sinais que já existem, sem inventar estado novo:
 *   1. ATENÇÃO   — reclamação/cobrança/tom irritado (o alarme sagrado)
 *   2. RESPONDER — a bola está com a ótica (cliente escreveu, ninguém respondeu)
 *   3. OS PARADA — óculos pronto e não avisado ("dinheiro que já é seu")
 *   4. ATRASADO  — lead aberto parado há muito tempo (SLA)
 *
 * Princípios (atendente leiga e afogada — ver design 2026-07-01):
 * - TETO RÍGIDO: no máximo QUEUE_CAP itens; o resto vira "+N mais antigos".
 * - ORDEM FIXA por urgência (previsível > "score inteligente" opaco).
 * - Semáforo de cor, frase imperativa com o NOME do cliente, zero jargão.
 *
 * Este módulo é PURO (sem I/O): recebe os sinais já buscados e devolve a fila
 * ordenada/cortada. A camada de serviço (today-queue.service.ts) faz as queries
 * multi-tenant e chama este builder — assim a priorização é testável sem banco.
 */

export const QUEUE_CAP = 10;

export type TodayQueueKind = "attention" | "needs_reply" | "os_ready" | "sla_late";

/** Semáforo de cor (a atendente lê cor antes de texto). */
export type QueueSeverity = "red" | "yellow" | "green";

export interface TodayQueueItem {
  /** Chave estável para o React (kind + id da entidade de origem). */
  key: string;
  kind: TodayQueueKind;
  /** Nome do cliente (ou "Cliente" quando desconhecido — nunca vazio). */
  customerName: string;
  phone?: string | null;
  severity: QueueSeverity;
  /** Frase imperativa com o nome: "Avise o João", "Responda a Maria". */
  headline: string;
  /** Detalhe em português claro: "pronto há 6 dias", "esperando há 2 dias". */
  subtext: string;
  /** Texto pronto pra colar no WhatsApp (a atendente edita se quiser). */
  draftText: string;
  /** Link opcional pra abrir a conversa/OS de origem no sistema. */
  href?: string;
  /**
   * Horas de espera (p/ ordenar DENTRO do grupo, mais antigo primeiro). Não é
   * exibido cru — o subtext já traduz pra "há X dias". */
  waitingHours: number;
}

/** Ordem fixa de urgência entre os grupos (menor = aparece primeiro). */
const KIND_RANK: Record<TodayQueueKind, number> = {
  attention: 0,   // 🔴 reclamação/cobrança — nunca pode esperar
  needs_reply: 1, // cliente esperando resposta AGORA
  os_ready: 2,    // dinheiro que já é seu (óculos pronto parado)
  sla_late: 3,    // lead esfriando por tempo
};

/**
 * Traduz horas em uma frase de tempo humana ("hoje", "há 3 dias"). Arredonda pra
 * baixo em dias; < 24h vira "hoje" (a atendente não quer "há 3h47" — ver UX).
 */
export function humanWait(hours: number): string {
  if (hours < 24) return "hoje";
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/**
 * Semáforo por tempo de espera: 🟢 hoje / 🟡 1-4 dias / 🔴 5 dias+. Itens de
 * ATENÇÃO (reclamação) já entram como 🔴 direto — não passam por aqui.
 */
export function severityByWait(hours: number): QueueSeverity {
  const days = hours / 24;
  if (days >= 5) return "red";
  if (days >= 1) return "yellow";
  return "green";
}

/** Primeiro nome (pro tom próximo da atendente) — nunca vazio. */
export function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "Cliente";
  return n.split(/\s+/)[0] || n;
}

/**
 * Rascunhos prontos por tipo de item — MESMAS palavras que a atendente já usa,
 * centralizadas aqui p/ prod e futura reutilização. Curtos, calorosos, sem
 * jargão. A atendente edita antes de mandar (o botão só copia + abre o wa.me).
 */
export const queueDrafts = {
  osReady: (name: string): string =>
    `Oi ${firstName(name)}! 😊 Seu óculos já está pronto pra retirar aqui na ótica. Qualquer coisa, estou à disposição!`,
  needsReply: (name: string): string =>
    `Oi ${firstName(name)}! Tudo bem? Vi sua mensagem por aqui 😊 Como posso te ajudar?`,
  slaLate: (name: string): string =>
    `Oi ${firstName(name)}! Passando pra saber se você ainda tem interesse — qualquer dúvida, é só chamar 😊`,
  attention: (name: string): string =>
    `Oi ${firstName(name)}! Recebi sua mensagem e já estou cuidando disso pra você. Me dá só um instante 🙏`,
};

/**
 * Monta a fila final: concatena os grupos, ordena por (grupo, mais antigo
 * primeiro) e corta no teto. Devolve os itens visíveis + quantos ficaram de fora
 * (overflow) pra UI mostrar "+N mais antigos" sem esconder que há mais.
 */
export function buildTodayQueue(
  items: ReadonlyArray<TodayQueueItem>,
  cap: number = QUEUE_CAP,
): { queue: TodayQueueItem[]; total: number; overflow: number } {
  const ordered = [...items].sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    // Dentro do grupo: quem espera há mais tempo primeiro (a dor maior).
    return b.waitingHours - a.waitingHours;
  });
  const queue = ordered.slice(0, cap);
  return { queue, total: ordered.length, overflow: Math.max(0, ordered.length - queue.length) };
}
