"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SHORTCUTS: Record<string, string> = {
  F2: "/dashboard/pdv",
  F3: "/dashboard/clientes",
  F4: "/dashboard/produtos",
};

const ALT_SHORTCUTS: Record<string, string> = {
  v: "/dashboard/pdv",
  c: "/dashboard/clientes",
  p: "/dashboard/produtos",
};

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // F2, F3, F4 shortcuts
      if (SHORTCUTS[e.key]) {
        e.preventDefault();
        router.push(SHORTCUTS[e.key]);
        return;
      }

      // Alt+V, Alt+C, Alt+P shortcuts
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const route = ALT_SHORTCUTS[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          router.push(route);
          return;
        }
      }

      // Ctrl+Shift+V, Ctrl+Shift+C, Ctrl+Shift+P shortcuts
      if (e.ctrlKey && e.shiftKey && !e.metaKey) {
        const route = ALT_SHORTCUTS[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          router.push(route);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null;
}
