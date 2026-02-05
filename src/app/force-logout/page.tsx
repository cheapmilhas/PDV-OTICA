"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function ForceLogoutPage() {
  useEffect(() => {
    // Logout automático ao carregar a página
    signOut({ callbackUrl: "/login" });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">🔄 Atualizando Sessão</h2>
          <p className="mt-4 text-gray-600">
            Fazendo logout para atualizar sua sessão...
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Você será redirecionado para a tela de login em instantes.
          </p>
          <div className="mt-8 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
