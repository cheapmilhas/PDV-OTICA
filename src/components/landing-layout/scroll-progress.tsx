"use client";

import { useScrollProgress } from "@/hooks/use-scroll-progress";

export function ScrollProgress() {
  const progress = useScrollProgress();

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-brand-primary to-brand-accent transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
