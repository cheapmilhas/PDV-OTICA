import { describe, it, expect } from "vitest";

import { deriveMedicalOnboarding } from "./medical-onboarding";
import type { ClinicUsage } from "./vis-usage-client";

/** Clínica recém-provisionada: nada configurado, nada usado. */
const ZERADA: ClinicUsage = {
  doctorsActive: 0,
  staffActive: 1, // o admin que aceitou o convite
  patients: 0,
  appointments: 0,
  appointmentsLast30d: 0,
  medicalRecords: 0,
  workingHoursDays: 0,
  onlineBookingEnabled: 0,
  legalFieldsFilled: 0,
};

function uso(over: Partial<ClinicUsage> = {}): ClinicUsage {
  return { ...ZERADA, ...over };
}

describe("deriveMedicalOnboarding — progresso", () => {
  it("clínica zerada: 0% e nenhum passo concluído", () => {
    const r = deriveMedicalOnboarding(ZERADA);
    expect(r.percent).toBe(0);
    expect(r.doneRequired).toBe(0);
    expect(r.steps.every((s) => !s.done)).toBe(true);
  });

  it("clínica completa: 100% nos obrigatórios", () => {
    const r = deriveMedicalOnboarding(
      uso({
        legalFieldsFilled: 1,
        doctorsActive: 2,
        workingHoursDays: 5,
        patients: 40,
        appointments: 90,
      })
    );
    expect(r.percent).toBe(100);
    expect(r.doneRequired).toBe(r.totalRequired);
  });

  it("o percentual conta só os OBRIGATÓRIOS — opcionais não inflam", () => {
    // Só passos opcionais concluídos: o progresso segue 0%.
    const r = deriveMedicalOnboarding(
      uso({ staffActive: 5, medicalRecords: 10, onlineBookingEnabled: 1 })
    );
    expect(r.percent).toBe(0);
    expect(r.steps.filter((s) => s.done && !s.required).length).toBe(3);
  });

  it("progresso parcial arredonda para inteiro", () => {
    const r = deriveMedicalOnboarding(uso({ legalFieldsFilled: 1, doctorsActive: 1 }));
    expect(r.doneRequired).toBe(2);
    expect(r.totalRequired).toBe(5);
    expect(r.percent).toBe(40);
  });
});

describe("deriveMedicalOnboarding — marcos individuais", () => {
  function done(usage: ClinicUsage, key: string) {
    return deriveMedicalOnboarding(usage).steps.find((s) => s.key === key)?.done;
  }

  it("equipe exige 2+, porque o admin já conta como 1", () => {
    // Uma clínica com só o fundador NÃO tem "equipe" — marcar esse passo com
    // staffActive=1 daria por concluído algo que nunca aconteceu.
    expect(done(uso({ staffActive: 1 }), "TEAM")).toBe(false);
    expect(done(uso({ staffActive: 2 }), "TEAM")).toBe(true);
  });

  it("flags 0/1 viram booleano corretamente", () => {
    expect(done(uso({ legalFieldsFilled: 0 }), "LEGAL_DATA")).toBe(false);
    expect(done(uso({ legalFieldsFilled: 1 }), "LEGAL_DATA")).toBe(true);
    expect(done(uso({ onlineBookingEnabled: 1 }), "ONLINE_BOOKING")).toBe(true);
  });

  it("um único item já satisfaz os marcos de 'primeiro X'", () => {
    expect(done(uso({ patients: 1 }), "FIRST_PATIENT")).toBe(true);
    expect(done(uso({ appointments: 1 }), "FIRST_APPOINTMENT")).toBe(true);
    expect(done(uso({ doctorsActive: 1 }), "FIRST_DOCTOR")).toBe(true);
  });
});

describe("ativa — 'está usando' ≠ 'já usou'", () => {
  it("clínica com histórico mas SEM movimento recente NÃO está ativa", () => {
    // 🔑 A distinção que decide se o trial converte: 90 agendamentos no
    // passado e zero nos últimos 30 dias é uma clínica que PAROU. Contar o
    // histórico aqui mostraria "ativa" para quem já abandonou o produto.
    const r = deriveMedicalOnboarding(
      uso({ appointments: 90, appointmentsLast30d: 0, patients: 40 })
    );
    expect(r.ativa).toBe(false);
  });

  it("um agendamento recente basta para estar ativa", () => {
    expect(deriveMedicalOnboarding(uso({ appointments: 1, appointmentsLast30d: 1 })).ativa).toBe(
      true
    );
  });

  it("clínica 100% configurada mas parada NÃO está ativa", () => {
    // Configuração completa não é uso. Os dois sinais são independentes de
    // propósito: dá para ter 100% de onboarding e estar morta.
    const r = deriveMedicalOnboarding(
      uso({
        legalFieldsFilled: 1,
        doctorsActive: 1,
        workingHoursDays: 5,
        patients: 10,
        appointments: 10,
        appointmentsLast30d: 0,
      })
    );
    expect(r.percent).toBe(100);
    expect(r.ativa).toBe(false);
  });
});

describe("estrutura", () => {
  it("todo passo tem rótulo e explicação — a tela não mostra código", () => {
    for (const s of deriveMedicalOnboarding(ZERADA).steps) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.hint.length).toBeGreaterThan(0);
      expect(s.key).toMatch(/^[A-Z_]+$/);
    }
  });

  it("NÃO usa os marcos óticos (FIRST_BRANCH, PRODUCTS_IMPORTED, FIRST_SALE)", () => {
    const keys = deriveMedicalOnboarding(ZERADA).steps.map((s) => s.key);
    expect(keys).not.toContain("FIRST_BRANCH");
    expect(keys).not.toContain("PRODUCTS_IMPORTED");
    expect(keys).not.toContain("FIRST_SALE");
  });

  it("é PURO: a mesma entrada dá a mesma saída, sem estado", () => {
    const a = deriveMedicalOnboarding(uso({ patients: 3 }));
    const b = deriveMedicalOnboarding(uso({ patients: 3 }));
    expect(a).toEqual(b);
  });
});
