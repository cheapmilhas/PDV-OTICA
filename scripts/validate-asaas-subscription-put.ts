/**
 * VALIDAÇÃO EM SANDBOX — pré-condição #1 de ligar a saga de troca de plano
 * (VIS_TIER_SELF_SERVICE_ENABLED). Prova as 3 suposições que o `confirmBilling`
 * (src/lib/domus-plan-change/deps.ts) faz sobre o `PUT /subscriptions/{id}` do
 * Asaas — se qualquer uma for falsa, o Asaas-first não é seguro mesmo com todo o
 * endurecimento das Fases A-E:
 *
 *   (1) OBJETO COMPLETO: o PUT devolve id + value + cycle + status. A saga valida
 *       os quatro; se faltar, ela trava em BILLING_REQUESTED revalidando (fail-
 *       closed, seguro, mas o cliente não recebe o plano).
 *   (2) IDEMPOTÊNCIA: repetir o MESMO PUT (mesmo value, mesma asaas-idempotency-key)
 *       NÃO gera cobrança/fatura extra — a retomada da saga o faz de novo.
 *   (3) NÃO-DUPLICAÇÃO: a contagem de cobranças (payments) da assinatura NÃO
 *       aumenta entre PUTs repetidos com a mesma key.
 *
 * SEGURO: roda SÓ contra o SANDBOX (aborta se a chave for de produção). Cria um
 * customer + subscription DESCARTÁVEIS e os CANCELA no fim (best-effort). Não toca
 * em nenhum recurso real.
 *
 * USO (o dono roda; precisa ASAAS_API_KEY de SANDBOX — $aact_test_*):
 *   ASAAS_API_KEY='$aact_test_...' npx tsx scripts/validate-asaas-subscription-put.ts
 *
 * Saída: relatório PASS/FAIL por checagem + veredito final. Exit 0 se tudo passou,
 * 1 se qualquer checagem falhou (para uso em CI/gate).
 */

import { asaas } from "@/lib/asaas";

// ---- helpers de relatório -------------------------------------------------
let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  console.log(`  [${tag}] ${label}${detail ? ` — ${detail}` : ""}`);
}
function section(t: string) {
  console.log(`\n=== ${t} ===`);
}

// Data futura YYYY-MM-DD (nextDueDate exige data no futuro).
function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    console.error("ASAAS_API_KEY ausente. Rode com a chave de SANDBOX ($aact_test_*).");
    process.exit(2);
  }
  // GUARDA DURA: NUNCA rodar contra produção. O script cria e cancela recursos.
  if (apiKey.startsWith("$aact_prod_")) {
    console.error("RECUSADO: ASAAS_API_KEY é de PRODUÇÃO. Este script só roda em SANDBOX.");
    process.exit(2);
  }

  console.log("Validação do PUT /subscriptions/{id} — SANDBOX Asaas");
  console.log("(pré-condição de ligar VIS_TIER_SELF_SERVICE_ENABLED)\n");

  let customerId: string | null = null;
  let subscriptionId: string | null = null;

  try {
    // ---- setup: customer + subscription descartáveis ---------------------
    section("Setup (recursos descartáveis)");
    const stamp = futureDate(0).replace(/-/g, ""); // determinístico o suficiente p/ log
    const customer = await asaas.customers.create({
      name: `VALIDACAO PUT ${stamp}`,
      email: `validacao-put-${stamp}@example.com`,
      cpfCnpj: "24971563792", // CPF de teste válido (sandbox aceita)
      notificationDisabled: true, // não dispara e-mail/SMS de teste
    });
    customerId = customer.id;
    console.log(`  customer criado: ${customerId}`);

    const PRICE_INITIAL = 89.9;
    const sub = await asaas.subscriptions.create({
      customer: customer.id,
      billingType: "BOLETO",
      nextDueDate: futureDate(7),
      value: PRICE_INITIAL,
      cycle: "MONTHLY",
      description: "Assinatura de validação (descartável)",
      externalReference: `validate-put-${Date.now()}`,
    });
    subscriptionId = sub.id;
    console.log(`  subscription criada: ${subscriptionId} (value=${sub.value}, cycle=${sub.cycle}, status=${sub.status})`);

    // Cobranças ANTES de qualquer PUT (baseline para a checagem de não-duplicação).
    const before = await asaas.payments.list({ subscription: sub.id, limit: 100 });
    console.log(`  cobranças (payments) na baseline: ${before.totalCount}`);

    // ---- (1) OBJETO COMPLETO ---------------------------------------------
    section("(1) PUT devolve objeto completo (id/value/cycle/status)");
    const NEW_PRICE = 189.9;
    const idemKey = `validate-put:${sub.id}:${Date.now()}`;
    const put1 = await asaas.subscriptions.update(sub.id, { value: NEW_PRICE }, idemKey);
    check("resposta tem id", typeof put1.id === "string" && put1.id.length > 0, `id=${put1.id}`);
    check("resposta tem value numérico", typeof put1.value === "number", `value=${put1.value}`);
    check("value = valor enviado", Math.round(put1.value * 100) === Math.round(NEW_PRICE * 100), `${put1.value} vs ${NEW_PRICE}`);
    check("resposta tem cycle", put1.cycle === "MONTHLY", `cycle=${put1.cycle}`);
    check("resposta tem status ACTIVE", put1.status === "ACTIVE", `status=${put1.status}`);
    check("id = assinatura correta", put1.id === sub.id, `${put1.id} vs ${sub.id}`);

    // ---- (2) IDEMPOTÊNCIA: mesmo PUT + mesma key, 2x ---------------------
    section("(2) Repetir o MESMO PUT com a MESMA idempotency-key");
    const put2 = await asaas.subscriptions.update(sub.id, { value: NEW_PRICE }, idemKey);
    check("2º PUT (mesma key) devolve o mesmo id", put2.id === put1.id, `${put2.id}`);
    check("2º PUT devolve o mesmo value", Math.round(put2.value * 100) === Math.round(NEW_PRICE * 100), `value=${put2.value}`);
    check("2º PUT mantém status ACTIVE", put2.status === "ACTIVE", `status=${put2.status}`);

    // ---- (3) NÃO-DUPLICAÇÃO de cobrança ----------------------------------
    section("(3) Cobranças NÃO aumentaram após os PUTs repetidos");
    const after = await asaas.payments.list({ subscription: sub.id, limit: 100 });
    console.log(`  cobranças depois dos PUTs: ${after.totalCount} (baseline era ${before.totalCount})`);
    check(
      "totalCount de payments não aumentou por causa do PUT",
      after.totalCount <= before.totalCount,
      `antes=${before.totalCount} depois=${after.totalCount}`,
    );

    // ---- (extra) key NOVA com o MESMO value ------------------------------
    // Documenta o comportamento: uma key diferente para o mesmo value gera uma
    // resposta nova? A saga usa key ESTÁVEL por eventId, então isto é só
    // informativo (não é um invariante que a saga dependa).
    section("(extra, informativo) PUT com key NOVA + mesmo value");
    const put3 = await asaas.subscriptions.update(sub.id, { value: NEW_PRICE }, `${idemKey}:new`);
    const afterNewKey = await asaas.payments.list({ subscription: sub.id, limit: 100 });
    console.log(`  key nova → status=${put3.status}, payments agora=${afterNewKey.totalCount}`);
    check(
      "key nova + mesmo value ainda não dispara cobrança extra",
      afterNewKey.totalCount <= before.totalCount,
      `antes=${before.totalCount} depois=${afterNewKey.totalCount}`,
    );
  } catch (err) {
    failures += 1;
    console.error("\nERRO durante a validação:", err instanceof Error ? err.message : err);
  } finally {
    // ---- limpeza (best-effort) -------------------------------------------
    section("Limpeza");
    if (subscriptionId) {
      try {
        await asaas.subscriptions.cancel(subscriptionId);
        console.log(`  subscription cancelada: ${subscriptionId}`);
      } catch (e) {
        console.log(`  aviso: falha ao cancelar subscription ${subscriptionId}: ${e instanceof Error ? e.message : e}`);
      }
    }
    // Customer não tem DELETE simples aqui; deixamos para limpeza manual no painel
    // (sandbox descartável). Logamos o id.
    if (customerId) console.log(`  customer de teste (limpar no painel se quiser): ${customerId}`);
  }

  section("VEREDITO");
  if (failures === 0) {
    console.log("  ✅ TODAS as checagens passaram — o PUT do Asaas honra o contrato que a saga assume.");
    console.log("  Pré-condição #1 de ligar o self-service: OK.");
    process.exit(0);
  } else {
    console.log(`  ❌ ${failures} checagem(ns) FALHARAM — NÃO ligar o self-service.`);
    console.log("  Se (1) objeto incompleto: a saga travaria em BILLING_REQUESTED (fail-closed).");
    console.log("  Se (2)/(3) duplicou cobrança: a retomada da saga dobraria fatura — bloqueante.");
    process.exit(1);
  }
}

main();
