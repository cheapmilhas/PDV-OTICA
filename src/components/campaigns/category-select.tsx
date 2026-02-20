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

interface Category {
  id: string;
  name: string;
}

interface CategorySelectProps {
  onSelect: (category: Category) => void;
}

export function CategorySelect({ onSelect }: CategorySelectProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("[CategorySelect] Iniciando fetch...");

      const response = await fetch("/api/categories");
      console.log("[CategorySelect] Response status:", response.status);

      const result = await response.json();
      console.log("[CategorySelect] Result:", result);

      if (result.success && Array.isArray(result.data)) {
        console.log(`[CategorySelect] ✅ ${result.data.length} categorias carregadas`);
        setCategories(result.data);
      } else {
        const errorMsg = result.error?.message || result.error || "Erro ao carregar categorias";
        console.error("[CategorySelect] ❌ Erro:", errorMsg);
        setError(errorMsg);
      }
    } catch (err: any) {
      console.error("[CategorySelect] ❌ Exception:", err);
      setError(err.message || "Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando categorias...</span>
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

  if (categories.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-2">
        ℹ️ Nenhuma categoria cadastrada no sistema
      </div>
    );
  }

  return (
    <Select
      onValueChange={(value) => {
        const category = categories.find((c) => c.id === value);
        if (category) {
          console.log("[CategorySelect] Categoria selecionada:", category);
          onSelect(category);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecione uma categoria..." />
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
