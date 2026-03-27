import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { TagCategory } from "@prisma/client";

// GET /api/admin/tags — lista todas as tags
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { companies: true, tickets: true } },
    },
  });

  return NextResponse.json({ tags });
}

// POST /api/admin/tags — cria nova tag
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { name, color, category } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const existing = await prisma.tag.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Tag com esse nome já existe" }, { status: 400 });
  }

  const tag = await prisma.tag.create({
    data: {
      name: name.trim(),
      color: color ?? "#6B7280",
      category: (category as TagCategory) ?? TagCategory.GENERAL,
    },
  });

  return NextResponse.json({ tag }, { status: 201 });
}
