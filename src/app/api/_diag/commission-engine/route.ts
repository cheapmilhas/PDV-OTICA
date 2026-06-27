import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireRole, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getCommissionEngine } from "@/lib/commission-flag";

/**
 * ⚠️ ENDPOINT DE DIAGNÓSTICO TEMPORÁRIO — REMOVER ANTES DO MERGE NA MAIN.
 *
 * Read-only, ADMIN-only. Existe só para confirmar, em runtime no Preview, POR QUE
 * a Atacadão resolve para "legacy" apesar da env COMMISSION_ENGINE_NEW_COMPANIES.
 *
 * NÃO retorna NENHUM valor bruto de env, secret ou companyId — apenas fatos
 * derivados (booleano, tamanhos, hash parcial, modo resolvido). O array
 * `newSetTokenLens` revela comprimentos dos tokens parseados: um token de 27 em
 * vez de 25 = 2 aspas literais em volta do id (a causa suspeita).
 *
 * NÃO usar em produção. Deletar este arquivo antes do merge.
 */
export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const companyId = await getCompanyId();

    // Reparse local da env (mesmo algoritmo de commission-flag.getNewCompanyIds),
    // mas expondo só COMPRIMENTOS dos tokens — nunca os valores.
    const raw = process.env.COMMISSION_ENGINE_NEW_COMPANIES ?? "";
    const tokens = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const companyIdSha8 = crypto
      .createHash("sha256")
      .update(companyId)
      .digest("hex")
      .slice(0, 8);

    // sha8 de cada token, para comparar com companyIdSha8 sem expor o valor.
    const tokenSha8 = tokens.map((t) =>
      crypto.createHash("sha256").update(t).digest("hex").slice(0, 8)
    );

    return NextResponse.json({
      // fato central: o companyId da sessão está no Set parseado?
      inNewSet: new Set(tokens).has(companyId),
      // o que o motor resolve para esta ótica
      resolvedMode: getCommissionEngine(companyId),
      // tamanho da lista parseada
      newSetSize: tokens.length,
      // comprimentos dos tokens (25 = id limpo; 27 = id com 2 aspas)
      newSetTokenLens: tokens.map((t) => t.length),
      // hashes parciais p/ checar se ALGUM token bate com o companyId
      tokenSha8,
      companyIdSha8,
      // só o COMPRIMENTO do companyId da sessão (25 esperado), nunca o valor
      companyIdLen: companyId.length,
      // o global é exatamente "new"? (booleano, não o valor)
      globalIsNew: process.env.COMMISSION_ENGINE === "new",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
