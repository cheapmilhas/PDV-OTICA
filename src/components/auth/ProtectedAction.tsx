"use client";

import { ReactNode } from "react";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";

interface ProtectedActionProps {
  /**
   * Permissão(ões) necessária(s)
   * - String única: "sales.create"
   * - Array com ALL: ["sales.create", "products.view"] - precisa ter todas
   * - Array com ANY: usar requireAny prop
   */
  permission: string | string[];

  /**
   * Se true, verifica se tem ALGUMA das permissões
   * Se false (padrão), verifica se tem TODAS as permissões
   */
  requireAny?: boolean;

  /**
   * Modo de exibição quando não tem permissão:
   * - "hide": Oculta completamente (padrão)
   * - "disable": Mostra mas desabilita
   * - "message": Mostra mensagem de sem permissão
   */
  fallbackMode?: "hide" | "disable" | "message";

  /**
   * Mensagem customizada quando não tem permissão
   */
  fallbackMessage?: string;

  /**
   * Conteúdo a ser protegido
   */
  children: ReactNode;
}

/**
 * Componente para proteger ações/botões baseado em permissões
 *
 * @example
 * ```tsx
 * // Ocultar botão se não tiver permissão
 * <ProtectedAction permission="sales.create">
 *   <Button>Criar Venda</Button>
 * </ProtectedAction>
 *
 * // Desabilitar botão se não tiver permissão
 * <ProtectedAction permission="sales.delete" fallbackMode="disable">
 *   <Button>Excluir</Button>
 * </ProtectedAction>
 *
 * // Mostrar mensagem se não tiver permissão
 * <ProtectedAction permission="reports.sales" fallbackMode="message">
 *   <RelatórioVendas />
 * </ProtectedAction>
 *
 * // Requer TODAS as permissões
 * <ProtectedAction permission={["sales.create", "products.view"]}>
 *   <Button>Nova Venda</Button>
 * </ProtectedAction>
 *
 * // Requer ALGUMA das permissões
 * <ProtectedAction permission={["sales.view", "sales.manage"]} requireAny>
 *   <VendasList />
 * </ProtectedAction>
 * ```
 */
export function ProtectedAction({
  permission,
  requireAny = false,
  fallbackMode = "hide",
  fallbackMessage = "Você não tem permissão para realizar esta ação",
  children,
}: ProtectedActionProps) {
  const { hasPermission, hasAllPermissions, hasAnyPermission, isLoading } =
    usePermission();

  // Aguardar carregamento das permissões
  if (isLoading) {
    if (fallbackMode === "hide") {
      return null;
    }
    return <div className="animate-pulse">{children}</div>;
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

  // Se não tem acesso
  if (!hasAccess) {
    switch (fallbackMode) {
      case "hide":
        return null;

      case "disable":
        // Clona o children e adiciona disabled
        if (typeof children === "object" && children !== null && "props" in children) {
          const childProps = (children as any).props;
          return (
            <div className="relative" title={fallbackMessage}>
              {typeof children === "object" && "type" in children
                ? {
                    ...children,
                    props: {
                      ...childProps,
                      disabled: true,
                      className: `${childProps.className || ""} opacity-50 cursor-not-allowed`,
                    },
                  }
                : children}
            </div>
          );
        }
        return <div className="opacity-50 cursor-not-allowed">{children}</div>;

      case "message":
        return (
          <Alert className="border-amber-200 bg-amber-50">
            <Shield className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              {fallbackMessage}
            </AlertDescription>
          </Alert>
        );

      default:
        return null;
    }
  }

  // Tem acesso, renderiza normalmente
  return <>{children}</>;
}
