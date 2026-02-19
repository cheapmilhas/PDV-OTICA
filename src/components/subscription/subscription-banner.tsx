"use client";

import { AlertTriangle, Clock, CreditCard, X } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

interface SubscriptionBannerProps {
  status: string;
  message: string;
  daysLeft?: number;
  daysOverdue?: number;
  readOnly?: boolean;
}

export function SubscriptionBanner({
  status,
  message,
  daysLeft,
  daysOverdue,
  readOnly,
}: SubscriptionBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (status === "ACTIVE" || dismissed) {
    return null;
  }

  let bgColor = "bg-blue-600";
  let Icon = Clock;
  let showCloseButton = true;
  let urgent = false;

  if (status === "TRIAL") {
    if (daysLeft !== undefined && daysLeft <= 3) {
      bgColor = "bg-orange-600";
      Icon = AlertTriangle;
      urgent = true;
      showCloseButton = false;
    } else {
      bgColor = "bg-blue-600";
      Icon = Clock;
    }
  } else if (status === "PAST_DUE") {
    bgColor = "bg-red-600";
    Icon = CreditCard;
    showCloseButton = false;
    urgent = true;
  }

  return (
    <div className={`${bgColor} text-white px-4 py-2.5`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className={`h-4 w-4 flex-shrink-0 ${urgent ? "animate-pulse" : ""}`} />
          <span className="text-sm font-medium truncate">{message}</span>
          {readOnly && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded flex-shrink-0">
              Modo leitura
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {(status === "TRIAL" || status === "PAST_DUE") && (
            <Link
              href="/dashboard/configuracoes"
              className="text-xs font-semibold bg-white text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              {status === "TRIAL" ? "Assinar agora" : "Regularizar"}
            </Link>
          )}
          {showCloseButton && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1 hover:bg-white/20 rounded flex-shrink-0"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
