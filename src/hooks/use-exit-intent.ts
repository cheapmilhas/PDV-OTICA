"use client";

import { useEffect, useState } from "react";

export function useExitIntent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const shown = sessionStorage.getItem("exit-intent-shown");
    if (shown) return;

    const isMobile = window.innerWidth < 768;
    if (isMobile) return;

    let timer: ReturnType<typeof setTimeout>;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        timer = setTimeout(() => {
          setShow(true);
          sessionStorage.setItem("exit-intent-shown", "true");
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
