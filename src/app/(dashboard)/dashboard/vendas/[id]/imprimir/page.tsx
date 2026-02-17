"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { Printer, ArrowLeft, Loader2, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Image from "next/image";

interface SaleDetails {
  id: string;
  createdAt: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  notes?: string;
  status: string;
  customer: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
  };
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
    qty: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    product: {
      id: string;
      name: string;
      sku: string;
      barcode?: string;
    };
  }>;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
    installments: number;
  }>;
}

export default function ImprimirVendaPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const autoprint = searchParams.get("autoprint") === "true";

  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [companySettings, setCompanySettings] = useState<{ logoUrl?: string; displayName?: string } | null>(null);

  // Debug: Log quando componente monta
  useEffect(() => {
    console.log("🔍 ImprimirVendaPage montado");
    console.log("📋 autoprint:", autoprint);
    console.log("🆔 sale ID:", id);
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [saleRes, settingsRes] = await Promise.all([
          fetch(`/api/sales/${id}`),
          fetch("/api/company/settings"),
        ]);
        if (!saleRes.ok) throw new Error("Erro ao carregar venda");
        const { data } = await saleRes.json();
        setSale(data);
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setCompanySettings(settingsData.data || settingsData);
        }
      } catch (error: any) {
        toast.error(error.message);
        router.push("/dashboard/vendas");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [id, router]);

  // Auto-baixar PDF quando autoprint=true
  useEffect(() => {
    console.log("🔄 useEffect autodownload - autoprint:", autoprint, "sale:", !!sale, "loading:", loading);

    if (autoprint && sale && !loading) {
      console.log("✅ Condições atendidas! Agendando download em 1.2s...");

      // Aguardar um pouco para garantir que o conteúdo foi renderizado
      const timer = setTimeout(async () => {
        console.log("⏰ Timeout completado! Iniciando download...");
        const success = await handleDownloadPDF();
        console.log("📊 Resultado do download:", success);
        // Opcional: fechar aba após download bem-sucedido
        // if (success) window.close();
      }, 1200);

      return () => {
        console.log("🧹 Limpando timeout");
        clearTimeout(timer);
      };
    } else {
      console.log("⏭️ Condições NÃO atendidas para autodownload");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoprint, sale, loading]);

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: "Dinheiro",
      DEBIT_CARD: "Débito",
      CREDIT_CARD: "Crédito",
      PIX: "PIX",
      BANK_SLIP: "Boleto",
      STORE_CREDIT: "Crédito Loja",
    };
    return labels[method] || method;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async (): Promise<boolean> => {
    console.log("📥 handleDownloadPDF - INICIANDO");
    setDownloading(true);

    try {
      console.log("📦 Importando bibliotecas...");
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      console.log("✅ Bibliotecas importadas");

      console.log("🔍 Procurando .print-container...");
      const printContainer = document.querySelector(".print-container") as HTMLElement;
      if (!printContainer) {
        console.error("❌ .print-container não encontrado!");
        toast.error("Erro ao gerar PDF - container não encontrado");
        return false;
      }
      console.log("✅ Container encontrado:", printContainer);

      console.log("📸 Capturando imagem com html2canvas...");
      const canvas = await html2canvas(printContainer, {
        scale: 2, // Maior qualidade
        useCORS: true,
        logging: true, // Ativar logs do html2canvas
        backgroundColor: "#ffffff",
      });
      console.log("✅ Canvas gerado:", canvas.width, "x", canvas.height);

      console.log("📄 Criando PDF...");
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

      console.log("📐 Dimensões do PDF:", pdfWidth, "x", pdfHeight);
      console.log("📐 Dimensões da imagem:", imgWidth, "x", imgHeight);

      // Adicionar primeira página
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Adicionar páginas extras se necessário
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
        console.log("📄 Página extra adicionada");
      }

      // Gerar nome do arquivo com nome do cliente
      const customerName = sale?.customer?.name?.replace(/\s+/g, "_") || "cliente";
      const saleDate = sale ? format(new Date(sale.createdAt), "ddMMyyyy") : "";
      const fileName = `Venda_${customerName}_${saleDate}.pdf`;

      console.log("💾 Salvando PDF:", fileName);
      pdf.save(fileName);
      console.log("✅ PDF salvo com sucesso!");

      toast.success("PDF baixado com sucesso!");
      return true;
    } catch (error) {
      console.error("❌ ERRO ao gerar PDF:", error);
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

  if (!sale) {
    return null;
  }

  return (
    <>
      {/* Indicador de download automático */}
      {autoprint && downloading && (
        <div className="no-print fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-black/80 text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <div>
            <p className="font-semibold">Gerando PDF...</p>
            <p className="text-sm text-gray-300">Aguarde enquanto o documento é preparado</p>
          </div>
        </div>
      )}

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
          <p className="text-gray-600">Comprovante de Venda</p>
        </div>

        {/* Informações da Venda */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <p className="font-semibold text-gray-700">Venda Nº:</p>
            <p className="text-gray-900">{sale.id.substring(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-700">Data/Hora:</p>
            <p className="text-gray-900">
              {format(new Date(sale.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
            </p>
          </div>
        </div>

        {/* Cliente */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h2 className="font-bold text-lg mb-2 text-gray-800">Cliente</h2>
          <div className="text-sm space-y-1">
            <p>
              <span className="font-semibold">Nome:</span> {sale.customer.name}
            </p>
            {sale.customer.cpf && (
              <p>
                <span className="font-semibold">CPF:</span> {sale.customer.cpf}
              </p>
            )}
            {sale.customer.phone && (
              <p>
                <span className="font-semibold">Telefone:</span> {sale.customer.phone}
              </p>
            )}
          </div>
        </div>

        {/* Itens da Venda */}
        <div className="mb-6">
          <h2 className="font-bold text-lg mb-3 text-gray-800">Itens da Venda</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left py-2">Produto</th>
                <th className="text-center py-2">Qtd</th>
                <th className="text-right py-2">Preço Unit.</th>
                <th className="text-right py-2">Desconto</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, index) => (
                <tr key={item.id} className="border-b border-gray-300">
                  <td className="py-2">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-xs text-gray-600">SKU: {item.product.sku}</p>
                  </td>
                  <td className="text-center py-2">{item.qty}</td>
                  <td className="text-right py-2">
                    {formatCurrency(Number(item.unitPrice))}
                  </td>
                  <td className="text-right py-2">
                    {Number(item.discount) > 0
                      ? formatCurrency(Number(item.discount))
                      : "-"}
                  </td>
                  <td className="text-right py-2 font-medium">
                    {formatCurrency(Number(item.lineTotal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totais */}
        <div className="mb-6 border-t-2 border-gray-800 pt-4">
          <div className="flex justify-end space-y-2 text-sm">
            <div className="w-64">
              <div className="flex justify-between py-1">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-medium">
                  {formatCurrency(Number(sale.subtotal))}
                </span>
              </div>
              {Number(sale.discountTotal) > 0 && (
                <div className="flex justify-between py-1 text-orange-600">
                  <span>Desconto:</span>
                  <span className="font-medium">
                    -{formatCurrency(Number(sale.discountTotal))}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-gray-800 text-lg font-bold">
                <span>Total:</span>
                <span>{formatCurrency(Number(sale.total))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Formas de Pagamento */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h2 className="font-bold text-lg mb-3 text-gray-800">Formas de Pagamento</h2>
          <div className="space-y-2 text-sm">
            {sale.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between">
                <span>
                  <span className="font-semibold">
                    {getPaymentMethodLabel(payment.method)}
                  </span>
                  {payment.installments > 1 && (
                    <span className="text-gray-600"> ({payment.installments}x)</span>
                  )}
                </span>
                <span className="font-medium">
                  {formatCurrency(Number(payment.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé */}
        <div className="border-t-2 border-gray-800 pt-4 mt-8 text-sm text-gray-600">
          <div className="grid grid-cols-2 gap-4">
            <div>
              {sale.branch && (
                <p>
                  <span className="font-semibold">Filial:</span> {sale.branch.name}
                </p>
              )}
              <p>
                <span className="font-semibold">Vendedor:</span> {sale.sellerUser.name}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Obrigado pela preferência!</p>
            </div>
          </div>
        </div>

        {/* Observações */}
        {sale.notes && (
          <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
            <p className="font-semibold text-gray-700 mb-1">Observações:</p>
            <p className="text-gray-600 whitespace-pre-wrap">{sale.notes}</p>
          </div>
        )}
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

          /* Garantir quebras de página adequadas */
          table {
            page-break-inside: auto;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          /* Ocultar elementos da interface */
          nav,
          aside,
          header,
          footer {
            display: none !important;
          }

          /* Ajustar cores para impressão */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        /* Estilos para visualização na tela */
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
