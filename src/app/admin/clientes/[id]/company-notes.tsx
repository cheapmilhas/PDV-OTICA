"use client";

import { useState, useEffect } from "react";
import { Plus, Pin, Trash2, Edit2, Save, X } from "lucide-react";
import { CompanyNote } from "@prisma/client";

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
      alert("Erro ao criar nota");
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
    if (!confirm("Deletar esta nota?")) return;

    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/notes/${noteId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Erro ao deletar nota");
      setNotes(notes.filter((n) => n.id !== noteId));
    } catch (error) {
      console.error(error);
    }
  }

  const typeColors: Record<string, string> = {
    general: "bg-muted text-muted-foreground",
    commercial: "bg-blue-100 text-blue-700",
    support: "bg-amber-100 text-amber-700",
    billing: "bg-emerald-100 text-emerald-700",
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
          <button
            onClick={handleCreateNote}
            disabled={!newNoteContent.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Nota
          </button>
        </div>
      </div>

      {/* Lista de notas */}
      {notes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhuma nota ainda. Adicione a primeira nota acima.
        </div>
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
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title={note.isPinned ? "Desafixar" : "Fixar"}
                  >
                    <Pin className={`w-4 h-4 ${note.isPinned ? "fill-primary text-primary" : ""}`} />
                  </button>
                  {editingId === note.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        className="p-1.5 text-emerald-600 hover:text-emerald-700 rounded transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditContent("");
                        }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
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
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="p-1.5 text-rose-600 hover:text-rose-700 rounded transition-colors"
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
    </div>
  );
}
