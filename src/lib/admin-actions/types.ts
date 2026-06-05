// src/lib/admin-actions/types.ts
import { z } from "zod";
import { AdminRole } from "@prisma/client";

export type RiskLevel = "low" | "medium" | "high";

export interface ActionContext {
  adminId: string;
  adminName?: string;   // preenchido pela rota a partir da session — evita re-buscar nos logs
  adminEmail?: string;  // idem (usado em globalAudit.metadata)
  requestId?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export interface AdminActionBlueprint<TInput = unknown> {
  id: string;
  label: string;
  description: string;
  category: "client" | "system";
  icon: string;
  riskLevel: RiskLevel;
  schema: z.ZodType<TInput>;
  confirm?: { requireReason: boolean; typeToConfirm?: "companyName" };
  allowedRoles: AdminRole[];
  /** companyId-alvo extraído do input, p/ auditoria + typeToConfirm (null em ações de sistema) */
  targetCompanyId?: (input: TInput) => string | null;
  execute: (ctx: ActionContext, input: TInput) => Promise<ActionResult>;
}
