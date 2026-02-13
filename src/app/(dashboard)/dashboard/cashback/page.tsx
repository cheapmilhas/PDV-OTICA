"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Wallet, Users, TrendingUp, TrendingDown, Search, Settings } from "lucide-react";
import Link from "next/link";

interface CashbackSummary {
  config: {
    enabled: boolean;
    earnPercent: number;
    expirationDays: number;
    maxUsagePercent: number;
  };
  totalBalance: number;
  activeCustomers: number;
  earnedThisMonth: number;
  usedThisMonth: number;
}

interface CustomerCashback {
  customerId: string;
  customerName: string;
  balance: number;
  totalEarned: number;
  totalUsed: number;
  totalExpired: number;
  lastMovement: Date | null;
}

export default function CashbackPage() {
  const [summary, setSummary] = useState<CashbackSummary | null>(null);
  const [customers, setCustomers] = useState<CustomerCashback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [summaryRes, customersRes] = await Promise.all([
        fetch("/api/cashback/summary"),
        fetch("/api/cashback/customers"),
      ]);

      if (!summaryRes.ok || !customersRes.ok) {
        throw new Error("Erro ao carregar dados");
      }

      const [summaryData, customersData] = await Promise.all([
        summaryRes.json(),
        customersRes.json(),
      ]);

      setSummary(summaryData.data);
      setCustomers(customersData.data.customers || []);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados de cashback.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredCustomers = customers.filter((c) =>
    c.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedRoute
      permission="cashback.access"
      message="Você não tem permissão para acessar cashback. Entre em contato com o administrador do sistema."
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Cashback</h1>
            <p className="text-muted-foreground">
              Gestão de programa de fidelidade e cashback
            </p>
          </div>
          <Link href="/dashboard/configuracoes/cashback">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </Button>
          </Link>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.totalBalance)}</div>
                <p className="text-xs text-muted-foreground">
                  Cashback disponível para uso
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Ativos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.activeCustomers}</div>
                <p className="text-xs text-muted-foreground">
                  Com saldo disponível
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ganho Este Mês</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(summary.earnedThisMonth)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cashback creditado aos clientes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usado Este Mês</CardTitle>
                <TrendingDown className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(summary.usedThisMonth)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cashback utilizado em vendas
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Configuration Status */}
        {summary && (
          <Card>
            <CardHeader>
              <CardTitle>Status da Configuração</CardTitle>
              <CardDescription>Configurações atuais do programa de cashback</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge variant={summary.config.enabled ? "default" : "secondary"}>
                    {summary.config.enabled ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">% de Ganho</p>
                  <p className="text-lg font-semibold">{summary.config.earnPercent}%</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Validade</p>
                  <p className="text-lg font-semibold">{summary.config.expirationDays} dias</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Uso Máximo</p>
                  <p className="text-lg font-semibold">{summary.config.maxUsagePercent}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Customers List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Clientes com Cashback</CardTitle>
                <CardDescription>Lista de clientes e seus saldos disponíveis</CardDescription>
              </div>
              <div className="w-64">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente com cashback"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Total Ganho</TableHead>
                    <TableHead className="text-right">Total Usado</TableHead>
                    <TableHead className="text-right">Expirado</TableHead>
                    <TableHead className="text-right">Último Movimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.customerId}>
                      <TableCell className="font-medium">{customer.customerName}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-green-600">
                          {formatCurrency(customer.balance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(customer.totalEarned)}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {formatCurrency(customer.totalUsed)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(customer.totalExpired)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {customer.lastMovement
                          ? format(new Date(customer.lastMovement), "dd/MM/yyyy", { locale: ptBR })
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
