import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { TagCategory } from "@prisma/client";

// PATCH /api/admin/tags/[id] — atualiza tag
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { name, color, category } = body;

  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) return NextResponse.json({ error: "Tag não encontrada" }, { status: 404 });

  if (name && name.trim() !== tag.name) {
    const existing = await prisma.tag.findUnique({ where: { name: name.trim() } });
    if (existing) return NextResponse.json({ error: "Tag com esse nome já existe" }, { status: 400 });
  }

  const updated = await prisma.tag.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(color && { color }),
      ...(category && { category: category as TagCategory }),
    },
  });

  return NextResponse.json({ tag: updated });
}

// DELETE /api/admin/tags/[id] — remove tag
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) return NextResponse.json({ error: "Tag não encontrada" }, { status: 404 });

  await prisma.tag.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
