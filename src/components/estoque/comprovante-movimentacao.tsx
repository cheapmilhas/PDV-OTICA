"use client";

import { StockMovementType } from "@prisma/client";
import { getStockMovementTypeLabel } from "@/lib/validations/stock-movement.schema";
import { formatCurrency } from "@/lib/utils";

interface ComprovanteMovimentacaoProps {
  movement: {
    id: string;
    type: StockMovementType;
    quantity: number;
    createdAt: string;
    invoiceNumber: string | null;
    reason: string | null;
    notes: string | null;
    product: {
      id: string;
      sku: string;
      name: string;
      type: string;
    };
    supplier: {
      id: string;
      name: string;
    } | null;
    sourceBranch: {
      id: string;
      name: string;
      code: string | null;
    } | null;
    targetBranch: {
      id: string;
      name: string;
      code: string | null;
    } | null;
    createdBy: {
      id: string;
      name: string;
      email: string;
    } | null;
  };
  companyName?: string;
}

export function ComprovanteMovimentacao({ movement, companyName = "PDV Ótica" }: ComprovanteMovimentacaoProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isEntrada = (type: StockMovementType) => {
    return [
      StockMovementType.PURCHASE,
      StockMovementType.CUSTOMER_RETURN,
      StockMovementType.ADJUSTMENT,
      StockMovementType.TRANSFER_IN,
    ].includes(type);
  };

  const isSaida = (type: StockMovementType) => {
    return [
      StockMovementType.SALE,
      StockMovementType.LOSS,
      StockMovementType.SUPPLIER_RETURN,
      StockMovementType.INTERNAL_USE,
      StockMovementType.TRANSFER_OUT,
      StockMovementType.OTHER,
    ].includes(type);
  };

  return (
    <div className="w-[210mm] min-h-[297mm] bg-white p-8 mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Cabeçalho */}
      <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{companyName}</h1>
        <p className="text-sm text-gray-600 mt-1">Comprovante de Movimentação de Estoque</p>
      </div>

      {/* Informações da Movimentação */}
      <div className="mb-6">
        <div className="bg-gray-100 p-4 rounded-lg mb-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Tipo de Movimentação</p>
              <p className="text-xl font-bold text-gray-800">
                {getStockMovementTypeLabel(movement.type)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Data e Hora</p>
              <p className="text-lg font-semibold text-gray-800">
                {formatDate(movement.createdAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600 font-semibold">ID da Movimentação</p>
            <p className="text-gray-800 font-mono text-xs">{movement.id}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-semibold">Responsável</p>
            <p className="text-gray-800">
              {movement.createdBy ? movement.createdBy.name : "Sistema"}
            </p>
            {movement.createdBy && (
              <p className="text-xs text-gray-500">{movement.createdBy.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Dados do Produto */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-800 border-b border-gray-300 pb-2 mb-3">
          Informações do Produto
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600 font-semibold">Nome</p>
            <p className="text-gray-800">{movement.product.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-semibold">SKU</p>
            <p className="text-gray-800 font-mono">{movement.product.sku}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 font-semibold">Quantidade</p>
            <p className={`text-2xl font-bold ${
              isEntrada(movement.type) ? "text-green-600" : "text-red-600"
            }`}>
              {isEntrada(movement.type) ? "+" : "-"}{movement.quantity}
            </p>
          </div>
        </div>
      </div>

      {/* Fornecedor */}
      {movement.supplier && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-300 pb-2 mb-3">
            Fornecedor
          </h2>
          <p className="text-gray-800">{movement.supplier.name}</p>
          {movement.invoiceNumber && (
            <p className="text-sm text-gray-600 mt-1">
              Nota Fiscal: {movement.invoiceNumber}
            </p>
          )}
        </div>
      )}

      {/* Transferência entre Filiais */}
      {(movement.sourceBranch || movement.targetBranch) && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-300 pb-2 mb-3">
            Transferência entre Filiais
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {movement.sourceBranch && (
              <div>
                <p className="text-sm text-gray-600 font-semibold">Origem</p>
                <p className="text-gray-800">{movement.sourceBranch.name}</p>
                {movement.sourceBranch.code && (
                  <p className="text-xs text-gray-500">Código: {movement.sourceBranch.code}</p>
                )}
              </div>
            )}
            {movement.targetBranch && (
              <div>
                <p className="text-sm text-gray-600 font-semibold">Destino</p>
                <p className="text-gray-800">{movement.targetBranch.name}</p>
                {movement.targetBranch.code && (
                  <p className="text-xs text-gray-500">Código: {movement.targetBranch.code}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Observações */}
      {(movement.reason || movement.notes) && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-300 pb-2 mb-3">
            Observações
          </h2>
          {movement.reason && (
            <div className="mb-2">
              <p className="text-sm text-gray-600 font-semibold">Motivo</p>
              <p className="text-gray-800">{movement.reason}</p>
            </div>
          )}
          {movement.notes && (
            <div>
              <p className="text-sm text-gray-600 font-semibold">Notas</p>
              <p className="text-gray-800">{movement.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Rodapé */}
      <div className="mt-12 pt-6 border-t-2 border-gray-300">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="border-t border-gray-400 pt-2 mt-12">
              <p className="text-sm font-semibold text-gray-800 text-center">
                {movement.createdBy ? movement.createdBy.name : "Sistema"}
              </p>
              <p className="text-xs text-gray-600 text-center mt-1">Responsável pela Movimentação</p>
            </div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2 mt-12">
              <p className="text-sm font-semibold text-gray-800 text-center">
                {formatDate(movement.createdAt)}
              </p>
              <p className="text-xs text-gray-600 text-center mt-1">Data e Hora da Movimentação</p>
            </div>
          </div>
        </div>
      </div>

      {/* Informações de Impressão */}
      <div className="mt-8 text-center text-xs text-gray-400">
        <p>Documento gerado automaticamente em {new Date().toLocaleString("pt-BR")}</p>
        <p>Este documento é válido sem assinatura</p>
      </div>
    </div>
  );
}
