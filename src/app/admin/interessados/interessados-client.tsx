"use client";

import { useState } from "react";
import { Download, Loader2, Mail } from "lucide-react";
import type { InteressadoItem } from "./page";

const PLAN_OPTIONS = [
  { slug: "", label: "Todos os planos" },
  { slug: "basico", label: "Básico" },
  { slug: "basico-nf", label: "Básico + NF" },
  { slug: "profissional", label: "Profissional" },
  { slug: "rede", label: "Rede" },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function InteressadosClient({ initial }: { initial: InteressadoItem[] }) {
  const [items, setItems] = useState<InteressadoItem[]>(initial);
  const [planSlug, setPlanSlug] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFilterChange(slug: string) {
    setPlanSlug(slug);
    setLoading(true);
    try {
      const qs = slug ? `?planSlug=${encodeURIComponent(slug)}` : "";
      const res = await fetch(`/api/admin/plan-interests${qs}`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // mantém a lista atual em caso de erro de rede
    } finally {
      setLoading(false);
    }
  }

  const csvHref = planSlug
    ? `/api/admin/plan-interests?planSlug=${encodeURIComponent(planSlug)}&format=csv`
    : `/api/admin/plan-interests?format=csv`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <Mail className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Interessados</h1>
            <p className="text-sm text-gray-500">
              Visitantes que pediram para ser avisados sobre planos &quot;Em breve&quot;.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={planSlug}
            onChange={(e) => handleFilterChange(e.target.value)}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
          >
            {PLAN_OPTIONS.map((opt) => (
              <option key={opt.slug || "all"} value={opt.slug}>
                {opt.label}
              </option>
            ))}
          </select>

          <a
            href={csvHref}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Carregando...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Mail className="h-10 w-10 text-gray-700 mb-3" />
            <p className="text-gray-400">Nenhum interessado ainda</p>
            <p className="text-sm text-gray-600 mt-1">
              Os pedidos de aviso sobre planos aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Plano</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40"
                  >
                    <td className="px-4 py-3 text-gray-200">{item.name}</td>
                    <td className="px-4 py-3 text-gray-300">{item.email}</td>
                    <td className="px-4 py-3 text-gray-400">{item.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">{item.companyName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-gray-800 text-xs text-gray-300">
                        {item.planSlug}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && items.length > 0 && (
        <p className="mt-3 text-xs text-gray-600">
          {items.length} {items.length === 1 ? "interessado" : "interessados"}
        </p>
      )}
    </div>
  );
}
