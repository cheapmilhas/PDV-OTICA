import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { qualifyPendingConversations } from "@/services/conversation-qualifier.service";
import { processFunnelReevals } from "@/services/funnel-automove.service";
import { withHeartbeat } from "@/lib/cron-instrument";

const log = logger.child({ cron: "whatsapp-qualify" });

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) log.error("CRON_SECRET não configurado — whatsapp-qualify recusado (fail-closed)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await withHeartbeat("whatsapp-qualify", async () => {
      // Cron DIÁRIO: ignora o cooldown (cooldownMin: 0) — roda 1x/dia, qualquer
      // conversa já estará fria, e assim varre TUDO mesmo que o cron externo de
      // alta frequência (cron-job.org) falhe. O debounce é só para o cron externo.
      const result = await qualifyPendingConversations(undefined, { cooldownMin: 0 });
      log.info("varredura de qualificação concluída", result);

      // Re-avaliação de funil disparada por resposta da ótica (outbound), SEM IA.
      // Fail-safe: uma falha aqui NÃO invalida a qualificação já concluída acima.
      let funnelReeval;
      try {
        funnelReeval = await processFunnelReevals();
        log.info("re-avaliação de funil (outbound) concluída", { ...funnelReeval });
      } catch (error) {
        log.error("falha na re-avaliação de funil (segue, qualificação já ok)", { error });
        funnelReeval = { scanned: 0, moves: 0, errors: 1 };
      }

      return NextResponse.json({ ok: true, ...result, funnelReeval });
    });
  } catch (error) {
    log.error("falha na varredura de qualificação", { error });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
