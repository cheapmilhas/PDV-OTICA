// src/lib/admin-actions/validate.ts
import { AdminRole } from "@prisma/client";
import type { AdminActionBlueprint } from "./types";

export interface ValidateInput {
  role: AdminRole;
  input: unknown;
  reason?: string;
  companyName?: string;
  confirmName?: string;
}

export type ValidateResult =
  | { ok: true; input: unknown }
  | { ok: false; status: 400 | 403; message: string };

export function validateActionRequest<TInput>(
  bp: AdminActionBlueprint<TInput>,
  req: ValidateInput,
): ValidateResult {
  if (!bp.allowedRoles.includes(req.role)) {
    return { ok: false, status: 403, message: "Sem permissão para esta ação" };
  }
  const parsed = bp.schema.safeParse(req.input);
  if (!parsed.success) {
    return { ok: false, status: 400, message: "Dados inválidos" };
  }
  if (bp.riskLevel === "high" || bp.confirm?.requireReason) {
    if (bp.confirm?.requireReason && !req.reason?.trim()) {
      return { ok: false, status: 400, message: "Motivo é obrigatório" };
    }
    // Compara com trim nos dois lados — alinhado ao frontend (action-modal),
    // que habilita o botão quando confirmName.trim() === companyName.trim().
    // Sem o trim, um nome com espaço no banco ("OTICA QA ") faz o botão habilitar
    // mas o backend rejeitar com "Confirmação não confere".
    if (
      bp.confirm?.typeToConfirm === "companyName" &&
      (req.confirmName ?? "").trim() !== (req.companyName ?? "").trim()
    ) {
      return { ok: false, status: 400, message: "Confirmação não confere" };
    }
  }
  return { ok: true, input: parsed.data };
}
