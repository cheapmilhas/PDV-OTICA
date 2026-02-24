"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function ImpersonateContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error" | "redirecting">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const sessionId = searchParams.get("sessionId");

    if (!token || !sessionId) {
      setStatus("error");
      setError("Token ou sessão inválidos");
      return;
    }

    // Setar cookie de sessão NextAuth com o token de impersonação
    document.cookie = `next-auth.session-token=${token}; path=/; max-age=7200; samesite=lax`;
    document.cookie = `impersonation-session=${sessionId}; path=/; max-age=7200; samesite=lax`;

    setStatus("redirecting");

    // Redirecionar para o dashboard
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 500);
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-4" />
            <p className="text-white">Preparando acesso...</p>
          </>
        )}
        {status === "redirecting" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-green-500 mx-auto mb-4" />
            <p className="text-white">Redirecionando para o PDV...</p>
            <p className="text-sm text-gray-500 mt-2">Você está acessando como administrador</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-red-400 text-lg font-bold mb-2">Erro</p>
            <p className="text-gray-400">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <ImpersonateContent />
    </Suspense>
  );
}
