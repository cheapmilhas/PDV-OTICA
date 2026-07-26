import { describe, expect, it } from "vitest";

import { isPublicPath, SELF_AUTHENTICATED_API_PREFIXES } from "@/lib/proxy-public-routes";

/**
 * Regressão de um bug que aconteceu DUAS vezes: uma rota do canal interno
 * Domus→Vis foi criada sem entrar no bypass do middleware, que passou a
 * devolver 401 antes do handler. Como o Domus engole o erro de propósito, a
 * falha era invisível dos dois lados — só apareceu lendo log de produção.
 */
describe("isPublicPath — canais internos com auth própria", () => {
  it.each([
    "/api/internal/domus/send-reset-email",
    "/api/internal/domus/plan-change",
    "/api/internal/domus/entitlements",
    "/api/internal/domus/entitlements/abc-123",
  ])("libera %s (autentica por HMAC/Bearer, não por cookie)", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it("libera webhooks e crons, que têm auth própria", () => {
    expect(isPublicPath("/api/webhooks/asaas")).toBe(true);
    expect(isPublicPath("/api/cron/whatsapp-dispatch")).toBe(true);
  });

  it.each([
    "/api/internal/domus/send-reset-emailXYZ",
    "/api/internal/domus/send-reset-email-anything",
    "/api/internal/domus/plan-changeXYZ",
    "/api/authXYZ",
    "/api/public-private",
    "/api/webhooksXYZ",
    "/api/cronXYZ",
  ])("NÃO libera %s (casamento respeita fronteira de segmento)", (path) => {
    // Sem a fronteira, uma rota futura cujo nome só COMEÇA igual a um canal
    // herdaria o bypass sem ninguém perceber.
    expect(isPublicPath(path)).toBe(false);
  });

  it("NÃO libera rota interna fora dos canais registrados", () => {
    // O bypass é por subtree exato: uma rota interna nova, sem auth própria,
    // não pode herdar a liberação por estar sob /api/internal.
    expect(isPublicPath("/api/internal/qualquer-coisa")).toBe(false);
    expect(isPublicPath("/api/internal/domus")).toBe(false);
  });

  it("NÃO libera rotas autenticadas do PDV e do admin", () => {
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/api/sales")).toBe(false);
    expect(isPublicPath("/admin/clientes")).toBe(false);
  });

  it("páginas públicas casam por caminho exato, não por prefixo", () => {
    expect(isPublicPath("/precos")).toBe(true);
    // "/precos-internos" não é pública só por começar igual.
    expect(isPublicPath("/precos-internos")).toBe(false);
  });

  it("todo prefixo registrado é de fato liberado", () => {
    for (const prefix of SELF_AUTHENTICATED_API_PREFIXES) {
      expect(isPublicPath(prefix)).toBe(true);
    }
  });
});
