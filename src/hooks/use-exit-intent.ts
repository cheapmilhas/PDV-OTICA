"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "exit-intent-shown-at";
// Só reexibe o popup após esse período (evita perturbar o usuário a cada aba/visita)
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function wasShownRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const shownAt = Number(raw);
    if (!Number.isFinite(shownAt)) return false;
    return Date.now() - shownAt < COOLDOWN_MS;
  } catch {
    // Se localStorage estiver indisponível (modo privativo etc.), não bloqueia,
    // mas também não trava: trata como "já mostrado" para não perturbar.
    return true;
  }
}

function markShown(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // ignora — sem persistência, o popup simplesmente poderá reaparecer
  }
}

export function useExitIntent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (wasShownRecently()) return;

    const isMobile = window.innerWidth < 768;
    if (isMobile) return;

    let timer: ReturnType<typeof setTimeout>;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        timer = setTimeout(() => {
          setShow(true);
          markShown();
        }, 100);
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => setShow(false);

  return { show, dismiss };
}
