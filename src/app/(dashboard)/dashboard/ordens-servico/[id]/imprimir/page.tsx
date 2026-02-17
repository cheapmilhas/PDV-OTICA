"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

export default function ImprimirOrdemServicoPage() {
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const printTriggered = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [orderRes, settingsRes] = await Promise.all([
          fetch(`/api/service-orders/${id}`),
          fetch("/api/company/settings"),
        ]);
        if (!orderRes.ok) throw new Error("Erro ao carregar OS");
        const { data } = await orderRes.json();
        setOrder(data);
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setCompanySettings(s.data || s);
        }
      } catch (error: any) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!loading && order && !printTriggered.current) {
      printTriggered.current = true;
      setTimeout(() => window.print(), 500);
    }
  }, [loading, order]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Rascunho",
      APPROVED: "Aprovado",
      SENT_TO_LAB: "Enviado ao Laboratório",
      IN_PROGRESS: "Em Produção",
      READY: "Pronto para Retirada",
      DELIVERED: "Entregue",
      CANCELED: "Cancelado",
    };
    return labels[status] || status;
  };

  let rx: any = null;
  if (order?.prescription) {
    try {
      rx = JSON.parse(order.prescription);
    } catch {
      rx = null;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) return null;

  const osNumber = order.id.substring(0, 8).toUpperCase();

  return (
    <>
      {/* Barra de controle - apenas na tela, não imprime */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm p-3 flex items-center justify-between">
        <Link href={`/dashboard/ordens-servico/${id}/detalhes`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
      </div>

      {/* Conteúdo da OS */}
      <div className="print-container max-w-[210mm] mx-auto bg-white p-8 mt-16">

        {/* ===== CABEÇALHO ===== */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              {companySettings?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={companySettings.logoUrl}
                  alt="Logo"
                  className="h-16 w-auto max-w-[180px] object-contain"
                />
              ) : (
                <h1 className="text-2xl font-bold">
                  {companySettings?.displayName || "PDV Ótica"}
                </h1>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-extrabold tracking-widest text-gray-800">OS #{osNumber}</p>
              <p className="text-sm text-gray-500 mt-1">
                {format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              <span className="inline-block mt-1 px-3 py-0.5 bg-gray-800 text-white text-xs font-bold rounded">
                {getStatusLabel(order.status)}
              </span>
            </div>
          </div>
        </div>

        {/* ===== CLIENTE ===== */}
        <div className="mb-6 p-4 bg-gray-50 rounded border-l-4 border-gray-800">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Cliente</h2>
          <p className="text-xl font-bold text-gray-900">{order.customer?.name}</p>
          <div className="grid grid-cols-2 gap-x-4 mt-1 text-sm text-gray-700">
            {order.customer?.cpf && <p>CPF: {order.customer.cpf}</p>}
            {order.customer?.phone && <p>Telefone: {order.customer.phone}</p>}
          </div>
        </div>

        {/* ===== RECEITA ===== */}
        {rx && (rx.od?.esf || rx.oe?.esf || rx.adicao) && (
          <div className="mb-6 p-4 border-2 border-gray-800 rounded">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Receita / Prescrição</h2>

            <div className="grid grid-cols-2 gap-6">
              {/* OD */}
              <div>
                <p className="font-bold text-sm text-center bg-gray-800 text-white py-1 px-2 rounded mb-2">
                  OLHO DIREITO (OD)
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {rx.od?.esf && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">Esférico</td>
                        <td className="py-1 text-right font-bold">{rx.od.esf}</td>
                      </tr>
                    )}
                    {rx.od?.cil && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">Cilíndrico</td>
                        <td className="py-1 text-right font-bold">{rx.od.cil}</td>
                      </tr>
                    )}
                    {rx.od?.eixo && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">Eixo</td>
                        <td className="py-1 text-right font-bold">{rx.od.eixo}°</td>
                      </tr>
                    )}
                    {rx.od?.dnp && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">DNP</td>
                        <td className="py-1 text-right font-bold">{rx.od.dnp}</td>
                      </tr>
                    )}
                    {rx.od?.altura && (
                      <tr>
                        <td className="py-1 text-gray-500 font-medium">Altura</td>
                        <td className="py-1 text-right font-bold">{rx.od.altura}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* OE */}
              <div>
                <p className="font-bold text-sm text-center bg-gray-800 text-white py-1 px-2 rounded mb-2">
                  OLHO ESQUERDO (OE)
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {rx.oe?.esf && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">Esférico</td>
                        <td className="py-1 text-right font-bold">{rx.oe.esf}</td>
                      </tr>
                    )}
                    {rx.oe?.cil && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">Cilíndrico</td>
                        <td className="py-1 text-right font-bold">{rx.oe.cil}</td>
                      </tr>
                    )}
                    {rx.oe?.eixo && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">Eixo</td>
                        <td className="py-1 text-right font-bold">{rx.oe.eixo}°</td>
                      </tr>
                    )}
                    {rx.oe?.dnp && (
                      <tr className="border-b">
                        <td className="py-1 text-gray-500 font-medium">DNP</td>
                        <td className="py-1 text-right font-bold">{rx.oe.dnp}</td>
                      </tr>
                    )}
                    {rx.oe?.altura && (
                      <tr>
                        <td className="py-1 text-gray-500 font-medium">Altura</td>
                        <td className="py-1 text-right font-bold">{rx.oe.altura}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Adição / Tipo / Material */}
            {(rx.adicao || rx.tipoLente || rx.material) && (
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t text-sm">
                {rx.adicao && (
                  <div className="text-center">
                    <p className="text-gray-500 font-medium text-xs uppercase">Adição</p>
                    <p className="font-bold text-lg">{rx.adicao}</p>
                  </div>
                )}
                {rx.tipoLente && (
                  <div className="text-center">
                    <p className="text-gray-500 font-medium text-xs uppercase">Tipo de Lente</p>
                    <p className="font-bold">{rx.tipoLente}</p>
                  </div>
                )}
                {rx.material && (
                  <div className="text-center">
                    <p className="text-gray-500 font-medium text-xs uppercase">Material</p>
                    <p className="font-bold">{rx.material}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== ITENS / SERVIÇOS ===== */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Itens / Serviços</h2>
          <div className="border rounded overflow-hidden">
            {order.items?.map((item: any, idx: number) => (
              <div key={item.id} className={`p-3 ${idx < order.items.length - 1 ? "border-b" : ""}`}>
                <p className="font-bold text-gray-900">{item.description || `Item ${idx + 1}`}</p>
                {item.observations && (
                  <p className="text-sm text-gray-600 mt-1">Obs: {item.observations}</p>
                )}
                {item.qty > 1 && (
                  <p className="text-xs text-gray-500 mt-0.5">Qtd: {item.qty}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ===== LABORATÓRIO ===== */}
        {order.laboratory && (
          <div className="mb-6 p-3 bg-gray-50 rounded border">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Laboratório</h2>
            <p className="font-bold text-gray-900">{order.laboratory.name}</p>
          </div>
        )}

        {/* ===== DATAS ===== */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="p-3 bg-gray-50 rounded border">
            <p className="text-gray-500 font-medium text-xs uppercase mb-1">Data de Abertura</p>
            <p className="font-bold">
              {format(new Date(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>
          {order.promisedDate && (
            <div className="p-3 bg-gray-50 rounded border">
              <p className="text-gray-500 font-medium text-xs uppercase mb-1">Prazo de Entrega</p>
              <p className="font-bold text-lg">
                {format(new Date(order.promisedDate), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          )}
        </div>

        {/* ===== OBSERVAÇÕES ===== */}
        {order.notes && (
          <div className="mb-6 p-3 bg-yellow-50 rounded border border-yellow-300">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Observações</h2>
            <p className="text-sm whitespace-pre-wrap text-gray-800">{order.notes}</p>
          </div>
        )}

        {/* ===== ASSINATURAS ===== */}
        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="border-t-2 border-gray-800 pt-2 text-center">
              <p className="text-gray-600">Responsável pela OS</p>
            </div>
          </div>
          <div>
            <div className="border-t-2 border-gray-800 pt-2 text-center">
              <p className="text-gray-600">Cliente / Recebimento</p>
            </div>
          </div>
        </div>

        {/* ===== RODAPÉ ===== */}
        <div className="mt-6 pt-4 border-t text-center text-xs text-gray-400">
          <p>OS #{osNumber} — Emitida em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          .print-container {
            max-width: 100%;
            margin: 0;
            padding: 15mm;
            margin-top: 0 !important;
          }
          nav, aside, header, footer { display: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { size: A4 portrait; margin: 8mm; }
        @media screen {
          body { background-color: #f5f5f5; }
          .print-container { box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 40px; }
        }
      `}</style>
    </>
  );
}
