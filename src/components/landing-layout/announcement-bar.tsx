"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import Link from "next/link";

export function AnnouncementBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("announcement-dismissed");
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("announcement-dismissed", "true");
  };

  if (!visible) return null;

  return (
    <div
      className="relative z-50 py-2.5 px-4 text-center text-xs font-medium"
      style={{
        background: "rgba(99,102,241,0.07)",
        borderBottom: "1px solid rgba(99,102,241,0.14)",
        color: "rgba(248,248,252,0.70)",
      }}
    >
      <div className="flex items-center justify-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{
            background: "var(--brand-primary)",
            boxShadow: "0 0 6px rgba(99,102,241,0.7)",
          }}
        />
        <span>
          <strong style={{ color: "var(--lp-foreground)" }}>Lançamento:</strong>{" "}
          30% OFF nos primeiros 3 meses —{" "}
          <Link
            href="/precos"
            className="underline underline-offset-2 hover:no-underline transition-colors"
            style={{ color: "var(--brand-primary)" }}
          >
            Ver planos
          </Link>
        </span>
      </div>
      <button
        onClick={dismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded cursor-pointer transition-colors"
        style={{ color: "var(--lp-subtle)" }}
        aria-label="Fechar anúncio"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
