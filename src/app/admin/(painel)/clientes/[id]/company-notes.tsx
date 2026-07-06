"use client";

import { useState, useEffect } from "react";
import { Plus, Pin, Trash2, Edit2, Save, X, StickyNote } from "lucide-react";
import { CompanyNote } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/EmptyState";
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

interface CompanyNotesProps {
  companyId: string;
}

export function CompanyNotes({ companyId }: CompanyNotesProps) {
  const [notes, setNotes] = useState<CompanyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteType, setNewNoteType] = useState("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotes();
  }, [companyId]);

  async function fetchNotes() {
    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/notes`);
      if (!res.ok) throw new Error("Erro ao carregar notas");
      const data = await res.json();
      setNotes(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateNote() {
    if (!newNoteContent.trim()) return;

    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNoteContent, type: newNoteType }),
      });

      if (!res.ok) throw new Error("Erro ao criar nota");
      const note = await res.json();
      setNotes([note, ...notes]);
      setNewNoteContent("");
      setNewNoteType("general");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar nota");
    }
  }

  async function handleTogglePin(noteId: string, currentState: boolean) {
    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !currentState }),
      });

      if (!res.ok) throw new Error("Erro ao fixar nota");
      const updated = await res.json();
      setNotes(notes.map((n) => (n.id === noteId ? updated : n)));
    } catch (error) {
      console.error(error);
    }
  }

  async function handleSaveEdit(noteId: string) {
    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar nota");
      const updated = await res.json();
      setNotes(notes.map((n) => (n.id === noteId ? updated : n)));
      setEditingId(null);
      setEditContent("");
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDelete(noteId: string) {
    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/notes/${noteId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Erro ao deletar nota");
      setNotes(notes.filter((n) => n.id !== noteId));
    } catch (error) {
      console.error(error);
      toast.error("Erro ao deletar nota");
    } finally {
      setDeletingId(null);
    }
  }

  // Tom semântico via token (theme-aware); fundo suave com opacidade.
  const typeColors: Record<string, string> = {
    general: "bg-muted text-muted-foreground",
    commercial: "bg-info/10 text-info",
    support: "bg-warning/10 text-warning",
    billing: "bg-success/10 text-success",
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Form para nova nota */}
      <div className="rounded-xl border border-border bg-card p-4">
        <textarea
          value={newNoteContent}
          onChange={(e) => setNewNoteContent(e.target.value)}
          placeholder="Escrever uma nota sobre este cliente..."
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-3"
          rows={3}
        />
        <div className="flex items-center gap-3">
          <select
            value={newNoteType}
            onChange={(e) => setNewNoteType(e.target.value)}
            className="px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="general">Geral</option>
            <option value="commercial">Comercial</option>
            <option value="support">Suporte</option>
            <option value="billing">Financeiro</option>
          </select>
          <Button
            onClick={handleCreateNote}
            disabled={!newNoteContent.trim()}
          >
            <Plus className="w-4 h-4" />
            Adicionar Nota
          </Button>
        </div>
      </div>

      {/* Lista de notas */}
      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          message="Nenhuma nota ainda. Adicione a primeira nota acima."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`rounded-xl border ${
                note.isPinned
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              } p-4`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeColors[note.type] || typeColors.general}`}>
                    {note.type === "general" && "Geral"}
                    {note.type === "commercial" && "Comercial"}
                    {note.type === "support" && "Suporte"}
                    {note.type === "billing" && "Financeiro"}
                  </span>
                  {note.isPinned && (
                    <Pin className="w-3 h-3 text-primary fill-primary" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTogglePin(note.id, note.isPinned)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={note.isPinned ? "Desafixar" : "Fixar"}
                    aria-label={note.isPinned ? "Desafixar nota" : "Fixar nota"}
                  >
                    <Pin className={`w-4 h-4 ${note.isPinned ? "fill-primary text-primary" : ""}`} />
                  </button>
                  {editingId === note.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        className="p-1.5 text-success hover:text-success/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Salvar nota"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditContent("");
                        }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Cancelar edição"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(note.id);
                          setEditContent(note.content);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Editar nota"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingId(note.id)}
                        className="p-1.5 text-destructive hover:text-destructive/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Deletar nota"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingId === note.id ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                />
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap mb-3">{note.content}</p>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{note.adminName}</span>
                <span>{new Date(note.createdAt).toLocaleString("pt-BR")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar nota?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A nota será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingId) handleDelete(deletingId);
              }}
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
