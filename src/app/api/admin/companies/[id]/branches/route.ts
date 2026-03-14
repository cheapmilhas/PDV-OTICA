import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

/**
 * GET /api/admin/companies/[id]/branches
 * Lista filiais de uma empresa (admin)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;

  const branches = await prisma.branch.findMany({
    where: { companyId },
    include: {
      _count: {
        select: {
          sales: true,
          serviceOrders: true,
          userBranches: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, data: branches });
}

/**
 * POST /api/admin/companies/[id]/branches
 * Cria nova filial para a empresa (admin)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;

  try {
    const body = await request.json();
    const { name, code, address, city, state, zipCode, phone, nfeSeries } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome da filial é obrigatório" }, { status: 400 });
    }

    // Verificar se a empresa existe
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, maxBranches: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    // Verificar limite de filiais
    const currentBranches = await prisma.branch.count({
      where: { companyId, active: true },
    });
    if (company.maxBranches !== -1 && currentBranches >= company.maxBranches) {
      return NextResponse.json({
        error: `Limite de filiais atingido (${company.maxBranches}). Faça upgrade do plano.`,
      }, { status: 403 });
    }

    // Verificar código único (se informado)
    if (code?.trim()) {
      const existingCode = await prisma.branch.findFirst({
        where: { companyId, code: code.trim() },
      });
      if (existingCode) {
        return NextResponse.json({ error: `Código "${code}" já está em uso` }, { status: 400 });
      }
    }

    // Criar filial
    const branch = await prisma.branch.create({
      data: {
        companyId,
        name: name.trim(),
        code: code?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        phone: phone?.trim() || null,
        nfeSeries: nfeSeries ? parseInt(nfeSeries, 10) : null,
      },
    });

    // Vincular todos os admins da empresa à nova filial
    const adminUsers = await prisma.user.findMany({
      where: { companyId, role: "ADMIN", active: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.userBranch.createMany({
        data: adminUsers.map((u) => ({ userId: u.id, branchId: branch.id })),
        skipDuplicates: true,
      });
    }

    // Audit log
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: "BRANCH_CREATED",
        metadata: { branchId: branch.id, branchName: branch.name },
      },
    });

    return NextResponse.json({ success: true, data: branch }, { status: 201 });
  } catch (error) {
    console.error("[ADMIN-BRANCHES] Erro ao criar filial:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
