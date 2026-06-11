"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { ModalFinalizarVenda } from "@/components/pdv/modal-finalizar-venda";
import { ManagerApprovalModal } from "@/components/pdv/manager-approval-modal";
import toast from "react-hot-toast";

interface Payment {
  id: string;
  method: string;
  amount: number;
  installments?: number;
}

const OVERRIDABLE_CODES = ["CREDIT_LIMIT_EXCEEDED", "CUSTOMER_OVERDUE", "INSUFFICIENT_STOCK"];

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
  const { data: session } = useSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  // Override de gerente para negativas autorizáveis.
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingConversion, setPendingConversion] = useState<{
    payments: Payment[];
    reasons: string[];
  } | null>(null);

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

  const handleConfirmConversion = async (
    payments: Payment[],
    _cashbackUsed?: number,
    override?: { approvedByUserId: string; reasons: string[] }
  ) => {
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
          ...(override && { override }),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const code: string | undefined =
          typeof data?.error === "object" ? data?.error?.code : undefined;
        const msg =
          (typeof data?.error === "string" && data.error) ||
          data?.error?.message ||
          data?.message ||
          `Erro ao converter orçamento (HTTP ${res.status})`;

        // Negativa autorizável e ainda sem override → pedir senha do gerente.
        if (code && OVERRIDABLE_CODES.includes(code) && !override) {
          setPendingConversion({ payments, reasons: [code] });
          setOverrideReason(msg);
          setOverrideModalOpen(true);
          setConverting(false);
          return;
        }

        const err = new Error(msg) as Error & { code?: string };
        err.code = code;
        throw err;
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

      // Aviso quando a OS automática NÃO nasceu mas era esperada (ex: orçamento de
      // lente sem cliente vinculado). Sem isto a falha era silenciosa — o vendedor
      // achava que a OS tinha sido criada. reason vem da API (createFromSale).
      if (data.serviceOrder && data.serviceOrder.created === false && data.serviceOrder.reason) {
        toast(
          `Venda criada, mas a Ordem de Serviço não foi gerada automaticamente: ${data.serviceOrder.reason} Você pode gerá-la manualmente na tela da venda.`,
          { icon: "⚠️", duration: 8000 }
        );
      }

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
      const titulos: Record<string, string> = {
        CREDIT_LIMIT_EXCEEDED: "🚫 Limite de crédito excedido",
        CUSTOMER_OVERDUE: "🚫 Cliente inadimplente",
        INSUFFICIENT_STOCK: "📦 Estoque insuficiente",
      };
      const t = error.code && titulos[error.code];
      toast.error(t ? `${t}\n${error.message}` : error.message || "Erro ao converter orçamento", {
        duration: t ? 7000 : 5000,
      });
    } finally {
      setConverting(false);
    }
  };

  // Gerente autorizou — reenvia a conversão com o override.
  const handleManagerApproved = (approvedByUserId: string) => {
    if (!pendingConversion) return;
    const { payments, reasons } = pendingConversion;
    setPendingConversion(null);
    setOverrideReason("");
    void handleConfirmConversion(payments, undefined, { approvedByUserId, reasons });
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

      <ManagerApprovalModal
        open={overrideModalOpen}
        onClose={() => {
          setOverrideModalOpen(false);
          setPendingConversion(null);
          setOverrideReason("");
        }}
        reason={overrideReason}
        currentUserId={session?.user?.id}
        onApproved={handleManagerApproved}
      />
    </>
  );
}
