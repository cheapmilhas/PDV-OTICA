import { describe, expect, it } from "vitest";

import {
  isOpticalOnlyActionAllowed,
  OPTICAL_ONLY_ACTION_MESSAGE,
} from "@/lib/admin-optical-only";

/**
 * Dívida B4 da Entrega 2: impersonar e re-sincronizar setup só fazem sentido no
 * Vis App. Até este gate, a UI escondia os botões para medical mas a API aceitava
 * chamada direta — e impersonar uma clínica é acesso a dado clínico sem o
 * consentimento por código que é o núcleo da Entrega 3.
 */
describe("isOpticalOnlyActionAllowed", () => {
  it("libera ótica (Vis App)", () => {
    expect(isOpticalOnlyActionAllowed("VIS_APP")).toBe(true);
  });

  it("BLOQUEIA medical — clínica se acessa por código de suporte, não por impersonação", () => {
    expect(isOpticalOnlyActionAllowed("VIS_MEDICAL")).toBe(false);
  });

  it("é fail-closed: só VIS_APP passa, qualquer produto novo nasce bloqueado", () => {
    // Um produto acrescentado ao enum não deve herdar acesso por omissão. O
    // teste trava a política, não a lista de valores conhecidos hoje.
    const produtoFuturo = "VIS_ALGUM_NOVO" as never;
    expect(isOpticalOnlyActionAllowed(produtoFuturo)).toBe(false);
  });

  it("a mensagem aponta o caminho legítimo em vez de só negar", () => {
    expect(OPTICAL_ONLY_ACTION_MESSAGE).toMatch(/código de autorização/i);
  });
});
