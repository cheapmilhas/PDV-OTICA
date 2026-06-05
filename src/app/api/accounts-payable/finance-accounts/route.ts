import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/accounts-payable/finance-accounts
 *
 * Lista enxuta das contas financeiras (id, name, type, balance) usada APENAS
 * pelo modal de pagamento de contas a pagar — para o lojista escolher de onde
 * sai o dinheiro.
 *
 * Por que existe (e não reaproveita /api/finance/accounts): aquele endpoint é
 * gated pela feature `finance_accounts` (gestão de "Contas Financeiras"), mas
 * PAGAR uma conta NÃO é gated. Sem este endpoint, planos sem essa feature
 * recebiam 403 e ficavam impossibilitados de registrar pagamentos. Este
 * handler é intencionalmente NÃO-gated e somente-leitura.
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const accounts = await prisma.financeAccount.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, balance: true },
    });

    return NextResponse.json({
      success: true,
      data: accounts.map((a) => ({ ...a, balance: Number(a.balance) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
