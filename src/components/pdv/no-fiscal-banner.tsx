"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Banner discreto avisando que o sistema NÃO emite NFC-e.
 *
 * Mostrado no PDV enquanto a emissão fiscal não estiver habilitada
 * (FOCUS_NFE_TOKEN ausente ou filial sem fiscalEnabled).
 *
 * Cumpre dever de transparência conforme cláusula 2 dos Termos de Uso.
 */
export function NoFiscalBanner() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p>
        <strong>Esta venda não gera documento fiscal.</strong> A emissão de NFC-e/NF-e é
        responsabilidade do estabelecimento. Emita separadamente em seu sistema fiscal autorizado.
      </p>
    </div>
  );
}
