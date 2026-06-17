import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { analyzeLens } from "@/lib/lens-optics";
import { buildKnowledgeContext, buildGlobalContext } from "@/services/lens-knowledge.service";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const od = body.od ?? { sph: 0, cyl: 0 };
  const oe = body.oe ?? { sph: 0, cyl: 0 };
  const frame =
    body.frame && typeof body.frame.lensWidthMm === "number" && typeof body.frame.bridgeMm === "number"
      ? body.frame
      : undefined;

  const analysis = analyzeLens({ od, oe }, frame);

  const companyId = typeof body.companyId === "string" && body.companyId ? body.companyId : null;
  const ctx = companyId ? await buildKnowledgeContext(companyId) : await buildGlobalContext();

  // Resumo do contexto — NUNCA devolve o conteúdo cru dos documentos.
  const scopes = ctx.docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.scope] = (acc[d.scope] ?? 0) + 1;
    return acc;
  }, {});
  const context = { docCount: ctx.docs.length, tokens: ctx.tokens, scopes };

  // TODO Fase 3: chamar Claude com o contexto + logAiUsage(companyId: null, feature: "lens_advisor_playground").
  // F2: NÃO chama Claude e NÃO loga uso (sem custo real) — playground isolado da cota das óticas.
  return NextResponse.json({ data: { analysis, context } });
}
