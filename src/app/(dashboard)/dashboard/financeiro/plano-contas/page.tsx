"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Lock,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Types
type AccountKind = "ASSET" | "LIABILITY" | "REVENUE" | "EXPENSE" | "EQUITY";

interface ChartAccount {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  level: number;
  isSystem: boolean;
  parentId: string | null;
  children: ChartAccount[];
}

// Kind badge config
const kindConfig: Record<
  AccountKind,
  { label: string; className: string }
> = {
  ASSET: {
    label: "Ativo",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  LIABILITY: {
    label: "Passivo",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
  REVENUE: {
    label: "Receita",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  EXPENSE: {
    label: "Despesa",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  EQUITY: {
    label: "Patrimonio",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
};

// Flatten the tree to get all accounts as a flat list
function flattenAccounts(accounts: ChartAccount[]): ChartAccount[] {
  const result: ChartAccount[] = [];
  function walk(nodes: ChartAccount[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  }
  walk(accounts);
  return result;
}

// Recursive tree node component
function AccountNode({
  account,
  level,
}: {
  account: ChartAccount;
  level: number;
}) {
  const [isOpen, setIsOpen] = useState(level === 1);
  const hasChildren = account.children && account.children.length > 0;
  const kind = kindConfig[account.kind];

  if (!hasChildren) {
    // Leaf node - no collapsible needed
    return (
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${level * 24}px` }}
      >
        {/* Dot bullet for leaf nodes */}
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        </span>

        {/* Code and name */}
        <span className="font-mono text-sm text-muted-foreground">
          {account.code}
        </span>
        <span className="text-sm">-</span>
        <span className="text-sm font-medium">{account.name}</span>

        {/* Kind badge */}
        <Badge variant="outline" className={kind.className}>
          {kind.label}
        </Badge>

        {/* System badge */}
        {account.isSystem && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            Sistema
          </Badge>
        )}

        {/* Edit icon for custom accounts */}
        {!account.isSystem && (
          <button
            className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Editar conta"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  // Node with children - collapsible
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${level * 24}px` }}
      >
        <CollapsibleTrigger asChild>
          <button className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted transition-transform">
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                isOpen ? "rotate-90" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>

        {/* Code and name */}
        <span className="font-mono text-sm text-muted-foreground">
          {account.code}
        </span>
        <span className="text-sm">-</span>
        <span className="text-sm font-medium">{account.name}</span>

        {/* Kind badge */}
        <Badge variant="outline" className={kind.className}>
          {kind.label}
        </Badge>

        {/* System badge */}
        {account.isSystem && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            Sistema
          </Badge>
        )}

        {/* Edit icon for custom accounts */}
        {!account.isSystem && (
          <button
            className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Editar conta"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <CollapsibleContent>
        <div className="pl-6">
          {account.children.map((child) => (
            <AccountNode key={child.id} account={child} level={level + 1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PlanoContasPageContent() {
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    kind: "" as AccountKind | "",
    parentId: "",
  });

  // Fetch the chart of accounts tree
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/chart");
      if (!res.ok) throw new Error("Erro ao carregar plano de contas");
      const json = await res.json();
      setAccounts(json.data || []);
    } catch (error: any) {
      console.error("Erro ao carregar plano de contas:", error);
      toast.error("Erro ao carregar plano de contas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Get flat list of accounts that can be parents (level < 3)
  const parentOptions = flattenAccounts(accounts).filter(
    (a) => a.level < 3
  );

  // Handle form submit
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name || !form.kind) {
      toast.error("Preencha todos os campos obrigatorios");
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, string> = {
        code: form.code,
        name: form.name,
        kind: form.kind,
      };
      if (form.parentId) {
        body.parentId = form.parentId;
      }

      const res = await fetch("/api/finance/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        const errMsg =
          errData?.error?.message || errData?.message || "Erro ao criar conta";
        throw new Error(
          typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)
        );
      }

      toast.success("Conta criada com sucesso!");
      setShowNewDialog(false);
      setForm({ code: "", name: "", kind: "", parentId: "" });
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/financeiro">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Plano de Contas</h1>
          <p className="text-muted-foreground">
            Estrutura hierarquica das contas contabeis
          </p>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
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

      {/* Empty State */}
      {!loading && accounts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              Nenhuma conta cadastrada no plano de contas.
            </p>
            <Button onClick={() => setShowNewDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Conta
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tree View */}
      {!loading && accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {accounts.map((account) => (
                <AccountNode key={account.id} account={account} level={1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog - Nova Conta */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Conta</DialogTitle>
            <DialogDescription>
              Adicione uma nova conta ao plano de contas
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {/* Code */}
            <div className="space-y-2">
              <Label htmlFor="code">
                Codigo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="code"
                placeholder="Ex: 5.1.09"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Ex: Despesa com Limpeza"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Kind */}
            <div className="space-y-2">
              <Label htmlFor="kind">
                Tipo <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  setForm({ ...form, kind: value as AccountKind })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASSET">Ativo</SelectItem>
                  <SelectItem value="LIABILITY">Passivo</SelectItem>
                  <SelectItem value="REVENUE">Receita</SelectItem>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                  <SelectItem value="EQUITY">Patrimonio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Parent Account */}
            <div className="space-y-2">
              <Label htmlFor="parentId">Conta Pai (opcional)</Label>
              <Select
                value={form.parentId}
                onValueChange={(value) =>
                  setForm({ ...form, parentId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma (conta raiz)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma (conta raiz)</SelectItem>
                  {parentOptions.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewDialog(false)}
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

export default function PlanoContasPage() {
  return (
    <ProtectedRoute permission="financial.view">
      <PlanoContasPageContent />
    </ProtectedRoute>
  );
}
