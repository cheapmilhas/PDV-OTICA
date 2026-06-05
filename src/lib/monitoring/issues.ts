import type { SystemPulse } from "./system-pulse";

export type IssueSeverity = "critical" | "warning" | "info";
export type IssueCategory = "system" | "client";

export interface IssueAction {
  kind: "blueprint" | "link" | "info";
  blueprintId?: string;
  href?: string;
  label: string;
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  explanation: string;
  companyId?: string;
  companyName?: string;
  action?: IssueAction;
}

// ── Limiares (constantes documentadas; não editáveis pela UI — YAGNI) ──
export const ERROR_RATE_PCT = 5;
export const MIN_REQ_FOR_ERROR_ALERT = 20;
export const TRIAL_WARNING_DAYS = 3;

export function detectSystemIssues(pulse: SystemPulse): Issue[] {
  const issues: Issue[] = [];
  if (pulse.status === "down" || pulse.db.status === "down") {
    issues.push({
      id: "system_slow", severity: "critical", category: "system",
      title: "Sistema fora do ar",
      explanation: "O sistema não está conseguindo responder agora. Os usuários podem estar sem acesso.",
      action: { kind: "info", label: "Verificar novamente" },
    });
  } else if (pulse.status === "degraded" || pulse.db.status === "degraded") {
    issues.push({
      id: "system_slow", severity: "warning", category: "system",
      title: "Sistema lento",
      explanation: "As telas estão demorando mais que o normal para responder. Pode ser um pico temporário.",
      action: { kind: "info", label: "Verificar novamente" },
    });
  }
  return issues;
}
