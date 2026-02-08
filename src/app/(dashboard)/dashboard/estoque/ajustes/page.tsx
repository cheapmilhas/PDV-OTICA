import { Metadata } from "next";
import { requireAuth } from "@/lib/auth-helpers";
import { hasPermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { ListaAjustes } from "@/components/estoque/lista-ajustes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export const metadata: Metadata = {
  title: "Ajustes de Estoque | PDV Ótica",
  description: "Gerencie ajustes de estoque com justificativa e aprovação",
};

export default async function AjustesEstoquePage() {
  const session = await requireAuth();
  const canApprove = await hasPermission(Permission.STOCK_ADJUSTMENT_APPROVE);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Ajustes de Estoque</h1>
          <p className="text-muted-foreground">
            Histórico e aprovação de ajustes manuais de estoque
          </p>
        </div>
      </div>

      {canApprove && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Você tem permissão para aprovar ajustes</CardTitle>
            <CardDescription className="text-blue-700">
              Como ADMIN ou MANAGER, você pode aprovar ou rejeitar ajustes pendentes diretamente na lista abaixo.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Todos os Ajustes</CardTitle>
          <CardDescription>
            Ajustes criados em <strong>{new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListaAjustes canApprove={canApprove} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Como funciona?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold mb-2">1. Criação de Ajuste</h4>
            <p className="text-muted-foreground">
              No cadastro de produtos, clique em "Ajustar Estoque" para criar um ajuste manual.
              Informe o tipo (quebra, perda, erro de contagem, etc.), quantidade e justificativa.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">2. Aprovação Automática ou Manual</h4>
            <p className="text-muted-foreground">
              Se o valor total do ajuste for menor que o limite configurado (padrão: R$ 500), o ajuste é aprovado automaticamente.
              Caso contrário, fica pendente de aprovação por um ADMIN ou MANAGER.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">3. Aplicação ao Estoque</h4>
            <p className="text-muted-foreground">
              Após aprovação, o estoque do produto é atualizado automaticamente e um registro de movimentação é criado.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
