"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";

interface Supplier {
  id: string;
  name: string;
  tradeName?: string | null;
}

interface SupplierSelectProps {
  value: string;
  onChange: (supplierId: string, supplierName: string) => void;
  label?: string;
  required?: boolean;
}

export function SupplierSelect({
  value,
  onChange,
  label = "Fornecedor",
  required = false,
}: SupplierSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dados do formulário de novo fornecedor
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    tradeName: "",
    cnpj: "",
    phone: "",
    email: "",
  });

  // Busca suppliers ao montar componente
  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Atualiza o campo de busca quando supplier é selecionado externamente
  useEffect(() => {
    if (value && suppliers.length > 0) {
      const supplier = suppliers.find((s) => s.id === value);
      if (supplier) {
        setSelectedSupplier(supplier);
        setSearchTerm(supplier.name);
      }
    }
  }, [value, suppliers]);

  // Filtra suppliers conforme busca
  useEffect(() => {
    if (searchTerm === "") {
      setFilteredSuppliers(suppliers);
    } else {
      const filtered = suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.tradeName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredSuppliers(filtered);
    }
  }, [searchTerm, suppliers]);

  // Fecha dropdown quando clica fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchSuppliers() {
    try {
      const res = await fetch("/api/suppliers?pageSize=100");
      if (!res.ok) throw new Error("Erro ao buscar fornecedores");
      const json = await res.json();
      setSuppliers(json.data || []);
    } catch (error) {
      console.error("Erro ao buscar fornecedores:", error);
      toast.error("Erro ao buscar fornecedores");
    }
  }

  // Formata CNPJ: 20.606.235/0001-39
  function formatCNPJ(value: string) {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 5) return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
    if (numbers.length <= 8) return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5)}`;
    if (numbers.length <= 12) return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8)}`;
    return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8, 12)}-${numbers.slice(12, 14)}`;
  }

  function handleSelectSupplier(supplier: Supplier) {
    setSelectedSupplier(supplier);
    setSearchTerm(supplier.name);
    setShowDropdown(false);
    onChange(supplier.id, supplier.name);
  }

  function handleInputChange(value: string) {
    setSearchTerm(value);
    setShowDropdown(true);
    // Se limpar o campo, limpa a seleção
    if (value === "") {
      setSelectedSupplier(null);
      onChange("", "");
    }
  }

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Remove formatação do CNPJ antes de enviar
      const supplierData = {
        ...newSupplier,
        cnpj: newSupplier.cnpj.replace(/\D/g, ""),
      };

      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao criar fornecedor");
      }

      const { data: createdSupplier } = await res.json();

      toast.success(`Fornecedor ${createdSupplier.name} criado com sucesso!`);

      // Atualiza lista e seleciona o novo fornecedor
      await fetchSuppliers();
      handleSelectSupplier(createdSupplier);

      // Fecha dialog e limpa formulário
      setShowDialog(false);
      setNewSupplier({
        name: "",
        tradeName: "",
        cnpj: "",
        phone: "",
        email: "",
      });
    } catch (error: any) {
      console.error("Erro ao criar fornecedor:", error);
      toast.error(error.message || "Erro ao criar fornecedor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="space-y-2" ref={dropdownRef}>
        <div className="flex items-center gap-2">
          <Label htmlFor="supplier">
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDialog(true)}
            className="h-6 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Novo
          </Button>
        </div>
        <div className="relative">
          <Input
            id="supplier"
            value={searchTerm}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            placeholder="Digite para buscar ou selecionar..."
            required={required}
            autoComplete="off"
          />
          {showDropdown && filteredSuppliers.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
              {filteredSuppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => handleSelectSupplier(supplier)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
                >
                  {selectedSupplier?.id === supplier.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                  <div>
                    <div className="font-medium">{supplier.name}</div>
                    {supplier.tradeName && (
                      <div className="text-xs text-muted-foreground">{supplier.tradeName}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog para criar novo fornecedor */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Fornecedor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSupplier}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-supplier-name">
                  Nome <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="new-supplier-name"
                  required
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-tradeName">Razão Social</Label>
                <Input
                  id="new-supplier-tradeName"
                  value={newSupplier.tradeName}
                  onChange={(e) => setNewSupplier({ ...newSupplier, tradeName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-cnpj">CNPJ</Label>
                <Input
                  id="new-supplier-cnpj"
                  value={formatCNPJ(newSupplier.cnpj)}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, cnpj: e.target.value.replace(/\D/g, "") })
                  }
                  maxLength={18}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-phone">Telefone</Label>
                <Input
                  id="new-supplier-phone"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-email">Email</Label>
                <Input
                  id="new-supplier-email"
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
