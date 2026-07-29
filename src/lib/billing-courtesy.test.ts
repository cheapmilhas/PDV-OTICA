import { describe, it, expect } from "vitest";
import { resolveObligationDisposition } from "./billing-courtesy";

const d = (s: string) => new Date(s + "T00:00:00.000Z");

describe("resolveObligationDisposition", () => {
  it("cortesia vigente no periodStart → COURTESY", () => {
    const disposition = resolveObligationDisposition({
      periodStart: d("2026-08-01"),
      planPriceMonthly: 9900,
      courtesies: [{ startsAt: d("2026-07-01"), endsAt: d("2026-09-01"), revokedAt: null }],
    });
    expect(disposition).toBe("COURTESY");
  });

  it("cortesia expirada antes do periodStart → CHARGE", () => {
    const disposition = resolveObligationDisposition({
      periodStart: d("2026-08-01"),
      planPriceMonthly: 9900,
      courtesies: [{ startsAt: d("2026-01-01"), endsAt: d("2026-06-01"), revokedAt: null }],
    });
    expect(disposition).toBe("CHARGE");
  });

  it("cortesia começa no meio do período → CHARGE (avaliada contra periodStart, spec §4.3)", () => {
    // A cortesia começa dia 15, mas o período em avaliação começou dia 01 —
    // a cortesia ainda não existia no periodStart. Vale para o período
    // INTEIRO ou não vale nada; não há meio-termo.
    const disposition = resolveObligationDisposition({
      periodStart: d("2026-08-01"),
      planPriceMonthly: 9900,
      courtesies: [{ startsAt: d("2026-08-15"), endsAt: null, revokedAt: null }],
    });
    expect(disposition).toBe("CHARGE");
  });

  it("plano com priceMonthly = 0 → INTERNAL, mesmo sem cortesia", () => {
    const disposition = resolveObligationDisposition({
      periodStart: d("2026-08-01"),
      planPriceMonthly: 0,
      courtesies: [],
    });
    expect(disposition).toBe("INTERNAL");
  });

  it("sem cortesia, plano pago → CHARGE", () => {
    const disposition = resolveObligationDisposition({
      periodStart: d("2026-08-01"),
      planPriceMonthly: 9900,
      courtesies: [],
    });
    expect(disposition).toBe("CHARGE");
  });

  it("cortesia sem data de fim (permanente, ex.: a ótica do dono) → COURTESY", () => {
    const disposition = resolveObligationDisposition({
      periodStart: d("2026-08-01"),
      planPriceMonthly: 9900,
      courtesies: [{ startsAt: d("2020-01-01"), endsAt: null, revokedAt: null }],
    });
    expect(disposition).toBe("COURTESY");
  });

  describe("decisão: precedência INTERNAL > COURTESY", () => {
    it("plano de preço zero COM cortesia vigente → INTERNAL, não COURTESY", () => {
      // INTERNAL existe para a conta interna do dono (plano R$0) nunca aparecer
      // como "receita perdida". Se COURTESY vencesse aqui, uma cortesia
      // concedida por engano (ou esquecida) sobre um plano interno inflaria a
      // métrica de receita não faturada com um valor que nunca existiu.
      // priceMonthly = 0 já não tem "valor cheio" nenhum a perder — a pergunta
      // "está de cortesia?" não se aplica a um plano que não cobra ninguém.
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 0,
        courtesies: [{ startsAt: d("2020-01-01"), endsAt: null, revokedAt: null }],
      });
      expect(disposition).toBe("INTERNAL");
    });
  });

  describe("decisão: cortesia revogada não vale", () => {
    it("cortesia com revokedAt preenchido, mesmo vigente por data, → CHARGE", () => {
      // revokedAt existe para o dono poder desfazer uma cortesia dada por
      // engano. Se revogação não bloqueasse a disposição, não haveria como
      // reverter — a cortesia "vigente por data" continuaria isentando para
      // sempre, mesmo revogada.
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [
          { startsAt: d("2026-01-01"), endsAt: null, revokedAt: d("2026-07-15") },
        ],
      });
      expect(disposition).toBe("CHARGE");
    });

    it("uma cortesia revogada e outra vigente na mesma assinatura → COURTESY (a vigente ganha)", () => {
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [
          { startsAt: d("2026-01-01"), endsAt: null, revokedAt: d("2026-07-15") },
          { startsAt: d("2026-07-20"), endsAt: null, revokedAt: null },
        ],
      });
      expect(disposition).toBe("COURTESY");
    });
  });

  describe("decisão: múltiplas cortesias — qualquer uma vigente basta (OR)", () => {
    it("cortesia antiga expirada + cortesia nova vigente → COURTESY", () => {
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [
          { startsAt: d("2026-01-01"), endsAt: d("2026-03-01"), revokedAt: null },
          { startsAt: d("2026-07-01"), endsAt: d("2026-10-01"), revokedAt: null },
        ],
      });
      expect(disposition).toBe("COURTESY");
    });

    it("duas cortesias sobrepostas, ambas vigentes → COURTESY", () => {
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [
          { startsAt: d("2026-06-01"), endsAt: d("2026-09-01"), revokedAt: null },
          { startsAt: d("2026-07-01"), endsAt: d("2026-12-01"), revokedAt: null },
        ],
      });
      expect(disposition).toBe("COURTESY");
    });

    it("todas as cortesias já expiraram → CHARGE", () => {
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [
          { startsAt: d("2026-01-01"), endsAt: d("2026-03-01"), revokedAt: null },
          { startsAt: d("2026-04-01"), endsAt: d("2026-06-01"), revokedAt: null },
        ],
      });
      expect(disposition).toBe("CHARGE");
    });
  });

  describe("bordas de data", () => {
    it("cortesia começa EXATAMENTE no periodStart → vigente, fronteira inclusiva (COURTESY)", () => {
      // `startsAt <= periodStart`: se a concessão começa hoje e o período
      // avaliado também começa hoje, a cortesia já cobre o período inteiro.
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [{ startsAt: d("2026-08-01"), endsAt: null, revokedAt: null }],
      });
      expect(disposition).toBe("COURTESY");
    });

    it("cortesia termina EXATAMENTE no periodStart → já não vigente, fronteira exclusiva (CHARGE)", () => {
      // `endsAt` é o limite superior do último período coberto, alinhado ao
      // ciclo (a interface arredonda para o limite do ciclo — spec §4.3).
      // Se `endsAt === periodStart`, o período que está começando agora já é
      // o primeiro período NÃO coberto — mesma semântica semiaberta
      // [periodStart, periodEnd) usada em billing-clock.ts.
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [{ startsAt: d("2026-01-01"), endsAt: d("2026-08-01"), revokedAt: null }],
      });
      expect(disposition).toBe("CHARGE");
    });

    it("endsAt no passado distante → CHARGE", () => {
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [{ startsAt: d("2010-01-01"), endsAt: d("2010-06-01"), revokedAt: null }],
      });
      expect(disposition).toBe("CHARGE");
    });

    it("lista de cortesias vazia → CHARGE", () => {
      const disposition = resolveObligationDisposition({
        periodStart: d("2026-08-01"),
        planPriceMonthly: 9900,
        courtesies: [],
      });
      expect(disposition).toBe("CHARGE");
    });
  });
});
