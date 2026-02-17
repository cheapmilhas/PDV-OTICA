"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { Printer, ArrowLeft, Loader2, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface QuoteDetails {
  id: string;
  createdAt: string;
  validUntil: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  notes?: string;
  paymentConditions?: string;
  status: string;
  customer?: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
    email?: string;
  };
  customerName?: string;
  sellerUser: {
    id: string;
    name: string;
    email: string;
  };
  branch?: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    quantity?: number;
    qty?: number;
    unitPrice: number;
    discount: number;
    total?: number;
    lineTotal?: number;
    description: string;
    product?: {
      id: string;
      name: string;
      sku: string;
    };
    prescriptionData?: {
      od?: {
        esf?: string;
        cil?: string;
        eixo?: string;
        dnp?: string;
        altura?: string;
      };
      oe?: {
        esf?: string;
        cil?: string;
        eixo?: string;
        dnp?: string;
        altura?: string;
      };
      adicao?: string;
      tipoLente?: string;
      material?: string;
      tratamentos?: string[];
    };
  }>;
}

export default function ImprimirOrcamentoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [quote, setQuote] = useState<QuoteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [companySettings, setCompanySettings] = useState<{ logoUrl?: string; displayName?: string } | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [quoteRes, settingsRes] = await Promise.all([
          fetch(`/api/quotes/${id}`),
          fetch("/api/company/settings"),
        ]);
        if (!quoteRes.ok) throw new Error("Erro ao carregar orçamento");
        const data = await quoteRes.json();
        setQuote(data);
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setCompanySettings(settingsData.data || settingsData);
        }
      } catch (error: any) {
        toast.error(error.message);
        router.push("/dashboard/orcamentos");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [id, router]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async (): Promise<boolean> => {
    console.log("📥 Iniciando download do PDF");
    setDownloading(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const printContainer = document.querySelector(".print-container") as HTMLElement;
      if (!printContainer) {
        toast.error("Erro ao gerar PDF - container não encontrado");
        return false;
      }

      const canvas = await html2canvas(printContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const customerName = (quote?.customer?.name || quote?.customerName || "cliente").replace(/\s+/g, "_");
      const quoteDate = quote ? format(new Date(quote.createdAt), "ddMMyyyy") : "";
      const fileName = `Orcamento_${customerName}_${quoteDate}.pdf`;

      pdf.save(fileName);
      toast.success("PDF baixado com sucesso!");
      return true;
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF: " + (error as Error).message);
      return false;
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quote) {
    return null;
  }

  const customerName = quote.customer?.name || quote.customerName || "Cliente não informado";

  return (
    <>
      {/* Botões - Ocultos na impressão */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Button
          variant="outline"
          onClick={handleDownloadPDF}
          disabled={downloading}
        >
          <Download className="h-4 w-4 mr-2" />
          {downloading ? "Gerando..." : "Baixar PDF"}
        </Button>
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
      </div>

      {/* Conteúdo para Impressão */}
      <div className="print-container max-w-[210mm] mx-auto bg-white p-8">
        {/* Cabeçalho */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6 text-center">
          {companySettings?.logoUrl ? (
            <div className="flex justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={companySettings.logoUrl}
                alt="Logo"
                className="h-16 w-auto max-w-[200px] object-contain"
              />
            </div>
          ) : (
            <h1 className="text-3xl font-bold mb-2">
              {companySettings?.displayName || "PDV Ótica"}
            </h1>
          )}
          <p className="text-gray-600 text-xl">Orçamento</p>
        </div>

        {/* Informações do Orçamento */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <p className="font-semibold text-gray-700">Orçamento Nº:</p>
            <p className="text-gray-900">{quote.id.substring(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-700">Data de Emissão:</p>
            <p className="text-gray-900">
              {format(new Date(quote.createdAt), "dd/MM/yyyy", {
                locale: ptBR,
              })}
            </p>
          </div>
        </div>

        <div className="mb-6 text-sm">
          <p className="font-semibold text-gray-700">Válido até:</p>
          <p className="text-gray-900">
            {format(new Date(quote.validUntil), "dd/MM/yyyy", {
              locale: ptBR,
            })}
          </p>
        </div>

        {/* Cliente */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h2 className="font-bold text-lg mb-2 text-gray-800">Cliente</h2>
          <div className="text-sm space-y-1">
            <p>
              <span className="font-semibold">Nome:</span> {customerName}
            </p>
            {quote.customer?.cpf && (
              <p>
                <span className="font-semibold">CPF:</span> {quote.customer.cpf}
              </p>
            )}
            {quote.customer?.phone && (
              <p>
                <span className="font-semibold">Telefone:</span> {quote.customer.phone}
              </p>
            )}
            {quote.customer?.email && (
              <p>
                <span className="font-semibold">Email:</span> {quote.customer.email}
              </p>
            )}
          </div>
        </div>

        {/* Itens do Orçamento */}
        <div className="mb-6">
          <h2 className="font-bold text-lg mb-3 text-gray-800">Itens do Orçamento</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left py-2">Descrição</th>
                <th className="text-center py-2">Qtd</th>
                <th className="text-right py-2">Preço Unit.</th>
                <th className="text-right py-2">Desconto</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-300">
                  <td className="py-2">
                    <p className="font-medium">{item.description}</p>
                    {item.product && (
                      <p className="text-xs text-gray-600">SKU: {item.product.sku}</p>
                    )}
                  </td>
                  <td className="text-center py-2">{item.quantity || item.qty}</td>
                  <td className="text-right py-2">
                    {formatCurrency(Number(item.unitPrice))}
                  </td>
                  <td className="text-right py-2">
                    {Number(item.discount) > 0
                      ? formatCurrency(Number(item.discount))
                      : "-"}
                  </td>
                  <td className="text-right py-2 font-medium">
                    {formatCurrency(Number(item.total || item.lineTotal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Receita (se houver) */}
        {quote.items.some((item) => item.prescriptionData) && (
          <div className="mb-6 p-4 bg-blue-50 rounded break-inside-avoid">
            <h2 className="font-bold text-lg mb-3 text-gray-800">Dados da Receita</h2>
            {quote.items.map((item) => {
              if (!item.prescriptionData) return null;
              const rx = item.prescriptionData;
              return (
                <div key={item.id} className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Olho Direito (OD)</h4>
                      <div className="space-y-1">
                        {rx.od?.esf && <p>Esférico: {rx.od.esf}</p>}
                        {rx.od?.cil && <p>Cilíndrico: {rx.od.cil}</p>}
                        {rx.od?.eixo && <p>Eixo: {rx.od.eixo}</p>}
                        {rx.od?.dnp && <p>DNP: {rx.od.dnp}</p>}
                        {rx.od?.altura && <p>Altura: {rx.od.altura}</p>}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Olho Esquerdo (OE)</h4>
                      <div className="space-y-1">
                        {rx.oe?.esf && <p>Esférico: {rx.oe.esf}</p>}
                        {rx.oe?.cil && <p>Cilíndrico: {rx.oe.cil}</p>}
                        {rx.oe?.eixo && <p>Eixo: {rx.oe.eixo}</p>}
                        {rx.oe?.dnp && <p>DNP: {rx.oe.dnp}</p>}
                        {rx.oe?.altura && <p>Altura: {rx.oe.altura}</p>}
                      </div>
                    </div>
                  </div>
                  {(rx.adicao || rx.tipoLente || rx.material) && (
                    <div className="border-t pt-2">
                      {rx.adicao && <p>Adição: {rx.adicao}</p>}
                      {rx.tipoLente && <p>Tipo: {rx.tipoLente}</p>}
                      {rx.material && <p>Material: {rx.material}</p>}
                      {rx.tratamentos && rx.tratamentos.length > 0 && (
                        <p>Tratamentos: {rx.tratamentos.join(", ")}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Totais */}
        <div className="mb-6 border-t-2 border-gray-800 pt-4">
          <div className="flex justify-end space-y-2 text-sm">
            <div className="w-64">
              <div className="flex justify-between py-1">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-medium">
                  {formatCurrency(Number(quote.subtotal))}
                </span>
              </div>
              {Number(quote.discountTotal) > 0 && (
                <div className="flex justify-between py-1 text-orange-600">
                  <span>Desconto:</span>
                  <span className="font-medium">
                    -{formatCurrency(Number(quote.discountTotal))}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-gray-800 text-lg font-bold">
                <span>Total:</span>
                <span>{formatCurrency(Number(quote.total))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Condições de Pagamento */}
        {quote.paymentConditions && (
          <div className="mb-6 p-4 bg-gray-50 rounded">
            <h2 className="font-bold text-lg mb-2 text-gray-800">Condições de Pagamento</h2>
            <p className="text-sm whitespace-pre-wrap text-gray-700">{quote.paymentConditions}</p>
          </div>
        )}

        {/* Observações */}
        {quote.notes && (
          <div className="mb-6 p-4 bg-gray-50 rounded">
            <h2 className="font-bold text-lg mb-2 text-gray-800">Observações</h2>
            <p className="text-sm whitespace-pre-wrap text-gray-700">{quote.notes}</p>
          </div>
        )}

        {/* Rodapé */}
        <div className="border-t-2 border-gray-800 pt-4 mt-8 text-sm text-gray-600">
          <div className="grid grid-cols-2 gap-4">
            <div>
              {quote.branch && (
                <p>
                  <span className="font-semibold">Filial:</span> {quote.branch.name}
                </p>
              )}
              <p>
                <span className="font-semibold">Vendedor:</span> {quote.sellerUser.name}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Obrigado pelo interesse!</p>
              <p className="text-xs mt-2">Este orçamento tem validade até {format(new Date(quote.validUntil), "dd/MM/yyyy")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos de Impressão */}
      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }

          .no-print {
            display: none !important;
          }

          .print-container {
            max-width: 100%;
            padding: 20mm;
            margin: 0;
          }

          table {
            page-break-inside: auto;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          .break-inside-avoid {
            page-break-inside: avoid;
          }

          nav,
          aside,
          header,
          footer {
            display: none !important;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media screen {
          body {
            background-color: #f5f5f5;
          }

          .print-container {
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            margin-top: 80px;
            margin-bottom: 40px;
          }
        }
      `}</style>
    </>
  );
}
