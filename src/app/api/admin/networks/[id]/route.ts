import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

/**
 * GET /api/admin/networks/[id]
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const network = await prisma.network.findUnique({
    where: { id },
    include: {
      companies: {
        select: {
          id: true, name: true, cnpj: true, isBlocked: true, createdAt: true,
          _count: { select: { sales: true, products: true, customers: true } },
        },
      },
      headquarters: { select: { id: true, name: true } },
    },
  });

  if (!network) return NextResponse.json({ error: "Rede não encontrada" }, { status: 404 });

  return NextResponse.json({ success: true, data: network });
}

/**
 * PATCH /api/admin/networks/[id]
 * Atualizar configurações da rede
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, sharedCatalog, sharedCustomers, sharedPricing, sharedSuppliers } = body;

    const network = await prisma.network.findUnique({ where: { id } });
    if (!network) return NextResponse.json({ error: "Rede não encontrada" }, { status: 404 });

    const updated = await prisma.network.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(sharedCatalog !== undefined && { sharedCatalog }),
        ...(sharedCustomers !== undefined && { sharedCustomers }),
        ...(sharedPricing !== undefined && { sharedPricing }),
        ...(sharedSuppliers !== undefined && { sharedSuppliers }),
      },
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "NETWORK_UPDATED",
        metadata: { networkId: id },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[ADMIN-NETWORKS] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * POST /api/admin/networks/[id]
 * Ações: add-company, remove-company, delete
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      case "add-company": {
        const { companyId } = body;
        if (!companyId) return NextResponse.json({ error: "companyId é obrigatório" }, { status: 400 });

        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { networkId: true, name: true },
        });
        if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
        if (company.networkId) {
          return NextResponse.json({ error: `"${company.name}" já pertence a uma rede` }, { status: 400 });
        }

        await prisma.company.update({
          where: { id: companyId },
          data: { networkId: id },
        });

        return NextResponse.json({ success: true, message: `"${company.name}" adicionada à rede` });
      }

      case "remove-company": {
        const { companyId } = body;
        if (!companyId) return NextResponse.json({ error: "companyId é obrigatório" }, { status: 400 });

        await prisma.company.update({
          where: { id: companyId },
          data: { networkId: null, isHeadquarters: false },
        });

        return NextResponse.json({ success: true, message: "Empresa removida da rede" });
      }

      case "delete": {
        // Remover todas as empresas da rede e deletar
        await prisma.$transaction(async (tx) => {
          await tx.company.updateMany({
            where: { networkId: id },
            data: { networkId: null, isHeadquarters: false },
          });
          await tx.network.delete({ where: { id } });
        });

        return NextResponse.json({ success: true, message: "Rede removida" });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    console.error("[ADMIN-NETWORKS] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
