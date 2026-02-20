"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Brand {
  id: string;
  name: string;
}

interface BrandSelectProps {
  onSelect: (brand: Brand) => void;
}

export function BrandSelect({ onSelect }: BrandSelectProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("[BrandSelect] Iniciando fetch...");

      const response = await fetch("/api/brands");
      console.log("[BrandSelect] Response status:", response.status);

      const result = await response.json();
      console.log("[BrandSelect] Result:", result);

      if (result.success && Array.isArray(result.data)) {
        console.log(`[BrandSelect] ✅ ${result.data.length} marcas carregadas`);
        setBrands(result.data);
      } else {
        const errorMsg = result.error?.message || result.error || "Erro ao carregar marcas";
        console.error("[BrandSelect] ❌ Erro:", errorMsg);
        setError(errorMsg);
      }
    } catch (err: any) {
      console.error("[BrandSelect] ❌ Exception:", err);
      setError(err.message || "Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando marcas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 text-sm py-2">
        ❌ {error}
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-2">
        ℹ️ Nenhuma marca cadastrada no sistema
      </div>
    );
  }

  return (
    <Select
      onValueChange={(value) => {
        const brand = brands.find((b) => b.id === value);
        if (brand) {
          console.log("[BrandSelect] Marca selecionada:", brand);
          onSelect(brand);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecione uma marca..." />
      </SelectTrigger>
      <SelectContent>
        {brands.map((brand) => (
          <SelectItem key={brand.id} value={brand.id}>
            {brand.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
