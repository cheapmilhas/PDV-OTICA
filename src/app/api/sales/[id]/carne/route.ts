import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { generateCarnePDF } from "@/lib/pdf-utils";

/**
 * GET /api/sales/[id]/carne
 * Gera e retorna PDF do carnê de pagamento
 *
 * Validações:
 * - Venda deve existir e pertencer à empresa do usuário
 * - Venda deve ter pagamento com crediário (STORE_CREDIT)
 * - Deve ter parcelas criadas em AccountReceivable
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Buscar venda completa
    const sale = await prisma.sale.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
        payments: {
          where: { method: "STORE_CREDIT" },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venda não encontrada" },
        { status: 404 }
      );
    }

    // Verificar se tem cliente
    if (!sale.customer) {
      return NextResponse.json(
        { error: "Venda não possui cliente vinculado" },
        { status: 400 }
      );
    }

    // Verificar se tem pagamento com crediário
    if (!sale.payments.some((p) => p.method === "STORE_CREDIT")) {
      return NextResponse.json(
        { error: "Venda não foi realizada com crediário" },
        { status: 400 }
      );
    }

    // Buscar parcelas (contas a receber)
    const installments = await prisma.accountReceivable.findMany({
      where: { saleId: id, companyId },
      orderBy: { installmentNumber: "asc" },
    });

    if (installments.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma parcela encontrada para esta venda" },
        { status: 404 }
      );
    }

    // Buscar dados da empresa
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Dados da empresa não encontrados" },
        { status: 500 }
      );
    }

    // Gerar PDF
    const pdfBuffer = generateCarnePDF({
      sale: sale as any,
      company,
      installments,
    });

    // Retornar PDF
    const filename = `carne_venda_${sale.id.substring(0, 8)}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Erro ao gerar carnê:", error);
    return handleApiError(error);
  }
}
