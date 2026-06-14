"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export interface Seller {
  id: string;
  name: string;
}

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "GOOGLE", label: "Google" },
  { value: "REFERRAL", label: "Indicação" },
  { value: "WALK_IN", label: "Espontâneo (loja)" },
  { value: "OTHER", label: "Outro" },
];

const NONE = "__none__";

interface NovoLeadModalProps {
  open: boolean;
  sellers: Seller[];
  onOpenChange: (open: boolean) => void;
  /** Chamado após criar com sucesso (para o container refazer o fetch). */
  onCreated: () => void;
}

export function NovoLeadModal({
  open,
  sellers,
  onOpenChange,
  onCreated,
}: NovoLeadModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("");
  const [source, setSource] = useState<string>(NONE);
  const [sellerUserId, setSellerUserId] = useState<string>(NONE);
  const [estimatedValue, setEstimatedValue] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setInterest("");
    setSource(NONE);
    setSellerUserId(NONE);
    setEstimatedValue("");
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Informe o nome do lead");
      return;
    }
    setSaving(true);
    try {
      const parsedValue = estimatedValue
        ? Number(estimatedValue.replace(",", "."))
        : undefined;

      const body: Record<string, unknown> = { name: name.trim() };
      if (phone.trim()) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim();
      if (interest.trim()) body.interest = interest.trim();
      if (source !== NONE) body.source = source;
      if (sellerUserId !== NONE) body.sellerUserId = sellerUserId;
      if (parsedValue != null && !Number.isNaN(parsedValue)) {
        body.estimatedValue = parsedValue;
      }

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erro ao criar lead");
      }

      const json = await res.json();
      if (json?.data?.duplicateWarning) {
        toast(
          "Já existe um lead com este telefone — cadastramos mesmo assim.",
          { icon: "⚠️", duration: 5000 }
        );
      } else {
        toast.success("Lead criado!");
      }

      reset();
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao criar lead"
      );
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
          <DialogDescription>
            Só o nome é obrigatório. Os demais campos ajudam a acompanhar o
            funil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="lead-name">Nome *</Label>
            <Input
              id="lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do cliente"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-phone">Telefone</Label>
              <Input
                id="lead-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-interest">Interesse</Label>
            <Input
              id="lead-interest"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="Ex: óculos de grau, lente de contato, óculos de sol..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={sellerUserId} onValueChange={setSellerUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Eu mesmo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Eu mesmo</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-value">Valor estimado (R$)</Label>
            <Input
              id="lead-value"
              inputMode="decimal"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            O lead entra automaticamente na primeira etapa do funil.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
