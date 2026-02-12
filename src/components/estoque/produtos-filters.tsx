"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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

export interface ProdutosFilterValues {
  startDate?: Date;
  endDate?: Date;
  categoryId: string;
  brandId: string;
  supplierId: string;
  stockLevel: string;
  minPrice: string;
  maxPrice: string;
}

interface FilterOptions {
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}

interface ProdutosFiltersProps {
  onFilterChange: (filters: ProdutosFilterValues) => void;
  filterOptions?: FilterOptions;
}

export function ProdutosFilters({ onFilterChange, filterOptions }: ProdutosFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Estados dos filtros
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [categoryId, setCategoryId] = useState("ALL");
  const [brandId, setBrandId] = useState("ALL");
  const [supplierId, setSupplierId] = useState("ALL");
  const [stockLevel, setStockLevel] = useState("ALL");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

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
      categoryId: categoryId === "ALL" ? "" : categoryId,
      brandId: brandId === "ALL" ? "" : brandId,
      supplierId: supplierId === "ALL" ? "" : supplierId,
      stockLevel: stockLevel === "ALL" ? "" : stockLevel,
      minPrice,
      maxPrice,
    });
  };

  // Limpar filtros
  const handleClearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setCategoryId("ALL");
    setBrandId("ALL");
    setSupplierId("ALL");
    setStockLevel("ALL");
    setMinPrice("");
    setMaxPrice("");
    onFilterChange({
      startDate: undefined,
      endDate: undefined,
      categoryId: "",
      brandId: "",
      supplierId: "",
      stockLevel: "",
      minPrice: "",
      maxPrice: "",
    });
  };

  // Contar filtros ativos
  const activeFiltersCount = [
    startDate || endDate,
    categoryId !== "ALL",
    brandId !== "ALL",
    supplierId !== "ALL",
    stockLevel !== "ALL",
    minPrice || maxPrice,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFiltersCount > 0;

  // Remover filtro individual
  const removeFilter = (filterName: string) => {
    switch (filterName) {
      case "date":
        setStartDate(undefined);
        setEndDate(undefined);
        break;
      case "category":
        setCategoryId("ALL");
        break;
      case "brand":
        setBrandId("ALL");
        break;
      case "supplier":
        setSupplierId("ALL");
        break;
      case "stockLevel":
        setStockLevel("ALL");
        break;
      case "price":
        setMinPrice("");
        setMaxPrice("");
        break;
    }
    setTimeout(handleApplyFilters, 0);
  };

  const getStockLevelLabel = (value: string) => {
    const map: Record<string, string> = {
      zerado: "Zerado",
      baixo: "Baixo",
      normal: "Normal",
      alto: "Alto",
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

            {/* Categoria */}
            <div className="space-y-2">
              <Label className="text-sm">Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as categorias</SelectItem>
                  {filterOptions?.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Marca */}
            <div className="space-y-2">
              <Label className="text-sm">Marca</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as marcas</SelectItem>
                  {filterOptions?.brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fornecedor */}
            <div className="space-y-2">
              <Label className="text-sm">Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os fornecedores</SelectItem>
                  {filterOptions?.suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nível de Estoque */}
            <div className="space-y-2">
              <Label className="text-sm">Nível de Estoque</Label>
              <Select value={stockLevel} onValueChange={setStockLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os níveis</SelectItem>
                  <SelectItem value="zerado">Zerado (0 unidades)</SelectItem>
                  <SelectItem value="baixo">Baixo (abaixo do mínimo)</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alto">Alto (acima do máximo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preço Mínimo */}
            <div className="space-y-2">
              <Label className="text-sm">Preço Mínimo</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="R$ 0,00"
              />
            </div>

            {/* Preço Máximo */}
            <div className="space-y-2">
              <Label className="text-sm">Preço Máximo</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="R$ 9999,00"
              />
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
              {categoryId !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Categoria: {filterOptions?.categories.find((c) => c.id === categoryId)?.name}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("category");
                    }}
                  />
                </Badge>
              )}
              {brandId !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Marca: {filterOptions?.brands.find((b) => b.id === brandId)?.name}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("brand");
                    }}
                  />
                </Badge>
              )}
              {supplierId !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Fornecedor: {filterOptions?.suppliers.find((s) => s.id === supplierId)?.name}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("supplier");
                    }}
                  />
                </Badge>
              )}
              {stockLevel !== "ALL" && (
                <Badge variant="secondary" className="gap-1">
                  Estoque: {getStockLevelLabel(stockLevel)}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("stockLevel");
                    }}
                  />
                </Badge>
              )}
              {(minPrice || maxPrice) && (
                <Badge variant="secondary" className="gap-1">
                  Preço: R$ {minPrice || "0"} - R$ {maxPrice || "∞"}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter("price");
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
