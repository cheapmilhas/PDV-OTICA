"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { ArrowLeft, Trash2, Loader2, Plus } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface ServiceItem {
  description: string;
  qty: number;
  observations: string;
}

export default function EditarOrdemServicoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [laboratories, setLaboratories] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    expectedDate: "",
    laboratoryId: "",
    notes: "",
  });

  const [showPrescription, setShowPrescription] = useState(false);
  const [prescriptionData, setPrescriptionData] = useState({
    od: { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
    oe: { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
    adicao: "",
    tipoLente: "",
    material: "",
  });

  const [items, setItems] = useState<ServiceItem[]>([
    { description: "", qty: 1, observations: "" },
  ]);

  const [statusUpdate, setStatusUpdate] = useState({
    newStatus: "",
    statusNotes: "",
  });

  // Buscar dados da ordem e laboratórios
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const [orderRes, laboratoriesRes] = await Promise.all([
          fetch(`/api/service-orders/${id}`),
          fetch("/api/laboratories?status=ativos&pageSize=100"),
        ]);

        if (!orderRes.ok) throw new Error("Erro ao carregar ordem de serviço");

        const { data } = await orderRes.json();
        setOrder(data);

        if (laboratoriesRes.ok) {
          const labData = await laboratoriesRes.json();
          setLaboratories(labData.data || []);
        }

        // Preencher formulário
        setFormData({
          expectedDate: data.promisedDate
            ? new Date(data.promisedDate).toISOString().split("T")[0]
            : "",
          laboratoryId: data.laboratory?.id || "",
          notes: data.notes || "",
        });

        // Preencher receita (API returns prescriptionData as JSON object)
        if (data.prescriptionData) {
          try {
            const rx = typeof data.prescriptionData === "string"
              ? JSON.parse(data.prescriptionData)
              : data.prescriptionData;
            setPrescriptionData({
              od: rx.od || { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
              oe: rx.oe || { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
              adicao: rx.adicao || "",
              tipoLente: rx.tipoLente || "",
              material: rx.material || "",
            });
            setShowPrescription(true);
          } catch {
            // prescription is plain text, ignore
          }
        }

        // Preencher itens
        if (data.items && data.items.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              description: item.description || "",
              qty: item.qty || 1,
              observations: item.observations || "",
            }))
          );
        }

        setStatusUpdate({
          newStatus: data.status,
          statusNotes: "",
        });
      } catch (error: any) {
        toast.error(error.message);
        router.push("/dashboard/ordens-servico");
      } finally {
        setFetching(false);
      }
    };

    fetchOrder();
  }, [id, router]);

  const addItem = () => {
    setItems([...items, { description: "", qty: 1, observations: "" }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error("É necessário pelo menos 1 item/serviço");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ServiceItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  // Permite apenas números, ponto, vírgula (campos numéricos da receita)
  const sanitizeNumericField = (value: string) => {
    return value.replace(/[^0-9.,\-+]/g, "");
  };

  // Permite apenas números inteiros (eixo: 0-180)
  const sanitizeIntegerField = (value: string) => {
    return value.replace(/[^0-9]/g, "");
  };

  const numericFields = ["eixo", "dnp", "altura"];

  const updatePrescription = (eye: "od" | "oe", field: string, value: string) => {
    const sanitized = field === "eixo"
      ? sanitizeIntegerField(value)
      : numericFields.includes(field)
        ? sanitizeNumericField(value)
        : value;
    setPrescriptionData((prev) => ({
      ...prev,
      [eye]: { ...prev[eye], [field]: sanitized },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (items.some((item) => !item.description)) {
        throw new Error("Preencha a descrição de todos os itens");
      }

      const payload: any = {
        items: items.map((item) => ({
          description: item.description,
          qty: item.qty || 1,
          observations: item.observations || undefined,
        })),
      };

      if (formData.expectedDate) {
        payload.expectedDate = new Date(formData.expectedDate).toISOString();
      }

      payload.laboratoryId = formData.laboratoryId || undefined;
      payload.notes = formData.notes || undefined;

      // Montar receita se preenchida
      if (showPrescription && (prescriptionData.od.esf || prescriptionData.oe.esf)) {
        payload.prescription = JSON.stringify(prescriptionData);
      } else if (!showPrescription) {
        payload.prescription = undefined;
      }

      const res = await fetch(`/api/service-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao atualizar ordem de serviço");
      }

      toast.success("Ordem de serviço atualizada com sucesso!");
      router.push(`/dashboard/ordens-servico/${id}/detalhes`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (statusUpdate.newStatus === order.status) {
      toast.error("Selecione um novo status");
      return;
    }

    try {
      const payload: any = { status: statusUpdate.newStatus };
      if (statusUpdate.statusNotes) {
        payload.notes = statusUpdate.statusNotes;
      }

      const res = await fetch(`/api/service-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao atualizar status");
      }

      toast.success("Status atualizado com sucesso!");
      router.push(`/dashboard/ordens-servico/${id}/detalhes`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Tem certeza que deseja cancelar esta ordem de serviço?")) return;
    const reason = prompt("Motivo do cancelamento (opcional):");

    setCanceling(true);
    try {
      const res = await fetch(`/api/service-orders/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao cancelar ordem de serviço");
      }

      toast.success("Ordem de serviço cancelada com sucesso!");
      router.push("/dashboard/ordens-servico");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCanceling(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Rascunho",
      APPROVED: "Aprovado",
      SENT_TO_LAB: "Enviado Lab",
      IN_PROGRESS: "Em Progresso",
      READY: "Pronto",
      DELIVERED: "Entregue",
      CANCELED: "Cancelado",
    };
    return labels[status] || status;
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/ordens-servico/${id}/detalhes`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Editar Ordem de Serviço</h1>
            <p className="text-muted-foreground">Atualize os dados da ordem de serviço</p>
          </div>
        </div>
        <Badge variant="secondary">{getStatusLabel(order.status)}</Badge>
      </div>

      {/* Cliente Info (Read-only) */}
      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-semibold">{order.customer.name}</p>
          {order.customer.cpf && (
            <p className="text-sm text-muted-foreground">CPF: {order.customer.cpf}</p>
          )}
        </CardContent>
      </Card>

      {/* Atualizar Status */}
      {order.status !== "DELIVERED" && order.status !== "CANCELED" && (
        <Card>
          <CardHeader>
            <CardTitle>Atualizar Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Novo Status</Label>
                <Select
                  value={statusUpdate.newStatus}
                  onValueChange={(value) =>
                    setStatusUpdate({ ...statusUpdate, newStatus: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Rascunho</SelectItem>
                    <SelectItem value="APPROVED">Aprovado</SelectItem>
                    <SelectItem value="SENT_TO_LAB">Enviado ao Laboratório</SelectItem>
                    <SelectItem value="IN_PROGRESS">Em Produção</SelectItem>
                    <SelectItem value="READY">Pronto para Retirada</SelectItem>
                    <SelectItem value="DELIVERED">Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Observação da Mudança</Label>
                <Input
                  value={statusUpdate.statusNotes}
                  onChange={(e) =>
                    setStatusUpdate({ ...statusUpdate, statusNotes: e.target.value })
                  }
                  placeholder="Opcional..."
                />
              </div>
            </div>

            <Button type="button" onClick={handleStatusUpdate}>
              Atualizar Status
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Dados Básicos */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Dados da Ordem de Serviço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expectedDate">Data de Entrega Prevista</Label>
                <Input
                  id="expectedDate"
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="laboratoryId">Laboratório</Label>
                <Select
                  value={formData.laboratoryId}
                  onValueChange={(value) => setFormData({ ...formData, laboratoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o laboratório" />
                  </SelectTrigger>
                  <SelectContent>
                    {laboratories.map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Observações adicionais..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Receita / Prescrição */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Receita / Prescrição</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPrescription(!showPrescription)}
              >
                {showPrescription ? "Remover Receita" : "Adicionar Receita"}
              </Button>
            </div>
          </CardHeader>
          {showPrescription && (
            <CardContent className="space-y-4">
              <div className="grid gap-6 md:grid-cols-2">
                {/* OD */}
                <div>
                  <p className="font-semibold mb-3 text-center bg-gray-800 text-white py-1 rounded">
                    Olho Direito (OD)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {["esf", "cil", "eixo", "dnp", "altura"].map((field) => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs capitalize">{field}</Label>
                        <Input
                          placeholder={field === "eixo" ? "0-180" : "0.00"}
                          value={(prescriptionData.od as any)[field]}
                          onChange={(e) => updatePrescription("od", field, e.target.value)}
                          inputMode={numericFields.includes(field) ? (field === "eixo" ? "numeric" : "decimal") : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* OE */}
                <div>
                  <p className="font-semibold mb-3 text-center bg-gray-800 text-white py-1 rounded">
                    Olho Esquerdo (OE)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {["esf", "cil", "eixo", "dnp", "altura"].map((field) => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs capitalize">{field}</Label>
                        <Input
                          placeholder={field === "eixo" ? "0-180" : "0.00"}
                          value={(prescriptionData.oe as any)[field]}
                          onChange={(e) => updatePrescription("oe", field, e.target.value)}
                          inputMode={numericFields.includes(field) ? (field === "eixo" ? "numeric" : "decimal") : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
                <div className="space-y-1">
                  <Label className="text-xs">Adição</Label>
                  <Input
                    placeholder="0.00"
                    value={prescriptionData.adicao}
                    onChange={(e) =>
                      setPrescriptionData({ ...prescriptionData, adicao: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de Lente</Label>
                  <Input
                    placeholder="Ex: Multifocal"
                    value={prescriptionData.tipoLente}
                    onChange={(e) =>
                      setPrescriptionData({ ...prescriptionData, tipoLente: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Material</Label>
                  <Input
                    placeholder="Ex: Policarbonato"
                    value={prescriptionData.material}
                    onChange={(e) =>
                      setPrescriptionData({ ...prescriptionData, material: e.target.value })
                    }
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Itens/Serviços */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Itens/Serviços</CardTitle>
              <Button type="button" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <Card key={index} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Item {index + 1}</h4>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="md:col-span-3 space-y-1">
                      <Label>
                        Descrição <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        placeholder="Ex: Lente multifocal, Montagem, Ajuste..."
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Quantidade</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateItem(index, "qty", parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Observações</Label>
                    <Textarea
                      value={item.observations}
                      onChange={(e) => updateItem(index, "observations", e.target.value)}
                      placeholder="Observações adicionais sobre este item..."
                      rows={2}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* Botões */}
        <div className="flex gap-4">
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/ordens-servico/${id}/detalhes`)}
          >
            Cancelar
          </Button>
          {order.status !== "DELIVERED" && order.status !== "CANCELED" && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              disabled={canceling}
            >
              {canceling ? "Cancelando..." : "Cancelar Ordem"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
