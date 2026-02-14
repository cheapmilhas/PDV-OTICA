"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface CompanyLogoProps {
  className?: string;
  fallbackText?: string;
  priority?: boolean;
}

/**
 * Componente de Logo da Empresa
 *
 * - Carrega logo do banco de dados
 * - Fallback para texto "PDV Ótica" se não houver logo
 * - Aceita className customizada
 */
export function CompanyLogo({
  className = "h-8",
  fallbackText = "PDV Ótica",
  priority = false
}: CompanyLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadLogo() {
      try {
        const response = await fetch("/api/company/logo");
        const result = await response.json();

        if (result.success && result.data.logoUrl) {
          setLogoUrl(result.data.logoUrl);
        }
      } catch (err) {
        console.error("Erro ao carregar logo:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadLogo();
  }, []);

  if (loading) {
    return (
      <div className={`${className} flex items-center`}>
        <div className="h-full w-20 bg-gray-200 animate-pulse rounded" />
      </div>
    );
  }

  if (error || !logoUrl) {
    return (
      <span className={`font-semibold text-xl ${className}`}>
        {fallbackText}
      </span>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Image
        src={logoUrl}
        alt="Logo da Empresa"
        fill
        className="object-contain"
        priority={priority}
        onError={() => setError(true)}
      />
    </div>
  );
}
