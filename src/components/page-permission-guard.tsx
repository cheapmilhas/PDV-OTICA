"use client";

import { usePermission } from "@/hooks/use-permission";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PagePermissionGuardProps {
  permission: string;
  children: React.ReactNode;
}

export function PagePermissionGuard({
  permission,
  children,
}: PagePermissionGuardProps) {
  const { hasPermission, isLoading, role } = usePermission();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !hasPermission(permission)) {
      console.log(
        `🚫 PagePermissionGuard: Acesso negado para permissão "${permission}" (role: ${role})`
      );
    }
  }, [isLoading, hasPermission, permission, role]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasPermission(permission)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">Acesso Negado</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Você não tem permissão para acessar esta página.
        </p>
        <p className="text-sm text-muted-foreground">
          Permissão necessária: <code className="bg-muted px-2 py-1 rounded">{permission}</code>
        </p>
        <p className="text-sm text-muted-foreground">
          Sua role: <code className="bg-muted px-2 py-1 rounded">{role || "N/A"}</code>
        </p>
        <Button onClick={() => router.push("/dashboard")} className="mt-4">
          Voltar ao Dashboard
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
