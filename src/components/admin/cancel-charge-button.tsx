"use client";

/**
 * Botão de CANCELAR COBRANÇA no Asaas (fatura não paga).
 *
 * A confirmação é EXPLÍCITA e não é um `window.confirm`: a ação é irreversível
 * (o `DELETE /payments/{id}` do Asaas não volta atrás, e recriar gera outro
 * `paymentId`/QR Code), então o gesto exige ler o que vai acontecer e digitar
 * `CANCELAR`. Um clique solto — ou um `confirm()` que o operador aperta Enter
 * por reflexo — é justamente o que não pode acontecer aqui.
 *
 * O botão só aparece quando a fatura está num status cancelável; o servidor
 * repete TODAS as guardas (a UI não é gate).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CancelChargeButtonProps {
  invoiceId: string;
  /** Número humano da fatura (INV-000004), só para o texto da confirmação. */
  invoiceNumber?: string | null;
  /** Total em CENTAVOS. */
  totalCents: number;
  /** `Invoice.asaasPaymentId` — mostrado para o operador conferir. */
  asaasPaymentId?: string | null;
}

export const CONFIRM_WORD = "CANCELAR";

/**
 * A confirmação digitada libera a ação?
 *
 * Função PURA e EXPORTADA de propósito. O guarda equivalente dentro do handler
 * (`if (!armed …) return`) é inalcançável por teste de DOM: o React reaplica o
 * `disabled` no botão antes de o clique chegar, então o jsdom simplesmente não
 * entrega o evento — uma sabotagem que remove esse guarda passa por TODOS os
 * testes de clique (verificado por mutação). Extraindo a regra, a invariante
 * "só a palavra exata arma" fica exercitável de verdade, em vez de coberta por
 * acidente pelo atributo HTML.
 */
export function isConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function CancelChargeButton({
  invoiceId,
  invoiceNumber,
  totalCents,
  asaasPaymentId,
}: CancelChargeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");

  const armed = isConfirmed(typed);

  function close() {
    setOpen(false);
    setTyped("");
  }

  async function run() {
    // 🔎 SOBREVIVENTE DE MUTAÇÃO, DOCUMENTADO: remover o `!armed` daqui NÃO
    // quebra nenhum teste. Não é buraco de cobertura — é redundância de fato
    // inalcançável por teste de DOM: o React reaplica `disabled` no botão antes
    // do clique dispachar, então o jsdom nunca entrega o evento com o estado
    // desarmado. A REGRA em si está coberta em dois pontos independentes
    // (`isConfirmed` como unidade, e o binding `disabled={!armed || loading}`),
    // e as duas sabotagens correspondentes morrem. Esta linha fica como 2ª
    // tranca para o dia em que o `disabled` sumir num redesign.
    if (!armed || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/cancel-charge`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (data.outcome === "already_canceled") {
          toast.success("Fatura já estava cancelada.");
        } else if (data.gateway === "already_gone") {
          toast.success("Cobrança já não existia no Asaas. Fatura cancelada.");
        } else if (data.gateway === "no_charge") {
          toast.success("Fatura cancelada (não havia cobrança no Asaas).");
        } else {
          toast.success("Cobrança cancelada no Asaas.");
        }
        close();
        router.refresh();
      } else {
        toast.error(data.error || "Erro ao cancelar a cobrança");
      }
    } catch {
      toast.error("Erro ao cancelar a cobrança");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        className="text-xs text-red-500 hover:text-red-400 underline"
      >
        Cancelar cobrança
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar cobrança"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-foreground shadow-xl">
            <h2 className="text-lg font-semibold">Cancelar cobrança no Asaas</h2>

            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                Fatura <strong className="text-foreground">{invoiceNumber || invoiceId.slice(0, 8)}</strong> —{" "}
                <strong className="text-foreground">{brl(totalCents)}</strong>
              </p>
              {asaasPaymentId && (
                <p className="font-mono text-xs break-all">Cobrança: {asaasPaymentId}</p>
              )}
            </div>

            <p className="rounded-md border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
              Isto REMOVE a cobrança no Asaas. É irreversível: o PIX/boleto do cliente
              deixa de funcionar e não dá para reativar — recriar gera outro código.
              Só funciona em cobrança NÃO paga; para fatura paga, o caminho é estorno.
            </p>

            <label className="block text-sm">
              <span className="text-muted-foreground">
                Digite <strong className="text-foreground">{CONFIRM_WORD}</strong> para confirmar
              </span>
              <input
                type="text"
                aria-label={`Digite ${CONFIRM_WORD} para confirmar`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"
              />
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={run}
                disabled={!armed || loading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Cancelando…" : "Cancelar cobrança"}
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
