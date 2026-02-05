"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface ServiceItem {
  type: string;
  description: string;
  price: string;
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

  const [formData, setFormData] = useState({
    expectedDate: "",
    prescription: "",
    notes: "",
  });

  const [items, setItems] = useState<ServiceItem[]>([
    {
      type: "",
      description: "",
      price: "",
      observations: "",
    },
  ]);

  const [statusUpdate, setStatusUpdate] = useState({
    newStatus: "",
    statusNotes: "",
  });

  // Buscar dados da ordem
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/service-orders/${id}`);
        if (!res.ok) throw new Error("Erro ao carregar ordem de serviço");

        const { data } = await res.json();
        setOrder(data);

        // Preencher formulário
        setFormData({
          expectedDate: data.expectedDate
            ? new Date(data.expectedDate).toISOString().split("T")[0]
            : "",
          prescription: data.prescription || "",
          notes: data.notes || "",
        });

        // Preencher itens
        if (data.items && data.items.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              type: item.type,
              description: item.description,
              price: item.price.toString(),
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
    setItems([
      ...items,
      {
        type: "",
        description: "",
        price: "",
        observations: "",
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error("É necessário pelo menos 1 item/serviço");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ServiceItem, value: string) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      return sum + price;
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (items.some((item) => !item.type || !item.description || !item.price)) {
        throw new Error("Preencha todos os campos obrigatórios dos itens");
      }

      const payload: any = {
        items: items.map((item) => ({
          type: item.type,
          description: item.description,
          price: parseFloat(item.price),
          observations: item.observations || undefined,
        })),
      };

      if (formData.expectedDate) {
        payload.expectedDate = new Date(formData.expectedDate).toISOString();
      }

      if (formData.prescription !== undefined) {
        payload.prescription = formData.prescription || undefined;
      }

      if (formData.notes !== undefined) {
        payload.notes = formData.notes || undefined;
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
      router.push("/dashboard/ordens-servico");
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
      const payload: any = {
        status: statusUpdate.newStatus,
      };

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
      router.push("/dashboard/ordens-servico");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Tem certeza que deseja cancelar esta ordem de serviço?")) {
      return;
    }

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

  if (!order) {
    return null;
  }

  const total = calculateTotal();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ordens-servico">
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
        <Badge variant={order.active ? "default" : "destructive"}>
          {order.active ? getStatusLabel(order.status) : "Cancelada"}
        </Badge>
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
      {order.active && order.status !== "DELIVERED" && (
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
                    <SelectItem value="SENT_TO_LAB">Enviado Lab</SelectItem>
                    <SelectItem value="IN_PROGRESS">Em Progresso</SelectItem>
                    <SelectItem value="READY">Pronto</SelectItem>
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
              <Label htmlFor="prescription">Receita/Prescrição</Label>
              <Textarea
                id="prescription"
                value={formData.prescription}
                onChange={(e) => setFormData({ ...formData, prescription: e.target.value })}
                rows={3}
                placeholder="Digite a prescrição médica se aplicável..."
              />
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
                <div className="space-y-4">
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        Tipo de Serviço <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={item.type}
                        onChange={(e) => updateItem(index, "type", e.target.value)}
                        placeholder="Ex: Montagem, Ajuste, Reparo..."
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Valor (R$) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) => updateItem(index, "price", e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Descrição <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Descreva o serviço a ser realizado..."
                      rows={2}
                      required
                    />
                  </div>

                  <div className="space-y-2">
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

            {/* Total */}
            <div className="flex justify-end pt-4 border-t">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botões */}
        <div className="flex gap-4">
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar Alterações"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/ordens-servico")}
          >
            Cancelar
          </Button>
          {order.active && order.status !== "DELIVERED" && (
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
