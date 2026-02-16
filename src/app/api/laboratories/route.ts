import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/laboratories
 * Lista laboratorios da empresa com busca e filtro de status
 *
 * Query params:
 * - search: string (busca em nome, cnpj, email, contactPerson)
 * - status: "ativos" | "inativos" | "todos" (default: "ativos")
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "ativos";

    // Filtro de status
    const activeFilter =
      status === "ativos"
        ? { active: true }
        : status === "inativos"
          ? { active: false }
          : {};

    // Filtro de busca
    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { cnpj: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { contactPerson: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const labs = await prisma.lab.findMany({
      where: {
        companyId,
        ...activeFilter,
        ...searchFilter,
      },
      orderBy: {
        name: "asc",
      },
    });

    // Serializa Decimals para number
    const serializedLabs = labs.map((lab) => ({
      ...lab,
      defaultDiscount: Number(lab.defaultDiscount),
      qualityRating: lab.qualityRating ? Number(lab.qualityRating) : null,
    }));

    return NextResponse.json({
      success: true,
      data: serializedLabs,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/laboratories
 * Cria novo laboratorio
 *
 * Body: { name, cnpj?, phone?, email?, contactPerson?, defaultLeadTimeDays?, urgentLeadTimeDays?, ... }
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();

    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Nome e obrigatorio" } },
        { status: 400 }
      );
    }

    const lab = await prisma.lab.create({
      data: {
        companyId,
        name: body.name.trim(),
        code: body.code?.trim() || null,
        cnpj: body.cnpj?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        orderEmail: body.orderEmail?.trim() || null,
        website: body.website?.trim() || null,
        contactPerson: body.contactPerson?.trim() || null,
        integrationType: body.integrationType?.trim() || null,
        apiUrl: body.apiUrl?.trim() || null,
        apiKey: body.apiKey?.trim() || null,
        clientCode: body.clientCode?.trim() || null,
        defaultLeadTimeDays: body.defaultLeadTimeDays ?? 7,
        urgentLeadTimeDays: body.urgentLeadTimeDays ?? 3,
        paymentTermDays: body.paymentTermDays ?? 30,
        defaultDiscount: body.defaultDiscount ?? 0,
      },
    });

    const serializedLab = {
      ...lab,
      defaultDiscount: Number(lab.defaultDiscount),
      qualityRating: lab.qualityRating ? Number(lab.qualityRating) : null,
    };

    return NextResponse.json(
      { success: true, data: serializedLab },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
