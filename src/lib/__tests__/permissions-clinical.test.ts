import { describe, it, expect } from "vitest";
import { Permission, ROLE_PERMISSIONS } from "@/lib/permissions";

describe("permissões clínicas (Vis Medical F0)", () => {
  it("define os códigos clínicos no enum Permission", () => {
    expect(Permission.CLINICAL_ENCOUNTER_VIEW).toBe("clinical.encounter.view");
    expect(Permission.CLINICAL_ENCOUNTER_CREATE).toBe("clinical.encounter.create");
    expect(Permission.CLINICAL_EXAM_CREATE).toBe("clinical.exam.create");
    expect(Permission.CLINICAL_PRESCRIPTION_ISSUE).toBe("clinical.prescription.issue");
    expect(Permission.CLINICAL_APPOINTMENT_MANAGE).toBe("clinical.appointment.manage");
  });

  it("concede permissões clínicas aos papéis clínicos e NUNCA aos comerciais", () => {
    // papéis comerciais não podem tocar dado clínico
    for (const role of ["SELLER", "CASHIER", "STOCK_MANAGER"] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(Permission.CLINICAL_ENCOUNTER_VIEW);
    }
  });

  it("papéis clínicos recebem o conjunto clínico", () => {
    for (const role of ["OPHTHALMOLOGIST", "OPTOMETRIST"] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain(Permission.CLINICAL_PRESCRIPTION_ISSUE);
    }
  });

  // DECISÃO EXPLÍCITA (F0): ADMIN = Object.values(Permission) → herda os códigos
  // clínicos automaticamente. É SEGURO na F0 porque não há tela nem dado clínico
  // ainda (permissões órfãs). Quando a fase clínica introduzir dado real, a
  // autorização clínica NÃO pode se apoiar só em requirePermission — precisa de
  // gate adicional por platformProduct (um ADMIN de conta VIS_APP não deve ler
  // prontuário de conta VIS_MEDICAL). Este teste documenta a decisão para não virar
  // surpresa silenciosa. Ver spec Seção 5.
  it("ADMIN herda os códigos clínicos (esperado na F0; gate por produto vem na fase clínica)", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain(Permission.CLINICAL_ENCOUNTER_VIEW);
  });
});
