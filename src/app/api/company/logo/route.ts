import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/company/logo
 * Upload logotipo da empresa
 *
 * Aceita: PNG, JPG, SVG
 * Tamanho máximo: 2MB
 * Salva como base64 (Data URL) no banco
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("company.settings");

    const formData = await request.formData();
    const file = formData.get("logo") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Validar tipo
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: "Tipo de arquivo inválido. Use PNG, JPG ou SVG." },
        { status: 400 }
      );
    }

    // Validar tamanho (2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, message: "Arquivo muito grande. Máximo: 2MB" },
        { status: 400 }
      );
    }

    // Converter para base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Atualizar banco
    const settings = await prisma.companySettings.upsert({
      where: { companyId },
      create: {
        companyId,
        logoUrl: dataUrl,
      },
      update: {
        logoUrl: dataUrl,
      },
    });

    return NextResponse.json({
      success: true,
      data: { logoUrl: settings.logoUrl },
      message: "Logo atualizada com sucesso!",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/company/logo
 * Remove logotipo da empresa
 */
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("company.settings");

    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
    });

    if (!settings?.logoUrl) {
      return NextResponse.json(
        { success: false, message: "Nenhuma logo cadastrada" },
        { status: 404 }
      );
    }

    // Remover do banco
    await prisma.companySettings.update({
      where: { companyId },
      data: { logoUrl: null },
    });

    return NextResponse.json({
      success: true,
      message: "Logo removida com sucesso!",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/company/logo
 * Retorna URL da logo
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { logoUrl: true },
    });

    return NextResponse.json({
      success: true,
      data: { logoUrl: settings?.logoUrl || null },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
