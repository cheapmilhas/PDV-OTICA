"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, Plus } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
}

interface ProductComboboxProps {
  companyId: string;
  onSelect: (product: Product) => void;
}

export function ProductCombobox({ companyId, onSelect }: ProductComboboxProps) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (search.length >= 2) {
      const timer = setTimeout(() => {
        searchProducts(search);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setProducts([]);
      setShowDropdown(false);
    }
  }, [search]);

  const searchProducts = async (term: string) => {
    try {
      setLoading(true);

      console.log(`[ProductCombobox] Buscando produtos com termo: "${term}"`);

      const response = await fetch(`/api/products/search?search=${encodeURIComponent(term)}`);
      console.log("[ProductCombobox] Response status:", response.status);

      const result = await response.json();
      console.log("[ProductCombobox] Result:", result);

      if (result.success && Array.isArray(result.data)) {
        console.log(`[ProductCombobox] ✅ ${result.data.length} produtos encontrados`);
        setProducts(result.data);
        setShowDropdown(true);
      } else {
        console.error("[ProductCombobox] ❌ Formato inesperado:", result);
        setProducts([]);
        setShowDropdown(false);
      }
    } catch (err) {
      console.error("[ProductCombobox] ❌ Exception:", err);
      setProducts([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (product: Product) => {
    console.log("[ProductCombobox] Produto selecionado:", product);
    onSelect(product);
    setSearch("");
    setShowDropdown(false);
    setProducts([]);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => products.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Digite o nome, SKU ou código de barras (mín. 2 caracteres)..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        )}
      </div>

      {search.length > 0 && search.length < 2 && (
        <p className="text-sm text-gray-500 mt-1">
          ℹ️ Digite ao menos 2 caracteres para buscar
        </p>
      )}

      {showDropdown && products.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => handleSelect(product)}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-0"
            >
              <div>
                <p className="font-medium text-gray-900">{product.name}</p>
                {(product.sku || product.barcode) && (
                  <p className="text-sm text-gray-500">
                    {product.sku && `SKU: ${product.sku}`}
                    {product.sku && product.barcode && " • "}
                    {product.barcode && `Código: ${product.barcode}`}
                  </p>
                )}
              </div>
              <Plus className="w-4 h-4 text-indigo-600" />
            </button>
          ))}
        </div>
      )}

      {showDropdown && products.length === 0 && !loading && search.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500">
          ❌ Nenhum produto encontrado para "{search}"
        </div>
      )}
    </div>
  );
}
