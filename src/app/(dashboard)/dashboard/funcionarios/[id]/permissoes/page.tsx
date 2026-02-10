"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Shield, ChevronDown, ChevronRight, RotateCcw, ArrowLeft, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PagePermissionGuard } from "@/components/page-permission-guard";

interface Permission {
  code: string;
  name: string;
  description?: string;
  module: string;
  category: string;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface UserPermissions {
  role: string;
  rolePermissions: string[];
  customPermissions: Array<{ code: string; granted: boolean }>;
  effectivePermissions: string[];
}

interface ModulePermissions {
  [module: string]: Permission[];
}

function UserPermissionsPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<UserData | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [allPermissions, setAllPermissions] = useState<ModulePermissions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    fetchData();
  }, [userId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [userRes, permsRes, allPermsRes] = await Promise.all([
        fetch(`/api/users/${userId}`),
        fetch(`/api/users/${userId}/permissions`),
        fetch(`/api/permissions/by-module`),
      ]);

      if (!userRes.ok || !permsRes.ok || !allPermsRes.ok) {
        throw new Error("Erro ao carregar dados");
      }

      const userData = await userRes.json();
      const permsData = await permsRes.json();
      const allPermsData = await allPermsRes.json();

      setUser(userData.data);
      setPermissions(permsData);
      setAllPermissions(allPermsData);

      // Expandir todos os módulos por padrão
      setExpandedModules(new Set(Object.keys(allPermsData)));
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  }

  function toggleModule(module: string) {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(module)) {
      newExpanded.delete(module);
    } else {
      newExpanded.add(module);
    }
    setExpandedModules(newExpanded);
  }

  function handlePermissionChange(code: string, granted: boolean) {
    const newChanges = new Map(pendingChanges);
    newChanges.set(code, granted);
    setPendingChanges(newChanges);
  }

  function isPermissionChecked(code: string): boolean {
    if (pendingChanges.has(code)) {
      return pendingChanges.get(code)!;
    }
    return permissions?.effectivePermissions.includes(code) || false;
  }

  function isPermissionFromRole(code: string): boolean {
    return permissions?.rolePermissions.includes(code) || false;
  }

  function isPermissionCustomized(code: string): boolean {
    if (pendingChanges.has(code)) {
      const pendingValue = pendingChanges.get(code);
      const roleHas = isPermissionFromRole(code);
      return pendingValue !== roleHas;
    }
    return permissions?.customPermissions.some(c => c.code === code) || false;
  }

  async function handleSaveChanges() {
    if (pendingChanges.size === 0) {
      toast.error("Nenhuma alteração para salvar");
      return;
    }

    setSaving(true);
    try {
      const permissionsToSend = Array.from(pendingChanges.entries()).map(([code, granted]) => ({
        code,
        granted,
      }));

      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permissionsToSend }),
      });

      if (!res.ok) throw new Error("Erro ao salvar permissões");

      toast.success("Permissões atualizadas com sucesso!");
      setPendingChanges(new Map());
      await fetchData();
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar permissões");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToDefault() {
    if (!confirm("Tem certeza que deseja resetar todas as permissões customizadas? O usuário voltará a ter apenas as permissões padrão do cargo.")) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/permissions/reset`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Erro ao resetar permissões");

      toast.success("Permissões resetadas para o padrão!");
      setPendingChanges(new Map());
      await fetchData();
    } catch (error: any) {
      console.error("Erro ao resetar:", error);
      toast.error("Erro ao resetar permissões");
    } finally {
      setSaving(false);
    }
  }

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0][0]}${parts[parts.length - 1]?.[0] || parts[0][1] || ""}`.toUpperCase();
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      ADMIN: "Administrador",
      GERENTE: "Gerente",
      VENDEDOR: "Vendedor",
      CAIXA: "Caixa",
      ATENDENTE: "Atendente",
    };
    return labels[role] || role;
  };

  const getModuleLabel = (module: string) => {
    const labels: Record<string, string> = {
      dashboard: "Dashboard",
      sales: "Vendas",
      quotes: "Orçamentos",
      service_orders: "Ordens de Serviço",
      cash: "Caixa",
      receivables: "Contas a Receber",
      payables: "Contas a Pagar",
      products: "Produtos",
      stock: "Estoque",
      customers: "Clientes",
      suppliers: "Fornecedores",
      users: "Usuários",
      reports: "Relatórios",
      settings: "Configurações",
      goals: "Metas",
    };
    return labels[module] || module;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !permissions) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Erro ao carregar
            </CardTitle>
            <CardDescription>
              Não foi possível carregar as informações do usuário
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard/funcionarios")} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para Funcionários
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasChanges = pendingChanges.size > 0;
  const hasCustomPermissions = permissions.customPermissions.length > 0 || hasChanges;

  return (
    <PagePermissionGuard permission="users.permissions">
      <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/funcionarios")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-purple-100 text-purple-600 text-xl">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">{user.name}</CardTitle>
                <CardDescription className="text-base">{user.email}</CardDescription>
                <Badge variant="secondary" className="mt-2">
                  <Shield className="h-3 w-3 mr-1" />
                  {getRoleLabel(user.role)}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Permissões Ativas</p>
              <p className="text-3xl font-bold">{permissions.effectivePermissions.length}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {permissions.rolePermissions.length} padrão + {permissions.customPermissions.length} customizadas
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Gerenciar Permissões</h2>
          <p className="text-sm text-muted-foreground">
            Customize as permissões individuais do usuário
          </p>
        </div>
        <div className="flex gap-2">
          {hasCustomPermissions && (
            <Button
              variant="outline"
              onClick={handleResetToDefault}
              disabled={saving}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Resetar para Padrão
            </Button>
          )}
          {hasChanges && (
            <Button onClick={handleSaveChanges} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>Salvar Alterações ({pendingChanges.size})</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Permissions by Module */}
      <div className="space-y-3">
        {Object.entries(allPermissions).map(([module, modulePermissions]) => {
          const isExpanded = expandedModules.has(module);
          const modulePermsCount = modulePermissions.length;
          const moduleActiveCount = modulePermissions.filter(p =>
            isPermissionChecked(p.code)
          ).length;

          return (
            <Card key={module}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleModule(module)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <CardTitle className="text-lg">{getModuleLabel(module)}</CardTitle>
                          <CardDescription>
                            {moduleActiveCount} de {modulePermsCount} permissões ativas
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={moduleActiveCount === modulePermsCount ? "default" : "secondary"}>
                        {moduleActiveCount}/{modulePermsCount}
                      </Badge>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {modulePermissions.map((permission) => {
                        const isChecked = isPermissionChecked(permission.code);
                        const isFromRole = isPermissionFromRole(permission.code);
                        const isCustom = isPermissionCustomized(permission.code);

                        return (
                          <div
                            key={permission.code}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <Checkbox
                              id={permission.code}
                              checked={isChecked}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(permission.code, checked as boolean)
                              }
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={permission.code}
                                className="text-sm font-medium cursor-pointer flex items-center gap-2"
                              >
                                {permission.name}
                                {isCustom && (
                                  <Badge variant="outline" className="text-xs">
                                    Customizado
                                  </Badge>
                                )}
                                {!isCustom && isFromRole && (
                                  <Badge variant="secondary" className="text-xs">
                                    Padrão
                                  </Badge>
                                )}
                              </label>
                              {permission.description && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {permission.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 font-mono">
                                {permission.code}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {/* Sticky Save Button */}
      {hasChanges && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="text-sm">
                  <p className="font-medium">{pendingChanges.size} alterações pendentes</p>
                  <p className="text-xs text-muted-foreground">Clique em salvar para aplicar</p>
                </div>
                <Button onClick={handleSaveChanges} disabled={saving} size="lg">
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Alterações"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </PagePermissionGuard>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="users.permissions">
      <UserPermissionsPage />
    </ProtectedRoute>
  );
}
