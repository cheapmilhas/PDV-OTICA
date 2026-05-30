"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { track } from "@/lib/analytics";
import {
  ArrowLeft,
  Loader2,
  User,
  Calendar,
  AlertTriangle,
  FileText,
  Edit,
  Printer,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateBR } from "@/lib/date-utils";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
  SENT_TO_LAB: "No Lab",
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
  prescriptionImageUrl?: string | null;
  lensType?: string | null;
  lensDescription?: string | null;
  lensColoring?: string | null;
  treatments?: string[];
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
  sale?: { id: string } | null;
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

function DetalhesOrdemServicoContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<ServiceOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);

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
      SENT_TO_LAB: "No Lab",
      IN_PROGRESS: "Em Produção",
      READY: "Pronta",
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
    return differenceInCalendarDays(new Date(expectedDate), new Date());
  };

  const handleConvertToSale = async () => {
    if (!order) return;
    setConverting(true);
    try {
      // Valida que a OS pode ser convertida
      const res = await fetch(`/api/service-orders/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro ao gerar venda");
      }
      track("os_converted_to_sale", { osId: id });
      toast.success("Redirecionando para o PDV...");
      router.push(`/dashboard/pdv?serviceOrderId=${id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConverting(false);
    }
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
          {["READY", "DELIVERED"].includes(order.status) && !order.sale && (
            <Button
              size="sm"
              onClick={handleConvertToSale}
              disabled={converting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {converting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShoppingCart className="h-4 w-4 mr-2" />
              )}
              Gerar Venda
            </Button>
          )}
          {order.sale && (
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 text-green-700"
              onClick={() => router.push(`/dashboard/vendas/${order.sale!.id}/detalhes`)}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Ver Venda
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

      {/* Receita pendente — OS sem receita preenchida */}
      {!order.prescriptionData && !order.prescriptionImageUrl && order.status !== "CANCELED" && (
        <Card className="border-amber-500 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                Receita pendente — esta Ordem de Serviço ainda não tem a receita preenchida.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => router.push(`/dashboard/ordens-servico/${id}/editar?focus=receita`)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Edit className="h-4 w-4 mr-2" />
              Preencher receita
            </Button>
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
                  {formatDateBR(order.promisedDate)}
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

      {/* Imagem da receita (quando não há dados de prescrição estruturados) */}
      {!order.prescriptionData && order.prescriptionImageUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Foto da Receita
            </CardTitle>
          </CardHeader>
          <CardContent>
            <a href={order.prescriptionImageUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.prescriptionImageUrl}
                alt="Receita médica"
                className="max-w-full max-h-96 rounded-lg border object-contain cursor-pointer hover:opacity-80 transition-opacity"
              />
            </a>
          </CardContent>
        </Card>
      )}

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

        const hasAdd = rx.od?.add || rx.oe?.add || rx.adicao;
        const hasPrisma = rx.od?.prisma || rx.oe?.prisma;
        const hasCerat = rx.ceratometria && (rx.ceratometria.odH || rx.ceratometria.oeH);
        const hasExtra = rx.olhoDominante || rx.pantoscopicAngle || rx.vertexDistance || rx.frameCurvature;

        return (
          <Card className="border-2 border-gray-800">
            <CardHeader className="bg-gray-800 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-white">
                <FileText className="h-5 w-5" />
                Receita / Prescrição
                {rx.tipoLente && (
                  <span className="ml-auto text-sm font-normal bg-white/20 px-2 py-0.5 rounded">
                    {rx.tipoLente}{rx.material ? ` · ${rx.material}` : ""}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Imagem da receita */}
              {order.prescriptionImageUrl && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Foto da Receita</p>
                  <a href={order.prescriptionImageUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={order.prescriptionImageUrl}
                      alt="Receita médica"
                      className="max-w-full max-h-64 rounded-lg border object-contain cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  </a>
                </div>
              )}
              {/* Tabela Visão de Longe */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Visão de Longe</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
                      <th className="border p-1.5 text-center font-semibold">Esf.</th>
                      <th className="border p-1.5 text-center font-semibold">Cil.</th>
                      <th className="border p-1.5 text-center font-semibold">Eixo</th>
                      <th className="border p-1.5 text-center font-semibold">DNP</th>
                      <th className="border p-1.5 text-center font-semibold">Altura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["od", "oe"] as const).map((eye) => (
                      <tr key={eye} className="text-center font-bold">
                        <td className="border p-1.5 bg-gray-50 font-black">{eye === "od" ? "OD" : "OE"}</td>
                        <td className="border p-1.5">{rx[eye]?.esf || "—"}</td>
                        <td className="border p-1.5">{rx[eye]?.cil || "—"}</td>
                        <td className="border p-1.5">{rx[eye]?.eixo ? `${rx[eye].eixo}°` : "—"}</td>
                        <td className="border p-1.5">{rx[eye]?.dnp || "—"}</td>
                        <td className="border p-1.5">{rx[eye]?.altura || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tabela Adição / Visão de Perto */}
              {hasAdd && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Adição / Visão de Perto</p>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
                        <th className="border p-1.5 text-center font-semibold">Adição</th>
                        <th className="border p-1.5 text-center font-semibold">Esf. Perto</th>
                        <th className="border p-1.5 text-center font-semibold">Cil. Perto</th>
                        <th className="border p-1.5 text-center font-semibold">Eixo Perto</th>
                        <th className="border p-1.5 text-center font-semibold">DNP Perto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["od", "oe"] as const).map((eye) => {
                        const addVal = rx[eye]?.add || rx.adicao || "";
                        const esfLonge = parseFloat(String(rx[eye]?.esf || "0").replace(",", ".")) || 0;
                        const addNum = parseFloat(String(addVal).replace(",", ".")) || 0;
                        const esfPerto = addNum ? (esfLonge + addNum).toFixed(2) : "";
                        const dnpPerto = eye === "od" ? rx.dnpPertoOd : rx.dnpPertoOe;
                        return (
                          <tr key={eye} className="text-center font-bold">
                            <td className="border p-1.5 bg-gray-50 font-black">{eye === "od" ? "OD" : "OE"}</td>
                            <td className="border p-1.5 text-green-700">{addVal || "—"}</td>
                            <td className="border p-1.5 text-muted-foreground">
                              {esfPerto ? (parseFloat(esfPerto) > 0 ? `+${esfPerto}` : esfPerto) : "—"}
                            </td>
                            <td className="border p-1.5 text-muted-foreground">{rx[eye]?.cil || "—"}</td>
                            <td className="border p-1.5 text-muted-foreground">{rx[eye]?.eixo ? `${rx[eye].eixo}°` : "—"}</td>
                            <td className="border p-1.5">{dnpPerto || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Prisma */}
              {hasPrisma && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Prisma</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {(["od", "oe"] as const).map((eye) => (
                      <div key={eye} className="flex items-center gap-3">
                        <span className="font-black text-gray-500">{eye === "od" ? "OD" : "OE"}</span>
                        <span className="font-bold">{rx[eye]?.prisma || "—"}</span>
                        {rx[eye]?.base && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-medium">{rx[eye].base}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dados adicionais */}
              {(hasExtra || rx.tipoLente || rx.material) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-3 border-t text-sm">
                  {rx.olhoDominante && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Olho Dom.</p>
                      <p className="font-bold">{rx.olhoDominante}</p>
                    </div>
                  )}
                  {rx.pantoscopicAngle && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Ang. Pant.</p>
                      <p className="font-bold">{rx.pantoscopicAngle}°</p>
                    </div>
                  )}
                  {rx.vertexDistance && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Dist. Vértice</p>
                      <p className="font-bold">{rx.vertexDistance} mm</p>
                    </div>
                  )}
                  {rx.frameCurvature && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Curva Arm.</p>
                      <p className="font-bold">{rx.frameCurvature}</p>
                    </div>
                  )}
                  {!rx.tipoLente && rx.material && (
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs uppercase font-medium">Material</p>
                      <p className="font-bold">{rx.material}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Ceratometria */}
              {hasCerat && (
                <div className="pt-3 border-t">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Ceratometria</p>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
                        <th className="border p-1.5 text-center font-semibold">Horiz.</th>
                        <th className="border p-1.5 text-center font-semibold">Eixo H</th>
                        <th className="border p-1.5 text-center font-semibold">Vert.</th>
                        <th className="border p-1.5 text-center font-semibold">Eixo V</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["od", "oe"] as const).map((eye) => (
                        <tr key={eye} className="text-center font-bold">
                          <td className="border p-1.5 bg-gray-50 font-black">{eye === "od" ? "OD" : "OE"}</td>
                          <td className="border p-1.5">{rx.ceratometria[`${eye}H`] || "—"}</td>
                          <td className="border p-1.5">{rx.ceratometria[`${eye}HEixo`] ? `${rx.ceratometria[`${eye}HEixo`]}°` : "—"}</td>
                          <td className="border p-1.5">{rx.ceratometria[`${eye}V`] || "—"}</td>
                          <td className="border p-1.5">{rx.ceratometria[`${eye}VEixo`] ? `${rx.ceratometria[`${eye}VEixo`]}°` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Dados da Lente */}
      {(order.lensType || order.lensDescription || order.lensColoring || (order.treatments && order.treatments.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle>Dados da Lente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {order.lensType && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-medium">Fabricação</p>
                  <p className="font-semibold">{order.lensType === "PRONTA" ? "Pronta" : "Surfaçada"}</p>
                </div>
              )}
              {order.lensDescription && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-medium">Descrição</p>
                  <p className="font-semibold">{order.lensDescription}</p>
                </div>
              )}
              {order.lensColoring && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-medium">Coloração</p>
                  <p className="font-semibold">{order.lensColoring}</p>
                </div>
              )}
            </div>
            {order.treatments && order.treatments.length > 0 && (
              <div className="mt-3">
                <p className="text-muted-foreground text-xs uppercase font-medium mb-1">Tratamentos</p>
                <div className="flex flex-wrap gap-1.5">
                  {order.treatments.map((t: string) => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

export default function DetalhesOrdemServicoPage() {
  return (
    <ProtectedRoute permission="service_orders.view">
      <DetalhesOrdemServicoContent />
    </ProtectedRoute>
  );
}
