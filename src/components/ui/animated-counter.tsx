"use client";

import { useInView } from "framer-motion";
import { useRef } from "react";
import { useCounterAnimation } from "@/hooks/use-counter-animation";
import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({
  value,
  suffix = "",
  prefix = "",
  duration = 1500,
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const count = useCounterAnimation(value, duration, isInView);

  const formatted = new Intl.NumberFormat("pt-BR").format(count);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
