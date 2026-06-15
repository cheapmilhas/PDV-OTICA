import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/whatsapp/history?type=&status=&limit=&cursor=
 *
 * Histórico de envios (WhatsappMessageLog) da ótica, mais recentes primeiro.
 * Gated por settings.edit + feature flag.
 */
export async function GET(request: Request) {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);

    const where: Prisma.WhatsappMessageLogWhereInput = { companyId };
    if (type) where.type = type as Prisma.WhatsappMessageLogWhereInput["type"];
    if (status) where.status = status as Prisma.WhatsappMessageLogWhereInput["status"];

    const rows = await prisma.whatsappMessageLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, type: true, status: true, skipReason: true, error: true,
        phone: true, content: true, createdAt: true, sentAt: true,
        customer: { select: { name: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((r) => ({
          id: r.id,
          type: r.type,
          status: r.status,
          skipReason: r.skipReason,
          error: r.error,
          phone: r.phone,
          content: r.content,
          customerName: r.customer?.name ?? null,
          createdAt: r.createdAt,
          sentAt: r.sentAt,
        })),
        nextCursor: hasMore ? items[items.length - 1].id : null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
