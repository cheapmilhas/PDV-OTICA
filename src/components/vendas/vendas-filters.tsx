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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [showCustomDates, setShowCustomDates] = useState(false);

  const paymentMethods = [
    { value: "CASH", label: "Dinheiro" },
    { value: "PIX", label: "PIX" },
    { value: "DEBIT_CARD", label: "Débito" },
    { value: "CREDIT_CARD", label: "Crédito" },
    { value: "BOLETO", label: "Boleto" },
    { value: "CHEQUE", label: "Cheque" },
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
        <CardContent className="space-y-3 pt-0">
          {/* Tabs Compactas para Período */}
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs defaultValue="all" className="w-auto">
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs px-3 py-1" onClick={handleClearFilters}>
                  Todos
                </TabsTrigger>
                <TabsTrigger value="today" className="text-xs px-3 py-1" onClick={() => setQuickFilter("today")}>
                  Hoje
                </TabsTrigger>
                <TabsTrigger value="yesterday" className="text-xs px-3 py-1" onClick={() => setQuickFilter("yesterday")}>
                  Ontem
                </TabsTrigger>
                <TabsTrigger value="thisWeek" className="text-xs px-3 py-1" onClick={() => setQuickFilter("thisWeek")}>
                  Semana
                </TabsTrigger>
                <TabsTrigger value="thisMonth" className="text-xs px-3 py-1" onClick={() => setQuickFilter("thisMonth")}>
                  Mês
                </TabsTrigger>
                <TabsTrigger value="lastMonth" className="text-xs px-3 py-1" onClick={() => setQuickFilter("lastMonth")}>
                  Mês Passado
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              variant={showCustomDates ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs"
              onClick={() => {
                setShowCustomDates(!showCustomDates);
                if (showCustomDates) {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }
              }}
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              {showCustomDates ? "Personalizado ✓" : "Personalizado"}
            </Button>
          </div>

          {/* Campos de Data Customizada + Outros Filtros - Tudo em uma linha */}
          {showCustomDates && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 border rounded-lg bg-muted/30">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Data Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Data Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    locale={ptBR}
                    disabled={(date) => (startDate ? date < startDate : false)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Outros Filtros - Grid Horizontal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {/* Vendedor */}
            <Select value={sellerUserId} onValueChange={setSellerUserId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos vendedores</SelectItem>
                {sellers.map((seller) => (
                  <SelectItem key={seller.id} value={seller.id}>{seller.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Meio de Pagamento */}
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos meios</SelectItem>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Botão Aplicar */}
            <Button onClick={handleApplyFilters} size="sm">Aplicar</Button>

            {/* Botão Limpar */}
            <Button variant="outline" size="sm" onClick={handleClearFilters} disabled={!hasActiveFilters}>
              <X className="mr-2 h-4 w-4" />Limpar
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
