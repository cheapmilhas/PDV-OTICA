"use client";

import { BranchProvider } from "@/hooks/use-branch-context";

export function BranchProviderWrapper({ children }: { children: React.ReactNode }) {
  return <BranchProvider>{children}</BranchProvider>;
}
