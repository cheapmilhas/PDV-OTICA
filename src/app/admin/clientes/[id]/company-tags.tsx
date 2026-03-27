"use client";

import { useState, useTransition } from "react";
import { X, Plus, Tag } from "lucide-react";

type TagEntry = {
  id: string;
  tagId: string;
  tag: {
    id: string;
    name: string;
    color: string;
    category: string;
  };
};

type AvailableTag = {
  id: string;
  name: string;
  color: string;
  category: string;
};

async function addTag(companyId: string, tagId: string) {
  const res = await fetch(`/api/admin/clientes/${companyId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId }),
  });
  if (!res.ok) throw new Error("Erro ao adicionar tag");
}

async function removeTag(companyId: string, tagId: string) {
  const res = await fetch(`/api/admin/clientes/${companyId}/tags/${tagId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Erro ao remover tag");
}

export function CompanyTags({
  companyId,
  initialTags,
  availableTags,
}: {
  companyId: string;
  initialTags: TagEntry[];
  availableTags: AvailableTag[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [showPicker, setShowPicker] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const assignedTagIds = new Set(tags.map((t) => t.tagId));
  const unassignedTags = availableTags.filter((t) => !assignedTagIds.has(t.id));

  function handleAdd(tag: AvailableTag) {
    setError(null);
    const optimistic: TagEntry = {
      id: `temp-${tag.id}`,
      tagId: tag.id,
      tag,
    };
    setTags((prev) => [...prev, optimistic]);
    setShowPicker(false);

    startTransition(async () => {
      try {
        await addTag(companyId, tag.id);
      } catch {
        setTags((prev) => prev.filter((t) => t.id !== optimistic.id));
        setError("Erro ao adicionar tag");
      }
    });
  }

  function handleRemove(tagEntry: TagEntry) {
    setError(null);
    setTags((prev) => prev.filter((t) => t.id !== tagEntry.id));

    startTransition(async () => {
      try {
        await removeTag(companyId, tagEntry.tagId);
      } catch {
        setTags((prev) => [...prev, tagEntry]);
        setError("Erro ao remover tag");
      }
    });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-white">Tags</h2>
        </div>
        {unassignedTags.length > 0 && (
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        )}
      </div>

      {/* Tags aplicadas */}
      {tags.length === 0 ? (
        <p className="text-xs text-gray-600">Nenhuma tag aplicada</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: `${t.tag.color}20`,
                borderColor: `${t.tag.color}40`,
                color: t.tag.color,
              }}
            >
              {t.tag.name}
              <button
                onClick={() => handleRemove(t)}
                disabled={isPending}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Picker de tags disponíveis */}
      {showPicker && unassignedTags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-2">Selecionar tag:</p>
          <div className="flex flex-wrap gap-2">
            {unassignedTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAdd(tag)}
                disabled={isPending}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: `${tag.color}15`,
                  borderColor: `${tag.color}30`,
                  color: tag.color,
                }}
              >
                <Plus className="h-3 w-3" />
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
