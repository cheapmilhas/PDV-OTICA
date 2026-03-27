import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

// POST /api/admin/clientes/[id]/tags — associa tag à empresa
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;
  const { tagId } = await request.json();

  if (!tagId) return NextResponse.json({ error: "tagId é obrigatório" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) return NextResponse.json({ error: "Tag não encontrada" }, { status: 404 });

  const existing = await prisma.companyTag.findUnique({
    where: { companyId_tagId: { companyId, tagId } },
  });
  if (existing) return NextResponse.json({ error: "Tag já associada a esta empresa" }, { status: 400 });

  const companyTag = await prisma.companyTag.create({
    data: { companyId, tagId },
    include: { tag: true },
  });

  return NextResponse.json({ companyTag }, { status: 201 });
}

// DELETE /api/admin/clientes/[id]/tags — remove tag da empresa
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;
  const { tagId } = await request.json();

  if (!tagId) return NextResponse.json({ error: "tagId é obrigatório" }, { status: 400 });

  const existing = await prisma.companyTag.findUnique({
    where: { companyId_tagId: { companyId, tagId } },
  });
  if (!existing) return NextResponse.json({ error: "Associação não encontrada" }, { status: 404 });

  await prisma.companyTag.delete({ where: { id: existing.id } });

  return NextResponse.json({ success: true });
}
