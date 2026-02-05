import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  /**
   * Ícone a ser mostrado (componente Lucide ou similar)
   */
  icon?: ReactNode;

  /**
   * Título da mensagem
   */
  title: string;

  /**
   * Descrição adicional (opcional)
   */
  description?: string;

  /**
   * Botão de ação (opcional)
   */
  action?: ReactNode;

  /**
   * Classe CSS adicional
   */
  className?: string;
}

/**
 * Componente de estado vazio
 * Mostra mensagem amigável quando não há dados
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<Users className="h-12 w-12" />}
 *   title="Nenhum cliente encontrado"
 *   description="Comece adicionando seu primeiro cliente"
 *   action={
 *     <Button onClick={() => router.push('/clientes/novo')}>
 *       Novo Cliente
 *     </Button>
 *   }
 * />
 * ```
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        {icon && (
          <div className="mb-4 text-muted-foreground opacity-50">
            {icon}
          </div>
        )}

        <h3 className="text-lg font-semibold text-foreground">{title}</h3>

        {description && (
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            {description}
          </p>
        )}

        {action && <div className="mt-6">{action}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Variant específico para resultados de busca vazios
 */
export function NoSearchResults({
  searchTerm,
  onClear,
  className = "",
}: {
  searchTerm: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      title="Nenhum resultado encontrado"
      description={
        searchTerm
          ? `Não encontramos resultados para "${searchTerm}". Tente buscar com outros termos.`
          : "Não há registros para exibir no momento."
      }
      action={
        onClear && searchTerm ? (
          <button
            onClick={onClear}
            className="text-sm text-primary hover:underline"
          >
            Limpar busca
          </button>
        ) : undefined
      }
      className={className}
    />
  );
}
