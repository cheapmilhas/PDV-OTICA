"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  span?: "1" | "2";
  rowSpan?: "1" | "2";
  glow?: boolean;
}

export function BentoCard({
  children,
  className,
  span = "1",
  rowSpan = "1",
  glow = false,
}: BentoCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 overflow-hidden",
        "hover:border-[var(--border-hover)] transition-colors duration-300",
        glow && "hover:shadow-glow",
        span === "2" && "md:col-span-2",
        rowSpan === "2" && "md:row-span-2",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
