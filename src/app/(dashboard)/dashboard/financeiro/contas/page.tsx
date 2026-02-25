"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Banknote,
  Smartphone,
  Building2,
  CreditCard,
  Wallet,
  Plus,
  ArrowLeft,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  CalendarIcon,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// Types
type FinanceAccountType = "CASH" | "BANK" | "PIX" | "CARD_ACQUIRER" | "OTHER";

interface FinanceAccount {
  id: string;
  name: string;
  type: FinanceAccountType;
  balance: number;
  isDefault: boolean;
  active: boolean;
  bankName?: string | null;
  agency?: string | null;
  accountNumber?: string | null;
  pixKey?: string | null;
  acquirerName?: string | null;
  defaultFeePercent?: number | null;
  description?: string | null;
}

interface StatementEntry {
  id: string;
  type: string;
  side: "DEBIT" | "CREDIT";
  amount: number;
  description?: string | null;
  entryDate: string;
  debitAccount?: { code: string; name: string } | null;
  creditAccount?: { code: string; name: string } | null;
}

interface NewAccountForm {
  name: string;
  type: FinanceAccountType | "";
  bankName: string;
  agency: string;
  accountNumber: string;
  pixKey: string;
  acquirerName: string;
  defaultFeePercent: string;
  description: string;
  isDefault: boolean;
}

// Helpers
const accountTypeConfig: Record<
  FinanceAccountType,
  { label: string; icon: typeof Banknote; color: string; bgColor: string }
> = {
  CASH: {
    label: "Dinheiro",
    icon: Banknote,
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  PIX: {
    label: "PIX",
    icon: Smartphone,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  BANK: {
    label: "Banco",
    icon: Building2,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  CARD_ACQUIRER: {
    label: "Adquirente",
    icon: CreditCard,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
  OTHER: {
    label: "Outro",
    icon: Wallet,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
};

const translateEntryType = (type: string) => {
  const translations: Record<string, string> = {
    SALE_REVENUE: "Receita de Venda",
    COGS: "Custo de Mercadoria",
    PAYMENT_RECEIVED: "Pagamento Recebido",
    CARD_FEE: "Taxa de Cartao",
    COMMISSION_EXPENSE: "Comissao",
    EXPENSE: "Despesa",
    REFUND: "Estorno",
    STOCK_ADJUST: "Ajuste de Estoque",
    TRANSFER: "Transferencia",
    OTHER: "Outro",
  };
  return translations[type] || type;
};

const emptyForm: NewAccountForm = {
  name: "",
  type: "",
  bankName: "",
  agency: "",
  accountNumber: "",
  pixKey: "",
  acquirerName: "",
  defaultFeePercent: "",
  description: "",
  isDefault: false,
};

function ContasFinanceirasPage() {
  const router = useRouter();

  // Accounts state
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Statement state
  const [statementEntries, setStatementEntries] = useState<StatementEntry[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // New account dialog
  const [showNewAccountDialog, setShowNewAccountDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewAccountForm>(emptyForm);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null;

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/accounts");
      if (!res.ok) throw new Error("Erro ao carregar contas");
      const data = await res.json();
      setAccounts(data.data || []);
    } catch (error: any) {
      console.error("Erro ao carregar contas:", error);
      toast.error("Erro ao carregar contas financeiras");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch statement
  const fetchStatement = useCallback(
    async (accountId: string) => {
      setStatementLoading(true);
      try {
        const params = new URLSearchParams({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
        const res = await fetch(
          `/api/finance/accounts/${accountId}/statement?${params}`
        );
        if (!res.ok) throw new Error("Erro ao carregar extrato");
        const data = await res.json();
        setStatementEntries(data.data || []);
      } catch (error: any) {
        console.error("Erro ao carregar extrato:", error);
        toast.error("Erro ao carregar extrato");
      } finally {
        setStatementLoading(false);
      }
    },
    [startDate, endDate]
  );

  // Initial load
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Load statement when account selected or dates change
  useEffect(() => {
    if (selectedAccountId) {
      fetchStatement(selectedAccountId);
    }
  }, [selectedAccountId, fetchStatement]);

  // Create account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.type) {
      toast.error("Preencha o nome e o tipo da conta");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, any> = {
        name: form.name,
        type: form.type,
        isDefault: form.isDefault,
      };

      if (form.type === "BANK") {
        if (form.bankName) body.bankName = form.bankName;
        if (form.agency) body.agency = form.agency;
        if (form.accountNumber) body.accountNumber = form.accountNumber;
      }
      if (form.type === "PIX") {
        if (form.pixKey) body.pixKey = form.pixKey;
      }
      if (form.type === "CARD_ACQUIRER") {
        if (form.acquirerName) body.acquirerName = form.acquirerName;
        if (form.defaultFeePercent)
          body.defaultFeePercent = parseFloat(form.defaultFeePercent);
      }
      if (form.description) body.description = form.description;

      const res = await fetch("/api/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        const errMsg =
          errData?.error?.message || errData?.message || "Erro ao criar conta";
        throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      }

      toast.success("Conta criada com sucesso!");
      setShowNewAccountDialog(false);
      setForm(emptyForm);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  // Total balance
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  // Compute running balance for statement (entries come in desc order, reverse for running balance)
  const statementWithBalance = (() => {
    if (!selectedAccount || statementEntries.length === 0) return [];

    const reversed = [...statementEntries].reverse();
    let runningBalance = selectedAccount.balance;

    // Calculate starting balance by subtracting all entries from current balance
    for (const entry of statementEntries) {
      if (entry.side === "DEBIT") {
        runningBalance += entry.amount;
      } else {
        runningBalance -= entry.amount;
      }
    }

    // Now walk forward building running balance
    const result = reversed.map((entry) => {
      if (entry.side === "CREDIT") {
        runningBalance += entry.amount;
      } else {
        runningBalance -= entry.amount;
      }
      return { ...entry, runningBalance };
    });

    return result.reverse();
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/financeiro")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Contas Financeiras</h1>
            <p className="text-muted-foreground">
              Gerencie suas contas e visualize extratos
            </p>
          </div>
        </div>
        <Button onClick={() => setShowNewAccountDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Conta
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Account Cards */}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {accounts.map((account) => {
              const config = accountTypeConfig[account.type];
              const Icon = config.icon;
              const isSelected = selectedAccountId === account.id;

              return (
                <Card
                  key={account.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    isSelected && "ring-2 ring-primary"
                  )}
                  onClick={() =>
                    setSelectedAccountId(
                      isSelected ? null : account.id
                    )
                  }
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div
                        className={cn(
                          "p-2 rounded-lg",
                          config.bgColor
                        )}
                      >
                        <Icon className={cn("h-5 w-5", config.color)} />
                      </div>
                      <div className="flex items-center gap-2">
                        {account.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Padrao
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="font-semibold text-sm truncate">
                      {account.name}
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(account.balance)}
                    </p>
                    {account.type === "BANK" && account.bankName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {account.bankName}
                        {account.agency && ` | Ag: ${account.agency}`}
                        {account.accountNumber &&
                          ` | CC: ${account.accountNumber}`}
                      </p>
                    )}
                    {account.type === "CARD_ACQUIRER" &&
                      account.acquirerName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {account.acquirerName}
                          {account.defaultFeePercent != null &&
                            ` | Taxa: ${account.defaultFeePercent}%`}
                        </p>
                      )}
                    {account.type === "PIX" && account.pixKey && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Chave: {account.pixKey}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Total Balance Bar */}
          {accounts.length > 0 && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Saldo Total de Todas as Contas
                  </span>
                  <span className="text-2xl font-bold">
                    {formatCurrency(totalBalance)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Statement Section */}
          {selectedAccount && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Extrato - {selectedAccount.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    {/* Start Date Picker */}
                    <div className="space-y-2">
                      <Label>Data Inicial</Label>
                      <Popover
                        open={startDateOpen}
                        onOpenChange={setStartDateOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-[200px] justify-start text-left font-normal",
                              !startDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate
                              ? format(startDate, "dd/MM/yyyy", {
                                  locale: ptBR,
                                })
                              : "Selecione..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={(date) => {
                              if (date) setStartDate(date);
                              setStartDateOpen(false);
                            }}
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* End Date Picker */}
                    <div className="space-y-2">
                      <Label>Data Final</Label>
                      <Popover
                        open={endDateOpen}
                        onOpenChange={setEndDateOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-[200px] justify-start text-left font-normal",
                              !endDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {endDate
                              ? format(endDate, "dd/MM/yyyy", {
                                  locale: ptBR,
                                })
                              : "Selecione..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={endDate}
                            onSelect={(date) => {
                              if (date) setEndDate(date);
                              setEndDateOpen(false);
                            }}
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Statement Table */}
              {statementLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : statementWithBalance.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">
                      Nenhuma movimentacao encontrada no periodo selecionado.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descricao</TableHead>
                        <TableHead className="text-right">Entrada</TableHead>
                        <TableHead className="text-right">Saida</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statementWithBalance.map((entry) => {
                        const isInflow = entry.side === "CREDIT";
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(entry.entryDate), "dd/MM/yyyy", {
                                locale: ptBR,
                              })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {isInflow ? (
                                  <ArrowUpCircle className="h-4 w-4 text-green-600 shrink-0" />
                                ) : (
                                  <ArrowDownCircle className="h-4 w-4 text-red-600 shrink-0" />
                                )}
                                <span className="text-sm">
                                  {translateEntryType(entry.type)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {entry.description || "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              {isInflow
                                ? formatCurrency(entry.amount)
                                : ""}
                            </TableCell>
                            <TableCell className="text-right font-medium text-red-600">
                              {!isInflow
                                ? formatCurrency(entry.amount)
                                : ""}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(entry.runningBalance)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* New Account Dialog */}
      <Dialog open={showNewAccountDialog} onOpenChange={setShowNewAccountDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Conta Financeira</DialogTitle>
            <DialogDescription>
              Preencha os dados para cadastrar uma nova conta
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAccount} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="acc-name">
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                id="acc-name"
                placeholder="Ex: Caixa Principal, Conta Itau..."
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="acc-type">
                Tipo <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm({ ...form, type: value as FinanceAccountType })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Dinheiro</SelectItem>
                  <SelectItem value="BANK">Banco</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="CARD_ACQUIRER">Adquirente de Cartao</SelectItem>
                  <SelectItem value="OTHER">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditional: BANK fields */}
            {form.type === "BANK" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="acc-bank">Banco</Label>
                  <Input
                    id="acc-bank"
                    placeholder="Itau, Bradesco..."
                    value={form.bankName}
                    onChange={(e) =>
                      setForm({ ...form, bankName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-agency">Agencia</Label>
                  <Input
                    id="acc-agency"
                    placeholder="1234"
                    value={form.agency}
                    onChange={(e) =>
                      setForm({ ...form, agency: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-number">Conta</Label>
                  <Input
                    id="acc-number"
                    placeholder="56789-0"
                    value={form.accountNumber}
                    onChange={(e) =>
                      setForm({ ...form, accountNumber: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            {/* Conditional: PIX field */}
            {form.type === "PIX" && (
              <div className="space-y-2">
                <Label htmlFor="acc-pix">Chave PIX</Label>
                <Input
                  id="acc-pix"
                  placeholder="CPF, e-mail, telefone ou chave aleatoria"
                  value={form.pixKey}
                  onChange={(e) =>
                    setForm({ ...form, pixKey: e.target.value })
                  }
                />
              </div>
            )}

            {/* Conditional: CARD_ACQUIRER fields */}
            {form.type === "CARD_ACQUIRER" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="acc-acquirer">Adquirente</Label>
                  <Input
                    id="acc-acquirer"
                    placeholder="Stone, Cielo, Rede..."
                    value={form.acquirerName}
                    onChange={(e) =>
                      setForm({ ...form, acquirerName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-fee">Taxa Padrao (%)</Label>
                  <Input
                    id="acc-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="2.50"
                    value={form.defaultFeePercent}
                    onChange={(e) =>
                      setForm({ ...form, defaultFeePercent: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="acc-desc">Descricao (opcional)</Label>
              <Textarea
                id="acc-desc"
                placeholder="Observacoes sobre a conta..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
              />
            </div>

            {/* Is Default */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="acc-default"
                checked={form.isDefault}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isDefault: !!checked })
                }
              />
              <Label htmlFor="acc-default" className="cursor-pointer">
                Definir como conta padrao
              </Label>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewAccountDialog(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Conta"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="financial.view">
      <ContasFinanceirasPage />
    </ProtectedRoute>
  );
}
