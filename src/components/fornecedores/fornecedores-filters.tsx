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
import { CalendarIcon, Filter, X, ChevronDown } from "lucide-react";
import { format, subMonths, subYears, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

export interface FornecedoresFilterValues {
  startDate?: Date;
  endDate?: Date;
  city: string;
  state: string;
}

interface FilterOptions {
  cities: string[];
  states: string[];
}

interface FornecedoresFiltersProps {
  onFilterChange: (filters: FornecedoresFilterValues) => void;
  filterOptions?: FilterOptions;
}

const ESTADOS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO"
];

export function FornecedoresFilters({ onFilterChange, filterOptions }: FornecedoresFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Estados dos filtros
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [city, setCity] = useState("ALL");
  const [state, setState] = useState("ALL");

  // Filtros rápidos de data
  const setQuickFilter = (type: "today" | "week" | "month" | "year") => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (type) {
      case "today":
        setStartDate(today);
        setEndDate(today);
        break;
      case "week":
        setStartDate(startOfWeek(today, { weekStartsOn: 0 }));
        setEndDate(endOfWeek(today, { weekStartsOn: 0 }));
        break;
      case "month":
        setStartDate(subMonths(today, 1));
        setEndDate(today);
        break;
      case "year":
        setStartDate(subYears(today, 1));
        setEndDate(today);
        break;
    }
  };

  // Aplicar filtros
  const handleApplyFilters = () => {
    onFilterChange({
      startDate,
      endDate,
      city: city === "ALL" ? "" : city,
      state: state === "ALL" ? "" : state,
    });
  };

  // Limpar filtros
  const handleClearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setCity("ALL");
    setState("ALL");
    onFilterChange({
      startDate: undefined,
      endDate: undefined,
      city: "",
      state: "",
    });
  };

  // Contar filtros ativos
  const activeFiltersCount = [
    startDate || endDate,
    city !== "ALL",
    state !== "ALL",
  ].filter(Boolean).length;

  const hasActiveFilters = activeFiltersCount > 0;

  // Remover filtro individual
  const removeFilter = (filterName: string) => {
    switch (filterName) {
      case "date":
        setStartDate(undefined);
        setEndDate(undefined);
        break;
      case "city":
        setCity("ALL");
        break;
      case "state":
        setState("ALL");
        break;
    }
    // Aplicar filtros automaticamente ao remover
    setTimeout(handleApplyFilters, 0);
  };

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
              {activeFiltersCount} {activeFiltersCount === 1 ? "ativo" : "ativos"}
            </Badge>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6 pt-0">
          {/* Filtros Rápidos de Data */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Período de Cadastro</Label>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("today")}>
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("week")}>
                Esta Semana
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("month")}>
                Último Mês
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("year")}>
                Último Ano
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Data Inicial */}
            <div className="space-y-2">
              <Label className="text-sm">Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Data Final */}
            <div className="space-y-2">
              <Label className="text-sm">Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
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
                    disabled={(date) => (startDate ? date < startDate : false)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Cidade */}
            <div className="space-y-2">
              <Label className="text-sm">Cidade</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as cidades</SelectItem>
                  {filterOptions?.cities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label className="text-sm">Estado</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os estados</SelectItem>
                  {ESTADOS_BR.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Badges de Filtros Ativos */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <span className="text-sm text-muted-foreground">Filtros ativos:</span>
              {(startDate || endDate) && (
                <Badge variant="secondary" className="gap-1">
                  Período: {startDate ? format(startDate, "dd/MM") : "..."} -{" "}
                  {endDate ? format(endDate, "dd/MM") : "..."}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("date");
                    }}
                  />
                </Badge>
              )}
              {city !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Cidade: {city}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("city");
                    }}
                  />
                </Badge>
              )}
              {state !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Estado: {state}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("state");
                    }}
                  />
                </Badge>
              )}
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleApplyFilters} className="flex-1">
              Aplicar Filtros
            </Button>
            <Button
              variant="outline"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
            >
              <X className="mr-2 h-4 w-4" />
              Limpar
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
