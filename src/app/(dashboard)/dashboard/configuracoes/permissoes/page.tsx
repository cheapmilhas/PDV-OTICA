"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Shield,
  CheckCircle,
  XCircle,
  Save,
  RotateCcw,
  Users,
  Search,
  Settings,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  Permission,
  UserRole,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  PERMISSION_LABELS,
} from "@/lib/permissions";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Permissões agrupadas por categoria
const PERMISSION_CATEGORIES: Record<string, Permission[]> = {
  Vendas: Object.values(Permission).filter((p) => p.startsWith("sales.")),
  Orçamentos: Object.values(Permission).filter((p) => p.startsWith("quotes.")),
  Clientes: Object.values(Permission).filter((p) => p.startsWith("customers.")),
  Produtos: Object.values(Permission).filter((p) => p.startsWith("products.")),
  Estoque: Object.values(Permission).filter((p) => p.startsWith("stock.")),
  Financeiro: Object.values(Permission).filter(
    (p) =>
      p.startsWith("financial.") ||
      p.startsWith("accounts_receivable.") ||
      p.startsWith("accounts_payable.")
  ),
  Caixa: Object.values(Permission).filter((p) => p.startsWith("cash_shift.")),
  Relatórios: Object.values(Permission).filter((p) => p.startsWith("reports.")),
  "Usuários e Permissões": Object.values(Permission).filter(
    (p) => p.startsWith("users.") || p.startsWith("permissions.")
  ),
  Configurações: Object.values(Permission).filter(
    (p) =>
      p.startsWith("settings.") ||
      p.startsWith("company.") ||
      p.startsWith("branch.")
  ),
};

const EDITABLE_ROLES: UserRole[] = ["MANAGER", "SELLER", "CASHIER", "STOCK_MANAGER"];

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

function PermissoesPageContent() {
  const router = useRouter();

  // Estado para edição de permissões por cargo
  const [selectedRole, setSelectedRole] = useState<UserRole>("MANAGER");
  const [rolePerms, setRolePerms] = useState<Set<Permission>>(
    new Set(ROLE_PERMISSIONS["MANAGER"])
  );
  const [originalPerms, setOriginalPerms] = useState<Set<Permission>>(
    new Set(ROLE_PERMISSIONS["MANAGER"])
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Estado para listagem de usuários
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  function handleSelectRole(role: UserRole) {
    if (hasChanges) {
      if (!confirm("Tem alterações não salvas. Deseja descartar?")) return;
    }
    setSelectedRole(role);
    const perms = new Set(ROLE_PERMISSIONS[role]);
    setRolePerms(perms);
    setOriginalPerms(new Set(ROLE_PERMISSIONS[role]));
    setHasChanges(false);
  }

  function togglePermission(perm: Permission) {
    if (selectedRole === "ADMIN") return; // ADMIN sempre tem tudo
    const next = new Set(rolePerms);
    if (next.has(perm)) {
      next.delete(perm);
    } else {
      next.add(perm);
    }
    setRolePerms(next);
    // Verificar se houve mudança
    const orig = originalPerms;
    const changed =
      next.size !== orig.size ||
      [...next].some((p) => !orig.has(p));
    setHasChanges(changed);
  }

  function toggleCategory(category: string, grant: boolean) {
    if (selectedRole === "ADMIN") return;
    const next = new Set(rolePerms);
    for (const perm of PERMISSION_CATEGORIES[category]) {
      if (grant) {
        next.add(perm);
      } else {
        next.delete(perm);
      }
    }
    setRolePerms(next);
    const changed =
      next.size !== originalPerms.size ||
      [...next].some((p) => !originalPerms.has(p));
    setHasChanges(changed);
  }

  function handleDiscard() {
    setRolePerms(new Set(originalPerms));
    setHasChanges(false);
  }

  function handleSave() {
    // As permissões por cargo no sistema atual são definidas no código (lib/permissions.ts)
    // Aqui salvamos localmente no localStorage como customização, ou exibimos orientação
    // Em uma versão futura isso pode ser persistido no banco via RolePermission
    const key = `role_perms_${selectedRole}`;
    localStorage.setItem(key, JSON.stringify([...rolePerms]));
    setOriginalPerms(new Set(rolePerms));
    setHasChanges(false);
    toast.success(`Permissões do cargo "${ROLE_LABELS[selectedRole]}" atualizadas!`);
  }

  function handleReset() {
    const defaults = new Set(ROLE_PERMISSIONS[selectedRole]);
    setRolePerms(defaults);
    const key = `role_perms_${selectedRole}`;
    localStorage.removeItem(key);
    setOriginalPerms(defaults);
    setHasChanges(false);
    toast.success("Permissões restauradas ao padrão");
  }

  // Carregar customizações salvas
  useEffect(() => {
    const key = `role_perms_${selectedRole}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Permission[];
        setRolePerms(new Set(parsed));
        setOriginalPerms(new Set(parsed));
      } catch {
        // ignora erro de parse
      }
    } else {
      setRolePerms(new Set(ROLE_PERMISSIONS[selectedRole]));
      setOriginalPerms(new Set(ROLE_PERMISSIONS[selectedRole]));
    }
    setHasChanges(false);
  }, [selectedRole]);

  // Carregar usuários
  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/users?pageSize=100&status=todos");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(Array.isArray(data.data) ? data.data : []);
    } catch {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoadingUsers(false);
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const roleColors: Record<string, string> = {
    ADMIN: "bg-red-100 text-red-800",
    GERENTE: "bg-purple-100 text-purple-800",
    MANAGER: "bg-purple-100 text-purple-800",
    VENDEDOR: "bg-blue-100 text-blue-800",
    SELLER: "bg-blue-100 text-blue-800",
    CAIXA: "bg-green-100 text-green-800",
    CASHIER: "bg-green-100 text-green-800",
    ATENDENTE: "bg-yellow-100 text-yellow-800",
    STOCK_MANAGER: "bg-orange-100 text-orange-800",
  };

  const roleLabel: Record<string, string> = {
    ADMIN: "Admin",
    GERENTE: "Gerente",
    MANAGER: "Gerente",
    VENDEDOR: "Vendedor",
    SELLER: "Vendedor",
    CAIXA: "Caixa",
    CASHIER: "Caixa",
    ATENDENTE: "Atendente",
    STOCK_MANAGER: "Est. Manager",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Permissões
          </h1>
          <p className="text-muted-foreground">
            Gerencie as permissões por cargo e por usuário
          </p>
        </div>
      </div>

      <Tabs defaultValue="por-cargo" className="space-y-4">
        <TabsList>
          <TabsTrigger value="por-cargo" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Por Cargo
          </TabsTrigger>
          <TabsTrigger value="por-usuario" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Por Usuário
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: EDITAR POR CARGO */}
        <TabsContent value="por-cargo" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["ADMIN", ...EDITABLE_ROLES] as UserRole[]).map((role) => (
              <Button
                key={role}
                variant={selectedRole === role ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectRole(role)}
              >
                {ROLE_LABELS[role]}
                <Badge variant="secondary" className="ml-2">
                  {role === "ADMIN"
                    ? Object.values(Permission).length
                    : rolePerms.size}
                </Badge>
              </Button>
            ))}
          </div>

          {/* Aviso ADMIN */}
          {selectedRole === "ADMIN" && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4">
                <p className="text-amber-800 text-sm">
                  O cargo <strong>Administrador</strong> tem acesso total ao sistema e não pode ter permissões removidas.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Barra de ações */}
          {selectedRole !== "ADMIN" && hasChanges && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-blue-800 text-sm flex-1">
                Você tem alterações não salvas nas permissões de <strong>{ROLE_LABELS[selectedRole]}</strong>.
              </span>
              <Button size="sm" variant="outline" onClick={handleDiscard}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Descartar
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Salvar
              </Button>
            </div>
          )}

          {/* Permissões por categoria */}
          <div className="grid gap-4">
            {Object.entries(PERMISSION_CATEGORIES).map(([category, perms]) => {
              const grantedCount = perms.filter((p) =>
                selectedRole === "ADMIN" ? true : rolePerms.has(p)
              ).length;
              const allGranted = grantedCount === perms.length;
              const noneGranted = grantedCount === 0;

              return (
                <Card key={category}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {category}
                        <Badge variant="outline" className="text-xs">
                          {grantedCount}/{perms.length}
                        </Badge>
                      </CardTitle>
                      {selectedRole !== "ADMIN" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => toggleCategory(category, true)}
                            disabled={allGranted}
                          >
                            Conceder todas
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => toggleCategory(category, false)}
                            disabled={noneGranted}
                          >
                            Remover todas
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {perms.map((perm) => {
                        const granted =
                          selectedRole === "ADMIN" ? true : rolePerms.has(perm);
                        return (
                          <label
                            key={perm}
                            className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                              granted
                                ? "bg-green-50 border-green-200 hover:bg-green-100"
                                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                            } ${selectedRole === "ADMIN" ? "cursor-not-allowed" : ""}`}
                          >
                            {selectedRole === "ADMIN" ? (
                              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <Checkbox
                                checked={granted}
                                onCheckedChange={() => togglePermission(perm)}
                                className="flex-shrink-0"
                              />
                            )}
                            <span
                              className={`text-sm ${
                                granted
                                  ? "text-green-900 font-medium"
                                  : "text-gray-500"
                              }`}
                            >
                              {PERMISSION_LABELS[perm]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Botão de reset padrão */}
          {selectedRole !== "ADMIN" && (
            <div className="flex justify-between items-center pt-2">
              <p className="text-sm text-muted-foreground">
                Restaura as permissões padrão do sistema para este cargo.
              </p>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar padrões de {ROLE_LABELS[selectedRole]}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ABA 2: POR USUÁRIO */}
        <TabsContent value="por-usuario" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Permissões Individuais</CardTitle>
              <p className="text-sm text-muted-foreground">
                Clique em um usuário para editar as permissões específicas dele, que sobrepõem as do cargo.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuário..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {loadingUsers ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum usuário encontrado
                </p>
              ) : (
                <div className="divide-y">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between py-3 hover:bg-muted/30 px-2 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-sm">
                            {user.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{user.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          className={`text-xs ${
                            roleColors[user.role] || "bg-gray-100 text-gray-800"
                          }`}
                          variant="outline"
                        >
                          {roleLabel[user.role] || user.role}
                        </Badge>
                        {!user.active && (
                          <Badge variant="secondary" className="text-xs">
                            Inativo
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            router.push(
                              `/dashboard/funcionarios/${user.id}/permissoes`
                            )
                          }
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Editar permissões
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4">
              <p className="text-blue-800 text-sm">
                <strong>Dica:</strong> Permissões individuais <em>sobrepõem</em> as do cargo. Se um vendedor precisar de acesso extra (ou restrito) comparado ao cargo padrão, edite aqui sem mudar o cargo dele.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PermissoesPage() {
  return (
    <ProtectedRoute permission="permissions.manage">
      <PermissoesPageContent />
    </ProtectedRoute>
  );
}
