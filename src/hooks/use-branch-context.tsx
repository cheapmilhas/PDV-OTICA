"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useSession } from "next-auth/react";

interface Branch {
  id: string;
  name: string;
  code: string;
  city?: string;
  state?: string;
}

interface BranchContextValue {
  activeBranchId: string | "ALL";
  activeBranch: Branch | null;
  branches: Branch[];
  setActiveBranch: (id: string | "ALL") => void;
  isAllBranches: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const BranchContext = createContext<BranchContextValue>({
  activeBranchId: "ALL",
  activeBranch: null,
  branches: [],
  setActiveBranch: () => {},
  isAllBranches: true,
  isAdmin: false,
  loading: true,
});

const STORAGE_KEY = "pdv-active-branch";

export function BranchProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | "ALL">("ALL");
  const [loading, setLoading] = useState(true);

  const userRole = session?.user?.role;
  const isAdmin = userRole === "ADMIN";

  // Carregar branches da API
  useEffect(() => {
    if (!session?.user) return;

    async function loadBranches() {
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) return;
        const result = await res.json();
        const data: Branch[] = result.data || [];
        setBranches(data);

        // Restaurar seleção do localStorage
        const saved = localStorage.getItem(STORAGE_KEY);

        if (isAdmin && saved === "ALL") {
          setActiveBranchId("ALL");
        } else if (saved && data.some((b) => b.id === saved)) {
          setActiveBranchId(saved);
        } else {
          // Default: branch do usuário na session ou primeira
          const userBranchId = session?.user?.branchId;
          const userBranch = data.find((b) => b.id === userBranchId);
          const defaultId = userBranch?.id || data[0]?.id || "ALL";
          // Non-admin nunca pode ter "ALL"
          setActiveBranchId(!isAdmin && defaultId === "ALL" && data.length > 0 ? data[0].id : defaultId);
        }
      } catch (e) {
        console.error("Erro ao carregar filiais:", e);
      } finally {
        setLoading(false);
      }
    }

    loadBranches();
  }, [session, isAdmin]);

  const setActiveBranch = useCallback(
    (id: string | "ALL") => {
      // Non-admin não pode selecionar "ALL"
      if (id === "ALL" && !isAdmin) return;
      // Verificar se a branch existe
      if (id !== "ALL" && !branches.some((b) => b.id === id)) return;

      setActiveBranchId(id);
      localStorage.setItem(STORAGE_KEY, id);
    },
    [isAdmin, branches]
  );

  const activeBranch = activeBranchId === "ALL" ? null : branches.find((b) => b.id === activeBranchId) || null;
  const isAllBranches = activeBranchId === "ALL";

  return (
    <BranchContext.Provider
      value={{
        activeBranchId,
        activeBranch,
        branches,
        setActiveBranch,
        isAllBranches,
        isAdmin,
        loading,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranchContext() {
  return useContext(BranchContext);
}

/**
 * Retorna o query param para branchId filtrar nas APIs.
 * Se "ALL", retorna string vazia (não filtra).
 */
export function getBranchQueryParam(activeBranchId: string | "ALL"): string {
  if (activeBranchId === "ALL") return "";
  return `branchId=${activeBranchId}`;
}
