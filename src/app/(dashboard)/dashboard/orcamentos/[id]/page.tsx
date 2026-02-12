"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Loader2,
  Edit,
  Printer,
  CheckCircle2,
  XCircle,
  Send,
  ShoppingCart,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DetalhesOrcamentoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchQuote();
  }, [id]);

  const fetchQuote = async () => {
    try {
      const res = await fetch(`/api/quotes/${id}`);
      if (!res.ok) throw new Error("Erro ao carregar orçamento");
      const data = await res.json();
      setQuote(data);
    } catch (error: any) {
      toast.error(error.message);
      router.push("/dashboard/orcamentos");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/quotes/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar status");

      toast.success(`Status atualizado para ${newStatus}`);
      fetchQuote();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    const finalReason = cancelReason === "Outro" ? otherReason : cancelReason;

    if (!finalReason) {
      toast.error("Selecione um motivo");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/quotes/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lostReason: finalReason }),
      });

      if (!res.ok) throw new Error("Erro ao cancelar orçamento");

      toast.success("Orçamento cancelado");
      setCancelModalOpen(false);
      fetchQuote();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      PENDING: { label: "Pendente", className: "bg-blue-100 text-blue-800" },
      SENT: { label: "Enviado", className: "bg-purple-100 text-purple-800" },
      APPROVED: { label: "Aprovado", className: "bg-green-100 text-green-800" },
      CONVERTED: { label: "Convertido", className: "bg-teal-100 text-teal-800" },
      EXPIRED: { label: "Expirado", className: "bg-orange-100 text-orange-800" },
      CANCELLED: { label: "Cancelado", className: "bg-red-100 text-red-800" },
      OPEN: { label: "Aberto", className: "bg-blue-100 text-blue-800" },
      CANCELED: { label: "Cancelado", className: "bg-red-100 text-red-800" },
    };
    const config = configs[status] || configs.PENDING;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!quote) return null;

  const canEdit = ["PENDING", "SENT", "OPEN"].includes(quote.status);
  const canApprove = ["PENDING", "SENT"].includes(quote.status);
  const canConvert = quote.status === "APPROVED";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Orçamento #{quote.id.substring(0, 8)}</h1>
            <div className="flex items-center gap-2 mt-1">
              {getStatusBadge(quote.status)}
              <span className="text-sm text-muted-foreground">
                Criado em {format(new Date(quote.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <Card>
        <CardHeader>
          <CardTitle>Ações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => router.push(`/dashboard/orcamentos/${id}/editar`)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}

          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>

          {canApprove && (
            <>
              <Button variant="outline" onClick={() => handleStatusChange("SENT")}>
                <Send className="h-4 w-4 mr-2" />
                Marcar como Enviado
              </Button>
              <Button variant="default" onClick={() => handleStatusChange("APPROVED")}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aprovar
              </Button>
            </>
          )}

          {canConvert && (
            <Button onClick={() => router.push(`/dashboard/pdv?quoteId=${id}`)}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Converter em Venda
            </Button>
          )}

          {!["CONVERTED", "CANCELLED", "CANCELED"].includes(quote.status) && (
            <Button variant="destructive" onClick={() => setCancelModalOpen(true)}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Convertido */}
      {quote.convertedToSale && (
        <Card className="border-teal-200 bg-teal-50">
          <CardContent className="p-4">
            <p className="text-sm">
              ✅ Este orçamento foi convertido em venda.{" "}
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => router.push(`/dashboard/vendas/${quote.convertedToSale.id}`)}
              >
                Ver venda
              </Button>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cliente */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Nome:</span>
              <p className="font-semibold">{quote.customer?.name || quote.customerName}</p>
            </div>
            {quote.customer?.phone && (
              <div>
                <span className="text-sm text-muted-foreground">Telefone:</span>
                <p>{quote.customer.phone}</p>
              </div>
            )}
            {quote.customer?.email && (
              <div>
                <span className="text-sm text-muted-foreground">Email:</span>
                <p>{quote.customer.email}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Válido até:</span>
              <p className="font-semibold">
                {format(new Date(quote.validUntil), "dd/MM/yyyy")}
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Vendedor:</span>
              <p>{quote.sellerUser.name}</p>
            </div>
            {quote.branch && (
              <div>
                <span className="text-sm text-muted-foreground">Filial:</span>
                <p>{quote.branch.name}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Itens */}
      <Card>
        <CardHeader>
          <CardTitle>Itens do Orçamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-center p-3 w-20">Qtd</th>
                  <th className="text-right p-3 w-32">Preço Unit.</th>
                  <th className="text-right p-3 w-32">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item: any) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-3">
                      {item.description}
                      {item.product && (
                        <span className="text-sm text-muted-foreground block">
                          SKU: {item.product.sku}
                        </span>
                      )}
                    </td>
                    <td className="text-center p-3">{item.qty || item.quantity}</td>
                    <td className="text-right p-3">{formatCurrency(item.unitPrice)}</td>
                    <td className="text-right p-3 font-semibold">
                      {formatCurrency(item.total || item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2">
                <tr>
                  <td colSpan={3} className="p-3 text-right font-semibold">
                    Subtotal:
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {formatCurrency(quote.subtotal)}
                  </td>
                </tr>
                {quote.discountTotal > 0 && (
                  <tr className="text-red-600">
                    <td colSpan={3} className="p-3 text-right font-semibold">
                      Desconto:
                    </td>
                    <td className="p-3 text-right font-semibold">
                      - {formatCurrency(quote.discountTotal)}
                    </td>
                  </tr>
                )}
                <tr className="bg-muted">
                  <td colSpan={3} className="p-3 text-right text-lg font-bold">
                    TOTAL:
                  </td>
                  <td className="p-3 text-right text-lg font-bold text-primary">
                    {formatCurrency(quote.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Receita */}
      {quote.items.some((item: any) => item.prescriptionData) && (
        <Card>
          <CardHeader>
            <CardTitle>Dados da Receita</CardTitle>
          </CardHeader>
          <CardContent>
            {quote.items.map((item: any) => {
              if (!item.prescriptionData) return null;
              const rx = item.prescriptionData;
              return (
                <div key={item.id} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Olho Direito (OD)</h4>
                      <div className="text-sm space-y-1">
                        {rx.od?.esf && <p>Esférico: {rx.od.esf}</p>}
                        {rx.od?.cil && <p>Cilíndrico: {rx.od.cil}</p>}
                        {rx.od?.eixo && <p>Eixo: {rx.od.eixo}</p>}
                        {rx.od?.dnp && <p>DNP: {rx.od.dnp}</p>}
                        {rx.od?.altura && <p>Altura: {rx.od.altura}</p>}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Olho Esquerdo (OE)</h4>
                      <div className="text-sm space-y-1">
                        {rx.oe?.esf && <p>Esférico: {rx.oe.esf}</p>}
                        {rx.oe?.cil && <p>Cilíndrico: {rx.oe.cil}</p>}
                        {rx.oe?.eixo && <p>Eixo: {rx.oe.eixo}</p>}
                        {rx.oe?.dnp && <p>DNP: {rx.oe.dnp}</p>}
                        {rx.oe?.altura && <p>Altura: {rx.oe.altura}</p>}
                      </div>
                    </div>
                  </div>
                  {(rx.adicao || rx.tipoLente || rx.material) && (
                    <div className="border-t pt-4">
                      {rx.adicao && <p className="text-sm">Adição: {rx.adicao}</p>}
                      {rx.tipoLente && <p className="text-sm">Tipo: {rx.tipoLente}</p>}
                      {rx.material && <p className="text-sm">Material: {rx.material}</p>}
                      {rx.tratamentos && rx.tratamentos.length > 0 && (
                        <p className="text-sm">
                          Tratamentos: {rx.tratamentos.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Observações */}
      {(quote.notes || quote.paymentConditions) && (
        <Card>
          <CardHeader>
            <CardTitle>Observações e Condições</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {quote.paymentConditions && (
              <div>
                <h4 className="font-semibold mb-2">Condições de Pagamento:</h4>
                <p className="text-sm whitespace-pre-wrap">{quote.paymentConditions}</p>
              </div>
            )}
            {quote.notes && (
              <div>
                <h4 className="font-semibold mb-2">Observações:</h4>
                <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de Cancelamento */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Orçamento</DialogTitle>
            <DialogDescription>
              Por que o cliente não fechou? Essa informação ajuda a melhorar suas vendas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              {["Preço alto", "Comprou em concorrente", "Cliente desistiu", "Produto indisponível", "Outro"].map((reason) => (
                <div key={reason} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id={reason}
                    name="cancelReason"
                    value={reason}
                    checked={cancelReason === reason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor={reason} className="cursor-pointer">{reason}</Label>
                </div>
              ))}
            </div>

            {cancelReason === "Outro" && (
              <div>
                <Label>Especifique o motivo:</Label>
                <Textarea
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder="Digite o motivo..."
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelModalOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={actionLoading || !cancelReason}
            >
              {actionLoading ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
