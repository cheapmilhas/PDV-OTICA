"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

export interface ClientesFilterValues {
  startDate?: Date;
  endDate?: Date;
  city: string;
  state: string;
  gender: string;
  acceptsMarketing: string;
  referralSource: string;
  birthdayMonth: string;
}

interface ClientesFiltersSimpleProps {
  onFilterChange: (filters: ClientesFilterValues) => void;
}

export function ClientesFiltersSimple({ onFilterChange }: ClientesFiltersSimpleProps) {
  return (
    <Card className="bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtros (Versão Simples - TESTE)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Este é um componente de teste simplificado.</p>
        <Button
          onClick={() => {
            console.log("Botão clicado!");
            alert("Componente de filtros está funcionando!");
          }}
          className="mt-4"
        >
          Testar Filtros
        </Button>
      </CardContent>
    </Card>
  );
}
