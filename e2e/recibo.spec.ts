import { test, expect } from "@playwright/test";

/**
 * Smoke da página pública /recibo/[token]. Q6.3.
 *
 * Token inválido deve cair em 404 (NextJS notFound). Não tem dependência de
 * dados — só valida o handler do route. Para testar o fluxo feliz precisaria
 * gerar um JWT real no setup; deixado para suite de integração futura.
 */

test.describe("/recibo/[token]", () => {
  test("token inválido retorna 404", async ({ request }) => {
    const res = await request.get("/recibo/invalid-token-xxx");
    expect(res.status()).toBe(404);
  });

  test("token vazio retorna 404", async ({ request }) => {
    const res = await request.get("/recibo/");
    // /recibo sem token cai em 404 do Next (rota dinâmica não casa).
    expect([404, 308]).toContain(res.status());
  });
});
