export type ResendInviteCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Pré-condições do reenvio de convite medical (B3), puras e testáveis.
 * Espelham as checagens do case `resend_medical_invite` no route — mantê-las
 * aqui documenta a regra e permite testá-la sem Prisma.
 */
export function checkCanResendMedicalInvite(input: {
  platformProduct: string;
  medicalInviteUrl: string | null;
  email: string | null;
}): ResendInviteCheck {
  if (input.platformProduct !== "VIS_MEDICAL") {
    return { ok: false, status: 400, error: "Ação disponível apenas para clientes Vis Medical" };
  }
  if (!input.medicalInviteUrl) {
    return {
      ok: false,
      status: 409,
      error: "Convite ainda não disponível — aguarde o provisionamento concluir",
    };
  }
  if (!input.email) {
    return { ok: false, status: 422, error: "Empresa sem e-mail de contato para enviar o convite" };
  }
  return { ok: true };
}
