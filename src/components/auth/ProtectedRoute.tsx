"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePermission } from "@/hooks/use-permission";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, ArrowLeft, Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  /**
   * Permissão(ões) necessária(s)
   */
  permission: string | string[];

  /**
   * Se true, verifica se tem ALGUMA das permissões
   * Se false (padrão), verifica se tem TODAS as permissões
   */
  requireAny?: boolean;

  /**
   * URL para redirecionar quando não tem permissão
   * Default: /dashboard
   */
  redirectTo?: string;

  /**
   * Mensagem customizada
   */
  message?: string;

  /**
   * Conteúdo da página protegida
   */
  children: ReactNode;
}

/**
 * Componente para proteger páginas inteiras baseado em permissões
 *
 * @example
 * ```tsx
 * // Proteger página inteira
 * export default function VendasPage() {
 *   return (
 *     <ProtectedRoute permission="sales.view">
 *       <VendasContent />
 *     </ProtectedRoute>
 *   );
 * }
 *
 * // Múltiplas permissões (precisa ter todas)
 * <ProtectedRoute permission={["sales.view", "products.view"]}>
 *   <NovaVenda />
 * </ProtectedRoute>
 *
 * // Múltiplas permissões (precisa ter alguma)
 * <ProtectedRoute permission={["sales.view", "sales.manage"]} requireAny>
 *   <Vendas />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  permission,
  requireAny = false,
  redirectTo = "/dashboard",
  message = "Você não tem permissão para acessar esta página",
  children,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { hasPermission, hasAllPermissions, hasAnyPermission, isLoading } =
    usePermission();

  // Aguardar carregamento das permissões
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Verificando permissões...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verificar permissão
  let hasAccess = false;

  if (Array.isArray(permission)) {
    hasAccess = requireAny
      ? hasAnyPermission(permission)
      : hasAllPermissions(permission);
  } else {
    hasAccess = hasPermission(permission);
  }

  // Se não tem acesso, mostra tela de sem permissão
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-amber-100">
                <Shield className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Acesso Negado</CardTitle>
                <CardDescription>Permissão insuficiente</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{message}</p>

            <div className="p-3 rounded-md bg-muted">
              <p className="text-xs font-medium mb-2">Permissões necessárias:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {Array.isArray(permission) ? (
                  permission.map((p) => (
                    <li key={p} className="font-mono">
                      • {p}
                    </li>
                  ))
                ) : (
                  <li className="font-mono">• {permission}</li>
                )}
              </ul>
              {Array.isArray(permission) && (
                <p className="text-xs text-muted-foreground mt-2">
                  {requireAny
                    ? "* É necessário ter pelo menos uma destas permissões"
                    : "* É necessário ter todas estas permissões"}
                </p>
              )}
            </div>

            <Button onClick={() => router.push(redirectTo)} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tem acesso, renderiza a página normalmente
  return <>{children}</>;
}
