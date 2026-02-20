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

interface Supplier {
  id: string;
  name: string;
}

interface SupplierSelectProps {
  onSelect: (supplier: Supplier) => void;
}

export function SupplierSelect({ onSelect }: SupplierSelectProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("[SupplierSelect] Iniciando fetch...");

      const response = await fetch("/api/suppliers?pageSize=1000&status=ativos");
      console.log("[SupplierSelect] Response status:", response.status);

      const result = await response.json();
      console.log("[SupplierSelect] Result:", result);

      if (result.success && Array.isArray(result.data)) {
        console.log(`[SupplierSelect] ✅ ${result.data.length} fornecedores carregados`);
        setSuppliers(result.data);
      } else {
        const errorMsg = result.error?.message || result.error || "Erro ao carregar fornecedores";
        console.error("[SupplierSelect] ❌ Erro:", errorMsg);
        setError(errorMsg);
      }
    } catch (err: any) {
      console.error("[SupplierSelect] ❌ Exception:", err);
      setError(err.message || "Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando fornecedores...</span>
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

  if (suppliers.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-2">
        ℹ️ Nenhum fornecedor cadastrado no sistema
      </div>
    );
  }

  return (
    <Select
      onValueChange={(value) => {
        const supplier = suppliers.find((s) => s.id === value);
        if (supplier) {
          console.log("[SupplierSelect] Fornecedor selecionado:", supplier);
          onSelect(supplier);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecione um fornecedor..." />
      </SelectTrigger>
      <SelectContent>
        {suppliers.map((supplier) => (
          <SelectItem key={supplier.id} value={supplier.id}>
            {supplier.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
