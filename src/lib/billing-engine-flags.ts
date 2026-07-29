/**
 * As QUATRO chaves independentes do rollout do motor de recorrência
 * (spec §7). Uma por etapa, para que cada etapa ligue e desligue sozinha:
 *
 * | Etapa | Chave                              | O que libera                         |
 * |-------|------------------------------------|--------------------------------------|
 * | 1     | `BILLING_OBLIGATION_ENABLED`       | Gerar/manter obrigações (sem emitir) |
 * | 3     | `BILLING_SHADOW_ENABLED`           | Gravar decisões em modo sombra       |
 * | 4     | `BILLING_ISSUE_ENABLED` + coorte   | Emitir cobrança de verdade           |
 * | 5     | `BILLING_ENFORCEMENT_ENABLED` + coorte | Restringir acesso                |
 *
 * Uma flag única faria a etapa 5 (restringir acesso) ser refém da etapa 4
 * (cobrar) — exatamente o acoplamento que o rollout existe para evitar.
 *
 * ## Por que env var, e não coluna em `SaasEmailConfig`
 *
 * `SaasEmailConfig` é o antipadrão que este plano rejeita explicitamente:
 * `invoiceGenerationEnabled` (`schema.prisma`, default `false`) mora lá e é
 * editada numa tela intitulada "E-mails" — usá-la transforma um botão de
 * e-mail em "desligar o faturamento do SaaS". Acrescentar quatro booleanos à
 * MESMA tabela repetiria o erro com nomes novos: o operador continuaria
 * ligando o motor de cobrança numa tela de e-mail.
 *
 * Env var, além disso:
 * - não precisa de migração nem de tela para existir;
 * - é revertida sem escrita em banco (redeploy/instant rollback no painel);
 * - segue o precedente vivo deste repo — `ENFORCE_SUSPENSION` e
 *   `SUBSCRIPTION_BYPASS_COMPANY_IDS` (`src/lib/subscription.ts`) e o par
 *   kill-switch + allowlist de `src/lib/whatsapp-flag.ts`, que este módulo
 *   espelha campo a campo.
 *
 * ⚠️ Custo aceito: não aparece na UI e não fica auditável no banco. Mitigação —
 * quem altera env var no painel da Vercel deixa rastro lá, e as etapas 4 e 5
 * são operações acompanhadas pelo dono, não rotina de suporte.
 *
 * ⚠️ Consequência para a Task 7: como estas flags NÃO moram em
 * `SaasEmailConfig`, a fase nova do cron precisa ficar ANTES do early return de
 * `runInvoiceReminders` (`src/services/invoice-reminders.service.ts`), que sai
 * cedo quando `invoiceGenerationEnabled` é falsa. Se ficasse depois, o motor
 * inteiro ficaria gateado justamente pela flag que este desenho rejeita.
 *
 * Todas nascem DESLIGADAS: ausência da variável = `false`. Nenhuma delas é
 * default-on, porque o modo de falha de um motor de cobrança ligado por
 * engano é cobrar quem não devia.
 */

/** `true` só quando a env var vale exatamente a string `"true"`. */
function isOn(value: string | undefined): boolean {
  return value === "true";
}

/** CSV de companyIds → array limpo. Mesma normalização de `whatsapp-flag.ts`. */
function parseCompanyIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Etapa 1 — o motor pode criar e manter obrigações (`PLANNED`/`ISSUED`).
 * Não emite cobrança e não restringe ninguém: só materializa a linha do tempo.
 */
export function isObligationGenerationEnabled(): boolean {
  return isOn(process.env.BILLING_OBLIGATION_ENABLED);
}

/**
 * Etapa 3 — modo sombra: o motor decide e grava em `BillingShadowDecision`,
 * sem emitir e sem bloquear. Artefato descartável, nunca `BillingObligation`.
 */
export function isShadowModeEnabled(): boolean {
  return isOn(process.env.BILLING_SHADOW_ENABLED);
}

/**
 * Etapa 4 — emissão real, por COORTE.
 *
 * ⚠️ Esta etapa não é reversível no sentido comercial: desligar a flag não
 * cancela cobrança já criada no Asaas nem "desmanda" e-mail. Por isso a
 * allowlist é obrigatória — sem `BILLING_ISSUE_COMPANY_IDS`, ninguém é
 * cobrado, mesmo com o kill-switch ligado.
 */
export function isIssuanceEnabledForCompany(companyId: string): boolean {
  if (!isOn(process.env.BILLING_ISSUE_ENABLED)) return false;
  if (!companyId) return false;
  return parseCompanyIds(process.env.BILLING_ISSUE_COMPANY_IDS).includes(companyId);
}

/**
 * Etapa 5 — restrição de acesso, por COORTE.
 *
 * Independente da etapa 4 de propósito: dá para cobrar um ciclo inteiro
 * acompanhando o resultado antes de qualquer cliente perder escrita.
 *
 * 🔑 Não substitui as invariantes: mesmo com esta flag ligada e a empresa na
 * coorte, a restrição continua exigindo obrigação EMITIDA e VENCIDA (I1) e
 * aviso DESPACHADO (I3). A flag só decide se a decisão vira ação.
 */
export function isEnforcementEnabledForCompany(companyId: string): boolean {
  if (!isOn(process.env.BILLING_ENFORCEMENT_ENABLED)) return false;
  if (!companyId) return false;
  return parseCompanyIds(process.env.BILLING_ENFORCEMENT_COMPANY_IDS).includes(companyId);
}
