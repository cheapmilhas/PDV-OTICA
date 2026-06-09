"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "exit-intent-shown-at";
// Só reexibe o popup após esse período (evita perturbar o usuário a cada aba/visita)
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Fallback em memória para localStorage indisponível/cheio. Evita os dois
// extremos: reaparecer em loop (setItem falha) e sumir pra sempre (getItem falha).
let shownInThisSession = false;

function wasShownRecently(): boolean {
  if (shownInThisSession) return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const shownAt = Number(raw);
    if (!Number.isFinite(shownAt)) return false;
    return Date.now() - shownAt < COOLDOWN_MS;
  } catch {
    return shownInThisSession;
  }
}

function markShown(): void {
  shownInThisSession = true;
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // sem persistência entre sessões, mas o flag de memória cobre a sessão atual
  }
}

// exposto só para teste
export function __markShownForTest(): void {
  markShown();
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
