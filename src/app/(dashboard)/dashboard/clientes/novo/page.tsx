"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NovoClientePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    email: "",
    phone: "",
    phone2: "",
    birthDate: "",
    gender: "",
    address: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
    notes: "",
    referralSource: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao criar cliente");
      }

      const { data: createdCustomer } = await res.json();

      toast.success(`Cliente ${createdCustomer.name} criado com sucesso!`);
      router.push("/dashboard/clientes");
    } catch (error: any) {
      console.error("Erro ao criar cliente:", error);
      const errorMessage = error.message || "Erro ao criar cliente. Tente novamente.";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/clientes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Novo Cliente</h1>
          <p className="text-muted-foreground">Cadastre um novo cliente no sistema</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dados Pessoais */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nome Completo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value.replace(/\D/g, "") })}
                  maxLength={11}
                  placeholder="Apenas números"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone2">Telefone 2</Label>
                <Input
                  id="phone2"
                  value={formData.phone2}
                  onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate">Data de Nascimento</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gênero</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => setFormData({ ...formData, gender: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="referralSource">Como nos conheceu?</Label>
                <Input
                  id="referralSource"
                  value={formData.referralSource}
                  onChange={(e) => setFormData({ ...formData, referralSource: e.target.value })}
                  placeholder="Ex: Indicação, Google, Redes Sociais"
                />
              </div>
            </div>

            {/* Endereço */}
            <div>
              <h3 className="font-semibold mb-4">Endereço</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input
                    id="number"
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="complement">Complemento</Label>
                  <Input
                    id="complement"
                    value={formData.complement}
                    onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro</Label>
                  <Input
                    id="neighborhood"
                    value={formData.neighborhood}
                    onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Estado (UF)</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar Cliente"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/clientes")}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
