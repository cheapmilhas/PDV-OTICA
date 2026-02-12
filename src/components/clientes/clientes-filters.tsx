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

interface FilterOptions {
  cities: string[];
  states: string[];
  referralSources: string[];
}

interface ClientesFiltersProps {
  onFilterChange: (filters: ClientesFilterValues) => void;
  filterOptions?: FilterOptions;
}

const ESTADOS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO"
];

const MESES = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export function ClientesFilters({ onFilterChange, filterOptions }: ClientesFiltersProps) {
  console.log("ClientesFilters renderizado", { filterOptions });
  const [isExpanded, setIsExpanded] = useState(false);

  // Estados dos filtros
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [city, setCity] = useState("ALL");
  const [state, setState] = useState("ALL");
  const [gender, setGender] = useState("ALL");
  const [acceptsMarketing, setAcceptsMarketing] = useState("ALL");
  const [referralSource, setReferralSource] = useState("ALL");
  const [birthdayMonth, setBirthdayMonth] = useState("ALL");

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
      gender: gender === "ALL" ? "" : gender,
      acceptsMarketing: acceptsMarketing === "ALL" ? "" : acceptsMarketing,
      referralSource: referralSource === "ALL" ? "" : referralSource,
      birthdayMonth: birthdayMonth === "ALL" ? "" : birthdayMonth,
    });
  };

  // Limpar filtros
  const handleClearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setCity("ALL");
    setState("ALL");
    setGender("ALL");
    setAcceptsMarketing("ALL");
    setReferralSource("ALL");
    setBirthdayMonth("ALL");
    onFilterChange({
      startDate: undefined,
      endDate: undefined,
      city: "",
      state: "",
      gender: "",
      acceptsMarketing: "",
      referralSource: "",
      birthdayMonth: "",
    });
  };

  // Contar filtros ativos
  const activeFiltersCount = [
    startDate || endDate,
    city !== "ALL",
    state !== "ALL",
    gender !== "ALL",
    acceptsMarketing !== "ALL",
    referralSource !== "ALL",
    birthdayMonth !== "ALL",
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
      case "gender":
        setGender("ALL");
        break;
      case "acceptsMarketing":
        setAcceptsMarketing("ALL");
        break;
      case "referralSource":
        setReferralSource("ALL");
        break;
      case "birthdayMonth":
        setBirthdayMonth("ALL");
        break;
    }
    // Aplicar filtros automaticamente ao remover
    setTimeout(handleApplyFilters, 0);
  };

  const getGenderLabel = (value: string) => {
    const map: Record<string, string> = {
      M: "Masculino",
      F: "Feminino",
      Outro: "Outro",
    };
    return map[value] || value;
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

            {/* Gênero */}
            <div className="space-y-2">
              <Label className="text-sm">Gênero</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Aceita Marketing */}
            <div className="space-y-2">
              <Label className="text-sm">Aceita Marketing</Label>
              <Select value={acceptsMarketing} onValueChange={setAcceptsMarketing}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Origem */}
            <div className="space-y-2">
              <Label className="text-sm">Origem/Indicação</Label>
              <Select value={referralSource} onValueChange={setReferralSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as origens</SelectItem>
                  {filterOptions?.referralSources.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Aniversariantes */}
            <div className="space-y-2">
              <Label className="text-sm">Aniversariantes</Label>
              <Select value={birthdayMonth} onValueChange={setBirthdayMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os meses</SelectItem>
                  {MESES.map((mes) => (
                    <SelectItem key={mes.value} value={mes.value}>
                      {mes.label}
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
              {gender !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Gênero: {getGenderLabel(gender)}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("gender");
                    }}
                  />
                </Badge>
              )}
              {acceptsMarketing !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Marketing: {acceptsMarketing === "true" ? "Sim" : "Não"}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("acceptsMarketing");
                    }}
                  />
                </Badge>
              )}
              {referralSource !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Origem: {referralSource}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("referralSource");
                    }}
                  />
                </Badge>
              )}
              {birthdayMonth !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Aniversário: {MESES.find((m) => m.value === birthdayMonth)?.label}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("birthdayMonth");
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
