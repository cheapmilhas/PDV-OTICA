import { StockMovementType } from "@prisma/client";
import { isStockIncrease, isStockDecrease } from "./validations/stock-movement.schema";

/**
 * Lógica PURA de decisão de movimentação de estoque (Fase 2 — prevenção de bugs).
 *
 * Extraída de stock-movement.service.create() para ser testável sem banco. Aqui
 * mora a decisão que JÁ ERROU nos bugs T7/T9: dado o tipo de movimento, se há
 * filial e se o produto é controlado, qual operação física aplicar ao estoque.
 *
 * O serviço apenas EXECUTA a operação que esta função decide — toda a regra de
 * "credita/debita/ajusta/ignora" e a assimetria entrada-vs-saída ficam aqui,
 * cobertas por testes.
 *
 * Regras (documentadas nos bugs):
 * - ADJUSTMENT: valor ABSOLUTO; reflete sempre (inventário físico), mesmo
 *   produto não-controlado.
 * - Entrada (PURCHASE/CUSTOMER_RETURN/TRANSFER_IN): credita SEMPRE, mesmo
 *   produto não-controlado (T9/H3 — entrada explícita move o saldo; senão some
 *   do PDV).
 * - Saída (SALE/LOSS/...): só debita produto CONTROLADO; não-controlado não
 *   baixa estoque (assimetria intencional — o débito guarda, o crédito não).
 */
export type StockOperation = "credit" | "debit" | "set-absolute" | "none";

export interface StockOperationInput {
  type: StockMovementType;
  stockControlled: boolean;
}

export function resolveStockOperation(input: StockOperationInput): StockOperation {
  const { type, stockControlled } = input;

  if (type === StockMovementType.ADJUSTMENT) {
    // Ajuste é contagem física: aplica o valor absoluto independente do flag.
    return "set-absolute";
  }

  if (isStockIncrease(type)) {
    // Entrada explícita credita sempre (controlado ou não).
    return "credit";
  }

  if (isStockDecrease(type)) {
    // Saída só baixa estoque de produto controlado.
    return stockControlled ? "debit" : "none";
  }

  return "none";
}

/**
 * Decisão de estorno de estoque no CANCELAMENTO de venda (bug T7).
 *
 * A venda só DEBITA produto controlado; portanto o cancelamento só pode
 * CREDITAR de volta produto controlado — senão o saldo sobe acima do original
 * (34 → 35). Simetria exata com o débito da venda.
 */
export function shouldRestockOnCancel(stockControlled: boolean): boolean {
  return stockControlled;
}
