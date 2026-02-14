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
import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  subYears,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  subWeeks
} from "date-fns";
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

  const setQuickFilter = (
    type:
      | "today"
      | "yesterday"
      | "thisWeek"
      | "lastWeek"
      | "thisMonth"
      | "lastMonth"
      | "last30Days"
      | "thisYear"
      | "lastYear"
      | "last12Months"
  ) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let newStartDate: Date;
    let newEndDate: Date;

    switch (type) {
      case "today":
        // Hoje (00:00 até 23:59)
        newStartDate = today;
        newEndDate = endOfToday;
        break;

      case "yesterday":
        // Ontem
        newStartDate = subDays(today, 1);
        newEndDate = new Date(subDays(today, 1).setHours(23, 59, 59, 999));
        break;

      case "thisWeek":
        // Esta semana (domingo a hoje)
        newStartDate = startOfWeek(today, { weekStartsOn: 0 });
        newEndDate = endOfToday;
        break;

      case "lastWeek":
        // Semana passada (domingo a sábado)
        const lastWeekStart = subWeeks(startOfWeek(today, { weekStartsOn: 0 }), 1);
        newStartDate = lastWeekStart;
        newEndDate = endOfWeek(lastWeekStart, { weekStartsOn: 0 });
        break;

      case "thisMonth":
        // Mês atual (dia 1 até hoje)
        newStartDate = startOfMonth(today);
        newEndDate = endOfToday;
        break;

      case "lastMonth":
        // Mês passado completo (dia 1 ao último dia)
        const lastMonth = subMonths(today, 1);
        newStartDate = startOfMonth(lastMonth);
        newEndDate = endOfMonth(lastMonth);
        break;

      case "last30Days":
        // Últimos 30 dias (hoje - 30 dias até hoje)
        newStartDate = subDays(today, 29); // 29 + hoje = 30 dias
        newEndDate = endOfToday;
        break;

      case "thisYear":
        // Ano atual (1º de janeiro até hoje)
        newStartDate = startOfYear(today);
        newEndDate = endOfToday;
        break;

      case "lastYear":
        // Ano passado completo (1º jan a 31 dez)
        const lastYear = subYears(today, 1);
        newStartDate = startOfYear(lastYear);
        newEndDate = endOfYear(lastYear);
        break;

      case "last12Months":
        // Últimos 12 meses (hoje - 12 meses até hoje)
        newStartDate = subMonths(today, 12);
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
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Período Rápido</Label>

            {/* Linha 1: Dia */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("today")}>
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("yesterday")}>
                Ontem
              </Button>
            </div>

            {/* Linha 2: Semana */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("thisWeek")}>
                Esta Semana
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("lastWeek")}>
                Semana Passada
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("last30Days")}>
                Últimos 30 Dias
              </Button>
            </div>

            {/* Linha 3: Mês */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("thisMonth")}>
                Mês Atual
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("lastMonth")}>
                Mês Passado
              </Button>
            </div>

            {/* Linha 4: Ano */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("thisYear")}>
                Ano Atual
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("lastYear")}>
                Ano Passado
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("last12Months")}>
                Últimos 12 Meses
              </Button>
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
