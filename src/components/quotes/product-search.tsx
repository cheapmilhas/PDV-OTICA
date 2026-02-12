"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, Package, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

interface Product {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
  stockQty: number;
}

interface ProductSearchProps {
  onSelectProduct: (product: Product) => void;
}

export function ProductSearch({ onSelectProduct }: ProductSearchProps) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      if (search.length < 2) {
        setProducts([]);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          search,
          status: "ativos",
          pageSize: "10",
        });

        const res = await fetch(`/api/products?${params}`);
        if (!res.ok) throw new Error("Erro ao buscar produtos");

        const data = await res.json();
        setProducts(data.data || []);
        setShowResults(true);
      } catch (error: any) {
        console.error("Erro ao buscar produtos:", error);
        toast.error("Erro ao buscar produtos");
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      loadProducts();
    }, 300);

    return () => clearTimeout(debounce);
  }, [search]);

  const handleSelectProduct = (product: Product) => {
    onSelectProduct(product);
    setSearch("");
    setProducts([]);
    setShowResults(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => search.length >= 2 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Buscar produto por nome, SKU ou código..."
          className="pl-10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Resultados */}
      {showResults && products.length > 0 && (
        <Card className="absolute z-50 w-full mt-1 max-h-80 overflow-auto shadow-lg">
          <div className="divide-y">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className="w-full p-3 hover:bg-muted transition-colors text-left flex items-start gap-3"
              >
                <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{product.name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    <span>SKU: {product.sku}</span>
                    <span>•</span>
                    <span>Estoque: {product.stockQty}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary">
                    {formatCurrency(product.salePrice)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {showResults && search.length >= 2 && products.length === 0 && !loading && (
        <Card className="absolute z-50 w-full mt-1 p-4 text-center text-sm text-muted-foreground shadow-lg">
          Nenhum produto encontrado
        </Card>
      )}
    </div>
  );
}
