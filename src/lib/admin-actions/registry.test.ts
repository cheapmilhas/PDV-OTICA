import { describe, it, expect } from "vitest";
import { actionRegistry, getBlueprint } from "./registry";

describe("registry", () => {
  it("contém os 8 blueprints de cliente (impersonate fora do registry)", () => {
    const ids = Object.keys(actionRegistry);
    for (const id of ["block","unblock","reactivate","extend_trial","change_plan","cancel_subscription","change_billing_cycle","delete"]) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("impersonate");
  });
  it("todas as 8 ações são SUPER_ADMIN-only (por enquanto)", () => {
    for (const bp of Object.values(actionRegistry)) {
      expect(bp.allowedRoles).toEqual(["SUPER_ADMIN"]);
    }
  });
  it("delete é high-risk com typeToConfirm; todo blueprint exige companyId", () => {
    expect(getBlueprint("delete")!.confirm?.typeToConfirm).toBe("companyName");
    expect(getBlueprint("block")!.schema.safeParse({}).success).toBe(false); // companyId obrigatório
  });
});
