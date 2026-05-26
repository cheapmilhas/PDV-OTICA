/**
 * Estado persistido entre scripts (IDs criados, prefixo de teste, etc).
 * Gravado em scripts/qa-integration/.state.json (gitignored).
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface TestState {
  prefix: string;
  startedAt: string;
  companyId?: string;
  branchId?: string;
  branch2Id?: string;
  company2Id?: string;
  adminUserId?: string;
  frameProductId?: string;
  lensProductId?: string;
  customerId?: string;
  cashShiftId?: string;
  salesCreated?: Record<string, string>; // label -> saleId
  results?: Array<{
    scenario: string;
    expected: string;
    obtained: string;
    pass: boolean;
    notes?: string;
  }>;
  bugs?: Array<{
    title: string;
    severity: "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";
    repro: string;
    files: string[];
  }>;
}

const STATE_PATH = path.resolve(__dirname, ".state.json");

export function loadState(): TestState {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      `[QA] .state.json não existe — rode 01-setup.ts primeiro.`,
    );
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

export function saveState(state: TestState): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function recordResult(
  scenario: string,
  expected: string,
  obtained: string,
  pass: boolean,
  notes?: string,
): void {
  const s = loadState();
  s.results = s.results ?? [];
  s.results.push({ scenario, expected, obtained, pass, notes });
  saveState(s);
  const tag = pass ? "[PASS]" : "[FAIL]";
  console.log(`${tag} ${scenario} — esperado: ${expected} | obtido: ${obtained}`);
  if (notes) console.log(`       nota: ${notes}`);
}

export function recordBug(
  title: string,
  severity: TestState["bugs"] extends (infer X)[] | undefined
    ? X extends { severity: infer S }
      ? S
      : never
    : never,
  repro: string,
  files: string[],
): void {
  const s = loadState();
  s.bugs = s.bugs ?? [];
  s.bugs.push({ title, severity, repro, files });
  saveState(s);
  console.log(`[BUG ${severity}] ${title}`);
}
