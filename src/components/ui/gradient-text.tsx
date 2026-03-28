import { cn } from "@/lib/utils";
import type { ElementType } from "react";

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "brand";
  as?: ElementType;
}

// Renders as an italic solid-color accent word.
// Replaces the clichéd purple→cyan gradient headline pattern
// with brand-primary (indigo) italic styling — intentional, not AI-template.
export function GradientText({
  children,
  className,
  variant = "primary",
  as: Tag = "span",
}: GradientTextProps) {
  const color =
    variant === "brand" ? "var(--brand-accent)" : "var(--brand-primary)";

  return (
    <Tag
      className={cn(className)}
      style={{
        color,
        fontStyle: "italic",
        fontWeight: "inherit",
      }}
    >
      {children}
    </Tag>
  );
}
