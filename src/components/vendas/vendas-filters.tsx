"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

interface VendasFiltersProps {
  onFilterChange: (filters: VendasFilterValues) => void;
  sellers: Array<{ id: string; name: string }>;
}

export interface VendasFilterValues {
  startDate: Date | undefined;
  endDate: Date | undefined;
  sellerUserId: string;
  paymentMethod: string;
}

export function VendasFilters({ onFilterChange, sellers }: VendasFiltersProps) {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [sellerUserId, setSellerUserId] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [isExpanded, setIsExpanded] = useState(true);

  const paymentMethods = [
    { value: "CASH", label: "Dinheiro" },
    { value: "PIX", label: "PIX" },
    { value: "DEBIT_CARD", label: "Débito" },
    { value: "CREDIT_CARD", label: "Crédito" },
    { value: "STORE_CREDIT", label: "Crediário" },
  ];

  const setQuickFilter = (type: "today" | "week" | "month" | "year") => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    let newStartDate: Date;
    let newEndDate: Date;

    switch (type) {
      case "today":
        newStartDate = today;
        newEndDate = endOfToday;
        break;
      case "week":
        newStartDate = startOfWeek(today, { weekStartsOn: 0 });
        newEndDate = endOfWeek(endOfToday, { weekStartsOn: 0 });
        break;
      case "month":
        newStartDate = subDays(today, 30);
        newEndDate = endOfToday;
        break;
      case "year":
        newStartDate = subYears(today, 1);
        newEndDate = endOfToday;
        break;
      default:
        return;
    }

    setStartDate(newStartDate);
    setEndDate(newEndDate);

    // Aplicar filtros automaticamente após definir o período rápido
    setTimeout(() => {
      onFilterChange({
        startDate: newStartDate,
        endDate: newEndDate,
        sellerUserId: sellerUserId === "ALL" ? "" : sellerUserId,
        paymentMethod: paymentMethod === "ALL" ? "" : paymentMethod,
      });
    }, 100);
  };

  const handleApplyFilters = () => {
    onFilterChange({
      startDate,
      endDate,
      sellerUserId: sellerUserId === "ALL" ? "" : sellerUserId,
      paymentMethod: paymentMethod === "ALL" ? "" : paymentMethod,
    });
  };

  const handleClearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setSellerUserId("ALL");
    setPaymentMethod("ALL");
    onFilterChange({
      startDate: undefined,
      endDate: undefined,
      sellerUserId: "",
      paymentMethod: "",
    });
  };

  const hasActiveFilters = startDate || endDate || sellerUserId !== "ALL" || paymentMethod !== "ALL";

  return (
    <Card>
      <CardHeader
        className="flex flex-row items-center justify-between cursor-pointer py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          <CardTitle className="text-base">Filtros</CardTitle>
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-xs">
              Filtros ativos
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Filtros Rápidos */}
          <div className="space-y-2">
            <Label className="text-sm">Período Rápido</Label>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("today")}>Hoje</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("week")}>Esta Semana</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("month")}>Último Mês</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("year")}>Último Ano</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Data Inicial */}
            <div className="space-y-2">
              <Label className="text-sm">Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Data Final */}
            <div className="space-y-2">
              <Label className="text-sm">Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    locale={ptBR}
                    disabled={(date) => startDate ? date < startDate : false}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Vendedor */}
            <div className="space-y-2">
              <Label className="text-sm">Vendedor</Label>
              <Select value={sellerUserId} onValueChange={setSellerUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os vendedores</SelectItem>
                  {sellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>{seller.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Meio de Pagamento */}
            <div className="space-y-2">
              <Label className="text-sm">Pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os meios</SelectItem>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleApplyFilters} className="flex-1">Aplicar Filtros</Button>
            <Button variant="outline" onClick={handleClearFilters} disabled={!hasActiveFilters}>
              <X className="mr-2 h-4 w-4" />Limpar
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
