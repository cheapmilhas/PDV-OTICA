"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export default function EditarProdutoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [formData, setFormData] = useState({
    type: "",
    name: "",
    sku: "",
    barcode: "",
    brandId: "",
    categoryId: "",
    description: "",
    // Frame detail
    frameModel: "",
    frameColor: "",
    frameSize: "",
    frameMaterial: "",
    // Preços
    salePrice: "",
    costPrice: "",
    marginPercent: "",
    // Estoque
    stockQty: "",
    stockMin: "",
    stockMax: "",
    supplierId: "",
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

  // Buscar dados do produto + marcas/categorias
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productRes, brandsRes, categoriesRes] = await Promise.all([
          fetch(`/api/products/${id}`),
          fetch("/api/brands?pageSize=200"),
          fetch("/api/categories?pageSize=200"),
        ]);

        if (!productRes.ok) throw new Error("Erro ao carregar produto");

        const { data } = await productRes.json();

        if (brandsRes.ok) {
          const bData = await brandsRes.json();
          setBrands(bData.data || []);
        }
        if (categoriesRes.ok) {
          const cData = await categoriesRes.json();
          setCategories(cData.data || []);
        }

        setFormData({
          type: data.type || "",
          name: data.name || "",
          sku: data.sku || "",
          barcode: data.barcode || "",
          brandId: data.brandId || "",
          categoryId: data.categoryId || "",
          description: data.description || "",
          frameModel: data.frameDetail?.collection || "",
          frameColor: "",
          frameSize: data.frameDetail?.sizeText || "",
          frameMaterial: data.frameDetail?.material || "",
          salePrice: data.salePrice ? data.salePrice.toString() : "",
          costPrice: data.costPrice ? data.costPrice.toString() : "",
          marginPercent: data.marginPercent ? data.marginPercent.toString() : "",
          stockQty: data.stockQty !== null ? data.stockQty.toString() : "",
          stockMin: data.stockMin ? data.stockMin.toString() : "",
          stockMax: data.stockMax ? data.stockMax.toString() : "",
          supplierId: data.supplierId || "",
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
      } catch (error: any) {
        toast.error(error.message);
        router.push("/dashboard/produtos");
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [id, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const sanitizedData: any = {};

      if (formData.type) sanitizedData.type = formData.type;
      if (formData.name) sanitizedData.name = formData.name;
      if (formData.sku) sanitizedData.sku = formData.sku;
      if (formData.barcode) sanitizedData.barcode = formData.barcode;
      if (formData.salePrice) sanitizedData.salePrice = parseFloat(formData.salePrice);
      if (formData.costPrice) sanitizedData.costPrice = parseFloat(formData.costPrice);
      if (formData.marginPercent) sanitizedData.marginPercent = parseFloat(formData.marginPercent);
      if (formData.stockQty !== "") sanitizedData.stockQty = parseInt(formData.stockQty);
      if (formData.stockMin) sanitizedData.stockMin = parseInt(formData.stockMin);
      if (formData.stockMax) sanitizedData.stockMax = parseInt(formData.stockMax);
      if (formData.description) sanitizedData.description = formData.description;

      // Relações (IDs)
      if (formData.brandId) sanitizedData.brandId = formData.brandId;
      if (formData.categoryId) sanitizedData.categoryId = formData.categoryId;
      if (formData.supplierId) sanitizedData.supplierId = formData.supplierId;

      // Frame detail
      if (formData.frameModel) sanitizedData.frameModel = formData.frameModel;
      if (formData.frameColor) sanitizedData.frameColor = formData.frameColor;
      if (formData.frameSize) sanitizedData.frameSize = formData.frameSize;
      if (formData.frameMaterial) sanitizedData.frameMaterial = formData.frameMaterial;

      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizedData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao atualizar produto");
      }

      toast.success("Produto atualizado com sucesso!");
      router.push("/dashboard/produtos");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold">Editar Produto</h1>
          <p className="text-muted-foreground">Atualize os dados do produto</p>
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
                <Label htmlFor="brandId">Marca</Label>
                <Select
                  value={formData.brandId}
                  onValueChange={(value) => setFormData({ ...formData, brandId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoryId">Categoria</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="frameModel">Modelo</Label>
                <Input
                  id="frameModel"
                  value={formData.frameModel}
                  onChange={(e) => setFormData({ ...formData, frameModel: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="frameColor">Cor</Label>
                <Input
                  id="frameColor"
                  value={formData.frameColor}
                  onChange={(e) => setFormData({ ...formData, frameColor: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="frameSize">Tamanho</Label>
                <Input
                  id="frameSize"
                  value={formData.frameSize}
                  onChange={(e) => setFormData({ ...formData, frameSize: e.target.value })}
                  placeholder="Ex: M, 52-18-140"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="frameMaterial">Material</Label>
                <Input
                  id="frameMaterial"
                  value={formData.frameMaterial}
                  onChange={(e) => setFormData({ ...formData, frameMaterial: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="marginPercent">Margem (%)</Label>
                  <Input
                    id="marginPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.marginPercent}
                    onChange={(e) => setFormData({ ...formData, marginPercent: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Estoque */}
            <div>
              <h3 className="font-semibold mb-4">Estoque</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="stockQty">Quantidade em Estoque</Label>
                  <Input
                    id="stockQty"
                    type="number"
                    min="0"
                    value={formData.stockQty}
                    onChange={(e) => setFormData({ ...formData, stockQty: e.target.value })}
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
                  />
                </div>
              </div>
            </div>

            {/* Campos específicos para Lentes */}
            {isLensType && (
              <div>
                <h3 className="font-semibold mb-4">Especificações de Lente</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="spherical">Esférico</Label>
                    <Input
                      id="spherical"
                      type="number"
                      step="0.25"
                      value={formData.spherical}
                      onChange={(e) => setFormData({ ...formData, spherical: e.target.value })}
                      placeholder="-10.00 a +10.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cylindrical">Cilíndrico</Label>
                    <Input
                      id="cylindrical"
                      type="number"
                      step="0.25"
                      value={formData.cylindrical}
                      onChange={(e) => setFormData({ ...formData, cylindrical: e.target.value })}
                      placeholder="-6.00 a +6.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="axis">Eixo</Label>
                    <Input
                      id="axis"
                      type="number"
                      min="0"
                      max="180"
                      value={formData.axis}
                      onChange={(e) => setFormData({ ...formData, axis: e.target.value })}
                      placeholder="0 a 180"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="addition">Adição</Label>
                    <Input
                      id="addition"
                      type="number"
                      step="0.25"
                      value={formData.addition}
                      onChange={(e) => setFormData({ ...formData, addition: e.target.value })}
                      placeholder="+0.75 a +4.00"
                    />
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
                      type="number"
                      step="0.1"
                      value={formData.lensDiameter}
                      onChange={(e) => setFormData({ ...formData, lensDiameter: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fornecedor */}
            <div className="space-y-2">
              <Label htmlFor="supplierId">Fornecedor</Label>
              <Input
                id="supplierId"
                value={formData.supplierId}
                onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                placeholder="ID do fornecedor"
                className="hidden"
              />
              <p className="text-sm text-muted-foreground">
                Fornecedor vinculado ao produto (se aplicável)
              </p>
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="description">Observações</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Atualizar Produto"}
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
