"use client";

import { useEffect } from "react";
import { useCompanySettings } from "@/hooks/useCompanySettings";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { primaryColor } = useCompanySettings();

  useEffect(() => {
    if (primaryColor) {
      // Converter hex para HSL para uso com CSS variables do shadcn/ui
      const hex = primaryColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
        }
      }

      const hsl = `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;

      // Aplicar no root
      document.documentElement.style.setProperty("--primary", hsl);

      // Também aplicar foreground (texto em cima da cor primária)
      const foreground = l > 0.5 ? "0 0% 0%" : "0 0% 100%";
      document.documentElement.style.setProperty("--primary-foreground", foreground);
    }
  }, [primaryColor]);

  return <>{children}</>;
}
