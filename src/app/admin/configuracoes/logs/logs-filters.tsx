"use client";

import { useRouter } from "next/navigation";

interface Company {
  id: string;
  name: string;
}

interface LogsFiltersProps {
  companies: Company[];
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  actionFilter?: string;
}

export function LogsFilters({ companies, companyId, dateFrom, dateTo, actionFilter }: LogsFiltersProps) {
  const router = useRouter();

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p: Record<string, string | undefined> = { action: actionFilter, companyId, dateFrom, dateTo, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/admin/configuracoes/logs${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Empresa</label>
        <select
          value={companyId || ""}
          onChange={(e) => router.push(buildUrl({ companyId: e.target.value || undefined, page: undefined }))}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Todas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">De</label>
        <input
          type="date"
          value={dateFrom || ""}
          onChange={(e) => router.push(buildUrl({ dateFrom: e.target.value || undefined, page: undefined }))}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Até</label>
        <input
          type="date"
          value={dateTo || ""}
          onChange={(e) => router.push(buildUrl({ dateTo: e.target.value || undefined, page: undefined }))}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>
      {(companyId || dateFrom || dateTo) && (
        <button
          onClick={() => router.push(buildUrl({ companyId: undefined, dateFrom: undefined, dateTo: undefined, page: undefined }))}
          className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
