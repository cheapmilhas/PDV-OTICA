"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, User, ShoppingCart, DollarSign, Calendar, FileText, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConvertQuoteButton } from "@/components/quotes/convert-quote-button";

interface QuoteDetails {
  id: string;
  status: string;
  createdAt: string;
  validUntil: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  notes?: string;
  customer: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
    email?: string;
  };
  createdByUser: {
    id: string;
    name: string;
    email: string;
  };
  branch?: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    qty: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    product: {
      id: string;
      name: string;
      sku: string;
      barcode?: string;
      stockQty: number;
    };
  }>;
  convertedToSale?: {
    id: string;
    total: number;
  } | null;
}

export default function DetalhesOrcamentoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [quote, setQuote] = useState<QuoteDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const res = await fetch(`/api/quotes/${id}`);
        if (!res.ok) throw new Error("Erro ao carregar orçamento");

        const data = await res.json();
        setQuote(data);
      } catch (error: any) {
        toast.error(error.message);
        router.push("/dashboard/orcamentos");
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [id, router]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: any }> = {
      PENDING: { label: "Pendente", variant: "secondary" },
      APPROVED: { label: "Aprovado", variant: "default" },
      REJECTED: { label: "Rejeitado", variant: "destructive" },
      CONVERTED: { label: "Convertido", variant: "default" },
      EXPIRED: { label: "Expirado", variant: "secondary" },
      CANCELED: { label: "Cancelado", variant: "destructive" },
    };

    const config = statusConfig[status] || statusConfig.PENDING;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quote) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/orcamentos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Detalhes do Orçamento</h1>
            <p className="text-sm text-muted-foreground">ID: {id.substring(0, 8)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(quote.status)}
        </div>
      </div>

      {/* Botão Converter em Venda - APENAS se APPROVED */}
      {quote.status === "APPROVED" && !quote.convertedToSale && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Orçamento Aprovado
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Este orçamento está pronto para ser convertido em venda
                </p>
              </div>
              <ConvertQuoteButton
                quoteId={quote.id}
                quoteTotal={quote.total}
                quoteStatus={quote.status}
                validUntil={new Date(quote.validUntil)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Se já foi convertido, mostrar link para venda */}
      {quote.convertedToSale && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2 text-green-700">
                  <DollarSign className="h-5 w-5" />
                  Orçamento Convertido em Venda
                </h3>
                <p className="text-sm text-green-600 mt-1">
                  Este orçamento foi convertido em venda com sucesso
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/vendas/${quote.convertedToSale?.id}/detalhes`)}
              >
                Ver Venda
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-medium">{quote.customer.name}</p>
            </div>
            {quote.customer.cpf && (
              <div>
                <p className="text-sm text-muted-foreground">CPF</p>
                <p className="font-medium">{quote.customer.cpf}</p>
              </div>
            )}
            {quote.customer.phone && (
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium">{quote.customer.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações do Orçamento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Criado em</p>
              <p className="font-medium">
                {format(new Date(quote.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Válido até</p>
              <p className="font-medium">
                {format(new Date(quote.validUntil), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Criado por</p>
              <p className="font-medium">{quote.createdByUser.name}</p>
            </div>
            {quote.branch && (
              <div>
                <p className="text-sm text-muted-foreground">Filial</p>
                <p className="font-medium">{quote.branch.name}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Itens */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Itens do Orçamento ({quote.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {quote.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex-1">
                  <p className="font-medium">{item.product.name}</p>
                  <p className="text-sm text-muted-foreground">SKU: {item.product.sku}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Estoque disponível: {item.product.stockQty} un.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {item.qty} x {formatCurrency(item.unitPrice)}
                  </p>
                  {item.discount > 0 && (
                    <p className="text-xs text-red-600">Desconto: {formatCurrency(item.discount)}</p>
                  )}
                  <p className="font-semibold">{formatCurrency(item.lineTotal)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Totais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Totais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
          </div>
          {quote.discountTotal > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Desconto</span>
              <span className="font-medium">- {formatCurrency(quote.discountTotal)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-lg">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-primary">{formatCurrency(quote.total)}</span>
          </div>
        </CardContent>
      </Card>

      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Observações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{quote.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
