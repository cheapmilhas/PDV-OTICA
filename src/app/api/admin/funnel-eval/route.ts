import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { qualifyConversationText, LEAD_QUALIFIER_MODEL, type ContactIntent } from "@/lib/ai/lead-qualifier";
import { decideFunnelAdvance } from "@/lib/funnel-advance";
import { clientEngaged, oticaSentValue, shopReplied, type SignalMessage } from "@/lib/funnel-signals";
import { conversationNeedsHumanAttention } from "@/lib/conversation-attention";
import { scoreFunnelEval } from "@/lib/funnel-eval-score";
import { EVAL_CASES } from "./cases.data";

// Eval do funil IA (SUPER_ADMIN). Recebe casos sintéticos no body, roda a IA real
// + a régua ponta-a-ponta NA PROD (onde a chave Anthropic existe), e devolve o
// placar. NÃO toca o banco. Usado p/ calibrar régua/prompt antes de confiar.
export const maxDuration = 300;

interface EvalMessage { dir: "in" | "out"; type?: string; text?: string | null }
interface EvalCase {
  id: string; categoria: string; messages: EvalMessage[];
  expectedIntent: string; expectedIsLead: boolean; expectedStage: string; note?: string;
}

const STAGES = [
  { id: "novo", name: "Novo", order: 0, isWon: false, isLost: false },
  { id: "atend", name: "Em atendimento", order: 1, isWon: false, isLost: false },
  { id: "orc", name: "Orçamento enviado", order: 2, isWon: false, isLost: false },
  { id: "fechado", name: "Fechado", order: 3, isWon: true, isLost: false },
  { id: "perdido", name: "Perdido", order: 4, isWon: false, isLost: true },
];
const STAGE_NAME: Record<string, string> = { novo: "Novo", atend: "Em atendimento", orc: "Orçamento enviado" };

function buildText(messages: EvalMessage[]): string {
  return messages
    .filter((m) => m.dir === "in" && typeof m.text === "string" && m.text!.trim().length > 0)
    .map((m) => m.text!.trim()).join("\n");
}
function toSignals(messages: EvalMessage[]): SignalMessage[] {
  return messages.map((m) => ({ direction: m.dir === "in" ? "inbound" : "outbound", type: m.type ?? "text", text: m.text ?? null }));
}

async function runOne(c: EvalCase, model: string) {
  const text = buildText(c.messages);
  const sig = toSignals(c.messages);
  const q = await qualifyConversationText(text || "(sem texto)", STAGES, model);
  // A cadeia REAL de prod: o guardrail de atenção (finalize) decide "Sinaliza
  // humano" PRIMEIRO — pela intenção CRUA + urgent — para lead OU não-lead. Isso
  // (não o `action:"flag"` da régua, que é código morto p/ reclamação em prod)
  // é o sinal que a prod produz. Só depois a régua move o card dos leads reais.
  let gotStage: string;
  if (conversationNeedsHumanAttention({ intent: q.intent as ContactIntent, urgent: q.urgent })) {
    gotStage = "Sinaliza humano";
  } else if (!q.isLead) {
    gotStage = "Nao-lead";
  } else {
    const d = decideFunnelAdvance({
      intent: q.intent as ContactIntent, confidence: q.confidence, currentStageId: "novo", stages: STAGES,
      clientEngaged: clientEngaged(sig), shopReplied: shopReplied(sig), oticaSentValue: oticaSentValue(sig),
    });
    gotStage = d.action === "flag" ? "Sinaliza humano" : d.action === "move" && d.targetStageId ? (STAGE_NAME[d.targetStageId] ?? "Novo") : "Novo";
  }
  const failed: string[] = [];
  if (q.intent !== c.expectedIntent) failed.push(`intent: got ${q.intent}, exp ${c.expectedIntent}`);
  if (q.isLead !== c.expectedIsLead) failed.push(`isLead: got ${q.isLead}, exp ${c.expectedIsLead}`);
  if (gotStage !== c.expectedStage) failed.push(`stage: got ${gotStage}, exp ${c.expectedStage}`);
  return { id: c.id, categoria: c.categoria, ok: failed.length === 0, gotIntent: q.intent, gotIsLead: q.isLead, gotStage, conf: q.confidence, expIntent: c.expectedIntent, expIsLead: c.expectedIsLead, expStage: c.expectedStage, note: c.note ?? "", failed };
}

async function pool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) { const i = idx++; if (i >= items.length) break; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  // Casos embutidos (cases.data.ts). model opcional via ?model=...
  const cases = EVAL_CASES as unknown as EvalCase[];
  const model = new URL(request.url).searchParams.get("model") || LEAD_QUALIFIER_MODEL;

  const results = await pool(cases, 5, async (c) => {
    try { return await runOne(c, model); }
    catch (e) { return { id: c.id, categoria: c.categoria, ok: false, gotIntent: "ERRO", gotIsLead: false, gotStage: "ERRO", conf: 0, expIntent: c.expectedIntent, expIsLead: c.expectedIsLead, expStage: c.expectedStage, note: c.note ?? "", failed: [`EXCEÇÃO: ${e instanceof Error ? e.message : String(e)}`] }; }
  });

  const pass = results.filter((r) => r.ok).length;
  const byCat: Record<string, { total: number; pass: number }> = {};
  for (const r of results) { const e = byCat[r.categoria] ??= { total: 0, pass: 0 }; e.total++; if (r.ok) e.pass++; }

  // Item 2: placar PONDERADO POR IMPACTO — o número que interessa. A acurácia
  // geral (abaixo) fica só como continuidade histórica; a decisão sai daqui.
  const score = scoreFunnelEval(results.map((r) => ({
    gotIsLead: r.gotIsLead, gotStage: r.gotStage, expIsLead: r.expIsLead, expStage: r.expStage,
  })));

  return NextResponse.json({
    model, total: results.length,
    // ⭐ Placar por impacto (Item 2): a régua de decisão.
    //   naoPerdeReclamacao = SAGRADO (~100%), capturaLead = recall, estagioCerto | é-lead.
    impacto: score,
    // Continuidade histórica (métrica de vaidade — NÃO decidir por ela):
    pass, accuracy: +((pass / results.length) * 100).toFixed(1),
    dims: {
      intent: results.filter((r) => !r.failed.some((f) => f.startsWith("intent"))).length,
      isLead: results.filter((r) => !r.failed.some((f) => f.startsWith("isLead"))).length,
      stage: results.filter((r) => !r.failed.some((f) => f.startsWith("stage"))).length,
    },
    byCategoria: byCat,
    failures: results.filter((r) => !r.ok),
  });
}
