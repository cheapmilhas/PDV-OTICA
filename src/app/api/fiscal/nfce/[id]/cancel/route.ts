import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { focusNfe, FocusNfeError } from "@/lib/focus-nfe";
import { handleApiError } from "@/lib/error-handler";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "fiscal/nfce/cancel" });

const cancelSchema = z.object({
  justificativa: z.string().min(15).max(255),
});

const MAX_CANCEL_MINUTES = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!process.env.FOCUS_NFE_TOKEN) {
      return NextResponse.json(
        { error: { code: "FISCAL_DISABLED", message: "Emissão fiscal não habilitada" } },
        { status: 503 },
      );
    }

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: { message: "Não autenticado" } }, { status: 401 });
    }
    const companyId = (session.user as { companyId?: string }).companyId;
    if (!companyId) {
      return NextResponse.json({ error: { message: "Empresa não vinculada" } }, { status: 400 });
    }

    const { id: saleId } = await params;
    const body = await request.json();
    const { justificativa } = cancelSchema.parse(body);

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId },
      select: {
        id: true,
        fiscalStatus: true,
        fiscalRef: true,
        fiscalEmittedAt: true,
      } as any,
    });

    const saleAny = sale as unknown as {
      id: string;
      fiscalStatus: string;
      fiscalRef: string | null;
      fiscalEmittedAt: Date | null;
    } | null;

    if (!saleAny) {
      return NextResponse.json({ error: { message: "Venda não encontrada" } }, { status: 404 });
    }

    if (saleAny.fiscalStatus !== "AUTHORIZED") {
      return NextResponse.json(
        { error: { message: "Só é possível cancelar NFC-e autorizada" } },
        { status: 400 },
      );
    }

    if (!saleAny.fiscalRef) {
      return NextResponse.json(
        { error: { message: "NFC-e sem referência fiscal" } },
        { status: 400 },
      );
    }

    // Regra SEFAZ: cancelamento até 30 minutos após autorização
    if (saleAny.fiscalEmittedAt) {
      const diffMin = (Date.now() - saleAny.fiscalEmittedAt.getTime()) / 60000;
      if (diffMin > MAX_CANCEL_MINUTES) {
        return NextResponse.json(
          {
            error: {
              message: `Prazo de cancelamento expirado. Limite: ${MAX_CANCEL_MINUTES}min após emissão.`,
            },
          },
          { status: 400 },
        );
      }
    }

    await focusNfe.cancel(saleAny.fiscalRef, { justificativa });

    await prisma.sale.update({
      where: { id: saleAny.id },
      data: {
        fiscalStatus: "CANCELED",
        fiscalCanceledAt: new Date(),
        fiscalCancelReason: justificativa,
      } as any,
    });

    log.info("NFC-e cancelada", { saleId: saleAny.id, ref: saleAny.fiscalRef });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof FocusNfeError) {
      return NextResponse.json(
        { error: { code: "SEFAZ_ERROR", message: err.message } },
        { status: 502 },
      );
    }
    return handleApiError(err);
  }
}
