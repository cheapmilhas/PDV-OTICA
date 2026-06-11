"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";
import { UserPlus, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ModalNovoClienteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClienteCriado?: (cliente: any) => void;
}

export function ModalNovoCliente({ open, onOpenChange, onClienteCriado }: ModalNovoClienteProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    cpf: "",
    birthDate: "",
    gender: "",
    zipCode: "",
    address: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  const [mostrarMais, setMostrarMais] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormData({
        name: "",
        phone: "",
        email: "",
        cpf: "",
        birthDate: "",
        gender: "",
        zipCode: "",
        address: "",
        number: "",
        neighborhood: "",
        city: "",
        state: "",
      });
      setMostrarMais(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);

    try {
      // Preparar dados do cliente
      const customerData: any = {
        name: formData.name,
        phone: formData.phone.replace(/\D/g, ""), // Remover formatação
      };

      if (formData.email) {
        customerData.email = formData.email;
      }

      if (formData.cpf) {
        customerData.cpf = formData.cpf.replace(/\D/g, ""); // Remover formatação
      }

      if (formData.birthDate) customerData.birthDate = formData.birthDate;
      if (formData.gender) customerData.gender = formData.gender;
      if (formData.zipCode) customerData.zipCode = formData.zipCode.replace(/\D/g, "");
      if (formData.address) customerData.address = formData.address;
      if (formData.number) customerData.number = formData.number;
      if (formData.neighborhood) customerData.neighborhood = formData.neighborhood;
      if (formData.city) customerData.city = formData.city;
      if (formData.state) customerData.state = formData.state;

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao cadastrar cliente");
      }

      const data = await res.json();

      toast.success(`Cliente ${formData.name} cadastrado com sucesso!`);

      onClienteCriado?.(data.data);

      // Limpar formulário
      setFormData({
        name: "",
        phone: "",
        email: "",
        cpf: "",
        birthDate: "",
        gender: "",
        zipCode: "",
        address: "",
        number: "",
        neighborhood: "",
        city: "",
        state: "",
      });
      setMostrarMais(false);

      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao cadastrar cliente:", error);
      toast.error(error.message || "Erro ao cadastrar cliente");
    } finally {
      setLoading(false);
    }
  };

  const formatarTelefone = (valor: string) => {
    const numeros = valor.replace(/\D/g, "");
    if (numeros.length <= 10) {
      return numeros.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return numeros.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  };

  const formatarCPF = (valor: string) => {
    const numeros = valor.replace(/\D/g, "");
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Cadastro Rápido de Cliente
          </DialogTitle>
          <DialogDescription>
            Preencha os dados básicos do cliente para continuar a venda
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nome Completo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Ex: Maria Silva Santos"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">
                Telefone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                placeholder="(11) 98765-4321"
                value={formData.phone}
                onChange={(e) => {
                  const formatted = formatarTelefone(e.target.value);
                  setFormData({ ...formData, phone: formatted });
                }}
                maxLength={15}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF (opcional)</Label>
              <Input
                id="cpf"
                placeholder="000.000.000-00"
                value={formData.cpf}
                onChange={(e) => {
                  const formatted = formatarCPF(e.target.value);
                  setFormData({ ...formData, cpf: formatted });
                }}
                maxLength={14}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email (opcional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="cliente@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start px-0 text-muted-foreground"
              onClick={() => setMostrarMais((v) => !v)}
              disabled={loading}
            >
              {mostrarMais ? "− Ocultar informações adicionais" : "+ Adicionar mais informações"}
            </Button>

            {mostrarMais && (
              <div className="space-y-4 rounded-lg border p-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Data de nascimento</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gênero</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => setFormData({ ...formData, gender: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="gender">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Feminino</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input id="zipCode" placeholder="00000-000" value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })} disabled={loading} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number">Número</Label>
                    <Input id="number" value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })} disabled={loading} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input id="address" placeholder="Rua, avenida..." value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })} disabled={loading} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro</Label>
                  <Input id="neighborhood" value={formData.neighborhood}
                    onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })} disabled={loading} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })} disabled={loading} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">UF</Label>
                    <Input id="state" maxLength={2} placeholder="SP" value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })} disabled={loading} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium">💡 Dica:</p>
            <p>Cadastre apenas os dados essenciais. Você pode completar o cadastro depois.</p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Cadastrar Cliente
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
