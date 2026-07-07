import { beginCronRun, finishCronRun } from "@/services/cron-heartbeat.service";

/**
 * Envolve o corpo de um cron com o batimento de vida (Saúde do Sistema).
 * Grava início antes e sucesso/erro depois — SEM alterar auth nem o shape da
 * resposta (o handler já autenticou antes de chamar isto). Best-effort: uma
 * falha no batimento NUNCA derruba o cron (beginCronRun/finishCronRun engolem
 * seus próprios erros).
 *
 * Uso (depois do check de CRON_SECRET):
 *   return withHeartbeat("recalc-health", async () => {
 *     ... trabalho ...
 *     return NextResponse.json({ success: true });
 *   });
 */
export async function withHeartbeat<T>(jobKey: string, handler: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  await beginCronRun(jobKey);
  try {
    const result = await handler();
    await finishCronRun(jobKey, true, { durationMs: Date.now() - startedAt });
    return result;
  } catch (err) {
    await finishCronRun(jobKey, false, {
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
