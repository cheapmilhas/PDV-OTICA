import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-session";
import { asaas } from "@/lib/asaas";

/**
 * Diagnóstico do canal de cobrança — responde "o gateway está alcançável e a
 * credencial vale?" sem NUNCA revelar a chave.
 *
 * Existe porque a `ASAAS_API_KEY` é Sensitive no painel da Vercel: o valor não
 * pode ser lido nem por quem administra, e sem ele não dá para saber se as
 * requisições estão indo para produção ou para o sandbox. O ambiente é
 * escolhido pelo PREFIXO da chave (`$aact_prod_` → produção), então um formato
 * diferente manda a cobrança para o sandbox em silêncio.
 *
 * 🔑 O que é exposto: prefixo curto (11 chars, não identifica a chave), URL
 * base resolvida, e o resultado de uma consulta real. O segredo em si nunca sai.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const url = new URL(request.url);
  const criar = url.searchParams.get("criar") === "1";
  // Default = a clínica TESTE, que é o caso que estamos diagnosticando.
  const companyId = url.searchParams.get("companyId") ?? "cmryty1230088wikgisdtcxvb";

  const key = process.env.ASAAS_API_KEY;
  const explicitUrl = process.env.ASAAS_API_URL ?? null;

  if (!key) {
    return NextResponse.json({
      ok: false,
      problema: "ASAAS_API_KEY ausente no ambiente",
      keyPresente: false,
    });
  }

  const isProdPrefix = key.startsWith("$aact_prod_");
  const baseUrlResolvida =
    explicitUrl ||
    (isProdPrefix ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3");

  // Chamada REAL, mas inofensiva: consulta por um CNPJ. Não cria nada.
  let consulta: { ok: boolean; detalhe: string };
  try {
    const found = await asaas.customers.findByCpfCnpj("20606235000131");
    consulta = {
      ok: true,
      detalhe: found ? `customer encontrado (id ${found.id})` : "nenhum customer com esse CNPJ",
    };
  } catch (e) {
    consulta = { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
  }

  // A leitura já provou credencial+ambiente. O que falha é a ESCRITA, então o
  // diagnóstico precisa exercitar a mesma cadeia da cobrança: criar o customer.
  // `?criar=1` porque isto ESCREVE no gateway (idempotente por CNPJ: o
  // ensureAsaasCustomer procura antes de criar, então repetir não duplica).
  let criacao: { tentada: boolean; ok?: boolean; detalhe?: string } = { tentada: false };
  if (criar) {
    try {
      const { ensureAsaasCustomer } = await import("@/services/asaas-customer.service");
      const r = await ensureAsaasCustomer(companyId);
      criacao = {
        tentada: true,
        ok: true,
        detalhe: `customer ${r.asaasCustomerId} (${r.created ? "criado agora" : "já existia"})`,
      };
    } catch (e) {
      criacao = {
        tentada: true,
        ok: false,
        detalhe: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      };
    }
  }

  return NextResponse.json({
    ok: consulta.ok,
    keyPresente: true,
    criacao,
    // 11 chars: mostra o FORMATO ($aact_prod_, $aact_YTU…) sem identificar a chave.
    keyPrefixo: key.slice(0, 11),
    keyTamanho: key.length,
    prefixoReconhecidoComoProd: isProdPrefix,
    asaasApiUrlExplicita: explicitUrl,
    baseUrlResolvida,
    apontandoPara: baseUrlResolvida.includes("sandbox") ? "SANDBOX" : "PRODUÇÃO",
    consulta,
  });
}
