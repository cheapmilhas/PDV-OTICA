"use client";

import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Search, Eye, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ModalDetalhesCaixa } from "./modal-detalhes-caixa";

interface CashRegister {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: "OPEN" | "CLOSED";
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  difference: number | null;
  totalSales: number;
  totalExpenses: number;
  openedByUser: {
    name: string;
    email: string;
  };
  closedByUser?: {
    name: string;
    email: string;
  } | null;
  branch: {
    name: string;
  };
}

const statusLabels: Record<string, string> = {
  OPEN: "Aberto",
  CLOSED: "Fechado",
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "default",
  CLOSED: "secondary",
};

export function HistoricoCaixas() {
  const [caixas, setCaixas] = useState<CashRegister[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCaixa, setSelectedCaixa] = useState<CashRegister | null>(null);

  // Filtros
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(new Date()));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchUser, setSearchUser] = useState("");

  async function loadCaixas() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("dateFrom", dateFrom.toISOString());
      params.append("dateTo", dateTo.toISOString());

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      if (searchUser) {
        params.append("userName", searchUser);
      }

      const response = await fetch(`/api/cash-registers?${params.toString()}`);
      const result = await response.json();

      if (response.ok) {
        setCaixas(result.data || []);
      } else {
        toast.error("Erro ao carregar histórico de caixas");
      }
    } catch (error) {
      toast.error("Erro ao carregar histórico de caixas");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCaixas();
  }, [dateFrom, dateTo, statusFilter]);

  function handleSearch() {
    loadCaixas();
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  async function handleDownloadReport(caixaId: string) {
    try {
      toast.loading("Gerando relatório PDF...");

      const response = await fetch(`/api/cash-registers/${caixaId}/report`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Erro ao gerar relatório");
      }

      // Converter response para blob
      const blob = await response.blob();

      // Criar URL temporária para download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-caixa-${caixaId}.pdf`;
      document.body.appendChild(link);
      link.click();

      // Limpar
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success("Relatório baixado com sucesso!");
    } catch (error) {
      toast.dismiss();
      toast.error("Erro ao gerar relatório. Tente novamente.");
      console.error("Erro ao baixar relatório:", error);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Filtre os caixas por período, status ou usuário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Data Inicial */}
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => date && setDateFrom(date)}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Data Final */}
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => date && setDateTo(date)}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="OPEN">Abertos</SelectItem>
                  <SelectItem value="CLOSED">Fechados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Buscar por usuário */}
            <div className="space-y-2">
              <Label>Usuário</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome do usuário"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            {caixas.length} {caixas.length === 1 ? "caixa encontrado" : "caixas encontrados"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : caixas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum caixa encontrado para os filtros selecionados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora Abertura</TableHead>
                    <TableHead>Aberto por</TableHead>
                    <TableHead>Data/Hora Fechamento</TableHead>
                    <TableHead>Fechado por</TableHead>
                    <TableHead>Filial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Saldo Inicial</TableHead>
                    <TableHead className="text-right">Saldo Final</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {caixas.map((caixa) => (
                    <TableRow key={caixa.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(caixa.openedAt), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>{caixa.openedByUser.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {caixa.closedAt
                          ? format(new Date(caixa.closedAt), "dd/MM/yyyy HH:mm", {
                              locale: ptBR,
                            })
                          : "-"}
                      </TableCell>
                      <TableCell>{caixa.closedByUser?.name || "-"}</TableCell>
                      <TableCell>{caixa.branch.name}</TableCell>
                      <TableCell>
                        <Badge variant={statusColors[caixa.status]}>
                          {statusLabels[caixa.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(caixa.openingBalance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {caixa.closingBalance !== null
                          ? formatCurrency(caixa.closingBalance)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {caixa.difference !== null ? (
                          <span
                            className={cn(
                              "font-medium",
                              caixa.difference > 0 && "text-green-600",
                              caixa.difference < 0 && "text-red-600"
                            )}
                          >
                            {formatCurrency(caixa.difference)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCaixa(caixa)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {caixa.status === "CLOSED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadReport(caixa.id)}
                              title="Baixar relatório"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ModalDetalhesCaixa
        caixa={selectedCaixa}
        open={!!selectedCaixa}
        onOpenChange={(open) => !open && setSelectedCaixa(null)}
      />
    </>
  );
}
