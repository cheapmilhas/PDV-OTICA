import Link from "next/link";
import type { Tag } from "@prisma/client";

// Filtros pré-definidos rápidos
const QUICK_FILTERS = [
  { label: "Todos", status: "", health: "", onboarding: "" },
  { label: "Trials expirando", status: "TRIAL", health: "", onboarding: "" },
  { label: "Inadimplentes", status: "PAST_DUE", health: "", onboarding: "" },
  { label: "Health Crítico", status: "", health: "CRITICAL", onboarding: "" },
  { label: "Onboarding parado", status: "", health: "", onboarding: "STALLED" },
];

interface ClientesFiltersProps {
  search: string;
  statusFilter: string;
  healthFilter: string;
  onboardingFilter: string;
  segmentFilter: string;
  tagFilter: string;
  counts: Record<string, number>;
  allTags: Tag[];
}

export function ClientesFilters({
  search,
  statusFilter,
  healthFilter,
  onboardingFilter,
  segmentFilter,
  tagFilter,
  counts,
  allTags,
}: ClientesFiltersProps) {
  return (
    <>
      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_FILTERS.map((qf) => {
          const isActive =
            statusFilter === qf.status &&
            healthFilter === qf.health &&
            onboardingFilter === qf.onboarding;
          const href =
            qf.label === "Todos"
              ? "/admin/clientes"
              : `/admin/clientes?status=${qf.status}&health=${qf.health}&onboarding=${qf.onboarding}`;
          return (
            <Link
              key={qf.label}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                isActive
                  ? "bg-primary border-transparent text-primary-foreground"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {qf.label}
            </Link>
          );
        })}
      </div>

      {/* Filtros avançados */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <input
          name="search"
          defaultValue={search}
          placeholder="Buscar por nome, CNPJ ou email..."
          className="px-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring w-72"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativos ({counts.ACTIVE ?? 0})</option>
          <option value="TRIAL">Trial ({counts.TRIAL ?? 0})</option>
          <option value="PAST_DUE">Inadimplentes ({counts.PAST_DUE ?? 0})</option>
          <option value="SUSPENDED">Suspensos ({counts.SUSPENDED ?? 0})</option>
          <option value="CANCELED">Cancelados ({counts.CANCELED ?? 0})</option>
        </select>
        <select
          name="health"
          defaultValue={healthFilter}
          className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os health</option>
          <option value="CRITICAL">Crítico</option>
          <option value="AT_RISK">Em Risco</option>
          <option value="HEALTHY">Saudável</option>
          <option value="THRIVING">Excelente</option>
        </select>
        <select
          name="onboarding"
          defaultValue={onboardingFilter}
          className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os onboardings</option>
          <option value="PENDING_INVITE">Convite pendente</option>
          <option value="IN_PROGRESS">Em andamento</option>
          <option value="COMPLETED">Completo</option>
          <option value="STALLED">Parado</option>
        </select>
        <select
          name="segment"
          defaultValue={segmentFilter}
          className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os segmentos</option>
          <option value="MICRO">Micro</option>
          <option value="PEQUENA">Pequena</option>
          <option value="MEDIA">Média</option>
          <option value="GRANDE">Grande</option>
        </select>
        {allTags.length > 0 && (
          <select
            name="tag"
            defaultValue={tagFilter}
            className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas as tags</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
        >
          Filtrar
        </button>
        {(search || statusFilter || healthFilter || onboardingFilter || segmentFilter || tagFilter) && (
          <Link
            href="/admin/clientes"
            className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
          >
            Limpar
          </Link>
        )}
      </form>
    </>
  );
}
