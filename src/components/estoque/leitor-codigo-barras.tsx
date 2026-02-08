"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Barcode, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  stockQty: number;
  salePrice: number;
  category?: { name: string };
  brand?: { name: string };
}

interface LeitorCodigoBarrasProps {
  onProductFound?: (product: Product) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export function LeitorCodigoBarras({
  onProductFound,
  autoFocus = true,
  placeholder = "Escaneie ou digite o código de barras...",
}: LeitorCodigoBarrasProps) {
  const [code, setCode] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [lastProduct, setLastProduct] = useState<Product | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  async function searchProduct(barcode: string) {
    if (!barcode.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/products/search-by-barcode?code=${encodeURIComponent(barcode)}`
      );
      const result = await response.json();

      if (response.ok && result.data) {
        setLastProduct(result.data);
        toast.success(`Produto encontrado: ${result.data.name}`);
        onProductFound?.(result.data);
        setCode("");
      } else {
        setLastProduct(null);
        toast.error("Produto não encontrado");
      }
    } catch (error) {
      toast.error("Erro ao buscar produto");
      setLastProduct(null);
    } finally {
      setIsSearching(false);
    }
  }

  function handleInputChange(value: string) {
    setCode(value);

    // Clear timeout anterior
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Se tiver mais de 5 caracteres, aguarda 300ms sem digitação para buscar
    // (isso funciona bem com scanners USB que digitam rápido)
    if (value.length >= 5) {
      searchTimeoutRef.current = setTimeout(() => {
        searchProduct(value);
      }, 300);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchProduct(code);
    }
  }

  function handleManualSearch() {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchProduct(code);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="pl-10"
            disabled={isSearching}
          />
        </div>
        <Button
          onClick={handleManualSearch}
          disabled={isSearching || !code.trim()}
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>

      {lastProduct && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{lastProduct.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    SKU: {lastProduct.sku}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    R$ {lastProduct.salePrice.toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Estoque: {lastProduct.stockQty}
                  </p>
                </div>
              </div>
              {(lastProduct.category || lastProduct.brand) && (
                <div className="flex gap-4 text-sm">
                  {lastProduct.category && (
                    <span>
                      <strong>Categoria:</strong> {lastProduct.category.name}
                    </span>
                  )}
                  {lastProduct.brand && (
                    <span>
                      <strong>Marca:</strong> {lastProduct.brand.name}
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        💡 Dica: Se você tem um leitor USB, basta escanear o código. A busca será
        automática.
      </div>
    </div>
  );
}
