"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/brands");
      const result = await response.json();

      if (result.success) {
        setBrands(result.data || []);
      }
    } catch (error) {
      console.error("Erro ao buscar marcas:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      onValueChange={(value) => {
        const brand = brands.find((b) => b.id === value);
        if (brand) {
          onSelect(brand);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue
          placeholder={loading ? "Carregando..." : "Selecione uma marca"}
        />
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
