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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
  MessageCircle,
  Phone,
  Mail,
  MapPin,
  FileText,
  Plus,
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

  // Follow-ups
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState({
    type: "CALL",
    notes: "",
    outcome: "",
    nextFollowUpAt: "",
  });
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  useEffect(() => {
    fetchQuote();
    fetchFollowUps();
  }, [id]);

  const fetchFollowUps = async () => {
    try {
      const res = await fetch(`/api/quotes/${id}/follow-ups`);
      if (res.ok) {
        const data = await res.json();
        setFollowUps(data.data || []);
      }
    } catch (error) {
      // silencioso
    }
  };

  const handleWhatsApp = async () => {
    if (!quote) return;

    const phone = (quote.customer?.phone || quote.customerPhone || "").replace(/\D/g, "");
    if (!phone) {
      toast.error("Cliente não tem telefone cadastrado");
      return;
    }

    const customerFirstName = (quote.customer?.name || quote.customerName || "Cliente").split(" ")[0];
    const total = formatCurrency(Number(quote.total || 0));
    const validUntil = quote.validUntil
      ? format(new Date(quote.validUntil), "dd/MM/yyyy", { locale: ptBR })
      : "consulte-nos";

    const items = (quote.items || [])
      .map((item: any) => `• ${item.description || item.product?.name}`)
      .join("\n");

    const message = encodeURIComponent(
      `Olá ${customerFirstName}! 👋\n\nSegue seu orçamento:\n\n${items}\n\n*Total: ${total}*\nVálido até: ${validUntil}\n\nFicou alguma dúvida? Estou à disposição! 😊`
    );

    window.open(`https://wa.me/55${phone}?text=${message}`, "_blank");

    // Registrar follow-up automaticamente
    try {
      await fetch(`/api/quotes/${id}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WHATSAPP",
          direction: "outbound",
          notes: "Orçamento enviado via WhatsApp",
        }),
      });
      fetchFollowUps();
      fetchQuote();
    } catch (error) {
      // não bloquear — WhatsApp já foi aberto
    }
  };

  const handleSaveFollowUp = async () => {
    if (!newFollowUp.type) return;
    setSavingFollowUp(true);
    try {
      const payload: any = {
        type: newFollowUp.type,
        notes: newFollowUp.notes || undefined,
        outcome: newFollowUp.outcome || undefined,
        nextFollowUpAt: newFollowUp.nextFollowUpAt
          ? new Date(newFollowUp.nextFollowUpAt).toISOString()
          : undefined,
      };

      const res = await fetch(`/api/quotes/${id}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Erro ao registrar contato");

      toast.success("Contato registrado!");
      setFollowUpModalOpen(false);
      setNewFollowUp({ type: "CALL", notes: "", outcome: "", nextFollowUpAt: "" });
      fetchFollowUps();
      fetchQuote();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingFollowUp(false);
    }
  };

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
      console.log("📤 Atualizando status para:", newStatus);
      const res = await fetch(`/api/quotes/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error("❌ Erro na resposta:", error);
        throw new Error(error.message || "Erro ao atualizar status");
      }

      toast.success(`Status atualizado para ${newStatus}`);
      fetchQuote();
    } catch (error: any) {
      console.error("❌ Erro completo:", error);
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

          <Button variant="outline" onClick={() => router.push(`/dashboard/orcamentos/${id}/imprimir`)}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>

          <Button
            variant="outline"
            className="border-green-500 text-green-600 hover:bg-green-50"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
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

      {/* CRM - Histórico de Contatos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Histórico de Contatos
              {quote.contactCount > 0 && (
                <Badge variant="secondary">{quote.contactCount} contato(s)</Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setFollowUpModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Registrar Contato
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Próximo follow-up agendado */}
          {quote.followUpDate && (
            <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm">
              📅 <strong>Próximo contato agendado:</strong>{" "}
              {format(new Date(quote.followUpDate), "dd/MM/yyyy", { locale: ptBR })}
              {quote.followUpNotes && (
                <p className="mt-1 text-muted-foreground">{quote.followUpNotes}</p>
              )}
            </div>
          )}

          {followUps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum contato registrado ainda</p>
              <p className="text-xs mt-1">Clique em "Registrar Contato" para iniciar o histórico</p>
            </div>
          ) : (
            <div className="space-y-3">
              {followUps.map((fu: any, i: number) => {
                const typeIcons: Record<string, string> = {
                  WHATSAPP_SENT: "📲", CALLED: "📞", EMAILED: "📧",
                  VISITED: "🏪", FOLLOW_UP: "📝",
                };
                const outcomeLabels: Record<string, string> = {
                  INTERESTED: "Interessado", ASKED_DISCOUNT: "Pediu desconto",
                  WILL_THINK: "Vai pensar", NO_ANSWER: "Não atendeu",
                  NOT_INTERESTED: "Sem interesse", SCHEDULED_RETURN: "Agendou retorno",
                  CONVERTED: "Converteu!",
                };
                const meta = fu.metadata || {};
                return (
                  <div key={fu.id || i} className="flex gap-3 p-3 rounded-lg border bg-gray-50">
                    <div className="text-2xl">{typeIcons[fu.action] || "📋"}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <span className="font-medium">{fu.user?.name || "Usuário"}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">
                          {format(new Date(fu.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                        {meta.outcome && (
                          <Badge variant={meta.outcome === "CONVERTED" ? "default" : "secondary"} className="text-xs">
                            {outcomeLabels[meta.outcome] || meta.outcome}
                          </Badge>
                        )}
                      </div>
                      {meta.notes && (
                        <p className="text-sm text-gray-700 mt-1">{meta.notes}</p>
                      )}
                      {meta.nextFollowUpAt && (
                        <p className="text-xs text-blue-600 mt-1">
                          📅 Próximo: {format(new Date(meta.nextFollowUpAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Registrar Contato */}
      <Dialog open={followUpModalOpen} onOpenChange={setFollowUpModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Contato</DialogTitle>
            <DialogDescription>
              Registre um contato com o cliente sobre este orçamento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Contato *</Label>
              <Select
                value={newFollowUp.type}
                onValueChange={(v) => setNewFollowUp({ ...newFollowUp, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">📲 WhatsApp</SelectItem>
                  <SelectItem value="CALL">📞 Ligação</SelectItem>
                  <SelectItem value="EMAIL">📧 Email</SelectItem>
                  <SelectItem value="VISIT">🏪 Visita à loja</SelectItem>
                  <SelectItem value="NOTE">📝 Anotação interna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resultado do Contato</Label>
              <Select
                value={newFollowUp.outcome}
                onValueChange={(v) => setNewFollowUp({ ...newFollowUp, outcome: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem resultado específico</SelectItem>
                  <SelectItem value="INTERESTED">Interessado</SelectItem>
                  <SelectItem value="ASKED_DISCOUNT">Pediu desconto</SelectItem>
                  <SelectItem value="WILL_THINK">Vai pensar</SelectItem>
                  <SelectItem value="NO_ANSWER">Não atendeu</SelectItem>
                  <SelectItem value="NOT_INTERESTED">Sem interesse</SelectItem>
                  <SelectItem value="SCHEDULED_RETURN">Agendou retorno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={newFollowUp.notes}
                onChange={(e) => setNewFollowUp({ ...newFollowUp, notes: e.target.value })}
                placeholder="O que foi conversado..."
                rows={3}
              />
            </div>
            <div>
              <Label>Agendar Próximo Contato (opcional)</Label>
              <Input
                type="date"
                value={newFollowUp.nextFollowUpAt}
                onChange={(e) => setNewFollowUp({ ...newFollowUp, nextFollowUpAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFollowUp} disabled={savingFollowUp}>
              {savingFollowUp ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
