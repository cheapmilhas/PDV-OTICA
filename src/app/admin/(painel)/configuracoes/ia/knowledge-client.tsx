"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<KnowledgeDoc | null>(null);

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
    if (pendingId) return;
    setPendingId(doc.id);
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
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(doc: KnowledgeDoc) {
    setDocToDelete(null);
    if (pendingId) return;
    setPendingId(doc.id);
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
    } finally {
      setPendingId(null);
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
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Lista de documentos */}
      <div className="bg-muted border border-border rounded-lg p-5 space-y-4">
        <p className="font-semibold text-foreground">Documentos cadastrados</p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : docs.length === 0 ? (
          <EmptyState icon={FileText} message="Nenhum documento cadastrado ainda." />
        ) : (
          <ResponsiveTable minWidth={720}>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Escopo</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="text-foreground">{doc.title}</TableCell>
                  <TableCell className="text-muted-foreground">{companyName(doc.companyId)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {doc.tokensEstimate.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    {doc.active ? (
                      <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(doc)}
                        disabled={pendingId === doc.id}
                        className="text-primary"
                      >
                        {pendingId === doc.id ? "Salvando…" : doc.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDocToDelete(doc)}
                        disabled={pendingId === doc.id}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
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
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive">{formError}</p>
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
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Adicionar documento"}
          </Button>
        </div>
      </form>

      <AlertDialog open={docToDelete !== null} onOpenChange={(o) => !o && setDocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o documento &quot;{docToDelete?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O documento será removido da base de conhecimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (docToDelete) handleDelete(docToDelete);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
