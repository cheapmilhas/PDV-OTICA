"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Loader2,
  User,
  Calendar,
  AlertTriangle,
  FileText,
  Edit,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ServiceOrderDetails {
  id: string;
  createdAt: string;
  total: number;
  notes?: string;
  prescription?: string;
  expectedDate?: string;
  deliveredAt?: string;
  active: boolean;
  status: string;
  customer: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
  };
  branch?: {
    id: string;
    name: string;
  };
  laboratory?: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    type: string;
    description: string;
    price: number;
    observations?: string;
  }>;
}

export default function DetalhesOrdemServicoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<ServiceOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/service-orders/${id}`);
        if (!res.ok) throw new Error("Erro ao carregar ordem de serviço");

        const { data } = await res.json();
        setOrder(data);
      } catch (error: any) {
        toast.error(error.message);
        router.push("/dashboard/ordens-servico");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id, router]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Rascunho",
      APPROVED: "Aprovado",
      SENT_TO_LAB: "Enviado Lab",
      IN_PROGRESS: "Em Progresso",
      READY: "Pronto",
      DELIVERED: "Entregue",
      CANCELED: "Cancelado",
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string): any => {
    const variants: Record<string, any> = {
      DRAFT: "secondary",
      APPROVED: "default",
      SENT_TO_LAB: "outline",
      IN_PROGRESS: "default",
      READY: "default",
      DELIVERED: "default",
      CANCELED: "destructive",
    };
    return variants[status] || "secondary";
  };

  const calcularDiasRestantes = (expectedDate?: string) => {
    if (!expectedDate) return null;
    const hoje = new Date();
    const prazo = new Date(expectedDate);
    const diff = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const diasRestantes = calcularDiasRestantes(order.expectedDate);
  const prazoVencido =
    diasRestantes !== null &&
    diasRestantes < 0 &&
    order.status !== "DELIVERED" &&
    order.status !== "CANCELED";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ordens-servico">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Detalhes da Ordem de Serviço</h1>
            <p className="text-muted-foreground">
              {format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(order.status)}>
            {getStatusLabel(order.status)}
          </Badge>
          {order.active && order.status !== "DELIVERED" && (
            <Button
              size="sm"
              onClick={() => router.push(`/dashboard/ordens-servico/${id}/editar`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Ordem Cancelada Alert */}
      {!order.active && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">
              Esta ordem de serviço foi cancelada.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Prazo Vencido Alert */}
      {prazoVencido && (
        <Card className="border-orange-600 bg-orange-50">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <p className="text-sm text-orange-700">
              Atenção: Prazo de entrega vencido há {Math.abs(diasRestantes!)} dias.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(Number(order.total))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prazo de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.expectedDate ? (
              <div>
                <p className="text-lg font-bold">
                  {format(new Date(order.expectedDate), "dd/MM/yyyy", {
                    locale: ptBR,
                  })}
                </p>
                {diasRestantes !== null && order.status !== "DELIVERED" && order.status !== "CANCELED" && (
                  <p
                    className={`text-sm ${
                      prazoVencido ? "text-red-600 font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {prazoVencido
                      ? `Atrasado ${Math.abs(diasRestantes)} dias`
                      : diasRestantes === 0
                      ? "Vence hoje"
                      : diasRestantes === 1
                      ? "Vence amanhã"
                      : `${diasRestantes} dias restantes`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Não definido</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Data de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.deliveredAt ? (
              <p className="text-lg font-bold text-green-600">
                {format(new Date(order.deliveredAt), "dd/MM/yyyy", {
                  locale: ptBR,
                })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Não entregue</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-semibold">{order.customer.name}</p>
            </div>
            {order.customer.cpf && (
              <div>
                <p className="text-sm text-muted-foreground">CPF</p>
                <p>{order.customer.cpf}</p>
              </div>
            )}
            {order.customer.phone && (
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p>{order.customer.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações da OS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.branch && (
              <div>
                <p className="text-sm text-muted-foreground">Filial</p>
                <p className="font-semibold">{order.branch.name}</p>
              </div>
            )}
            {order.laboratory && (
              <div>
                <p className="text-sm text-muted-foreground">Laboratório</p>
                <p className="font-semibold">{order.laboratory.name}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Data de Abertura</p>
              <p>
                {format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={getStatusVariant(order.status)}>
                {getStatusLabel(order.status)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Prescrição */}
      {order.prescription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Receita/Prescrição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{order.prescription}</p>
          </CardContent>
        </Card>
      )}

      {/* Itens/Serviços */}
      <Card>
        <CardHeader>
          <CardTitle>Itens/Serviços ({order.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {order.items.map((item, index) => (
              <div
                key={item.id}
                className="border-b pb-4 last:border-0"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{item.type}</Badge>
                      <p className="font-bold text-lg">
                        {formatCurrency(Number(item.price))}
                      </p>
                    </div>
                    <p className="font-semibold">Item {index + 1}</p>
                    <p className="text-muted-foreground">{item.description}</p>
                    {item.observations && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Obs: {item.observations}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-4 border-t-2">
              <p className="font-bold">Total</p>
              <p className="font-bold text-xl text-primary">
                {formatCurrency(Number(order.total))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Observações */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
