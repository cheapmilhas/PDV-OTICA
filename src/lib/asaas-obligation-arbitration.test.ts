import { describe, it, expect } from "vitest";
import {
  arbitrateAccessEvent,
  decideObligationPromotion,
  REFUND_KEEPS_OBLIGATION_PAID,
  type ObligationEvidence,
} from "./asaas-obligation-arbitration";

/**
 * Task 8 — arbitragem do evento de pagamento PELO ESTADO DA OBRIGAÇÃO.
 *
 * O foco é ORDEM DE EVENTOS. O Asaas não garante ordem nem entrega única, e a
 * spec §4.2 permite várias TENTATIVAS (faturas) por obrigação — então "evento
 * velho de tentativa superada" é caso normal, não exceção.
 */

const INVOICE = "inv-vigente";

function obligation(over: Partial<ObligationEvidence> = {}): ObligationEvidence {
  return {
    id: "obl-1",
    state: "ISSUED",
    invoiceId: INVOICE,
    disposition: "CHARGE",
    ...over,
  };
}

describe("decideObligationPromotion — o pagamento quita a obrigação", () => {
  it("ISSUED + fatura vigente → promove (o defeito que a task existe para consertar)", () => {
    expect(decideObligationPromotion(INVOICE, obligation({ state: "ISSUED" }))).toEqual({
      action: "promote",
    });
  });

  it("PLANNED → promove: a fase 3 do motor chama o gateway ANTES de escrever ISSUED", () => {
    // Um PIX pago na hora pode confirmar enquanto a obrigação ainda está
    // PLANNED. Exigir ISSUED deixaria esse pagamento sem quitar.
    expect(decideObligationPromotion(INVOICE, obligation({ state: "PLANNED" }))).toEqual({
      action: "promote",
    });
  });

  it("PAID → noop idempotente (reenvio do mesmo evento não é erro)", () => {
    expect(decideObligationPromotion(INVOICE, obligation({ state: "PAID" }))).toEqual({
      action: "noop",
      reason: "already_paid",
    });
  });

  it("🔥 VOID NUNCA é promovida — o período foi anulado e refeito por outra obrigação", () => {
    const d = decideObligationPromotion(INVOICE, obligation({ state: "VOID" }));
    expect(d.action).toBe("needs_review");
    // Promover marcaria como quitado um período cuja cobrança vigente é OUTRA.
    expect(d).not.toEqual({ action: "promote" });
  });

  it("fatura SEM obrigação vinculada → noop (fluxo legado/avulso intacto)", () => {
    // As 8 faturas legadas de produção e toda cobrança manual são assim.
    expect(decideObligationPromotion(INVOICE, null)).toEqual({
      action: "noop",
      reason: "no_obligation",
    });
  });

  it("🔥 tentativa SUPERADA → paid_but_unresolved, NÃO noop silencioso", () => {
    // Dinheiro entrou por uma fatura que não é mais a tentativa vigente. Recusar
    // a escrita é fail-closed para o banco mas fail-OPEN para a restrição: a
    // obrigação segue ISSUED com dueAt vencido e I1 restringiria quem pagou.
    const d = decideObligationPromotion("inv-antiga", obligation({ invoiceId: INVOICE }));
    expect(d.action).toBe("paid_but_unresolved");
    expect(d.action).not.toBe("noop");
  });

  it("obrigação sem tentativa reservada (invoiceId null) não é promovida às cegas", () => {
    const d = decideObligationPromotion(INVOICE, obligation({ invoiceId: null }));
    expect(d.action).toBe("paid_but_unresolved");
  });

  it("estado desconhecido no enum → needs_review, nunca promove por omissão", () => {
    const d = decideObligationPromotion(INVOICE, obligation({ state: "REVERSED" }));
    expect(d.action).toBe("needs_review");
  });
});

describe("arbitrateAccessEvent — evento de atraso/chargeback fora de ordem", () => {
  it("🔥 obrigação PAID → NÃO controla acesso (OVERDUE atrasado não rebaixa quem pagou)", () => {
    expect(arbitrateAccessEvent(INVOICE, obligation({ state: "PAID" }))).toEqual({
      controls: false,
      reason: "obligation_paid",
    });
  });

  it("obrigação VOID → NÃO controla acesso (período anulado não cobra)", () => {
    expect(arbitrateAccessEvent(INVOICE, obligation({ state: "VOID" }))).toEqual({
      controls: false,
      reason: "obligation_void",
    });
  });

  it("🔥 tentativa SUPERADA → NÃO controla acesso, mesmo com a obrigação ISSUED", () => {
    // O cenário central da task: OVERDUE de uma tentativa cancelada chegando
    // depois de a obrigação ter sido reemitida.
    expect(
      arbitrateAccessEvent("inv-antiga", obligation({ state: "ISSUED", invoiceId: INVOICE })),
    ).toEqual({ controls: false, reason: "superseded_attempt" });
  });

  it("ISSUED na tentativa vigente → controla acesso (a dívida existe de verdade)", () => {
    expect(arbitrateAccessEvent(INVOICE, obligation({ state: "ISSUED" }))).toEqual({
      controls: true,
    });
  });

  it("PLANNED controla acesso — quem decide se venceu é I1 pelo dueAt, não este módulo", () => {
    expect(arbitrateAccessEvent(INVOICE, obligation({ state: "PLANNED" }))).toEqual({
      controls: true,
    });
  });

  it("fatura SEM obrigação → controla acesso (não perde enforcement no caminho legado)", () => {
    expect(arbitrateAccessEvent(INVOICE, null)).toEqual({ controls: true });
  });

  it("evento sem fatura resolvida + obrigação ISSUED → mantém enforcement de hoje", () => {
    // Caminho recorrente puro: sem invoiceId não há como falar de tentativa
    // superada, e a obrigação em aberto é evidência de dívida.
    expect(arbitrateAccessEvent(null, obligation({ state: "ISSUED" }))).toEqual({
      controls: true,
    });
  });

  it("evento sem fatura resolvida + obrigação PAID → ainda NÃO rebaixa", () => {
    expect(arbitrateAccessEvent(null, obligation({ state: "PAID" }))).toEqual({
      controls: false,
      reason: "obligation_paid",
    });
  });
});

describe("política de estorno", () => {
  it("estorno MANTÉM a obrigação PAID (reverter restringiria por I1 sem decisão humana)", () => {
    expect(REFUND_KEEPS_OBLIGATION_PAID).toBe(true);
  });
});
