"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { ModalFinalizarVenda } from "@/components/pdv/modal-finalizar-venda";
import toast from "react-hot-toast";

interface Payment {
  id: string;
  method: string;
  amount: number;
  installments?: number;
}

interface ConvertQuoteButtonProps {
  quoteId: string;
  quoteTotal: number;
  quoteStatus: string;
  validUntil: Date;
  disabled?: boolean;
}

/**
 * Botão para converter orçamento aprovado em venda (B1)
 *
 * Funcionalidades:
 * - Visível apenas se status === 'APPROVED'
 * - Verifica se orçamento não expirou
 * - Abre modal de pagamento (reutilizado do PDV)
 * - Chama POST /api/quotes/[id]/convert
 * - Redireciona para venda criada ou mostra erro
 */
export function ConvertQuoteButton({
  quoteId,
  quoteTotal,
  quoteStatus,
  validUntil,
  disabled = false,
}: ConvertQuoteButtonProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  // Verificar se orçamento pode ser convertido
  const canConvert = () => {
    if (quoteStatus !== "APPROVED") {
      toast.error("Orçamento deve estar APROVADO para conversão");
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(validUntil);
    expiryDate.setHours(0, 0, 0, 0);

    if (expiryDate < today) {
      toast.error(
        `Orçamento expirado. Válido até: ${new Date(validUntil).toLocaleDateString("pt-BR")}`
      );
      return false;
    }

    return true;
  };

  const handleOpenModal = () => {
    if (canConvert()) {
      setModalOpen(true);
    }
  };

  const handleConfirmConversion = async (payments: Payment[]) => {
    setConverting(true);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payments: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            installments: p.installments || 1,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao converter orçamento");
      }

      // Sucesso!
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-semibold">Orçamento convertido com sucesso!</p>
            <p className="text-sm text-muted-foreground">
              Venda #{data.sale?.id?.substring(0, 8)} criada
            </p>
          </div>
        </div>,
        { duration: 5000 }
      );

      setModalOpen(false);

      // Redirecionar para a venda criada
      if (data.sale?.id) {
        router.push(`/dashboard/vendas/${data.sale.id}`);
      } else {
        // Ou recarregar a página para atualizar o status do orçamento
        router.refresh();
      }
    } catch (error: any) {
      console.error("Erro ao converter orçamento:", error);
      toast.error(error.message || "Erro ao converter orçamento");
    } finally {
      setConverting(false);
    }
  };

  // Não renderizar se não for APPROVED
  if (quoteStatus !== "APPROVED") {
    return null;
  }

  return (
    <>
      <Button
        size="lg"
        onClick={handleOpenModal}
        disabled={disabled || converting}
        className="gap-2"
      >
        {converting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Convertendo...
          </>
        ) : (
          <>
            <CreditCard className="h-5 w-5" />
            Converter em Venda
          </>
        )}
      </Button>

      <ModalFinalizarVenda
        open={modalOpen}
        onOpenChange={setModalOpen}
        total={quoteTotal}
        onConfirm={handleConfirmConversion}
        loading={converting}
      />
    </>
  );
}
