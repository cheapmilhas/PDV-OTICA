"use client";

import { AlertOctagon, CreditCard, Mail, Phone, RefreshCw } from "lucide-react";
import Link from "next/link";

interface SubscriptionBlockedProps {
  status: string;
  message: string;
  companyName?: string;
}

export function SubscriptionBlocked({ status, message, companyName }: SubscriptionBlockedProps) {
  const getStatusInfo = () => {
    switch (status) {
      case "TRIAL_EXPIRED":
        return {
          title: "Período de teste expirado",
          description:
            "Seu período de teste de 14 dias chegou ao fim. Assine um plano para continuar usando o PDV Ótica.",
          Icon: AlertOctagon,
          color: "text-orange-500",
          bgColor: "bg-orange-500/10",
          showUpgrade: true,
          upgradeLabel: "Ver planos",
        };
      case "SUSPENDED":
        return {
          title: "Assinatura suspensa",
          description:
            "Sua assinatura foi suspensa devido a pagamentos pendentes. Regularize sua situação para voltar a usar o sistema.",
          Icon: CreditCard,
          color: "text-red-500",
          bgColor: "bg-red-500/10",
          showUpgrade: true,
          upgradeLabel: "Regularizar pagamento",
        };
      case "CANCELED":
        return {
          title: "Assinatura cancelada",
          description:
            "Sua assinatura foi cancelada. Se deseja reativar, entre em contato com nosso suporte.",
          Icon: AlertOctagon,
          color: "text-gray-500",
          bgColor: "bg-gray-500/10",
          showUpgrade: false,
          upgradeLabel: "",
        };
      case "NO_SUBSCRIPTION":
        return {
          title: "Sem assinatura ativa",
          description:
            "Sua empresa não possui uma assinatura ativa. Escolha um plano para começar a usar o PDV Ótica.",
          Icon: CreditCard,
          color: "text-blue-500",
          bgColor: "bg-blue-500/10",
          showUpgrade: true,
          upgradeLabel: "Ver planos",
        };
      default:
        return {
          title: "Acesso bloqueado",
          description: message,
          Icon: AlertOctagon,
          color: "text-red-500",
          bgColor: "bg-red-500/10",
          showUpgrade: false,
          upgradeLabel: "",
        };
    }
  };

  const info = getStatusInfo();
  const { Icon } = info;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div
            className={`mx-auto w-20 h-20 ${info.bgColor} rounded-full flex items-center justify-center mb-6`}
          >
            <Icon className={`w-10 h-10 ${info.color}`} />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">{info.title}</h1>

          {companyName && <p className="text-gray-500 text-sm mb-3">{companyName}</p>}

          <p className="text-gray-600 mb-8">{info.description}</p>

          <div className="space-y-3">
            {info.showUpgrade && (
              <Link
                href="/dashboard/configuracoes"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <CreditCard className="w-5 h-5" />
                {info.upgradeLabel}
              </Link>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Tentar novamente
            </button>
          </div>
        </div>

        {/* Contato */}
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Precisa de ajuda?</h2>
          <div className="space-y-3">
            <a
              href="mailto:suporte@pdvotica.com.br"
              className="flex items-center gap-3 text-gray-600 hover:text-indigo-600 transition-colors"
            >
              <Mail className="w-5 h-5" />
              <span>suporte@pdvotica.com.br</span>
            </a>
            <a
              href="https://wa.me/5585999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-gray-600 hover:text-green-600 transition-colors"
            >
              <Phone className="w-5 h-5" />
              <span>(85) 99999-9999</span>
            </a>
          </div>
        </div>

        <div className="text-center">
          <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
            Sair e fazer login com outra conta
          </Link>
        </div>
      </div>
    </div>
  );
}
