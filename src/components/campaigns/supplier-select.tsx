"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/suppliers");
      const result = await response.json();

      if (result.success) {
        setSuppliers(result.data || []);
      }
    } catch (error) {
      console.error("Erro ao buscar fornecedores:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      onValueChange={(value) => {
        const supplier = suppliers.find((s) => s.id === value);
        if (supplier) {
          onSelect(supplier);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue
          placeholder={loading ? "Carregando..." : "Selecione um fornecedor"}
        />
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
