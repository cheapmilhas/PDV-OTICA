import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

/**
 * GET /api/admin/networks
 * Lista todas as redes
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const networks = await prisma.network.findMany({
    include: {
      companies: {
        select: { id: true, name: true, cnpj: true, isBlocked: true },
      },
      headquarters: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: networks });
}

/**
 * POST /api/admin/networks
 * Cria uma rede nova e vincula empresas
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, companyIds, sharedCatalog, sharedCustomers, sharedPricing, sharedSuppliers } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome da rede é obrigatório" }, { status: 400 });
    }
    if (!companyIds || companyIds.length < 2) {
      return NextResponse.json({ error: "Selecione pelo menos 2 empresas" }, { status: 400 });
    }

    // Verificar que as empresas existem e não estão em outra rede
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true, networkId: true },
    });

    if (companies.length !== companyIds.length) {
      return NextResponse.json({ error: "Uma ou mais empresas não encontradas" }, { status: 400 });
    }

    const alreadyInNetwork = companies.find((c) => c.networkId);
    if (alreadyInNetwork) {
      return NextResponse.json({
        error: `"${alreadyInNetwork.name}" já pertence a outra rede`,
      }, { status: 400 });
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const result = await prisma.$transaction(async (tx) => {
      const network = await tx.network.create({
        data: {
          name: name.trim(),
          slug,
          sharedCatalog: sharedCatalog ?? true,
          sharedCustomers: sharedCustomers ?? false,
          sharedPricing: sharedPricing ?? false,
          sharedSuppliers: sharedSuppliers ?? true,
          headquartersId: companyIds[0],
        },
      });

      // Vincular empresas
      for (const companyId of companyIds) {
        await tx.company.update({
          where: { id: companyId },
          data: {
            networkId: network.id,
            isHeadquarters: companyId === companyIds[0],
          },
        });
      }

      return network;
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "NETWORK_CREATED",
        metadata: { networkId: result.id, networkName: result.name, companyIds },
      },
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[ADMIN-NETWORKS] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
