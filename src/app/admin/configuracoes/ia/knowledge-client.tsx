"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";

interface KnowledgeDoc {
  id: string;
  companyId: string | null;
  title: string;
  content: string;
  tokensEstimate: number;
  active: boolean;
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
}

const GLOBAL_SCOPE = "global";

export function KnowledgeClient({ companies }: { companies: Company[] }) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // novo documento
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<string>(GLOBAL_SCOPE);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const companyName = useCallback(
    (companyId: string | null): string => {
      if (companyId === null) return "Global";
      const c = companies.find((x) => x.id === companyId);
      return c ? c.name : "(ótica desconhecida)";
    },
    [companies],
  );

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/lens-knowledge");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Erro ao carregar documentos");
        return;
      }
      const data = (await res.json()) as { data: KnowledgeDoc[] };
      setDocs(data.data ?? []);
    } catch {
      setError("Erro de rede ao carregar documentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  async function handleToggle(doc: KnowledgeDoc) {
    setError("");
    try {
      const res = await fetch(`/api/admin/lens-knowledge/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !doc.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Erro ao atualizar documento");
        return;
      }
      await fetchDocs();
    } catch {
      setError("Erro de rede ao atualizar documento");
    }
  }

  async function handleDelete(doc: KnowledgeDoc) {
    if (!window.confirm(`Excluir o documento "${doc.title}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/admin/lens-knowledge/${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Erro ao excluir documento");
        return;
      }
      await fetchDocs();
    } catch {
      setError("Erro de rede ao excluir documento");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (title.trim().length === 0 || content.trim().length === 0) {
      setFormError("Título e conteúdo são obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/lens-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content,
          companyId: scope === GLOBAL_SCOPE ? null : scope,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError((data as { error?: string }).error || "Erro ao criar documento");
        return;
      }
      setTitle("");
      setScope(GLOBAL_SCOPE);
      setContent("");
      await fetchDocs();
    } catch {
      setFormError("Erro de rede ao criar documento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Base de Conhecimento"
        subtitle="Documentos usados pelo Assistente de Lentes. Podem ser globais (todas as óticas) ou específicos de uma ótica."
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* Lista de documentos */}
      <div className="bg-muted border border-border rounded-lg p-5 space-y-4">
        <p className="font-semibold text-foreground">Documentos cadastrados</p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum documento cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Título</th>
                  <th className="py-2 pr-3 font-medium">Escopo</th>
                  <th className="py-2 pr-3 font-medium text-right">Tokens</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-foreground">{doc.title}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{companyName(doc.companyId)}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">
                      {doc.tokensEstimate.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-3">
                      {doc.active ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggle(doc)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {doc.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc)}
                        className="ml-3 text-xs font-medium text-rose-600 hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Novo documento */}
      <form
        onSubmit={handleCreate}
        className="bg-muted border border-border rounded-lg p-5 space-y-4"
      >
        <div>
          <p className="font-semibold text-foreground">Novo documento</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Adicione conhecimento que o Assistente de Lentes poderá usar.
          </p>
        </div>

        {formError && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
            <p className="text-sm text-rose-700">{formError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="kb-title" className="text-sm font-medium text-foreground">
              Título
            </label>
            <input
              id="kb-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Guia de lentes multifocais"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="kb-scope" className="text-sm font-medium text-foreground">
              Escopo
            </label>
            <select
              id="kb-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value={GLOBAL_SCOPE}>Global (todas as óticas)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="kb-content" className="text-sm font-medium text-foreground">
            Conteúdo
          </label>
          <textarea
            id="kb-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="Cole aqui o texto de referência…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando…" : "Adicionar documento"}
          </button>
        </div>
      </form>
    </div>
  );
}
