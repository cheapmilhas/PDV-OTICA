"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ModalNovoClienteSimples } from "@/components/ordens-servico/modal-novo-cliente-simples";
import { PrescriptionImageUpload, type OcrPrescriptionData } from "@/components/ordens-servico/prescription-image-upload";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

interface ServiceItem {
  productId: string;
  description: string;
  qty: number;
  observations: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
}

function NovaOrdemServicoPageContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchProduct, setSearchProduct] = useState("");

  // Estados para busca de cliente
  const [searchCustomer, setSearchCustomer] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultDelivery = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"); // +7 dias

  const [formData, setFormData] = useState({
    customerId: "",
    branchId: "",
    laboratoryId: "",
    orderDate: today,
    expectedDate: defaultDelivery,
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

  const [laboratories, setLaboratories] = useState<any[]>([]);
  const [prescriptionImageUrl, setPrescriptionImageUrl] = useState("");

  // Campos de lente dedicados (fora do prescriptionData JSON)
  const [lensData, setLensData] = useState({
    lensType: "",
    lensDescription: "",
    lensColoring: "",
  });
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [availableTreatments, setAvailableTreatments] = useState<{ id: string; name: string; price: number }[]>([]);

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

    // Abrir a seção de receita automaticamente para o vendedor ver os campos preenchidos
    setShowPrescription(true);
  };

  const [items, setItems] = useState<ServiceItem[]>([
    {
      productId: "",
      description: "",
      qty: 1,
      observations: "",
    },
  ]);

  // Carregar dados iniciais
  useEffect(() => {
    const loadData = async () => {
      try {
        const [branchesRes, productsRes, laboratoriesRes, treatmentsRes] = await Promise.all([
          fetch("/api/branches?status=ativos&pageSize=100"),
          fetch("/api/products?status=ativos&pageSize=100&inStock=true"),
          fetch("/api/laboratories?status=ativos&pageSize=100"),
          fetch("/api/lens-treatments?active=true"),
        ]);

        if (branchesRes.ok) {
          const branchesData = await branchesRes.json();
          const branchList = branchesData.data || [];
          setBranches(branchList);
          // Auto-selecionar branch: usa a branch da sessão ou a primeira disponível
          if (!formData.branchId && branchList.length > 0) {
            const sessionBranch = session?.user?.branchId;
            const match = branchList.find((b: any) => b.id === sessionBranch);
            setFormData(prev => ({ ...prev, branchId: match?.id || branchList[0].id }));
          }
        }

        if (productsRes.ok) {
          const productsData = await productsRes.json();
          setProducts(productsData.data || []);
        }

        if (laboratoriesRes.ok) {
          const laboratoriesData = await laboratoriesRes.json();
          setLaboratories(laboratoriesData.data || []);
        }

        if (treatmentsRes.ok) {
          const treatmentsData = await treatmentsRes.json();
          setAvailableTreatments(treatmentsData.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar dados do sistema");
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  // Buscar clientes conforme digitação (debounce 300ms)
  useEffect(() => {
    if (!searchCustomer || searchCustomer.length < 2) {
      setCustomers([]);
      return;
    }

    const searchCustomers = async () => {
      setLoadingCustomers(true);
      try {
        const res = await fetch(`/api/customers?status=ativos&search=${searchCustomer}&pageSize=10`);
        if (res.ok) {
          const data = await res.json();
          setCustomers(data.data || []);
        }
      } catch (error) {
        console.error("Erro ao buscar clientes:", error);
      } finally {
        setLoadingCustomers(false);
      }
    };

    const debounce = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounce);
  }, [searchCustomer]);

  // Buscar produtos conforme digitação
  useEffect(() => {
    if (!searchProduct || searchProduct.length < 2) return;

    const loadProducts = async () => {
      try {
        const res = await fetch(`/api/products?status=ativos&search=${searchProduct}&pageSize=50`);
        if (res.ok) {
          const data = await res.json();
          setProducts(data.data || []);
        }
      } catch (error) {
        console.error("Erro ao buscar produtos:", error);
      }
    };

    const debounce = setTimeout(loadProducts, 300);
    return () => clearTimeout(debounce);
  }, [searchProduct]);

  const addItem = () => {
    setItems([
      ...items,
      {
        productId: "",
        description: "",
        qty: 1,
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

  const updateItem = (index: number, field: keyof ServiceItem, value: string | number) => {
    const newItems = [...items];
    (newItems[index][field] as any) = value;

    // Se selecionou um produto, preencher descrição automaticamente
    if (field === "productId" && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].description = product.name;
      }
    }

    setItems(newItems);
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

      if (items.some((item) => !item.description || item.qty < 1)) {
        throw new Error("Preencha todos os campos obrigatórios dos itens");
      }

      // Preparar dados
      const payload: any = {
        customerId: formData.customerId,
        branchId: formData.branchId,
        laboratoryId: formData.laboratoryId || undefined,
        expectedDate: formData.expectedDate ? new Date(formData.expectedDate).toISOString() : undefined,
        items: items.map((item) => ({
          productId: item.productId || undefined,
          description: item.description,
          qty: item.qty,
          observations: item.observations || undefined,
        })),
        notes: formData.notes || undefined,
      };

      // Validar dados da receita se a seção foi expandida e algum campo preenchido
      const hasAnyPrescriptionField =
        prescriptionData.od.esf || prescriptionData.od.cil || prescriptionData.od.eixo ||
        prescriptionData.od.dnp || prescriptionData.od.altura || prescriptionData.od.add ||
        prescriptionData.oe.esf || prescriptionData.oe.cil || prescriptionData.oe.eixo ||
        prescriptionData.oe.dnp || prescriptionData.oe.altura || prescriptionData.oe.add ||
        prescriptionData.adicao;

      if (hasAnyPrescriptionField) {
        for (const eye of ["od", "oe"] as const) {
          const label = eye === "od" ? "OD" : "OE";
          // Validar esférico (-30 a +30)
          const esf = prescriptionData[eye].esf;
          if (esf) {
            const esfNum = parseFloat(esf.replace(",", "."));
            if (isNaN(esfNum) || esfNum < -30 || esfNum > 30) {
              throw new Error(`Esférico do ${label} deve estar entre -30.00 e +30.00`);
            }
          }
          // Validar cilíndrico (-10 a 0)
          const cil = prescriptionData[eye].cil;
          if (cil) {
            const cilNum = parseFloat(cil.replace(",", "."));
            if (isNaN(cilNum) || cilNum < -10 || cilNum > 0) {
              throw new Error(`Cilíndrico do ${label} deve estar entre -10.00 e 0.00`);
            }
          }
          // Validar eixo (0 a 180)
          const eixo = prescriptionData[eye].eixo;
          if (eixo) {
            const eixoNum = parseInt(eixo);
            if (isNaN(eixoNum) || eixoNum < 0 || eixoNum > 180) {
              throw new Error(`Eixo do ${label} deve estar entre 0° e 180°`);
            }
          }
          // Validar DNP (20 a 40)
          const dnp = prescriptionData[eye].dnp;
          if (dnp) {
            const dnpNum = parseFloat(dnp.replace(",", "."));
            if (isNaN(dnpNum) || dnpNum < 20 || dnpNum > 40) {
              throw new Error(`DNP do ${label} deve estar entre 20 e 40 mm`);
            }
          }
          // Validar Altura (10 a 45)
          const altura = prescriptionData[eye].altura;
          if (altura) {
            const altNum = parseFloat(altura.replace(",", "."));
            if (isNaN(altNum) || altNum < 10 || altNum > 45) {
              throw new Error(`Altura do ${label} deve estar entre 10 e 45 mm`);
            }
          }
          // Validar adição (+0.50 a +4.00)
          const add = prescriptionData[eye].add;
          if (add) {
            const addNum = parseFloat(add.replace(",", "."));
            if (isNaN(addNum) || addNum < 0.5 || addNum > 4) {
              throw new Error(`Adição do ${label} deve estar entre +0.50 e +4.00`);
            }
          }
        }

        // Compatibilidade: setar adicao a partir de addOd se não preenchido diretamente
        const dataToSend = { ...prescriptionData };
        if (!dataToSend.adicao && prescriptionData.od.add) {
          dataToSend.adicao = prescriptionData.od.add;
        }

        payload.prescription = JSON.stringify(dataToSend);
      }

      if (prescriptionImageUrl) {
        payload.prescriptionImageUrl = prescriptionImageUrl;
      }

      // Dados de lente
      if (lensData.lensType) payload.lensType = lensData.lensType;
      if (lensData.lensDescription) payload.lensDescription = lensData.lensDescription;
      if (lensData.lensColoring) payload.lensColoring = lensData.lensColoring;
      if (selectedTreatments.length > 0) payload.treatments = selectedTreatments;

      console.log("📤 Enviando ordem de serviço:", payload);

      const res = await fetch("/api/service-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error("❌ Erro da API:", error);
        throw new Error(error.error?.message || error.message || "Erro ao criar ordem de serviço");
      }

      const result = await res.json();
      console.log("✅ Ordem criada:", result);

      const osNumber = result.data.number || result.data.id.substring(0, 8);
      toast.success(`OS #${osNumber} criada com sucesso!`);
      // Redireciona para detalhes (impressão disponível lá se quiser)
      router.push(`/dashboard/ordens-servico/${result.data.id}/detalhes`);
    } catch (error: any) {
      console.error("❌ Erro:", error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

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
          <p className="text-muted-foreground">Crie uma nova ordem de serviço para laboratório</p>
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
                {selectedCustomer ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border rounded-lg p-3 bg-muted">
                      <p className="font-medium">{selectedCustomer.name}</p>
                      {selectedCustomer.phone && (
                        <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setFormData({ ...formData, customerId: "" });
                        setSearchCustomer("");
                      }}
                    >
                      Alterar
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Digite nome, CPF ou telefone..."
                        value={searchCustomer}
                        onChange={(e) => setSearchCustomer(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    {loadingCustomers && (
                      <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-white shadow-lg p-2 z-10">
                        <p className="text-sm text-muted-foreground">Buscando...</p>
                      </div>
                    )}

                    {!loadingCustomers && searchCustomer.length >= 2 && customers.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-white shadow-lg max-h-60 overflow-y-auto z-10">
                        {customers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            className="w-full text-left p-3 hover:bg-muted transition-colors border-b last:border-0"
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setFormData({ ...formData, customerId: customer.id });
                              setSearchCustomer("");
                              setCustomers([]);
                            }}
                          >
                            <p className="font-medium">{customer.name}</p>
                            {customer.phone && (
                              <p className="text-sm text-muted-foreground">{customer.phone}</p>
                            )}
                            {customer.cpf && (
                              <p className="text-xs text-muted-foreground">CPF: {customer.cpf}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {!loadingCustomers && searchCustomer.length >= 2 && customers.length === 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-white shadow-lg p-4 z-10">
                        <p className="text-sm text-muted-foreground mb-2">Nenhum cliente encontrado</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setShowNewCustomerModal(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Criar novo cliente: "{searchCustomer}"
                        </Button>
                      </div>
                    )}
                  </div>
                )}
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
                    <SelectValue placeholder={loadingData ? "Carregando..." : "Selecione a filial"} />
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
                <Label htmlFor="laboratoryId">Laboratório</Label>
                <Select
                  value={formData.laboratoryId}
                  onValueChange={(value) => setFormData({ ...formData, laboratoryId: value })}
                  disabled={loadingData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingData ? "Carregando..." : "Selecione o laboratório"} />
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

              <div className="space-y-2">
                <Label htmlFor="orderDate">
                  Data da Venda <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="orderDate"
                  type="date"
                  value={formData.orderDate}
                  onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expectedDate">
                  Data Prevista de Entrega <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="expectedDate"
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações Gerais</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Observações adicionais para o laboratório..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Dados da Receita - Colapsável */}
        <Card className="mb-6">
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowPrescription(!showPrescription)}
          >
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                Dados da Receita
              </span>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${showPrescription ? "rotate-180" : ""}`}
              />
            </CardTitle>
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
                />
              </div>

              {/* BLOCO 1: VISÃO DE LONGE — Tabela compacta OD/OE */}
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
                              onChange={(e) =>
                                setPrescriptionData({
                                  ...prescriptionData,
                                  [eye]: { ...prescriptionData[eye], esf: sanitizeNumericField(e.target.value) },
                                })
                              }
                              placeholder="+0.00"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].cil}
                              onChange={(e) =>
                                setPrescriptionData({
                                  ...prescriptionData,
                                  [eye]: { ...prescriptionData[eye], cil: sanitizeNumericField(e.target.value) },
                                })
                              }
                              placeholder="-0.00"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].eixo}
                              onChange={(e) =>
                                setPrescriptionData({
                                  ...prescriptionData,
                                  [eye]: { ...prescriptionData[eye], eixo: sanitizeIntegerField(e.target.value) },
                                })
                              }
                              placeholder="0-180"
                              inputMode="numeric"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].dnp}
                              onChange={(e) =>
                                setPrescriptionData({
                                  ...prescriptionData,
                                  [eye]: { ...prescriptionData[eye], dnp: sanitizeNumericField(e.target.value) },
                                })
                              }
                              placeholder="mm"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border p-0.5">
                            <Input
                              className="h-8 text-center text-sm border-0 focus-visible:ring-1"
                              value={prescriptionData[eye].altura}
                              onChange={(e) =>
                                setPrescriptionData({
                                  ...prescriptionData,
                                  [eye]: { ...prescriptionData[eye], altura: sanitizeNumericField(e.target.value) },
                                })
                              }
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

              {/* BLOCO 2: ADIÇÃO + VISÃO DE PERTO (auto-calculado) */}
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
                                onChange={(e) =>
                                  setPrescriptionData({
                                    ...prescriptionData,
                                    [eye]: { ...prescriptionData[eye], add: sanitizeNumericField(e.target.value) },
                                  })
                                }
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
                  Esf. Perto, Cil. e Eixo de perto s&atilde;o calculados automaticamente (Esf. Longe + Adi&ccedil;&atilde;o).
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
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, prisma: sanitizeNumericField(e.target.value) },
                        })
                      }
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
                      onChange={(e) =>
                        setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, prisma: sanitizeNumericField(e.target.value) },
                        })
                      }
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
                        <SelectItem value="Visão Simples">Vis&atilde;o Simples</SelectItem>
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
                        <SelectItem value="SURFACADA">Surfa&ccedil;ada</SelectItem>
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
              <div>
                <CardTitle>Itens/Serviços</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Vincule produtos do estoque ou adicione descrições manuais
                </p>
              </div>
              <Button type="button" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <Card key={index} className="p-4 border-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg">Item {index + 1}</h4>
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

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Produto Vinculado (Opcional)</Label>
                      <Select
                        value={item.productId}
                        onValueChange={(value) => updateItem(index, "productId", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um produto do estoque" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="p-2">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar produto..."
                                value={searchProduct}
                                onChange={(e) => setSearchProduct(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                          </div>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.sku} - {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Quantidade <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateItem(index, "qty", parseInt(e.target.value) || 1)}
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
                      placeholder="Ex: Armação acetato preta, Lente multifocal 1.67..."
                      rows={2}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Esta descrição será enviada ao laboratório (não inclua valores)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Observações do Item</Label>
                    <Textarea
                      value={item.observations}
                      onChange={(e) => updateItem(index, "observations", e.target.value)}
                      placeholder="Informações adicionais sobre este item..."
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
          <Button type="submit" disabled={loading} size="lg">
            {loading ? "Criando..." : "Criar Ordem de Serviço"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => router.push("/dashboard/ordens-servico")}
          >
            Cancelar
          </Button>
        </div>
      </form>

      {/* Modal de Cadastro Rápido de Cliente */}
      <ModalNovoClienteSimples
        open={showNewCustomerModal}
        onOpenChange={setShowNewCustomerModal}
        initialName={searchCustomer}
        onClienteCreated={(cliente) => {
          setSelectedCustomer(cliente);
          setFormData({ ...formData, customerId: cliente.id });
          setSearchCustomer("");
          toast.success(`${cliente.name} cadastrado e selecionado!`);
        }}
      />
    </div>
  );
}

export default function NovaOrdemServicoPage() {
  return (
    <ProtectedRoute permission="service_orders.create">
      <NovaOrdemServicoPageContent />
    </ProtectedRoute>
  );
}
