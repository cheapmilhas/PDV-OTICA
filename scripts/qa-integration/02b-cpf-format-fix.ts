/**
 * Re-roda só os testes de FORMATO de CPF (não tocam DB) e corrige resultados 2.2-2.4
 * no .state.json. Não cria nada novo no banco.
 */
import "./_env-shim";
import { createCustomerSchema } from "@/lib/validations/customer.schema";
import { loadState, saveState } from "./_state";

const prefix = loadState().prefix;

function zodMsg(e: any): string {
  const issues = e?.issues ?? e?.errors ?? [];
  if (!Array.isArray(issues) || issues.length === 0) return e?.message ?? "rejeitado";
  return issues[0]?.message ?? "rejeitado";
}

interface Case {
  scenario: string;
  cpf: string;
  expectsReject: boolean;
  expected: string;
}

const cases: Case[] = [
  { scenario: "2.2 cpf com 10 dígitos", cpf: "1234567890", expectsReject: true, expected: "Zod rejeita" },
  { scenario: "2.3 cpf com 12 dígitos", cpf: "123456789012", expectsReject: true, expected: "Zod rejeita" },
  { scenario: "2.4 cpf com pontuação (123.456.789-09)", cpf: "123.456.789-09", expectsReject: true, expected: "Zod rejeita pontuação" },
];

const state = loadState();
state.results = state.results ?? [];

for (const c of cases) {
  let rejected = false;
  let msg = "(aceito)";
  try {
    createCustomerSchema.parse({ name: `${prefix}_X`, cpf: c.cpf });
  } catch (e: any) {
    rejected = true;
    msg = zodMsg(e);
  }
  const pass = rejected === c.expectsReject;
  // remove resultado antigo desse scenario
  state.results = state.results.filter((r) => r.scenario !== c.scenario);
  state.results.push({
    scenario: c.scenario,
    expected: c.expected,
    obtained: rejected ? `rejeitado: ${msg}` : "ACEITO (BUG)",
    pass,
  });
  console.log(`${pass ? "[PASS]" : "[FAIL]"} ${c.scenario} → ${rejected ? "REJECT" : "ACCEPT"} | ${msg}`);
}

saveState(state);
