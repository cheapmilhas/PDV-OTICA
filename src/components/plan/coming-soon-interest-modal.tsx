"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  planSlug: string;
  planName: string;
  onClose: () => void;
}

export function ComingSoonInterestModal({ open, planSlug, planName, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/public/plan-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug, name, email, phone: phone || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {state === "done" ? (
          <div className="text-center">
            <h3 className="text-lg font-semibold">Prontinho! 🎉</h3>
            <p className="mt-2 text-sm text-gray-600">
              Avisaremos você assim que o plano <strong>{planName}</strong> estiver disponível.
            </p>
            <button onClick={onClose} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Fechar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <h3 className="text-lg font-semibold">Quero ser avisado — {planName}</h3>
            <input required placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
            <input required type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
            <input placeholder="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
            {state === "error" && <p className="text-sm text-red-600">Algo deu errado. Tente de novo.</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button type="submit" disabled={state === "loading"}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {state === "loading" ? "Enviando..." : "Quero ser avisado"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
