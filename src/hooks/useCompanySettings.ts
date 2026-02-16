"use client";

import { useState, useEffect, useCallback } from "react";

interface CompanySettings {
  id: string;
  companyId: string;
  displayName: string | null;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  messageThankYou: string | null;
  messageQuote: string | null;
  messageReminder: string | null;
  messageBirthday: string | null;
  pdfHeaderText: string | null;
  pdfFooterText: string | null;
  defaultQuoteValidDays: number;
  defaultPaymentTerms: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompanySettingsResponse {
  success: boolean;
  data: CompanySettings;
}

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/company/settings");
      if (!response.ok) {
        throw new Error("Erro ao carregar configurações");
      }

      const result: CompanySettingsResponse = await response.json();
      setSettings(result.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Erro desconhecido"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    logoUrl: settings?.logoUrl,
    primaryColor: settings?.primaryColor,
    displayName: settings?.displayName,
    isLoading,
    error,
    refetch: fetchSettings,
  };
}
