"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, CheckCircle, XCircle } from "lucide-react";
import {
  Permission,
  UserRole,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  PERMISSION_LABELS
} from "@/lib/permissions";

export default function PermissoesPage() {
  const roles: UserRole[] = ["ADMIN", "MANAGER", "SELLER", "CASHIER", "STOCK_MANAGER"];

  // Agrupa permissões por categoria
  const permissionCategories = {
    "Vendas": Object.values(Permission).filter(p => p.startsWith("sales.")),
    "Orçamentos": Object.values(Permission).filter(p => p.startsWith("quotes.")),
    "Clientes": Object.values(Permission).filter(p => p.startsWith("customers.")),
    "Produtos": Object.values(Permission).filter(p => p.startsWith("products.")),
    "Estoque": Object.values(Permission).filter(p => p.startsWith("stock.")),
    "Financeiro": Object.values(Permission).filter(p =>
      p.startsWith("financial.") ||
      p.startsWith("accounts_receivable.") ||
      p.startsWith("accounts_payable.")
    ),
    "Caixa": Object.values(Permission).filter(p => p.startsWith("cash_shift.")),
    "Relatórios": Object.values(Permission).filter(p => p.startsWith("reports.")),
    "Usuários": Object.values(Permission).filter(p =>
      p.startsWith("users.") ||
      p.startsWith("permissions.")
    ),
    "Configurações": Object.values(Permission).filter(p =>
      p.startsWith("settings.") ||
      p.startsWith("company.") ||
      p.startsWith("branch.")
    ),
  };

  const hasPermission = (role: UserRole, permission: Permission) => {
    return ROLE_PERMISSIONS[role].includes(permission);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Permissões por Cargo
        </h1>
        <p className="text-muted-foreground">
          Visualize as permissões atribuídas a cada cargo do sistema
        </p>
      </div>

      {/* Tabs por Cargo */}
      <Tabs defaultValue="ADMIN" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          {roles.map((role) => (
            <TabsTrigger key={role} value={role}>
              {ROLE_LABELS[role]}
            </TabsTrigger>
          ))}
        </TabsList>

        {roles.map((role) => (
          <TabsContent key={role} value={role} className="space-y-6">
            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{ROLE_LABELS[role]}</span>
                  <Badge variant="outline" className="text-base">
                    {ROLE_PERMISSIONS[role].length} permissões
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {role === "ADMIN" && "Acesso total ao sistema. Pode realizar todas as operações."}
                  {role === "MANAGER" && "Acesso amplo ao sistema, exceto configurações da empresa."}
                  {role === "SELLER" && "Foco em vendas e atendimento ao cliente. Não pode cancelar vendas ou ver vendas canceladas."}
                  {role === "CASHIER" && "Foco em operações de caixa e vendas. Não pode cancelar vendas."}
                  {role === "STOCK_MANAGER" && "Foco em gestão de estoque e produtos."}
                </p>
              </CardContent>
            </Card>

            {/* Permissões por Categoria */}
            <div className="grid gap-6">
              {Object.entries(permissionCategories).map(([category, permissions]) => (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="text-lg">{category}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      {permissions.map((permission) => {
                        const hasAccess = hasPermission(role, permission);
                        return (
                          <div
                            key={permission}
                            className={`flex items-center gap-3 rounded-lg border p-3 ${
                              hasAccess
                                ? "bg-green-50 border-green-200"
                                : "bg-gray-50 border-gray-200 opacity-50"
                            }`}
                          >
                            {hasAccess ? (
                              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                            )}
                            <span
                              className={`text-sm ${
                                hasAccess ? "text-green-900 font-medium" : "text-gray-500"
                              }`}
                            >
                              {PERMISSION_LABELS[permission]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
