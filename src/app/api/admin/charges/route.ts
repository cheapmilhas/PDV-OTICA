import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { createManualCharge } from "@/services/manual-charge.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/charges" });
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  companyId: z.string().min(1),
  amount: z.number().int().positive(),
  description: z.string().min(1),
  source: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const scope = await requireCompanyScope(admin.id, body.companyId);
  if (!scope) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const result = await createManualCharge({
      companyId: body.companyId,
      amount: body.amount,
      description: body.description,
      source: body.source,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      adminId: admin.id,
    });
    log.info("cobrança avulsa criada", {
      invoiceId: result.invoiceId,
      adminId: admin.id,
      emailStatus: result.emailStatus,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("CPF/CNPJ")) {
      return NextResponse.json(
        { error: "Cadastre o CNPJ/CPF da empresa antes de cobrar" },
        { status: 400 }
      );
    }
    if (msg.includes("assinatura")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    log.error("Erro ao criar cobrança avulsa", { adminId: admin.id, error: msg });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
