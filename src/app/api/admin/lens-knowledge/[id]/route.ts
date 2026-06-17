import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { updateDoc, deleteDoc } from "@/services/lens-knowledge.service";

/**
 * PATCH /api/admin/lens-knowledge/[id]
 * Edita um doc (title/content) ou ativa/desativa (active). Super-admin.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const patch: { title?: string; content?: string; active?: boolean } = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.content === "string") patch.content = body.content;
  if (typeof body.active === "boolean") patch.active = body.active;

  const data = await updateDoc(id, patch);
  return NextResponse.json({ data });
}

/**
 * DELETE /api/admin/lens-knowledge/[id]
 * Remove um doc de conhecimento de lentes. Super-admin.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const { id } = await params;
  await deleteDoc(id);
  return NextResponse.json({ data: { ok: true } });
}
