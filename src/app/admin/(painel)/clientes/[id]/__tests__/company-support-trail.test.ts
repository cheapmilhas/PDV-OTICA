import { describe, expect, it } from "vitest";

import { rotuloDoMotivo } from "../company-support-trail";

/**
 * O `reason` da trilha carrega DOIS vocabulários DISJUNTOS, e é o EVENTO que
 * decide qual deles ler. Um mapa único mostraria uma recusa como se fosse
 * revogação — ou imprimiria o código cru na tela do operador. Este teste existe
 * para travar essa separação.
 */
describe("rotuloDoMotivo", () => {
  it("traduz COMO o acesso terminou nas revogações", () => {
    expect(rotuloDoMotivo("session_revoked", "client")).toBe("encerrado pelo cliente");
    expect(rotuloDoMotivo("session_revoked", "operator")).toBe("encerrado pelo operador");
    expect(rotuloDoMotivo("session_revoked", "expired")).toBe("expirou");
    expect(rotuloDoMotivo("pending_access_revoked", "client")).toBe(
      "encerrado pelo cliente",
    );
  });

  it("traduz POR QUE a tentativa foi recusada em access_denied", () => {
    expect(rotuloDoMotivo("access_denied", "grant_not_activatable")).toBe(
      "o acesso já não podia ser ativado",
    );
  });

  it("NÃO cruza os vocabulários: o motivo de recusa não vira motivo de fim", () => {
    // Se isto voltar texto, o mapa virou único e uma recusa apareceria como
    // revogação (ou vice-versa).
    expect(rotuloDoMotivo("session_revoked", "grant_not_activatable")).toBeNull();
    expect(rotuloDoMotivo("access_denied", "client")).toBeNull();
    expect(rotuloDoMotivo("access_denied", "expired")).toBeNull();
  });

  it("não imprime código cru: motivo desconhecido ou evento sem motivo vira null", () => {
    expect(rotuloDoMotivo("session_revoked", "motivo_novo_do_domus")).toBeNull();
    expect(rotuloDoMotivo("session_activated", "client")).toBeNull();
    expect(rotuloDoMotivo("code_generated", null)).toBeNull();
    expect(rotuloDoMotivo("SUPPORT_ACCESS_DENIED", "operator")).toBeNull();
  });
});
