"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SupplierSelect } from "@/components/supplier-select";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { calculateMargin, calculateSalePrice } from "@/lib/validations/product.schema";

export default function NovoProdutoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: "",
    name: "",
    sku: "",
    barcode: "",
    brand: "",
    model: "",
    color: "",
    size: "",
    material: "",
    salePrice: "",
    costPrice: "",
    marginPercent: "",
    stockControlled: true,
    stockQty: "0",
    stockMin: "5",
    stockMax: "",
    category: "",
    supplierId: "",
    notes: "",
    // Campos específicos para lentes
    spherical: "",
    cylindrical: "",
    axis: "",
    addition: "",
    lensType: "",
    lensMaterial: "",
    lensIndex: "",
    lensTreatment: "",
    lensDiameter: "",
  });

  // Handler para atualizar preços (calcula margem automaticamente)
  const handlePriceChange = (field: "salePrice" | "costPrice", value: string) => {
    const newSale = field === "salePrice" ? parseFloat(value) : parseFloat(formData.salePrice);
    const newCost = field === "costPrice" ? parseFloat(value) : parseFloat(formData.costPrice);

    // Calcula a margem sempre que preço de venda ou custo mudar
    let newMargin = "";
    if (newSale > 0 && newCost >= 0) {
      newMargin = calculateMargin(newSale, newCost).toFixed(2);
    }

    setFormData({
      ...formData,
      [field]: value,
      marginPercent: newMargin,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log("🚀 [FORM] Iniciando submit com formData.type:", formData.type);

    try {
      // Sanitize data - remove empty strings and convert numbers
      const sanitizedData: any = {
        type: formData.type,
        name: formData.name,
        sku: formData.sku,
        salePrice: parseFloat(formData.salePrice),
        stockControlled: formData.stockControlled,
        stockQty: parseInt(formData.stockQty) || 0,
      };

      // Optional fields (apenas campos que existem no schema)
      if (formData.barcode) sanitizedData.barcode = formData.barcode;
      if (formData.costPrice) sanitizedData.costPrice = parseFloat(formData.costPrice);
      if (formData.marginPercent) sanitizedData.marginPercent = parseFloat(formData.marginPercent);
      if (formData.stockMin) sanitizedData.stockMin = parseInt(formData.stockMin);
      if (formData.stockMax) sanitizedData.stockMax = parseInt(formData.stockMax);
      if (formData.supplierId) sanitizedData.supplierId = formData.supplierId;

      console.log("📤 [FORM] Enviando dados:", sanitizedData);

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizedData),
      });

      console.log("📥 [FORM] Response status:", res.status);

      if (!res.ok) {
        let error;
        try {
          error = await res.json();
          console.error("❌ [FORM] Erro da API:", error);
        } catch (e) {
          console.error("❌ [FORM] Erro ao parsear resposta:", e);
          const text = await res.text();
          console.error("❌ [FORM] Resposta raw:", text);
          throw new Error(`Erro HTTP ${res.status}: ${text || res.statusText}`);
        }

        // Mostrar detalhes dos campos inválidos
        if (error.error?.details) {
          const fieldErrors = error.error.details.map((d: any) => `${d.field}: ${d.message}`).join("\n");
          console.error("🔍 [FORM] Campos inválidos:", fieldErrors);
          throw new Error(`Dados inválidos:\n${fieldErrors}`);
        }

        throw new Error(error.error?.message || "Erro ao criar produto");
      }

      const { data: createdProduct } = await res.json();

      toast.success(`Produto ${createdProduct.name} criado com sucesso!`);
      router.push("/dashboard/produtos");
    } catch (error: any) {
      console.error("Erro ao criar produto:", error);
      const errorMessage = error.message || "Erro ao criar produto. Tente novamente.";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isLensType = formData.type === "LENS_SERVICE" || formData.type === "CONTACT_LENS";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/produtos">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Novo Produto</h1>
          <p className="text-muted-foreground">Cadastre um novo produto no catálogo</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Dados do Produto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dados Básicos */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">
                  Tipo <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FRAME">Armação</SelectItem>
                    <SelectItem value="LENS_SERVICE">Lente</SelectItem>
                    <SelectItem value="SUNGLASSES">Óculos de Sol</SelectItem>
                    <SelectItem value="CONTACT_LENS">Lente de Contato</SelectItem>
                    <SelectItem value="ACCESSORY">Acessório</SelectItem>
                    <SelectItem value="SERVICE">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">
                  Nome <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku">
                  SKU/Código <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="sku"
                  required
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                  placeholder="Ex: ARM-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="barcode">Código de Barras</Label>
                <Input
                  id="barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Marca</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Modelo</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Cor</Label>
                <Input
                  id="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="size">Tamanho</Label>
                <Input
                  id="size"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="Ex: M, 52-18-140"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="material">Material</Label>
                <Input
                  id="material"
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
            </div>

            {/* Preços */}
            <div>
              <h3 className="font-semibold mb-4">Precificação</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="salePrice">
                    Preço de Venda (R$) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="salePrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.salePrice}
                    onChange={(e) => handlePriceChange("salePrice", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="costPrice">Preço de Custo (R$)</Label>
                  <Input
                    id="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.costPrice}
                    onChange={(e) => handlePriceChange("costPrice", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="marginPercent">
                    Margem (%)
                    <span className="text-xs text-muted-foreground ml-2">(calculado automaticamente)</span>
                  </Label>
                  <Input
                    id="marginPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.marginPercent}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                    title="A margem é calculada automaticamente com base no preço de venda e custo"
                  />
                </div>
              </div>
            </div>

            {/* Estoque */}
            <div>
              <h3 className="font-semibold mb-4">Estoque</h3>

              {/* Toggle Controla Estoque */}
              <div className="flex items-center space-x-2 mb-4">
                <Switch
                  id="stockControlled"
                  checked={formData.stockControlled}
                  onCheckedChange={(checked) => setFormData({ ...formData, stockControlled: checked })}
                />
                <Label htmlFor="stockControlled" className="cursor-pointer">
                  Controlar Estoque
                </Label>
                <span className="text-sm text-muted-foreground">
                  {formData.stockControlled
                    ? "(Não permitir vendas com estoque zero)"
                    : "(Permite vendas independente do estoque)"}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="stockQty">Quantidade em Estoque</Label>
                  <Input
                    id="stockQty"
                    type="number"
                    min="0"
                    value={formData.stockQty}
                    onChange={(e) => setFormData({ ...formData, stockQty: e.target.value })}
                    disabled={!formData.stockControlled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stockMin">Estoque Mínimo</Label>
                  <Input
                    id="stockMin"
                    type="number"
                    min="0"
                    value={formData.stockMin}
                    onChange={(e) => setFormData({ ...formData, stockMin: e.target.value })}
                    disabled={!formData.stockControlled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stockMax">Estoque Máximo</Label>
                  <Input
                    id="stockMax"
                    type="number"
                    min="0"
                    value={formData.stockMax}
                    onChange={(e) => setFormData({ ...formData, stockMax: e.target.value })}
                    disabled={!formData.stockControlled}
                  />
                </div>
              </div>
            </div>

            {/* Campos específicos para Lentes */}
            {isLensType && (
              <div>
                <h3 className="font-semibold mb-4">Especificações de Lente</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Informe a disponibilidade da lente (ranges de dioptrias disponíveis para venda)
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="spherical">Esférico</Label>
                    <Input
                      id="spherical"
                      value={formData.spherical}
                      onChange={(e) => setFormData({ ...formData, spherical: e.target.value })}
                      placeholder="-6.00 a +6.00"
                    />
                    <p className="text-xs text-muted-foreground">Ex: -10.00 a +9.00</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cylindrical">Cilíndrico</Label>
                    <Input
                      id="cylindrical"
                      value={formData.cylindrical}
                      onChange={(e) => setFormData({ ...formData, cylindrical: e.target.value })}
                      placeholder="-6.00 a +6.00"
                    />
                    <p className="text-xs text-muted-foreground">Ex: -4.00 a 0.00</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="axis">Eixo</Label>
                    <Input
                      id="axis"
                      value={formData.axis}
                      onChange={(e) => setFormData({ ...formData, axis: e.target.value })}
                      placeholder="0 a 180"
                    />
                    <p className="text-xs text-muted-foreground">Graus (0° a 180°)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="addition">Adição</Label>
                    <Input
                      id="addition"
                      value={formData.addition}
                      onChange={(e) => setFormData({ ...formData, addition: e.target.value })}
                      placeholder="+0.75 a +4.00"
                    />
                    <p className="text-xs text-muted-foreground">Ex: +0.75 a +3.50 (multifocal)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lensType">Tipo de Lente</Label>
                    <Input
                      id="lensType"
                      value={formData.lensType}
                      onChange={(e) => setFormData({ ...formData, lensType: e.target.value })}
                      placeholder="Ex: Visão Simples, Multifocal"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lensMaterial">Material da Lente</Label>
                    <Input
                      id="lensMaterial"
                      value={formData.lensMaterial}
                      onChange={(e) => setFormData({ ...formData, lensMaterial: e.target.value })}
                      placeholder="Ex: CR-39, Policarbonato"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lensIndex">Índice de Refração</Label>
                    <Input
                      id="lensIndex"
                      value={formData.lensIndex}
                      onChange={(e) => setFormData({ ...formData, lensIndex: e.target.value })}
                      placeholder="Ex: 1.56, 1.67, 1.74"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lensTreatment">Tratamento</Label>
                    <Input
                      id="lensTreatment"
                      value={formData.lensTreatment}
                      onChange={(e) => setFormData({ ...formData, lensTreatment: e.target.value })}
                      placeholder="Ex: Antirreflexo, Fotocromático"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lensDiameter">Diâmetro (mm)</Label>
                    <Input
                      id="lensDiameter"
                      value={formData.lensDiameter}
                      onChange={(e) => setFormData({ ...formData, lensDiameter: e.target.value })}
                      placeholder="Ex: 65, 70, 75"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fornecedor */}
            <SupplierSelect
              value={formData.supplierId}
              onChange={(supplierId) => setFormData({ ...formData, supplierId })}
            />

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar Produto"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/produtos")}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
