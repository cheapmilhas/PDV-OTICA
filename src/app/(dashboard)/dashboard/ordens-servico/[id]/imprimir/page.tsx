"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { osDisplayNumber } from "@/lib/os-number";
import toast from "react-hot-toast";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateBR } from "@/lib/date-utils";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

function ImprimirOrdemServicoContent() {
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
      setTimeout(() => window.print(), 600);
    }
  }, [loading, order]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Rascunho",
      APPROVED: "Aprovado",
      SENT_TO_LAB: "Enviado ao Lab",
      IN_PROGRESS: "Em Produção",
      READY: "Pronto",
      DELIVERED: "Entregue",
      CANCELED: "Cancelado",
    };
    return labels[status] || status;
  };

  // Parse prescription – stored as JSON in prescriptionData field
  let rx: any = null;
  if (order?.prescriptionData) {
    try {
      rx = typeof order.prescriptionData === "string"
        ? JSON.parse(order.prescriptionData)
        : order.prescriptionData;
    } catch { rx = null; }
  }

  const formatGrau = (val: string | undefined | null) => {
    if (!val || val === "") return "—";
    // Handle Brazilian locale comma decimal separator (e.g. "-1,50" → -1.5)
    const normalized = String(val).replace(",", ".");
    const n = parseFloat(normalized);
    if (isNaN(n)) return val;
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) return null;

  // Número de exibição (#1234-G1 para garantia/retrabalho/erro médico).
  // osDisplayNumber já inclui o "#"; removemos para manter o layout existente
  // que prefixa "OS Nº" manualmente onde necessário.
  const osNumber = osDisplayNumber(order).replace(/^#/, "");

  const hasReceita = rx && (rx.od?.esf || rx.oe?.esf || rx.adicao);
  const hasAdd = rx && (rx.od?.add || rx.oe?.add || rx.adicao);
  const hasPrisma = rx && (rx.od?.prisma || rx.oe?.prisma);
  const hasCerat = rx?.ceratometria && (rx.ceratometria.odH || rx.ceratometria.oeH);
  const hasExtra = rx && (rx.olhoDominante || rx.pantoscopicAngle || rx.vertexDistance || rx.frameCurvature);

  return (
    <>
      {/* Barra de controle – apenas na tela */}
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

      {/* ===== DOCUMENTO A4 ===== */}
      <div className="print-container max-w-[210mm] mx-auto bg-white mt-16">

        {/* ===== CABEÇALHO ===== */}
        <div className="header-block flex items-start justify-between pb-4 mb-0">
          {/* Logo / Nome */}
          <div className="flex-1">
            {companySettings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companySettings.logoUrl}
                alt="Logo"
                className="h-16 w-auto max-w-[180px] object-contain"
              />
            ) : (
              <h1 className="text-xl font-black text-gray-900 uppercase tracking-wide">
                {companySettings?.displayName || "Empresa"}
              </h1>
            )}
          </div>
          {/* Número + Data + Status */}
          <div className="text-right">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Ordem de Serviço
            </div>
            <div className="text-4xl font-black text-blue-700 leading-none mt-1">
              Nº {osNumber}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
            <div className="inline-block mt-1 px-3 py-0.5 bg-gray-800 text-white text-xs font-bold rounded uppercase">
              {getStatusLabel(order.status)}
            </div>
          </div>
        </div>

        {/* Linha divisória dupla */}
        <div className="border-t-4 border-gray-900 mb-1" />
        <div className="border-t border-gray-400 mb-4" />

        {/* ===== CLIENTE ===== */}
        <div className="section-cliente bg-gray-50 border border-gray-300 rounded p-3 mb-3">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Cliente
          </div>
          <div className="text-xl font-black text-gray-900 uppercase">
            {order.customer?.name}
          </div>
          <div className="flex gap-6 mt-1 text-sm text-gray-700">
            {order.customer?.cpf && (
              <span><span className="font-semibold">CPF:</span> {order.customer.cpf}</span>
            )}
            {order.customer?.phone && (
              <span><span className="font-semibold">Tel:</span> {order.customer.phone}</span>
            )}
          </div>
        </div>

        {/* ===== LABORATÓRIO ===== */}
        {order.laboratory && (
          <div className="section-lab bg-blue-50 border-2 border-blue-500 rounded p-3 mb-3 flex items-center gap-3">
            <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest whitespace-nowrap">
              Laboratório
            </div>
            <div className="text-lg font-black text-blue-800 uppercase">
              {order.laboratory.name}
            </div>
          </div>
        )}

        {/* ===== RECEITA / PRESCRIÇÃO – DESTAQUE MÁXIMO ===== */}
        <div className="section-receita border-4 border-green-600 rounded overflow-hidden mb-3">
          <div className="bg-green-600 text-white px-4 py-2 flex items-center justify-between">
            <span className="text-base font-black uppercase tracking-wide">
              Receita / Prescrição
            </span>
            {rx?.tipoLente && (
              <span className="text-sm font-semibold bg-white text-green-700 px-2 py-0.5 rounded">
                {rx.tipoLente}
                {rx.material ? ` · ${rx.material}` : ""}
              </span>
            )}
          </div>

          {hasReceita ? (
            <div className="p-3 bg-green-50 space-y-2">
              {/* Tabela VISÃO DE LONGE */}
              <div className="text-[10px] font-black text-green-700 uppercase tracking-widest">Visão de Longe</div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-green-400 bg-green-200 p-1.5 text-center font-black w-12">OLHO</th>
                    <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">ESF</th>
                    <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">CIL</th>
                    <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">EIXO</th>
                    <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">DNP</th>
                    <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">ALTURA</th>
                  </tr>
                </thead>
                <tbody>
                  {(["od", "oe"] as const).map((eye) => (
                    <tr key={eye} className="text-center text-base font-bold">
                      <td className="border border-green-400 bg-green-200 p-1.5 font-black">{eye === "od" ? "O.D." : "O.E."}</td>
                      <td className="border border-green-400 bg-white p-1.5">{formatGrau(rx?.[eye]?.esf)}</td>
                      <td className="border border-green-400 bg-white p-1.5">{formatGrau(rx?.[eye]?.cil)}</td>
                      <td className="border border-green-400 bg-white p-1.5">{rx?.[eye]?.eixo ? `${rx[eye].eixo}°` : "—"}</td>
                      <td className="border border-green-400 bg-white p-1.5">{rx?.[eye]?.dnp || "—"}</td>
                      <td className="border border-green-400 bg-white p-1.5">{rx?.[eye]?.altura || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Tabela ADIÇÃO / VISÃO DE PERTO */}
              {hasAdd && (
                <>
                  <div className="text-[10px] font-black text-green-700 uppercase tracking-widest pt-1">Adição / Visão de Perto</div>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="border border-green-400 bg-green-200 p-1.5 text-center font-black w-12">OLHO</th>
                        <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">ADD</th>
                        <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">ESF. PERTO</th>
                        <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">CIL. PERTO</th>
                        <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">EIXO PERTO</th>
                        <th className="border border-green-400 bg-green-100 p-1.5 text-center font-bold">DNP PERTO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["od", "oe"] as const).map((eye) => {
                        const addVal = rx?.[eye]?.add || rx?.adicao || "";
                        const esfLonge = parseFloat(String(rx?.[eye]?.esf || "0").replace(",", ".")) || 0;
                        const addNum = parseFloat(String(addVal).replace(",", ".")) || 0;
                        const esfPerto = addNum ? (esfLonge + addNum).toFixed(2) : "";
                        const dnpPerto = eye === "od" ? rx?.dnpPertoOd : rx?.dnpPertoOe;
                        return (
                          <tr key={eye} className="text-center text-base font-bold">
                            <td className="border border-green-400 bg-green-200 p-1.5 font-black">{eye === "od" ? "O.D." : "O.E."}</td>
                            <td className="border border-green-400 bg-white p-1.5 font-black text-green-700">{formatGrau(addVal)}</td>
                            <td className="border border-green-400 bg-white p-1.5 text-gray-500">
                              {esfPerto ? (parseFloat(esfPerto) > 0 ? `+${esfPerto}` : esfPerto) : "—"}
                            </td>
                            <td className="border border-green-400 bg-white p-1.5 text-gray-500">{formatGrau(rx?.[eye]?.cil) !== "—" ? formatGrau(rx?.[eye]?.cil) : "—"}</td>
                            <td className="border border-green-400 bg-white p-1.5 text-gray-500">{rx?.[eye]?.eixo ? `${rx[eye].eixo}°` : "—"}</td>
                            <td className="border border-green-400 bg-white p-1.5">{dnpPerto || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Prisma */}
              {hasPrisma && (
                <div className="flex gap-6 text-sm pt-1">
                  <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Prisma:</span>
                  {(["od", "oe"] as const).map((eye) => (
                    rx?.[eye]?.prisma ? (
                      <span key={eye} className="font-bold">
                        {eye === "od" ? "OD" : "OE"}: {rx[eye].prisma}
                        {rx[eye].base ? ` (${rx[eye].base})` : ""}
                      </span>
                    ) : null
                  ))}
                </div>
              )}

              {/* Dados extras inline */}
              {(hasExtra || (!rx?.tipoLente && rx?.material)) && (
                <div className="flex flex-wrap gap-4 text-xs text-green-800 pt-1">
                  {rx?.olhoDominante && <span><span className="font-semibold">Olho Dom.:</span> {rx.olhoDominante}</span>}
                  {rx?.pantoscopicAngle && <span><span className="font-semibold">Ang. Pant.:</span> {rx.pantoscopicAngle}°</span>}
                  {rx?.vertexDistance && <span><span className="font-semibold">Dist. Vértice:</span> {rx.vertexDistance} mm</span>}
                  {rx?.frameCurvature && <span><span className="font-semibold">Curva Arm.:</span> {rx.frameCurvature}</span>}
                  {!rx?.tipoLente && rx?.material && <span><span className="font-semibold">Material:</span> {rx.material}</span>}
                </div>
              )}

              {/* Ceratometria */}
              {hasCerat && (
                <>
                  <div className="text-[10px] font-black text-green-700 uppercase tracking-widest pt-1">Ceratometria</div>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="border border-green-400 bg-green-200 p-1 text-center font-black w-10">OLHO</th>
                        <th className="border border-green-400 bg-green-100 p-1 text-center font-bold">HORIZ.</th>
                        <th className="border border-green-400 bg-green-100 p-1 text-center font-bold">EIXO H</th>
                        <th className="border border-green-400 bg-green-100 p-1 text-center font-bold">VERT.</th>
                        <th className="border border-green-400 bg-green-100 p-1 text-center font-bold">EIXO V</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["od", "oe"] as const).map((eye) => (
                        <tr key={eye} className="text-center font-bold">
                          <td className="border border-green-400 bg-green-200 p-1 font-black">{eye === "od" ? "OD" : "OE"}</td>
                          <td className="border border-green-400 bg-white p-1">{rx.ceratometria[`${eye}H`] || "—"}</td>
                          <td className="border border-green-400 bg-white p-1">{rx.ceratometria[`${eye}HEixo`] ? `${rx.ceratometria[`${eye}HEixo`]}°` : "—"}</td>
                          <td className="border border-green-400 bg-white p-1">{rx.ceratometria[`${eye}V`] || "—"}</td>
                          <td className="border border-green-400 bg-white p-1">{rx.ceratometria[`${eye}VEixo`] ? `${rx.ceratometria[`${eye}VEixo`]}°` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500 bg-white">
              <p className="font-semibold">Receita não informada</p>
              <p className="text-xs mt-1">Adicione a receita ao editar esta OS</p>
            </div>
          )}
        </div>

        {/* ===== DADOS DA LENTE ===== */}
        {(order.lensType || order.lensDescription || order.lensColoring || (order.treatments && order.treatments.length > 0)) && (
          <div className="border border-blue-400 rounded overflow-hidden mb-3">
            <div className="bg-blue-600 text-white px-4 py-2">
              <span className="text-sm font-black uppercase tracking-wide">Dados da Lente</span>
            </div>
            <div className="p-3 bg-white text-xs">
              <div className="grid grid-cols-3 gap-2">
                {order.lensType && (
                  <div>
                    <span className="text-gray-500 uppercase font-semibold">Fabricação:</span>{" "}
                    <span className="font-bold">{order.lensType === "PRONTA" ? "Pronta" : "Surfaçada"}</span>
                  </div>
                )}
                {order.lensDescription && (
                  <div>
                    <span className="text-gray-500 uppercase font-semibold">Descrição:</span>{" "}
                    <span className="font-bold">{order.lensDescription}</span>
                  </div>
                )}
                {order.lensColoring && (
                  <div>
                    <span className="text-gray-500 uppercase font-semibold">Coloração:</span>{" "}
                    <span className="font-bold">{order.lensColoring}</span>
                  </div>
                )}
              </div>
              {order.treatments && order.treatments.length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <span className="text-gray-500 uppercase font-semibold">Tratamentos:</span>{" "}
                  <span className="font-bold">{order.treatments.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ITENS / SERVIÇOS ===== */}
        <div className="section-itens border border-gray-300 rounded overflow-hidden mb-3">
          <div className="bg-gray-800 text-white px-4 py-2">
            <span className="text-sm font-black uppercase tracking-wide">
              Produtos / Serviços
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="p-2 text-left font-bold">#</th>
                <th className="p-2 text-left font-bold">Descrição</th>
                <th className="p-2 text-center font-bold w-16">Qtd</th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item: any, idx: number) => (
                <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="p-2 text-gray-400 font-mono">{idx + 1}</td>
                  <td className="p-2 font-semibold text-gray-900">
                    {item.description || `Item ${idx + 1}`}
                    {item.observations && (
                      <span className="block text-xs text-gray-500 font-normal mt-0.5">
                        Obs: {item.observations}
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-center font-black text-lg text-gray-900">
                    {item.qty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===== DATAS ===== */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="border border-gray-300 rounded p-3">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
              Data de Abertura
            </div>
            <div className="text-lg font-bold text-gray-800">
              {format(new Date(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}
            </div>
          </div>
          <div className={`border-4 rounded p-3 ${order.promisedDate ? "border-red-500 bg-red-50" : "border-gray-300"}`}>
            <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${order.promisedDate ? "text-red-600" : "text-gray-400"}`}>
              ⚠ Prazo de Entrega
            </div>
            <div className={`text-2xl font-black ${order.promisedDate ? "text-red-600" : "text-gray-400"}`}>
              {order.promisedDate
                ? formatDateBR(order.promisedDate)
                : "Não definido"}
            </div>
          </div>
        </div>

        {/* ===== OBSERVAÇÕES ===== */}
        <div className="border border-gray-300 rounded p-3 mb-4">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Observações
          </div>
          {order.notes ? (
            <div className="text-sm text-gray-800 bg-yellow-50 border border-yellow-300 rounded p-2">
              {order.notes}
            </div>
          ) : (
            <div className="h-10 border border-dashed border-gray-300 rounded" />
          )}
        </div>

        {/* ===== ASSINATURAS ===== */}
        <div className="grid grid-cols-2 gap-8 mt-8">
          <div className="text-center">
            <div className="border-t-2 border-gray-700 pt-2 mx-2">
              <p className="text-xs text-gray-600">Responsável pela OS</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t-2 border-gray-700 pt-2 mx-2">
              <p className="text-xs text-gray-600">Recebido pelo Laboratório</p>
            </div>
          </div>
        </div>

        {/* ===== RODAPÉ ===== */}
        <div className="mt-4 pt-3 border-t border-gray-200 text-center text-[10px] text-gray-400">
          OS Nº {osNumber} — Emitida em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: white; }
          .print-container {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            margin-top: 0 !important;
          }
          nav, aside, header, footer { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        @media screen {
          body { background-color: #e5e7eb; }
          .print-container {
            box-shadow: 0 0 20px rgba(0,0,0,0.15);
            margin-bottom: 40px;
            padding: 24px;
          }
        }
      `}</style>
    </>
  );
}

export default function ImprimirOrdemServicoPage() {
  return (
    <ProtectedRoute permission="service_orders.view">
      <ImprimirOrdemServicoContent />
    </ProtectedRoute>
  );
}
