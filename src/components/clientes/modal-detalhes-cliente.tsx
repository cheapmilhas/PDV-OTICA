"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency, formatCPF } from "@/lib/utils";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  TrendingUp,
  CreditCard,
} from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  dataNascimento: string;
  ultimaCompra: string;
  totalCompras: number;
  valorTotal: number;
  status: string;
}

interface ModalDetalhesClienteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: Cliente | null;
}

const getStatusVariant = (status: string) => {
  switch (status) {
    case "vip":
      return "default";
    case "active":
      return "secondary";
    case "inactive":
      return "outline";
    default:
      return "secondary";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "vip":
      return "VIP";
    case "active":
      return "Ativo";
    case "inactive":
      return "Inativo";
    default:
      return status;
  }
};

const getInitials = (nome: string) => {
  const parts = nome.split(" ");
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
};

const calcularIdade = (dataNascimento: string) => {
  const hoje = new Date();
  const nascimento = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mes = hoje.getMonth() - nascimento.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
    idade--;
  }
  return idade;
};

export function ModalDetalhesCliente({ open, onOpenChange, cliente }: ModalDetalhesClienteProps) {
  if (!cliente) return null;

  const ticketMedio = cliente.totalCompras > 0 ? cliente.valorTotal / cliente.totalCompras : 0;
  const idade = calcularIdade(cliente.dataNascimento);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Detalhes do Cliente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header do Cliente */}
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">
                {getInitials(cliente.nome)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{cliente.nome}</h3>
              <p className="text-sm text-muted-foreground">
                {idade} anos • CPF: {formatCPF(cliente.cpf)}
              </p>
            </div>
            <Badge variant={getStatusVariant(cliente.status)}>
              {getStatusLabel(cliente.status)}
            </Badge>
          </div>

          <Separator />

          {/* Informações de Contato */}
          <div className="space-y-3">
            <h4 className="font-semibold">Informações de Contato</h4>
            <div className="grid gap-3">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{cliente.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="font-medium">{cliente.telefone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                  <p className="font-medium">{formatDate(cliente.dataNascimento)}</p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Estatísticas de Compras */}
          <div className="space-y-3">
            <h4 className="font-semibold">Histórico de Compras</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShoppingBag className="h-4 w-4" />
                  <span>Total de Compras</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{cliente.totalCompras}</p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CreditCard className="h-4 w-4" />
                  <span>Valor Total</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-green-600">
                  {formatCurrency(cliente.valorTotal)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span>Ticket Médio</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-blue-600">
                  {formatCurrency(ticketMedio)}
                </p>
              </div>
            </div>
          </div>

          {/* Última Compra */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Última Compra</p>
                <p className="mt-1 text-lg font-semibold">
                  {formatDate(cliente.ultimaCompra)}
                </p>
              </div>
              {(() => {
                const diasDesdeUltimaCompra = Math.floor(
                  (new Date().getTime() - new Date(cliente.ultimaCompra).getTime()) /
                  (1000 * 60 * 60 * 24)
                );
                return (
                  <Badge variant={diasDesdeUltimaCompra > 60 ? "destructive" : "secondary"}>
                    {diasDesdeUltimaCompra === 0
                      ? "Hoje"
                      : `Há ${diasDesdeUltimaCompra} dias`}
                  </Badge>
                );
              })()}
            </div>
          </div>

          {/* Classificação */}
          {cliente.status === "vip" && (
            <div className="rounded-lg border-2 border-primary bg-primary/10 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  ⭐
                </div>
                <div>
                  <p className="font-semibold">Cliente VIP</p>
                  <p className="text-sm text-muted-foreground">
                    Cliente premium com benefícios especiais
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
