"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerCashbackBadgeProps {
  customerId: string;
  className?: string;
}

export function CustomerCashbackBadge({
  customerId,
  className,
}: CustomerCashbackBadgeProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }

    loadBalance();
  }, [customerId]);

  const loadBalance = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/cashback/customer/${customerId}?pageSize=0`
      );

      if (!response.ok) {
        // Se der erro (ex: cliente sem cashback ainda), retornar null
        setBalance(null);
        return;
      }

      const data = await response.json();
      setBalance(Number(data.data.customerCashback.balance));
    } catch (error) {
      console.error("Erro ao carregar cashback:", error);
      setBalance(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <Badge variant="outline" className={cn("gap-1", className)}>
        <Gift className="h-3 w-3" />
        <span className="text-xs">Carregando...</span>
      </Badge>
    );
  }

  if (balance === null || balance === 0) {
    return null;
  }

  return (
    <Badge
      variant={balance > 0 ? "default" : "outline"}
      className={cn(
        "gap-1",
        balance > 0 && "bg-green-600 hover:bg-green-700",
        className
      )}
    >
      <Gift className="h-3 w-3" />
      <span className="text-xs font-medium">{formatCurrency(balance)}</span>
    </Badge>
  );
}
