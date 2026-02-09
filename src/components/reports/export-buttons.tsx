"use client";

import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface ExportButtonsProps {
  onExportPDF?: () => Promise<void> | void;
  onExportExcel?: () => Promise<void> | void;
  onPrint?: () => void;
  disabled?: boolean;
}

export function ExportButtons({
  onExportPDF,
  onExportExcel,
  onPrint,
  disabled = false,
}: ExportButtonsProps) {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingExcel, setLoadingExcel] = useState(false);

  const handleExportPDF = async () => {
    if (!onExportPDF) return;
    setLoadingPDF(true);
    try {
      await onExportPDF();
      toast.success("PDF exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar PDF");
      console.error(error);
    } finally {
      setLoadingPDF(false);
    }
  };

  const handleExportExcel = async () => {
    if (!onExportExcel) return;
    setLoadingExcel(true);
    try {
      await onExportExcel();
      toast.success("Excel exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar Excel");
      console.error(error);
    } finally {
      setLoadingExcel(false);
    }
  };

  return (
    <div className="flex gap-2">
      {onExportPDF && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          disabled={disabled || loadingPDF}
        >
          <Download className="mr-2 h-4 w-4" />
          {loadingPDF ? "Exportando..." : "PDF"}
        </Button>
      )}
      {onExportExcel && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportExcel}
          disabled={disabled || loadingExcel}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {loadingExcel ? "Exportando..." : "Excel"}
        </Button>
      )}
      {onPrint && (
        <Button
          variant="outline"
          size="sm"
          onClick={onPrint}
          disabled={disabled}
        >
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      )}
    </div>
  );
}
