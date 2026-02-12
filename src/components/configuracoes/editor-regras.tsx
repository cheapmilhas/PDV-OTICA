"use client";

import { useState, useEffect } from "react";
import { RuleCategory } from "@prisma/client";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { getDefaultRules } from "@/lib/validations/system-rule.schema";

interface Rule {
  id?: string;
  key: string;
  value: any;
  description?: string;
  active?: boolean;
}

interface RulesByCategory {
  [key: string]: Rule[];
}

const categoryLabels: Record<RuleCategory, string> = {
  STOCK: "Estoque",
  SALES: "Vendas",
  FINANCIAL: "Financeiro",
  PRODUCTS: "Produtos",
  CUSTOMERS: "Clientes",
  REPORTS: "Relatórios",
};

export function EditorRegras() {
  const [rulesByCategory, setRulesByCategory] = useState<RulesByCategory>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [changedRules, setChangedRules] = useState<Set<string>>(new Set());

  async function loadRules() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/rules");
      const result = await response.json();

      if (response.ok) {
        // Organiza regras por categoria
        const grouped: RulesByCategory = {};
        (result.data || []).forEach((rule: Rule) => {
          const category = rule.key.split(".")[0].toUpperCase();
          if (!grouped[category]) {
            grouped[category] = [];
          }
          grouped[category].push(rule);
        });
        setRulesByCategory(grouped);
      } else {
        toast.error("Erro ao carregar regras");
      }
    } catch (error) {
      toast.error("Erro ao carregar regras");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  async function handleSaveRule(rule: Rule) {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: rule.key,
          value: rule.value,
          description: rule.description,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("Regra salva com sucesso");
        setChangedRules((prev) => {
          const next = new Set(prev);
          next.delete(rule.key);
          return next;
        });
        loadRules();
      } else {
        toast.error(result.error?.message || "Erro ao salvar regra");
      }
    } catch (error) {
      toast.error("Erro ao salvar regra");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRestoreDefaults() {
    try {
      const response = await fetch("/api/settings/rules/restore-defaults", {
        method: "POST",
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("Regras restauradas para valores padrão");
        setChangedRules(new Set());
        loadRules();
      } else {
        toast.error(result.error?.message || "Erro ao restaurar regras");
      }
    } catch (error) {
      toast.error("Erro ao restaurar regras");
    } finally {
      setShowRestoreDialog(false);
    }
  }

  function handleRuleChange(category: string, index: number, newValue: any) {
    setRulesByCategory((prev) => {
      const updated = { ...prev };
      updated[category][index].value = newValue;
      return updated;
    });

    setChangedRules((prev) => {
      const next = new Set(prev);
      next.add(rulesByCategory[category][index].key);
      return next;
    });
  }

  function renderRuleInput(rule: Rule, category: string, index: number) {
    const type = typeof rule.value;
    const hasChanged = changedRules.has(rule.key);

    if (type === "boolean") {
      return (
        <div className="flex items-center justify-between space-x-2">
          <div className="flex-1">
            <Label htmlFor={rule.key}>{rule.description || rule.key}</Label>
            <p className="text-xs text-muted-foreground mt-1">{rule.key}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={rule.key}
              checked={rule.value}
              onCheckedChange={(checked) => handleRuleChange(category, index, checked)}
            />
            {hasChanged && (
              <Button
                size="sm"
                onClick={() => handleSaveRule(rule)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (type === "number") {
      return (
        <div className="space-y-2">
          <Label htmlFor={rule.key}>{rule.description || rule.key}</Label>
          <p className="text-xs text-muted-foreground">{rule.key}</p>
          <div className="flex items-center gap-2">
            <Input
              id={rule.key}
              type="number"
              value={rule.value}
              onChange={(e) =>
                handleRuleChange(category, index, Number(e.target.value))
              }
              className="flex-1"
            />
            {hasChanged && (
              <Button
                size="sm"
                onClick={() => handleSaveRule(rule)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      );
    }

    // String
    return (
      <div className="space-y-2">
        <Label htmlFor={rule.key}>{rule.description || rule.key}</Label>
        <p className="text-xs text-muted-foreground">{rule.key}</p>
        <div className="flex items-center gap-2">
          <Input
            id={rule.key}
            type="text"
            value={rule.value}
            onChange={(e) => handleRuleChange(category, index, e.target.value)}
            className="flex-1"
          />
          {hasChanged && (
            <Button
              size="sm"
              onClick={() => handleSaveRule(rule)}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Regras do Sistema</h2>
            <p className="text-muted-foreground">
              Configure as regras de negócio do sistema
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowRestoreDialog(true)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restaurar Padrões
          </Button>
        </div>

        <Tabs defaultValue="STOCK" className="space-y-4">
          <TabsList>
            {Object.keys(rulesByCategory).map((category) => (
              <TabsTrigger key={category} value={category}>
                {categoryLabels[category as RuleCategory] || category}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.entries(rulesByCategory).map(([category, rules]) => (
            <TabsContent key={category} value={category}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {categoryLabels[category as RuleCategory] || category}
                  </CardTitle>
                  <CardDescription>
                    Configure as regras relacionadas a{" "}
                    {categoryLabels[category as RuleCategory]?.toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {rules.map((rule, index) => (
                    <div key={rule.key} className="border-b pb-6 last:border-0 last:pb-0">
                      {renderRuleInput(rule, category, index)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {changedRules.size > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-800">
              Você tem {changedRules.size} regra(s) não salva(s)
            </p>
          </div>
        )}
      </div>

      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar valores padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as regras customizadas serão removidas e os valores padrão serão
              restaurados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreDefaults}>
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
