import { describe, expect, it } from "vitest";

import { mergeSupportTrail } from "@/services/support-trail.service";

/**
 * A JUNÇÃO das duas trilhas. Vis e Domus são deployments independentes com
 * relógios independentes (a camada HMAC tolera ±5min), então ordenar por
 * timestamp cru pode INVERTER causa e efeito.
 */

const evDomus = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  grantId: "g1",
  event: "session_activated",
  visOperatorRef: "vis-op-abc",
  createdAt: "2026-07-26T10:00:00.000Z",
  details: null,
  ...over,
});

const evVis = (over: Record<string, unknown> = {}) => ({
  id: "v1",
  action: "SUPPORT_ACCESS_GRANTED",
  createdAt: new Date("2026-07-26T10:00:00.000Z"),
  supportGrantId: "g1",
  operatorName: "Maria",
  ...over,
});

describe("mergeSupportTrail — origem", () => {
  it("marca cada item com a origem (autoridades diferentes)", () => {
    const out = mergeSupportTrail({
      domus: [evDomus() as never],
      vis: [evVis() as never],
    });
    expect(out.map((e) => e.origem).sort()).toEqual(["medical", "vis"]);
  });
});

describe("mergeSupportTrail — ordem lógica quando o horário empata", () => {
  it("code_redeemed vem antes de token_issued (mesma transação, createdAt IDÊNTICO)", () => {
    const mesmoInstante = "2026-07-26T10:00:00.000Z";
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "b", event: "token_issued", createdAt: mesmoInstante }) as never,
        evDomus({ id: "a", event: "code_redeemed", createdAt: mesmoInstante }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("mergeSupportTrail — access_denied NÃO tem rank fixo", () => {
  it("uma recusa POSTERIOR não é reordenada para antes da sua causa", () => {
    // Corrida ordinária: o cliente revoga enquanto o operador abre o link.
    // pending_access_revoked (causa) → access_denied (efeito), mesmo grant.
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "efeito", event: "access_denied", createdAt: "2026-07-26T10:00:05.000Z" }) as never,
        evDomus({ id: "causa", event: "pending_access_revoked", createdAt: "2026-07-26T10:00:01.000Z" }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["causa", "efeito"]);
  });

  it("com horário IDÊNTICO, access_denied não é promovido na frente da causa", () => {
    // Aqui o rank É consultado. Como access_denied não tem entrada, cai no rank
    // desconhecido e fica DEPOIS de pending_access_revoked, que é a sua causa.
    const mesmoInstante = "2026-07-26T10:00:01.000Z";
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "efeito", event: "access_denied", createdAt: mesmoInstante }) as never,
        evDomus({ id: "causa", event: "pending_access_revoked", createdAt: mesmoInstante }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["causa", "efeito"]);
  });
});

describe("mergeSupportTrail — o evento de consentimento", () => {
  it("code_generated (sem grantId) NÃO é descartado nem vira órfão", () => {
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "consent", event: "code_generated", grantId: null, visOperatorRef: null, createdAt: "2026-07-26T09:00:00.000Z" }) as never,
        evDomus({ id: "resgate", event: "code_redeemed", createdAt: "2026-07-26T10:00:00.000Z" }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["consent", "resgate"]);
    expect(out[0].operador).toBeNull();
  });
});

describe("mergeSupportTrail — resolução do operador", () => {
  it("usa o nome real do GlobalAudit quando o grant casa", () => {
    const out = mergeSupportTrail({
      domus: [evDomus({ grantId: "g1" }) as never],
      vis: [evVis({ supportGrantId: "g1", operatorName: "Maria" }) as never],
    });
    const medical = out.find((e) => e.origem === "medical");
    expect(medical?.operador).toBe("Maria");
  });

  it("cai no ref opaco quando não há contraparte local — nunca em branco", () => {
    const out = mergeSupportTrail({
      domus: [evDomus({ grantId: "g-sem-par", visOperatorRef: "vis-op-xyz" }) as never],
      vis: [],
    });
    const medical = out.find((e) => e.origem === "medical");
    expect(medical?.operador).toBe("vis-op-xyz");
  });
});

describe("mergeSupportTrail — dia decrescente, evento crescente dentro do dia", () => {
  it("dia mais recente primeiro", () => {
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "ontem", createdAt: "2026-07-25T10:00:00.000Z" }) as never,
        evDomus({ id: "hoje", createdAt: "2026-07-26T10:00:00.000Z" }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["hoje", "ontem"]);
  });

  it("DENTRO do dia a ordem é cronológica — a narrativa tem que ser legível", () => {
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "depois", createdAt: "2026-07-26T15:00:00.000Z" }) as never,
        evDomus({ id: "antes", createdAt: "2026-07-26T09:00:00.000Z" }) as never,
        evDomus({ id: "ontem", createdAt: "2026-07-25T23:00:00.000Z" }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["antes", "depois", "ontem"]);
  });
});

describe("mergeSupportTrail — o dia é o do OPERADOR, não o do servidor", () => {
  it("22h em São Paulo NÃO cai no dia seguinte", () => {
    // 2026-07-26T23:30:00Z = 20:30 de 26/07 em São Paulo (UTC-3). Cortar a
    // string ISO daria "2026-07-26" por sorte aqui; o caso que quebra é o
    // inverso, abaixo.
    const out = mergeSupportTrail({
      domus: [evDomus({ id: "noite", createdAt: "2026-07-26T23:30:00.000Z" }) as never],
      vis: [],
    });
    expect(out[0].dia).toBe("2026-07-26");
  });

  it("01h UTC pertence ao dia ANTERIOR em São Paulo", () => {
    // 2026-07-27T01:00:00Z = 22:00 de 26/07 em São Paulo. Cortando a string ISO
    // isto viraria "2026-07-27" — o acesso apareceria no cabeçalho do dia
    // seguinte, com data errada numa trilha de LGPD.
    const out = mergeSupportTrail({
      domus: [evDomus({ id: "virada", createdAt: "2026-07-27T01:00:00.000Z" }) as never],
      vis: [],
    });
    expect(out[0].dia).toBe("2026-07-26");
  });

  it("dois eventos do MESMO dia local agrupam juntos mesmo cruzando a meia-noite UTC", () => {
    // 23:00 e 01:00 UTC são 20:00 e 22:00 do MESMO dia em São Paulo.
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "depois", createdAt: "2026-07-27T01:00:00.000Z" }) as never,
        evDomus({ id: "antes", createdAt: "2026-07-26T23:00:00.000Z" }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.dia)).toEqual(["2026-07-26", "2026-07-26"]);
    // E dentro do dia, ordem cronológica.
    expect(out.map((e) => e.id)).toEqual(["antes", "depois"]);
  });
});
