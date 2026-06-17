import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { listDocs, createDoc } from "@/services/lens-knowledge.service";

/**
 * GET /api/admin/lens-knowledge
 * Lista os docs de conhecimento de lentes (globais + por ótica). Super-admin.
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data = await listDocs();
  return NextResponse.json({ data });
}

/**
 * POST /api/admin/lens-knowledge
 * Cria um doc. companyId string = ótica específica; null = global. Super-admin.
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();

  if (
    !(typeof body.title === "string" && body.title.trim()) ||
    !(typeof body.content === "string" && body.content.trim())
  ) {
    return NextResponse.json({ error: "Título e conteúdo são obrigatórios" }, { status: 400 });
  }

  const companyId = typeof body.companyId === "string" ? body.companyId : null; // null = global

  const doc = await createDoc({
    title: body.title.trim(),
    content: body.content,
    companyId,
    createdByAdminId: admin.id,
  });
  return NextResponse.json({ data: doc });
}
