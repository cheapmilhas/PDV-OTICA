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
  Printer,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
  SENT_TO_LAB: "No Laboratório",
  IN_PROGRESS: "Em Produção",
  READY: "Pronta",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

interface ServiceOrderDetails {
  id: string;
  number?: number;
  createdAt: string;
  notes?: string;
  prescriptionData?: any;
  promisedDate?: string;
  deliveredAt?: string;
  isDelayed?: boolean;
  delayDays?: number;
  isWarranty?: boolean;
  isRework?: boolean;
  status: string;
  customer: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
  };
  branch?: { id: string; name: string };
  laboratory?: { id: string; name: string };
  originalOrder?: { id: string; number: number; status: string };
  reworkOrders?: Array<{ id: string; number: number; status: string; isWarranty: boolean; isRework: boolean }>;
  history?: Array<{
    id: string;
    action: string;
    fromStatus?: string;
    toStatus?: string;
    note?: string;
    createdAt: string;
    changedByUser?: { id: string; name: string };
  }>;
  items: Array<{
    id: string;
    description?: string;
    qty: number;
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

  const diasRestantes = calcularDiasRestantes(order.promisedDate);
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
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Detalhes da OS</h1>
              {order.number && (
                <span className="text-2xl font-black text-blue-600">
                  #{String(order.number).padStart(6, "0")}
                </span>
              )}
            </div>
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/dashboard/ordens-servico/${id}/imprimir`, "_blank")}
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir OS
          </Button>
          {order.status !== "DELIVERED" && order.status !== "CANCELED" && (
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
      {order.status === "CANCELED" && (
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
              Itens / Serviços
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{order.items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prazo de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.promisedDate ? (
              <div>
                <p className="text-lg font-bold">
                  {format(new Date(order.promisedDate), "dd/MM/yyyy", {
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
      {order.prescriptionData && (() => {
        let rx: any = null;
        try {
          rx = typeof order.prescriptionData === "string"
            ? JSON.parse(order.prescriptionData)
            : order.prescriptionData;
        } catch { rx = null; }

        if (!rx) return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Receita/Prescrição
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">Formato de receita não reconhecido.</p>
            </CardContent>
          </Card>
        );

        return (
          <Card className="border-2 border-gray-800">
            <CardHeader className="bg-gray-800 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-white">
                <FileText className="h-5 w-5" />
                Receita / Prescrição
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid gap-6 md:grid-cols-2">
                {/* OD */}
                <div>
                  <p className="font-bold text-sm text-center bg-gray-800 text-white py-1 px-2 rounded mb-3">
                    OLHO DIREITO (OD)
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {rx.od?.esf && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">Esférico</td>
                          <td className="py-1.5 text-right font-bold">{rx.od.esf}</td>
                        </tr>
                      )}
                      {rx.od?.cil && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">Cilíndrico</td>
                          <td className="py-1.5 text-right font-bold">{rx.od.cil}</td>
                        </tr>
                      )}
                      {rx.od?.eixo && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">Eixo</td>
                          <td className="py-1.5 text-right font-bold">{rx.od.eixo}°</td>
                        </tr>
                      )}
                      {rx.od?.dnp && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">DNP</td>
                          <td className="py-1.5 text-right font-bold">{rx.od.dnp}</td>
                        </tr>
                      )}
                      {rx.od?.altura && (
                        <tr>
                          <td className="py-1.5 text-muted-foreground font-medium">Altura</td>
                          <td className="py-1.5 text-right font-bold">{rx.od.altura}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* OE */}
                <div>
                  <p className="font-bold text-sm text-center bg-gray-800 text-white py-1 px-2 rounded mb-3">
                    OLHO ESQUERDO (OE)
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {rx.oe?.esf && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">Esférico</td>
                          <td className="py-1.5 text-right font-bold">{rx.oe.esf}</td>
                        </tr>
                      )}
                      {rx.oe?.cil && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">Cilíndrico</td>
                          <td className="py-1.5 text-right font-bold">{rx.oe.cil}</td>
                        </tr>
                      )}
                      {rx.oe?.eixo && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">Eixo</td>
                          <td className="py-1.5 text-right font-bold">{rx.oe.eixo}°</td>
                        </tr>
                      )}
                      {rx.oe?.dnp && (
                        <tr className="border-b">
                          <td className="py-1.5 text-muted-foreground font-medium">DNP</td>
                          <td className="py-1.5 text-right font-bold">{rx.oe.dnp}</td>
                        </tr>
                      )}
                      {rx.oe?.altura && (
                        <tr>
                          <td className="py-1.5 text-muted-foreground font-medium">Altura</td>
                          <td className="py-1.5 text-right font-bold">{rx.oe.altura}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {(rx.adicao || rx.tipoLente || rx.material) && (
                <div className="grid grid-cols-3 gap-4 pt-3 border-t text-sm">
                  {rx.adicao && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Adição</p>
                      <p className="font-bold text-lg">{rx.adicao}</p>
                    </div>
                  )}
                  {rx.tipoLente && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Tipo de Lente</p>
                      <p className="font-bold">{rx.tipoLente}</p>
                    </div>
                  )}
                  {rx.material && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Material</p>
                      <p className="font-bold">{rx.material}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Itens/Serviços */}
      <Card>
        <CardHeader>
          <CardTitle>Itens/Serviços ({order.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {order.items.map((item, index) => (
              <div key={item.id} className="border rounded p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold">{item.description || `Item ${index + 1}`}</p>
                    {item.qty > 1 && (
                      <p className="text-sm text-muted-foreground">Quantidade: {item.qty}</p>
                    )}
                    {item.observations && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Obs: {item.observations}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

      {/* Histórico */}
      {order.history && order.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Histórico de Alterações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {order.history.map((h: any) => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {h.action === "STATUS_CHANGED" && h.toStatus && `→ ${STATUS_LABELS[h.toStatus] || h.toStatus}`}
                        {h.action === "REVERTED" && `↩ Revertido para ${STATUS_LABELS[h.toStatus] || h.toStatus}`}
                        {h.action === "CREATED" && "✅ OS Criada"}
                        {h.action === "EDITED" && "✏️ OS Editada"}
                        {h.action === "DELIVERED" && "🎉 Entregue ao cliente"}
                        {h.action === "CANCELED" && "❌ Cancelada"}
                      </span>
                      {h.changedByUser && (
                        <span className="text-muted-foreground text-xs">por {h.changedByUser.name}</span>
                      )}
                      <span className="text-muted-foreground text-xs ml-auto">
                        {format(new Date(h.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {h.note && <p className="text-muted-foreground text-xs mt-0.5">{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
