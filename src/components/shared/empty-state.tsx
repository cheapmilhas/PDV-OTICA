import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center px-4 ${className}`}>
      {icon && (
        <div className="mb-4 text-muted-foreground/30">
          {icon}
        </div>
      )}

      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-sm leading-relaxed">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

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
            className="text-sm text-primary hover:underline font-medium"
          >
            Limpar busca
          </button>
        ) : undefined
      }
      className={className}
    />
  );
}
