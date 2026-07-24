import { describe, it, expect } from "vitest";
import { checkCanResendMedicalInvite } from "../resend-invite-guard";

describe("checkCanResendMedicalInvite (B3)", () => {
  const ok = {
    platformProduct: "VIS_MEDICAL",
    medicalInviteUrl: "https://medical.vis.app.br/aceitar-convite?token=abc",
    email: "clinica@example.com",
  };

  it("medical com invite e e-mail → ok", () => {
    expect(checkCanResendMedicalInvite(ok)).toEqual({ ok: true });
  });

  it("ótica → 400 (ação é só medical)", () => {
    const r = checkCanResendMedicalInvite({ ...ok, platformProduct: "VIS_APP" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("sem invite ainda → 409 (aguardar provisionamento)", () => {
    const r = checkCanResendMedicalInvite({ ...ok, medicalInviteUrl: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it("sem e-mail de contato → 422", () => {
    const r = checkCanResendMedicalInvite({ ...ok, email: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });
});
