import { describe, it, expect } from "vitest";
import { clientEngaged, oticaSentValue, shopReplied } from "./funnel-signals";
import type { SignalMessage } from "./funnel-signals";

const inbound = (text: string | null, type = "text"): SignalMessage => ({ direction: "inbound", type, text });
const outbound = (text: string | null, type = "text"): SignalMessage => ({ direction: "outbound", type, text });

describe("clientEngaged — cliente mandou conteúdo (não só saudação/sticker)", () => {
  it("texto com conteúdo real → engajou", () => {
    expect(clientEngaged([inbound("quero um óculos de grau")])).toBe(true);
  });

  it("só saudação → NÃO engajou", () => {
    expect(clientEngaged([inbound("oi"), inbound("bom dia")])).toBe(false);
  });

  it("sticker/imagem sem texto → NÃO engajou", () => {
    expect(clientEngaged([inbound(null, "image"), inbound(null, "sticker")])).toBe(false);
  });

  it("só mensagens da ótica (outbound) → NÃO engajou (cliente não falou)", () => {
    expect(clientEngaged([outbound("olá, tudo bem?")])).toBe(false);
  });

  it("mistura: saudação + conteúdo → engajou", () => {
    expect(clientEngaged([inbound("oi"), inbound("tem armação masculina?")])).toBe(true);
  });
});

describe("oticaSentValue — a ÓTICA mandou R$ (orçamento)", () => {
  it("outbound com R$ → true", () => {
    expect(oticaSentValue([outbound("fica R$ 890 à vista")])).toBe(true);
  });

  it("outbound com 'X reais' → true", () => {
    expect(oticaSentValue([outbound("são 750 reais ou 3x")])).toBe(true);
  });

  it("outbound com parcelamento R$ → true", () => {
    expect(oticaSentValue([outbound("12x de R$ 99 sem juros")])).toBe(true);
  });

  it("CLIENTE dizendo valor → NÃO conta (tem que ser da ótica)", () => {
    expect(oticaSentValue([inbound("tenho R$ 500 pra gastar")])).toBe(false);
  });

  it("outbound sem valor → false", () => {
    expect(oticaSentValue([outbound("oi, vou verificar pra você")])).toBe(false);
  });

  it("número solto sem R$ (telefone/OS) → false", () => {
    expect(oticaSentValue([outbound("sua OS é a 12345, retire amanhã")])).toBe(false);
  });

  it("'OS 1234 reais' (nº de OS, não preço) → false (não falso-positivo)", () => {
    expect(oticaSentValue([outbound("a OS 1234 reais já está pronta")])).toBe(false);
  });

  it("mas 'R$ 1234' mesmo com OS na frase → true (R$ explícito)", () => {
    expect(oticaSentValue([outbound("a OS 1234 ficou R$ 890")])).toBe(true);
  });

  it("conversa mista: pega o R$ da ótica mesmo com inbound junto", () => {
    expect(oticaSentValue([inbound("quanto custa?"), outbound("o multifocal fica R$ 1.290")])).toBe(true);
  });
});

describe("shopReplied — a ÓTICA respondeu (outbound com conteúdo)", () => {
  it("outbound com conteúdo real → respondeu", () => {
    expect(shopReplied([inbound("quero um orçamento"), outbound("claro! qual o grau?")])).toBe(true);
  });

  it("só saudação automática da ótica → NÃO conta (evita flip falso)", () => {
    expect(shopReplied([outbound("olá"), outbound("bom dia")])).toBe(false);
  });

  it("só o cliente falou (ótica em silêncio) → NÃO respondeu", () => {
    expect(shopReplied([inbound("oi, tem armação?")])).toBe(false);
  });

  it("outbound sticker/áudio sem texto → NÃO conta", () => {
    expect(shopReplied([outbound(null, "image"), outbound(null, "audio")])).toBe(false);
  });

  it("mistura: saudação + resposta real → respondeu", () => {
    expect(shopReplied([outbound("oi"), outbound("temos sim, a partir de 199")])).toBe(true);
  });
});
