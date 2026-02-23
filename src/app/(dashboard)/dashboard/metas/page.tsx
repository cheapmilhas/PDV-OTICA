"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Target,
  Trophy,
  TrendingUp,
  DollarSign,
  Award,
  Loader2,
  Plus,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function GoalsPageContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [sellers, setSellers] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);

  // Filtros de data
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // Modal de criar meta
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [branchGoal, setBranchGoal] = useState("");
  const [sellerGoals, setSellerGoals] = useState<Record<string, string>>({});

  // Modal de fechar mês
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingMonth, setClosingMonth] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedYear, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashRes, sellersRes, commissionsRes] = await Promise.all([
        fetch(`/api/goals/dashboard?year=${selectedYear}&month=${selectedMonth}`),
        fetch("/api/goals/sellers"),
        fetch(`/api/goals/commissions?year=${selectedYear}&month=${selectedMonth}`),
      ]);

      const dashData = await dashRes.json();
      const sellersData = await sellersRes.json();
      const commissionsData = await commissionsRes.json();

      if (dashData.success) setDashboard(dashData.data);
      if (sellersData.success) setSellers(sellersData.data);
      if (commissionsData.success) setCommissions(commissionsData.data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({ title: "Erro", description: "Erro ao carregar dados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleSaveGoal = async () => {
    setSavingGoal(true);
    try {
      const sellerGoalsArray = Object.entries(sellerGoals)
        .filter(([_, value]) => value && parseFloat(value) > 0)
        .map(([userId, goalAmount]) => ({
          userId,
          goalAmount: parseFloat(goalAmount),
        }));

      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          branchGoal: parseFloat(branchGoal) || 0,
          sellerGoals: sellerGoalsArray,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: "Sucesso", description: "Metas salvas com sucesso" });
        setShowGoalModal(false);
        setBranchGoal("");
        setSellerGoals({});
        fetchData();
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao salvar metas", variant: "destructive" });
    } finally {
      setSavingGoal(false);
    }
  };

  const handleCloseMonth = async () => {
    setClosingMonth(true);
    try {
      const response = await fetch("/api/goals/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: "Sucesso", description: result.message });
        setShowCloseModal(false);
        fetchData();
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao fechar mês", variant: "destructive" });
    } finally {
      setClosingMonth(false);
    }
  };

  const handleMarkAsPaid = async (commissionId: string) => {
    try {
      const response = await fetch(`/api/goals/commissions/${commissionId}`, {
        method: "PUT",
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: "Sucesso", description: "Comissão marcada como paga" });
        fetchData();
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao atualizar comissão", variant: "destructive" });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const openGoalModal = () => {
    // Pré-preencher com valores atuais se existirem
    if (dashboard?.goal) {
      setBranchGoal(String(dashboard.branch.goalAmount));
      const currentSellerGoals: Record<string, string> = {};
      dashboard.ranking.forEach((seller: any) => {
        if (seller.goalAmount > 0) {
          currentSellerGoals[seller.userId] = String(seller.goalAmount);
        }
      });
      setSellerGoals(currentSellerGoals);
    }
    setShowGoalModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" />
            Metas e Comissões
          </h1>
          <p className="text-muted-foreground">
            Acompanhe o desempenho da equipe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openGoalModal}>
            <Plus className="h-4 w-4 mr-2" />
            Definir Metas
          </Button>
          {dashboard?.goal && dashboard.goal.status === "ACTIVE" && (
            <Button variant="default" onClick={() => setShowCloseModal(true)}>
              <Calculator className="h-4 w-4 mr-2" />
              Fechar Mês
            </Button>
          )}
        </div>
      </div>

      {/* Seletor de Mês */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[200px]">
              <h2 className="text-xl font-bold">
                {MONTHS[selectedMonth - 1]} {selectedYear}
              </h2>
              {dashboard?.goal && (
                <Badge variant={dashboard.goal.status === "ACTIVE" ? "default" : "secondary"}>
                  {dashboard.goal.status === "ACTIVE" ? "Em andamento" : "Fechado"}
                </Badge>
              )}
            </div>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Meta da Filial</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(dashboard?.branch?.goalAmount || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={dashboard?.branch?.progress || 0} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {(dashboard?.branch?.progress || 0).toFixed(1)}% atingido
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vendas do Mês</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(dashboard?.branch?.totalSales || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">
                {dashboard?.ranking?.reduce((sum: number, r: any) => sum + r.salesCount, 0) || 0} vendas
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vendedores</CardDescription>
            <CardTitle className="text-2xl">
              {dashboard?.sellersOnGoal || 0} / {dashboard?.sellersCount || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="text-muted-foreground">
                atingiram a meta
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Comissões Totais</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(
                commissions.reduce((sum, c) => sum + c.totalCommission, 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">
                {commissions.filter((c) => c.status === "PAID").length} pagas
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">
            <Trophy className="h-4 w-4 mr-2" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="commissions">
            <DollarSign className="h-4 w-4 mr-2" />
            Comissões
          </TabsTrigger>
        </TabsList>

        {/* Tab Ranking */}
        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Ranking de Vendedores</CardTitle>
              <CardDescription>
                Desempenho individual no mês
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard?.ranking?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma venda registrada neste mês
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Meta</TableHead>
                      <TableHead className="text-center">Progresso</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard?.ranking?.map((seller: any, index: number) => (
                      <TableRow key={seller.userId}>
                        <TableCell>
                          {index === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                          {index === 1 && <Award className="h-5 w-5 text-gray-400" />}
                          {index === 2 && <Award className="h-5 w-5 text-orange-400" />}
                          {index > 2 && <span className="text-muted-foreground">{index + 1}</span>}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{seller.userName}</p>
                            <p className="text-xs text-muted-foreground">
                              {seller.salesCount} vendas
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(seller.totalSales)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(seller.goalAmount)}
                        </TableCell>
                        <TableCell className="w-[150px]">
                          <div className="space-y-1">
                            <Progress value={seller.progress} className="h-2" />
                            <p className="text-xs text-center text-muted-foreground">
                              {seller.progress.toFixed(1)}%
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {seller.goalAchieved ? (
                            <Badge className="bg-green-500">
                              <Check className="h-3 w-3 mr-1" />
                              Meta Atingida
                            </Badge>
                          ) : (
                            <Badge variant="outline">Em progresso</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Comissões */}
        <TabsContent value="commissions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Comissões do Mês</CardTitle>
              <CardDescription>
                Valores calculados para cada vendedor
              </CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma comissão calculada para este mês
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Bônus</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{commission.user.name}</p>
                            {commission.goalAchieved && (
                              <Badge variant="outline" className="text-xs">
                                <Trophy className="h-3 w-3 mr-1" />
                                Meta atingida
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(commission.totalSales)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(commission.baseCommission)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {commission.bonusCommission > 0
                            ? formatCurrency(commission.bonusCommission)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(commission.totalCommission)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={commission.status === "PAID" ? "default" : "secondary"}
                          >
                            {commission.status === "PAID" ? "Pago" : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {commission.status !== "PAID" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkAsPaid(commission.id)}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Pagar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Definir Metas */}
      <Dialog open={showGoalModal} onOpenChange={setShowGoalModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Definir Metas - {MONTHS[selectedMonth - 1]} {selectedYear}</DialogTitle>
            <DialogDescription>
              Configure a meta da filial e as metas individuais dos vendedores
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Meta da Filial */}
            <div className="space-y-2">
              <Label htmlFor="branchGoal">Meta da Filial (R$)</Label>
              <Input
                id="branchGoal"
                type="number"
                placeholder="0.00"
                value={branchGoal}
                onChange={(e) => setBranchGoal(e.target.value)}
              />
            </div>

            {/* Metas dos Vendedores */}
            <div className="space-y-4">
              <Label>Metas Individuais</Label>
              {sellers.map((seller) => (
                <div key={seller.id} className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium">{seller.name}</p>
                    <p className="text-xs text-muted-foreground">{seller.email}</p>
                  </div>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="w-40"
                    value={sellerGoals[seller.id] || ""}
                    onChange={(e) =>
                      setSellerGoals({ ...sellerGoals, [seller.id]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            {/* Distribuir igualmente */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const total = parseFloat(branchGoal) || 0;
                const perSeller = total / sellers.length;
                const newGoals: Record<string, string> = {};
                sellers.forEach((s) => {
                  newGoals[s.id] = perSeller.toFixed(2);
                });
                setSellerGoals(newGoals);
              }}
            >
              Distribuir Meta Igualmente
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGoalModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGoal} disabled={savingGoal}>
              {savingGoal && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Metas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Fechar Mês */}
      <Dialog open={showCloseModal} onOpenChange={setShowCloseModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar Mês</DialogTitle>
            <DialogDescription>
              Ao fechar o mês, as comissões serão calculadas e a meta será marcada como concluída.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-center text-lg font-medium">
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Resumo:</p>
              <ul className="text-sm mt-2 space-y-1">
                <li>• Vendas: {formatCurrency(dashboard?.branch?.totalSales || 0)}</li>
                <li>• Meta: {formatCurrency(dashboard?.branch?.goalAmount || 0)}</li>
                <li>• Vendedores: {dashboard?.sellersCount || 0}</li>
                <li>• Na meta: {dashboard?.sellersOnGoal || 0}</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCloseMonth} disabled={closingMonth}>
              {closingMonth && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar e Calcular Comissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <ProtectedRoute permission="goals.view">
      <GoalsPageContent />
    </ProtectedRoute>
  );
}
