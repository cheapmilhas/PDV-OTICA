"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function ImpersonateContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const sessionId = searchParams.get("sessionId");

    if (!token || !sessionId) return;

    // Redireciona para API route server-side que seta o cookie httpOnly corretamente
    window.location.href = `/api/auth/impersonate-session?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`;
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-4" />
        <p className="text-white">Preparando acesso...</p>
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
