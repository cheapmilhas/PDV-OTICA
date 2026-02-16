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
import { ArrowLeft, Plus, Trash2, ChevronDown, Search, Printer } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ModalNovoClienteSimples } from "@/components/ordens-servico/modal-novo-cliente-simples";

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

interface Lab {
  id: string;
  name: string;
  defaultLeadTimeDays: number;
}

export default function NovaOrdemServicoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchProduct, setSearchProduct] = useState("");

  // Estados para busca de cliente
  const [searchCustomer, setSearchCustomer] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultDelivery = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const [formData, setFormData] = useState({
    customerId: "",
    branchId: "",
    labId: "",
    orderDate: today,
    expectedDate: defaultDelivery,
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
    { productId: "", description: "", qty: 1, observations: "" },
  ]);

  // Carregar dados iniciais
  useEffect(() => {
    const loadData = async () => {
      try {
        const [branchesRes, productsRes, labsRes] = await Promise.all([
          fetch("/api/branches?status=ativos&pageSize=100"),
          fetch("/api/products?status=ativos&pageSize=100&inStock=true"),
          fetch("/api/laboratories"),
        ]);

        if (branchesRes.ok) {
          const branchesData = await branchesRes.json();
          setBranches(branchesData.data || []);
        }

        if (productsRes.ok) {
          const productsData = await productsRes.json();
          setProducts(productsData.data || []);
        }

        if (labsRes.ok) {
          const labsData = await labsRes.json();
          setLabs(labsData.data || []);
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  // Buscar clientes
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

  // Buscar produtos
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

  // Atualizar prazo baseado no lab selecionado
  useEffect(() => {
    if (formData.labId) {
      const lab = labs.find(l => l.id === formData.labId);
      if (lab) {
        const newDate = format(
          new Date(Date.now() + lab.defaultLeadTimeDays * 24 * 60 * 60 * 1000),
          "yyyy-MM-dd"
        );
        setFormData(prev => ({ ...prev, expectedDate: newDate }));
      }
    }
  }, [formData.labId, labs]);

  const addItem = () => {
    setItems([...items, { productId: "", description: "", qty: 1, observations: "" }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error("Pelo menos 1 item obrigatório");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ServiceItem, value: string | number) => {
    const newItems = [...items];
    (newItems[index][field] as any) = value;
    if (field === "productId" && value) {
      const product = products.find(p => p.id === value);
      if (product) newItems[index].description = product.name;
    }
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.customerId) throw new Error("Cliente é obrigatório");
      if (!formData.branchId) throw new Error("Filial é obrigatória");
      if (items.some((item) => !item.description || item.qty < 1)) {
        throw new Error("Preencha descrição de todos os itens");
      }

      const payload: any = {
        customerId: formData.customerId,
        branchId: formData.branchId,
        orderDate: new Date(formData.orderDate).toISOString(),
        promisedDate: formData.expectedDate ? new Date(formData.expectedDate).toISOString() : undefined,
        labId: formData.labId || undefined,
        items: items.map((item) => ({
          productId: item.productId || undefined,
          description: item.description,
          qty: item.qty,
          observations: item.observations || undefined,
        })),
      };

      if (prescriptionData.od.esf || prescriptionData.oe.esf) {
        payload.prescriptionData = prescriptionData;
      }

      if (formData.notes) payload.notes = formData.notes;

      const res = await fetch("/api/service-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || error.message || "Erro ao criar OS");
      }

      toast.success("Ordem de serviço criada!");
      router.push("/dashboard/ordens-servico");
    } catch (error: any) {
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
          <p className="text-muted-foreground">Crie uma OS para enviar ao laboratório</p>
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
              {/* Cliente */}
              <div className="space-y-2">
                <Label>Cliente <span className="text-red-500">*</span></Label>
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
                            {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
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
                          Criar novo cliente
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Filial */}
              <div className="space-y-2">
                <Label>Filial <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.branchId}
                  onValueChange={(value) => setFormData({ ...formData, branchId: value })}
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

              {/* Laboratório */}
              <div className="space-y-2">
                <Label>Laboratório</Label>
                <Select
                  value={formData.labId}
                  onValueChange={(value) => setFormData({ ...formData, labId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o laboratório" />
                  </SelectTrigger>
                  <SelectContent>
                    {labs.map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.name} ({lab.defaultLeadTimeDays} dias)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Datas */}
              <div className="space-y-2">
                <Label>Data da Venda <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={formData.orderDate}
                  onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Previsão de Entrega <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações para o Laboratório</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Informações importantes para o laboratório..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Dados da Receita (Grau) */}
        <Card className="mb-6">
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowPrescription(!showPrescription)}
          >
            <CardTitle className="flex items-center justify-between">
              <span>Dados da Receita (Grau)</span>
              <ChevronDown className={`h-5 w-5 transition-transform ${showPrescription ? "rotate-180" : ""}`} />
            </CardTitle>
          </CardHeader>
          {showPrescription && (
            <CardContent className="space-y-6">
              {/* OD */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Olho Direito (OD)</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {(["esf", "cil", "eixo", "dnp", "altura"] as const).map((field) => (
                    <div key={`od-${field}`}>
                      <Label>{field === "esf" ? "Esférico" : field === "cil" ? "Cilíndrico" : field === "eixo" ? "Eixo" : field.toUpperCase()}</Label>
                      <Input
                        value={prescriptionData.od[field]}
                        onChange={(e) => setPrescriptionData({
                          ...prescriptionData,
                          od: { ...prescriptionData.od, [field]: e.target.value },
                        })}
                        placeholder={field === "esf" ? "+2.00" : field === "cil" ? "-0.50" : field === "eixo" ? "90" : "32mm"}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* OE */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Olho Esquerdo (OE)</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {(["esf", "cil", "eixo", "dnp", "altura"] as const).map((field) => (
                    <div key={`oe-${field}`}>
                      <Label>{field === "esf" ? "Esférico" : field === "cil" ? "Cilíndrico" : field === "eixo" ? "Eixo" : field.toUpperCase()}</Label>
                      <Input
                        value={prescriptionData.oe[field]}
                        onChange={(e) => setPrescriptionData({
                          ...prescriptionData,
                          oe: { ...prescriptionData.oe, [field]: e.target.value },
                        })}
                        placeholder={field === "esf" ? "+1.75" : field === "cil" ? "-0.75" : field === "eixo" ? "85" : "31mm"}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Adição, Tipo, Material */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Adição</Label>
                  <Input
                    value={prescriptionData.adicao}
                    onChange={(e) => setPrescriptionData({ ...prescriptionData, adicao: e.target.value })}
                    placeholder="+2.00"
                  />
                </div>
                <div>
                  <Label>Tipo de Lente</Label>
                  <Select
                    value={prescriptionData.tipoLente}
                    onValueChange={(v) => setPrescriptionData({ ...prescriptionData, tipoLente: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                    onValueChange={(v) => setPrescriptionData({ ...prescriptionData, material: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
              </div>
            </CardContent>
          )}
        </Card>

        {/* Itens (Produtos) */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Produtos (Lente + Armação)</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Vincule os produtos que serão enviados ao laboratório
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
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeItem(index)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Produto do Estoque (Opcional)</Label>
                      <Select
                        value={item.productId}
                        onValueChange={(value) => updateItem(index, "productId", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um produto" />
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
                      <Label>Quantidade <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateItem(index, "qty", parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição <span className="text-red-500">*</span></Label>
                    <Textarea
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Ex: Lente multifocal 1.67, Armação acetato preta..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Observações do Item</Label>
                    <Textarea
                      value={item.observations}
                      onChange={(e) => updateItem(index, "observations", e.target.value)}
                      placeholder="Informações adicionais para o laboratório..."
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
