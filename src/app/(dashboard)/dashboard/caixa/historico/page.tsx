import { Metadata } from "next";
import { HistoricoCaixas } from "@/components/caixa/historico-caixas";

export const metadata: Metadata = {
  title: "Histórico de Caixas | PDV Ótica",
  description: "Visualize e gerencie o histórico de caixas",
};

export default function HistoricoCaixasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Histórico de Caixas</h1>
        <p className="text-muted-foreground">
          Visualize e confira caixas de outros dias
        </p>
      </div>

      <HistoricoCaixas />
    </div>
  );
}
