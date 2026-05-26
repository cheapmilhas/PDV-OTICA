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
import { ArrowLeft, Trash2, Loader2, Plus, ChevronDown } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { PrescriptionImageUpload, type OcrPrescriptionData } from "@/components/ordens-servico/prescription-image-upload";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

interface ServiceItem {
  description: string;
  qty: number;
  observations: string;
}

function EditarOrdemServicoContent() {
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
  const [showCeratometria, setShowCeratometria] = useState(false);
  const [prescriptionData, setPrescriptionData] = useState({
    od: { esf: "", cil: "", eixo: "", dnp: "", altura: "", add: "", prisma: "", base: "" },
    oe: { esf: "", cil: "", eixo: "", dnp: "", altura: "", add: "", prisma: "", base: "" },
    adicao: "",
    olhoDominante: "",
    pantoscopicAngle: "",
    vertexDistance: "",
    frameCurvature: "",
    tipoLente: "",
    material: "",
    ceratometria: {
      odH: "", odHEixo: "", odV: "", odVEixo: "",
      oeH: "", oeHEixo: "", oeV: "", oeVEixo: "",
    },
  });

  const [items, setItems] = useState<ServiceItem[]>([
    { description: "", qty: 1, observations: "" },
  ]);

  const [prescriptionImageUrl, setPrescriptionImageUrl] = useState("");

  // Campos de lente dedicados
  const [lensData, setLensData] = useState({
    lensType: "",
    lensDescription: "",
    lensColoring: "",
  });
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [availableTreatments, setAvailableTreatments] = useState<{ id: string; name: string; price: number }[]>([]);

  const [statusUpdate, setStatusUpdate] = useState({
    newStatus: "",
    statusNotes: "",
  });

  // Buscar dados da ordem e laboratórios
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const [orderRes, laboratoriesRes, treatmentsRes] = await Promise.all([
          fetch(`/api/service-orders/${id}`),
          fetch("/api/laboratories?status=ativos&pageSize=100"),
          fetch("/api/lens-treatments?active=true"),
        ]);

        if (!orderRes.ok) throw new Error("Erro ao carregar ordem de serviço");

        const { data } = await orderRes.json();
        setOrder(data);

        if (laboratoriesRes.ok) {
          const labData = await laboratoriesRes.json();
          setLaboratories(labData.data || []);
        }

        if (treatmentsRes.ok) {
          const treatmentsData = await treatmentsRes.json();
          setAvailableTreatments(treatmentsData.data || []);
        }

        // Preencher formulário
        setFormData({
          expectedDate: data.promisedDate
            ? new Date(data.promisedDate).toISOString().split("T")[0]
            : "",
          laboratoryId: data.laboratory?.id || "",
          notes: data.notes || "",
        });

        // Preencher imagem da receita se existir
        if (data.prescriptionImageUrl) {
          setPrescriptionImageUrl(data.prescriptionImageUrl);
        }

        // Preencher dados de lente se existirem
        setLensData({
          lensType: data.lensType || "",
          lensDescription: data.lensDescription || "",
          lensColoring: data.lensColoring || "",
        });
        if (data.treatments && data.treatments.length > 0) {
          setSelectedTreatments(data.treatments);
        }

        // Preencher receita (API returns prescriptionData as JSON object)
        if (data.prescriptionData) {
          try {
            const rx = typeof data.prescriptionData === "string"
              ? JSON.parse(data.prescriptionData)
              : data.prescriptionData;
            const defaultEye = { esf: "", cil: "", eixo: "", dnp: "", altura: "", add: "", prisma: "", base: "" };
            const defaultCerat = { odH: "", odHEixo: "", odV: "", odVEixo: "", oeH: "", oeHEixo: "", oeV: "", oeVEixo: "" };
            setPrescriptionData({
              od: { ...defaultEye, ...rx.od },
              oe: { ...defaultEye, ...rx.oe },
              adicao: rx.adicao || "",
              olhoDominante: rx.olhoDominante || "",
              pantoscopicAngle: rx.pantoscopicAngle || "",
              vertexDistance: rx.vertexDistance || "",
              frameCurvature: rx.frameCurvature || "",
              tipoLente: rx.tipoLente || "",
              material: rx.material || "",
              ceratometria: { ...defaultCerat, ...rx.ceratometria },
              ...(rx.dnpPertoOd ? { dnpPertoOd: rx.dnpPertoOd } : {}),
              ...(rx.dnpPertoOe ? { dnpPertoOe: rx.dnpPertoOe } : {}),
            } as any);
            setShowPrescription(true);
            if (rx.ceratometria && Object.values(rx.ceratometria).some((v: any) => v)) {
              setShowCeratometria(true);
            }
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

  const handleOcrResult = (data: OcrPrescriptionData) => {
    const toStr = (val: string | number | null | undefined): string =>
      val !== null && val !== undefined ? String(val) : "";

    setPrescriptionData((prev) => ({
      ...prev,
      od: {
        esf: toStr(data.od?.esf) || prev.od.esf,
        cil: toStr(data.od?.cil) || prev.od.cil,
        eixo: toStr(data.od?.eixo) || prev.od.eixo,
        dnp: toStr(data.od?.dnp) || prev.od.dnp,
        altura: toStr(data.od?.altura) || prev.od.altura,
        add: toStr(data.od?.add) || prev.od.add,
        prisma: toStr(data.od?.prisma) || prev.od.prisma,
        base: toStr(data.od?.base) || prev.od.base,
      },
      oe: {
        esf: toStr(data.oe?.esf) || prev.oe.esf,
        cil: toStr(data.oe?.cil) || prev.oe.cil,
        eixo: toStr(data.oe?.eixo) || prev.oe.eixo,
        dnp: toStr(data.oe?.dnp) || prev.oe.dnp,
        altura: toStr(data.oe?.altura) || prev.oe.altura,
        add: toStr(data.oe?.add) || prev.oe.add,
        prisma: toStr(data.oe?.prisma) || prev.oe.prisma,
        base: toStr(data.oe?.base) || prev.oe.base,
      },
    }));

    setShowPrescription(true);
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

      if (prescriptionImageUrl) {
        payload.prescriptionImageUrl = prescriptionImageUrl;
      }

      // Dados de lente
      payload.lensType = lensData.lensType || undefined;
      payload.lensDescription = lensData.lensDescription || undefined;
      payload.lensColoring = lensData.lensColoring || undefined;
      payload.treatments = selectedTreatments;

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
                {showPrescription ? "Ocultar Receita" : "Mostrar Receita"}
              </Button>
            </div>
          </CardHeader>
          {showPrescription && (
            <CardContent className="space-y-4">

              {/* Upload de imagem da receita com OCR */}
              <div className="p-4 bg-muted/30 border border-dashed rounded-lg">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                  Foto da Receita (OCR Automático)
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Tire uma foto ou envie a imagem da receita. A IA preencherá os campos automaticamente.
                </p>
                <PrescriptionImageUpload
                  onOcrResult={handleOcrResult}
                  onImageUploaded={(url) => setPrescriptionImageUrl(url)}
                  existingImageUrl={prescriptionImageUrl || null}
                />
              </div>

              {/* BLOCO 1: VISÃO DE LONGE */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Visão de Longe</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
                        <th className="border p-1.5 text-center font-semibold">Esférico</th>
                        <th className="border p-1.5 text-center font-semibold">Cilíndrico</th>
                        <th className="border p-1.5 text-center font-semibold">Eixo</th>
                        <th className="border p-1.5 text-center font-semibold">DNP</th>
                        <th className="border p-1.5 text-center font-semibold">Altura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["od", "oe"] as const).map((eye) => (
                        <tr key={eye}>
                          <td className="border p-1.5 font-bold bg-gray-50 text-center">
                            {eye === "od" ? "OD" : "OE"}
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].esf}
                              onChange={(e) => updatePrescription(eye, "esf", e.target.value)}
                              placeholder="+0.00"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].cil}
                              onChange={(e) => updatePrescription(eye, "cil", e.target.value)}
                              placeholder="-0.00"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].eixo}
                              onChange={(e) => updatePrescription(eye, "eixo", e.target.value)}
                              placeholder="0-180"
                              inputMode="numeric"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].dnp}
                              onChange={(e) => updatePrescription(eye, "dnp", e.target.value)}
                              placeholder="mm"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].altura}
                              onChange={(e) => updatePrescription(eye, "altura", e.target.value)}
                              placeholder="mm"
                              inputMode="decimal"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BLOCO 2: ADIÇÃO / VISÃO DE PERTO */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Adição / Visão de Perto</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
                        <th className="border p-1.5 text-center font-semibold">Adição</th>
                        <th className="border p-1.5 text-center font-semibold">Esf. Perto</th>
                        <th className="border p-1.5 text-center font-semibold">Cil. Perto</th>
                        <th className="border p-1.5 text-center font-semibold">Eixo Perto</th>
                        <th className="border p-1.5 text-center font-semibold">DNP Perto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["od", "oe"] as const).map((eye) => {
                        const esfLonge = parseFloat((prescriptionData[eye].esf || "0").replace(",", ".")) || 0;
                        const addVal = parseFloat((prescriptionData[eye].add || "0").replace(",", ".")) || 0;
                        const esfPerto = addVal ? (esfLonge + addVal).toFixed(2) : "";
                        return (
                          <tr key={eye}>
                            <td className="border p-1.5 font-bold bg-gray-50 text-center">
                              {eye === "od" ? "OD" : "OE"}
                            </td>
                            <td className="border p-0.5">
                              <Input
                                className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                                value={prescriptionData[eye].add}
                                onChange={(e) => updatePrescription(eye, "add", e.target.value)}
                                placeholder="+0.00"
                                inputMode="decimal"
                              />
                            </td>
                            <td className="border p-1.5 text-center text-sm text-muted-foreground bg-gray-50">
                              {esfPerto ? (parseFloat(esfPerto) > 0 ? `+${esfPerto}` : esfPerto) : "—"}
                            </td>
                            <td className="border p-1.5 text-center text-sm text-muted-foreground bg-gray-50">
                              {prescriptionData[eye].cil || "—"}
                            </td>
                            <td className="border p-1.5 text-center text-sm text-muted-foreground bg-gray-50">
                              {prescriptionData[eye].eixo ? `${prescriptionData[eye].eixo}°` : "—"}
                            </td>
                            <td className="border p-0.5">
                              <Input
                                className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                                value={eye === "od"
                                  ? (prescriptionData as any).dnpPertoOd || ""
                                  : (prescriptionData as any).dnpPertoOe || ""}
                                onChange={(e) =>
                                  setPrescriptionData({
                                    ...prescriptionData,
                                    [eye === "od" ? "dnpPertoOd" : "dnpPertoOe"]: sanitizeNumericField(e.target.value),
                                  } as any)
                                }
                                placeholder="mm"
                                inputMode="decimal"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Esf. Perto, Cil. e Eixo de perto são calculados automaticamente.
                </p>
              </div>

              {/* BLOCO 3: DADOS ADICIONAIS */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Dados Adicionais</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Prisma OD</Label>
                    <Input
                      className="h-8 text-sm"
                      value={prescriptionData.od.prisma}
                      onChange={(e) => updatePrescription("od", "prisma", e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Base OD</Label>
                    <Select
                      value={prescriptionData.od.base}
                      onValueChange={(v) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, base: v },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SUP">Superior (SUP)</SelectItem>
                        <SelectItem value="INF">Inferior (INF)</SelectItem>
                        <SelectItem value="NAZ">Nasal (NAZ)</SelectItem>
                        <SelectItem value="TMP">Temporal (TMP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prisma OE</Label>
                    <Input
                      className="h-8 text-sm"
                      value={prescriptionData.oe.prisma}
                      onChange={(e) => updatePrescription("oe", "prisma", e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Base OE</Label>
                    <Select
                      value={prescriptionData.oe.base}
                      onValueChange={(v) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, base: v },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SUP">Superior (SUP)</SelectItem>
                        <SelectItem value="INF">Inferior (INF)</SelectItem>
                        <SelectItem value="NAZ">Nasal (NAZ)</SelectItem>
                        <SelectItem value="TMP">Temporal (TMP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
                  <div>
                    <Label className="text-xs">Olho Dominante</Label>
                    <Select
                      value={prescriptionData.olhoDominante}
                      onValueChange={(v) =>
                        setPrescriptionData({ ...prescriptionData, olhoDominante: v })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OD">OD (Direito)</SelectItem>
                        <SelectItem value="OE">OE (Esquerdo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Ang. Pantoscópico</Label>
                    <Input
                      className="h-8 text-sm"
                      value={prescriptionData.pantoscopicAngle}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          pantoscopicAngle: sanitizeNumericField(e.target.value),
                        })
                      }
                      placeholder="°"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Dist. Vértice</Label>
                    <Input
                      className="h-8 text-sm"
                      value={prescriptionData.vertexDistance}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          vertexDistance: sanitizeNumericField(e.target.value),
                        })
                      }
                      placeholder="mm"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Curva Armação</Label>
                    <Input
                      className="h-8 text-sm"
                      value={prescriptionData.frameCurvature}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          frameCurvature: sanitizeNumericField(e.target.value),
                        })
                      }
                      placeholder="mm"
                      inputMode="decimal"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCO 4: LENTE — Tipo, Material, Fabricação, Coloração, Tratamentos */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Dados da Lente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Tipo de Lente</Label>
                    <Select
                      value={prescriptionData.tipoLente}
                      onValueChange={(v) =>
                        setPrescriptionData({ ...prescriptionData, tipoLente: v })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Visão Simples">Visão Simples</SelectItem>
                        <SelectItem value="Bifocal">Bifocal</SelectItem>
                        <SelectItem value="Multifocal">Multifocal</SelectItem>
                        <SelectItem value="Ocupacional">Ocupacional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Material</Label>
                    <Select
                      value={prescriptionData.material}
                      onValueChange={(v) =>
                        setPrescriptionData({ ...prescriptionData, material: v })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Resina 1.50">Resina 1.50</SelectItem>
                        <SelectItem value="Resina 1.56">Resina 1.56</SelectItem>
                        <SelectItem value="Resina 1.61">Resina 1.61</SelectItem>
                        <SelectItem value="Resina 1.67">Resina 1.67</SelectItem>
                        <SelectItem value="Resina 1.74">Resina 1.74</SelectItem>
                        <SelectItem value="Policarbonato">Policarbonato</SelectItem>
                        <SelectItem value="Trivex">Trivex</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Fabricação</Label>
                    <Select
                      value={lensData.lensType}
                      onValueChange={(v) => setLensData({ ...lensData, lensType: v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRONTA">Pronta</SelectItem>
                        <SelectItem value="SURFACADA">Surfaçada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-xs">Descrição da Lente</Label>
                    <Input
                      className="h-8 text-sm"
                      value={lensData.lensDescription}
                      onChange={(e) => setLensData({ ...lensData, lensDescription: e.target.value })}
                      placeholder="Ex: Multifocal Digital Free-Form"
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Coloração</Label>
                    <Input
                      className="h-8 text-sm"
                      value={lensData.lensColoring}
                      onChange={(e) => setLensData({ ...lensData, lensColoring: e.target.value })}
                      placeholder="Ex: Cinza 80%, Transitions"
                      maxLength={200}
                    />
                  </div>
                </div>

                {/* Tratamentos */}
                {availableTreatments.length > 0 && (
                  <div className="mt-3">
                    <Label className="text-xs">Tratamentos</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {availableTreatments.map((treatment) => {
                        const isSelected = selectedTreatments.includes(treatment.name);
                        return (
                          <button
                            key={treatment.id}
                            type="button"
                            onClick={() => {
                              setSelectedTreatments((prev) =>
                                isSelected
                                  ? prev.filter((t) => t !== treatment.name)
                                  : [...prev, treatment.name]
                              );
                            }}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary"
                            }`}
                          >
                            {treatment.name}
                            {treatment.price > 0 && (
                              <span className="ml-1 opacity-70">
                                +R${treatment.price.toFixed(2)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* BLOCO 5: CERATOMETRIA — Colapsável */}
              <div className="border rounded-lg">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowCeratometria(!showCeratometria)}
                >
                  <span>Ceratometria (Lentes de Contato)</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showCeratometria ? "rotate-180" : ""}`} />
                </button>
                {showCeratometria && (
                  <div className="px-2.5 pb-2.5">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
                          <th className="border p-1.5 text-center font-semibold">Horiz.</th>
                          <th className="border p-1.5 text-center font-semibold">Eixo H</th>
                          <th className="border p-1.5 text-center font-semibold">Vert.</th>
                          <th className="border p-1.5 text-center font-semibold">Eixo V</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["od", "oe"] as const).map((eye) => (
                          <tr key={eye}>
                            <td className="border p-1.5 font-bold bg-gray-50 text-center">
                              {eye === "od" ? "OD" : "OE"}
                            </td>
                            <td className="border p-0.5">
                              <Input
                                className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                                value={prescriptionData.ceratometria[`${eye}H`]}
                                onChange={(e) =>
                                  setPrescriptionData({
                                    ...prescriptionData,
                                    ceratometria: {
                                      ...prescriptionData.ceratometria,
                                      [`${eye}H`]: sanitizeNumericField(e.target.value),
                                    },
                                  })
                                }
                                placeholder="0.00"
                                inputMode="decimal"
                              />
                            </td>
                            <td className="border p-0.5">
                              <Input
                                className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                                value={prescriptionData.ceratometria[`${eye}HEixo`]}
                                onChange={(e) =>
                                  setPrescriptionData({
                                    ...prescriptionData,
                                    ceratometria: {
                                      ...prescriptionData.ceratometria,
                                      [`${eye}HEixo`]: sanitizeIntegerField(e.target.value),
                                    },
                                  })
                                }
                                placeholder="0-180"
                                inputMode="numeric"
                              />
                            </td>
                            <td className="border p-0.5">
                              <Input
                                className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                                value={prescriptionData.ceratometria[`${eye}V`]}
                                onChange={(e) =>
                                  setPrescriptionData({
                                    ...prescriptionData,
                                    ceratometria: {
                                      ...prescriptionData.ceratometria,
                                      [`${eye}V`]: sanitizeNumericField(e.target.value),
                                    },
                                  })
                                }
                                placeholder="0.00"
                                inputMode="decimal"
                              />
                            </td>
                            <td className="border p-0.5">
                              <Input
                                className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                                value={prescriptionData.ceratometria[`${eye}VEixo`]}
                                onChange={(e) =>
                                  setPrescriptionData({
                                    ...prescriptionData,
                                    ceratometria: {
                                      ...prescriptionData.ceratometria,
                                      [`${eye}VEixo`]: sanitizeIntegerField(e.target.value),
                                    },
                                  })
                                }
                                placeholder="0-180"
                                inputMode="numeric"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

export default function EditarOrdemServicoPage() {
  return (
    <ProtectedRoute permission="service_orders.edit">
      <EditarOrdemServicoContent />
    </ProtectedRoute>
  );
}
