"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface ServiceItem {
  type: string;
  description: string;
  price: string;
  observations: string;
}

export default function NovaOrdemServicoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [formData, setFormData] = useState({
    customerId: "",
    branchId: "",
    expectedDate: "",
    prescription: "",
    notes: "",
  });

  const [showPrescription, setShowPrescription] = useState(false);
  const [prescriptionData, setPrescriptionData] = useState({
    od: { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
    oe: { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
    adicao: "",
    tipoLente: "",
    material: "",
    tratamentos: [] as string[],
  });

  const [items, setItems] = useState<ServiceItem[]>([
    {
      type: "",
      description: "",
      price: "",
      observations: "",
    },
  ]);

  // Carregar clientes e filiais
  useEffect(() => {
    const loadData = async () => {
      try {
        const [customersRes, branchesRes] = await Promise.all([
          fetch("/api/customers?status=ativos&pageSize=1000"),
          fetch("/api/branches?status=ativos&pageSize=100"),
        ]);

        if (customersRes.ok) {
          const customersData = await customersRes.json();
          setCustomers(customersData.data || []);
        }

        if (branchesRes.ok) {
          const branchesData = await branchesRes.json();
          setBranches(branchesData.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

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
      // Validações
      if (!formData.customerId) {
        throw new Error("Cliente é obrigatório");
      }

      if (!formData.branchId) {
        throw new Error("Filial é obrigatória");
      }

      if (items.some((item) => !item.type || !item.description || !item.price)) {
        throw new Error("Preencha todos os campos obrigatórios dos itens");
      }

      // Preparar dados
      const payload: any = {
        customerId: formData.customerId,
        branchId: formData.branchId,
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

      if (formData.prescription) {
        payload.prescription = formData.prescription;
      }

      // Adicionar dados da prescrição estruturados se preenchidos
      if (prescriptionData.od.esf || prescriptionData.oe.esf) {
        payload.prescriptionData = prescriptionData;
      }

      if (formData.notes) {
        payload.notes = formData.notes;
      }

      const res = await fetch("/api/service-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao criar ordem de serviço");
      }

      toast.success("Ordem de serviço criada com sucesso!");
      router.push("/dashboard/ordens-servico");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const total = calculateTotal();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/ordens-servico">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Nova Ordem de Serviço</h1>
          <p className="text-muted-foreground">Crie uma nova ordem de serviço</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Dados Básicos */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Dados da Ordem de Serviço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customerId">
                  Cliente <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.customerId}
                  onValueChange={(value) => setFormData({ ...formData, customerId: value })}
                  required
                  disabled={loadingData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingData ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} {customer.cpf && `- CPF: ${customer.cpf}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchId">
                  Filial <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.branchId}
                  onValueChange={(value) => setFormData({ ...formData, branchId: value })}
                  required
                  disabled={loadingData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingData ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expectedDate">Data de Entrega Prevista</Label>
                <Input
                  id="expectedDate"
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                />
              </div>
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

        {/* Receita (Prescrição) - Colapsável */}
        <Card className="mb-6">
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowPrescription(!showPrescription)}
          >
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                👓 Dados da Receita (Opcional)
              </span>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${showPrescription ? "rotate-180" : ""}`}
              />
            </CardTitle>
          </CardHeader>
          {showPrescription && (
            <CardContent className="space-y-6">
              {/* Olho Direito */}
              <div className="space-y-3">
                <h3 className="font-semibold">Olho Direito (OD)</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <Label>Esférico</Label>
                    <Input
                      value={prescriptionData.od.esf}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, esf: e.target.value },
                        })
                      }
                      placeholder="+2.00"
                    />
                  </div>
                  <div>
                    <Label>Cilíndrico</Label>
                    <Input
                      value={prescriptionData.od.cil}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, cil: e.target.value },
                        })
                      }
                      placeholder="-0.50"
                    />
                  </div>
                  <div>
                    <Label>Eixo</Label>
                    <Input
                      value={prescriptionData.od.eixo}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, eixo: e.target.value },
                        })
                      }
                      placeholder="90°"
                    />
                  </div>
                  <div>
                    <Label>DNP</Label>
                    <Input
                      value={prescriptionData.od.dnp}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, dnp: e.target.value },
                        })
                      }
                      placeholder="32mm"
                    />
                  </div>
                  <div>
                    <Label>Altura</Label>
                    <Input
                      value={prescriptionData.od.altura}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, altura: e.target.value },
                        })
                      }
                      placeholder="20mm"
                    />
                  </div>
                </div>
              </div>

              {/* Olho Esquerdo */}
              <div className="space-y-3">
                <h3 className="font-semibold">Olho Esquerdo (OE)</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <Label>Esférico</Label>
                    <Input
                      value={prescriptionData.oe.esf}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, esf: e.target.value },
                        })
                      }
                      placeholder="+1.75"
                    />
                  </div>
                  <div>
                    <Label>Cilíndrico</Label>
                    <Input
                      value={prescriptionData.oe.cil}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, cil: e.target.value },
                        })
                      }
                      placeholder="-0.75"
                    />
                  </div>
                  <div>
                    <Label>Eixo</Label>
                    <Input
                      value={prescriptionData.oe.eixo}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, eixo: e.target.value },
                        })
                      }
                      placeholder="85°"
                    />
                  </div>
                  <div>
                    <Label>DNP</Label>
                    <Input
                      value={prescriptionData.oe.dnp}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, dnp: e.target.value },
                        })
                      }
                      placeholder="31mm"
                    />
                  </div>
                  <div>
                    <Label>Altura</Label>
                    <Input
                      value={prescriptionData.oe.altura}
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, altura: e.target.value },
                        })
                      }
                      placeholder="20mm"
                    />
                  </div>
                </div>
              </div>

              {/* Dados Adicionais */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Adição</Label>
                  <Input
                    value={prescriptionData.adicao}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        adicao: e.target.value,
                      })
                    }
                    placeholder="+2.00"
                  />
                </div>
                <div>
                  <Label>Tipo de Lente</Label>
                  <Select
                    value={prescriptionData.tipoLente}
                    onValueChange={(v) =>
                      setPrescriptionData({ ...prescriptionData, tipoLente: v })
                    }
                  >
                    <SelectTrigger>
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
                  <Label>Material</Label>
                  <Select
                    value={prescriptionData.material}
                    onValueChange={(v) =>
                      setPrescriptionData({ ...prescriptionData, material: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Resina 1.50">Resina 1.50</SelectItem>
                      <SelectItem value="Resina 1.56">Resina 1.56</SelectItem>
                      <SelectItem value="Resina 1.61">Resina 1.61</SelectItem>
                      <SelectItem value="Resina 1.67">Resina 1.67</SelectItem>
                      <SelectItem value="Resina 1.74">Resina 1.74</SelectItem>
                      <SelectItem value="Policarbonato">Policarbonato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tratamentos */}
              <div>
                <Label>Tratamentos</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                  {["Antirreflexo", "Fotossensível", "Blue Light", "Anti-risco", "Polarizado"].map((trat) => (
                    <div key={trat} className="flex items-center space-x-2">
                      <Checkbox
                        id={`trat-${trat}`}
                        checked={prescriptionData.tratamentos.includes(trat)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setPrescriptionData({
                              ...prescriptionData,
                              tratamentos: [...prescriptionData.tratamentos, trat],
                            });
                          } else {
                            setPrescriptionData({
                              ...prescriptionData,
                              tratamentos: prescriptionData.tratamentos.filter(
                                (t) => t !== trat
                              ),
                            });
                          }
                        }}
                      />
                      <label
                        htmlFor={`trat-${trat}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {trat}
                      </label>
                    </div>
                  ))}
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
            {loading ? "Criando..." : "Criar Ordem de Serviço"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/ordens-servico")}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
