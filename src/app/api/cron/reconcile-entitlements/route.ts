import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";
import { prisma } from "@/lib/prisma";
import { publishEntitlementForCompany } from "@/lib/vis-domus-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Coorte medical vinculada é pequena (~2 hoje); com CONCURRENCY 5 e o publisher
// best-effort, o pior caso fica bem abaixo do teto. maxDuration folgado por padrão
// dos crons — a função não deve ser morta no meio de um ciclo de reconcile.
export const maxDuration = 300;

const log = logger.child({ cron: "reconcile-entitlements" });

// Republica em lotes para não abrir N conexões simultâneas ao Domus de uma vez.
const CONCURRENCY = 5;

/**
 * GET /api/cron/reconcile-entitlements
 *
 * CADEADO — backstop horário do canal de entitlement Vis→Domus.
 * Alguns câmbios de estado de assinatura publicam inline (dunning, webhook), mas
 * outros só chegam ao Domus pelo pull diário (~24h). Este cron republica a coorte
 * medical vinculada (`platformProduct=VIS_MEDICAL` com `domusClinicId` setado) a
 * cada hora, cortando a janela de 24h → 1h.
 *
 * Best-effort e idempotente: `publishEntitlementForCompany` nunca lança, e o Domus
 * ordena por `sourceRevision` (rejeita revisão menor), então republicar um estado
 * já publicado é inócuo. Uma falha isolada de publish NÃO derruba o handler.
 *
 * Auth: Bearer CRON_SECRET, fail-CLOSED (padrão dos outros crons). Vercel Cron manda
 * o header; alta frequência (1×/h) usa cron-job.org (Vercel Hobby = 1×/dia).
 * Auto-instrumentado com withHeartbeat (Saúde do Sistema).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — reconcile-entitlements recusado (fail-closed)");
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("reconcile-entitlements", async () => {
      const companies = await prisma.company.findMany({
        where: { platformProduct: "VIS_MEDICAL", domusClinicId: { not: null } },
        select: { id: true },
      });
      const ids = companies.map((c) => c.id);
      let published = 0;
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        await Promise.all(
          ids.slice(i, i + CONCURRENCY).map(async (id) => {
            try {
              await publishEntitlementForCompany(id);
              published++;
            } catch {
              // publishEntitlementForCompany não lança; guard extra por segurança.
            }
          }),
        );
      }
      log.info("reconcile de entitlement medical concluído", {
        reconciled: companies.length,
        published,
      });
      return NextResponse.json({ ok: true, reconciled: companies.length, published });
    });
  } catch (err) {
    log.error("falha geral no reconcile de entitlement medical", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
