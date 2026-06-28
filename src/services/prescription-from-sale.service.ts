import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { upsertPrescription } from "./livro-receitas.service";

const log = logger.child({ service: "prescription-from-sale" });

/** Tipos de produto que caracterizam lente (mesmo gatilho da OS). */
const LENS_PRODUCT_TYPES = ["OPHTHALMIC_LENS", "CONTACT_LENS", "LENS_SERVICE"];

/**
 * Regra "venda → receita" do Livro de Receitas.
 *
 * Dada uma venda, decide se ela gera receita: tem ao menos 1 item LENTE OU 1
 * item marcado como exame de vista (`product.isEyeExam`). Em caso afirmativo e
 * havendo cliente, cria/atualiza UMA receita ligada à venda (upsert por saleId).
 *
 * A receita nasce SEM grau (status AGUARDANDO_GRAU) — o grau chega depois, pela
 * OS (espelho) ou pela tela do Livro. Pura quanto a efeitos: só toca o banco.
 *
 * Deve ser chamada PÓS-COMMIT da venda, em try/catch que não reverte a venda.
 */
export async function createPrescriptionFromSale(
  saleId: string,
  companyId: string,
  userId: string
): Promise<{ created: boolean; prescriptionId: string | null }> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, companyId },
    select: {
      id: true,
      customerId: true,
      branchId: true,
      createdAt: true,
      items: {
        select: { product: { select: { type: true, isEyeExam: true } } },
      },
    },
  });

  if (!sale) return { created: false, prescriptionId: null };

  const triggers = sale.items.some(
    (it) =>
      it.product &&
      ((it.product.type && LENS_PRODUCT_TYPES.includes(it.product.type)) ||
        it.product.isEyeExam === true)
  );

  if (!triggers) return { created: false, prescriptionId: null };

  // Venda de lente/exame sem cliente: não dá pra ancorar a receita. Skip
  // silencioso (warn, não error) — alinhado ao gating já existente da OS.
  if (!sale.customerId) {
    log.warn("Receita não criada: venda de lente/exame sem cliente", { saleId });
    return { created: false, prescriptionId: null };
  }

  const rx = await upsertPrescription({
    companyId,
    customerId: sale.customerId,
    branchId: sale.branchId,
    saleId: sale.id,
    // A receita é emitida na data da VENDA, não na data em que este disparo roda
    // (pós-commit pode ocorrer noutro instante). Mantém o Livro com a data real.
    issuedAt: sale.createdAt,
    createdByUserId: userId,
  });

  return { created: true, prescriptionId: rx.id };
}
