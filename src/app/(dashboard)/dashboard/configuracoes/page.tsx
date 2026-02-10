"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Save,
  Settings,
  Shield,
  Store,
  Key,
} from "lucide-react";

function ConfiguracoesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Estados para configurações da loja
  const [dadosLoja, setDadosLoja] = useState({
    nome: "Ótica Visão Perfeita",
    cnpj: "12.345.678/0001-90",
    email: "contato@oticavisaoperfeita.com.br",
    telefone: "(11) 3456-7890",
    endereco: "Rua das Flores, 123",
    cidade: "São Paulo",
    estado: "SP",
    cep: "01234-567",
  });

  // Configurações fiscais
  const [configFiscais, setConfigFiscais] = useState({
    emitirNFe: true,
    serie: "1",
    numeroProximaNota: "1001",
    certificadoDigital: "certificado.pfx",
  });

  // Configurações de PDV
  const [configPDV, setConfigPDV] = useState({
    permitirDescontoMaximo: 15,
    solicitarCPFNaNota: true,
    imprimirRecibo: true,
    exigirVendedor: false,
  });

  // Configurações de notificações
  const [configNotificacoes, setConfigNotificacoes] = useState({
    estoqueMinimo: true,
    vendasDiarias: true,
    novosClientes: false,
    osEmAndamento: true,
  });

  const handleSalvarConfiguracoes = () => {
    setLoading(true);
    setTimeout(() => {
      toast({
        title: "Configurações salvas!",
        description: "As alterações foram aplicadas com sucesso.",
      });
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie as configurações do sistema
          </p>
        </div>
        <Button onClick={handleSalvarConfiguracoes} disabled={loading}>
          <Save className="mr-2 h-4 w-4" />
          {loading ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="loja" className="space-y-4">
        <TabsList>
          <TabsTrigger value="loja">
            <Store className="mr-2 h-4 w-4" />
            Loja
          </TabsTrigger>
          <TabsTrigger value="fiscal">
            <Receipt className="mr-2 h-4 w-4" />
            Fiscal
          </TabsTrigger>
          <TabsTrigger value="pdv">
            <Settings className="mr-2 h-4 w-4" />
            PDV
          </TabsTrigger>
          <TabsTrigger value="notificacoes">
            <Bell className="mr-2 h-4 w-4" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="seguranca">
            <Shield className="mr-2 h-4 w-4" />
            Segurança
          </TabsTrigger>
        </TabsList>

        {/* Tab Dados da Loja */}
        <TabsContent value="loja" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dados da Empresa
              </CardTitle>
              <CardDescription>
                Informações básicas da ótica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome da Empresa</Label>
                  <Input
                    id="nome"
                    value={dadosLoja.nome}
                    onChange={(e) => setDadosLoja({ ...dadosLoja, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={dadosLoja.cnpj}
                    onChange={(e) => setDadosLoja({ ...dadosLoja, cnpj: e.target.value })}
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={dadosLoja.email}
                    onChange={(e) => setDadosLoja({ ...dadosLoja, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <Input
                    id="telefone"
                    value={dadosLoja.telefone}
                    onChange={(e) => setDadosLoja({ ...dadosLoja, telefone: e.target.value })}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="endereco" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Endereço
                </Label>
                <Input
                  id="endereco"
                  value={dadosLoja.endereco}
                  onChange={(e) => setDadosLoja({ ...dadosLoja, endereco: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={dadosLoja.cidade}
                    onChange={(e) => setDadosLoja({ ...dadosLoja, cidade: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <Select value={dadosLoja.estado} onValueChange={(value) => setDadosLoja({ ...dadosLoja, estado: value })}>
                    <SelectTrigger id="estado">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SP">São Paulo</SelectItem>
                      <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                      <SelectItem value="MG">Minas Gerais</SelectItem>
                      <SelectItem value="RS">Rio Grande do Sul</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={dadosLoja.cep}
                    onChange={(e) => setDadosLoja({ ...dadosLoja, cep: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Fiscal */}
        <TabsContent value="fiscal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Fiscais</CardTitle>
              <CardDescription>
                Configurações para emissão de notas fiscais
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="emitir-nfe" className="text-base">Emitir NF-e</Label>
                  <p className="text-sm text-muted-foreground">
                    Habilitar emissão de nota fiscal eletrônica
                  </p>
                </div>
                <Switch
                  id="emitir-nfe"
                  checked={configFiscais.emitirNFe}
                  onCheckedChange={(checked) => setConfigFiscais({ ...configFiscais, emitirNFe: checked })}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="serie">Série da NF-e</Label>
                  <Input
                    id="serie"
                    value={configFiscais.serie}
                    onChange={(e) => setConfigFiscais({ ...configFiscais, serie: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero">Número da Próxima Nota</Label>
                  <Input
                    id="numero"
                    value={configFiscais.numeroProximaNota}
                    onChange={(e) => setConfigFiscais({ ...configFiscais, numeroProximaNota: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificado">Certificado Digital</Label>
                <div className="flex gap-2">
                  <Input
                    id="certificado"
                    value={configFiscais.certificadoDigital}
                    disabled
                  />
                  <Button variant="outline">Upload</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Arquivo .pfx do certificado digital A1
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab PDV */}
        <TabsContent value="pdv" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações do PDV</CardTitle>
              <CardDescription>
                Personalize o comportamento do ponto de venda
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="desconto-max">Desconto Máximo Permitido (%)</Label>
                <Input
                  id="desconto-max"
                  type="number"
                  value={configPDV.permitirDescontoMaximo}
                  onChange={(e) => setConfigPDV({ ...configPDV, permitirDescontoMaximo: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  Desconto máximo que pode ser aplicado sem autorização
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="cpf-nota" className="text-base">Solicitar CPF na Nota</Label>
                    <p className="text-sm text-muted-foreground">
                      Pedir CPF do cliente ao finalizar venda
                    </p>
                  </div>
                  <Switch
                    id="cpf-nota"
                    checked={configPDV.solicitarCPFNaNota}
                    onCheckedChange={(checked) => setConfigPDV({ ...configPDV, solicitarCPFNaNota: checked })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="imprimir-recibo" className="text-base">Imprimir Recibo</Label>
                    <p className="text-sm text-muted-foreground">
                      Imprimir comprovante após finalizar venda
                    </p>
                  </div>
                  <Switch
                    id="imprimir-recibo"
                    checked={configPDV.imprimirRecibo}
                    onCheckedChange={(checked) => setConfigPDV({ ...configPDV, imprimirRecibo: checked })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="exigir-vendedor" className="text-base">Exigir Vendedor</Label>
                    <p className="text-sm text-muted-foreground">
                      Obrigar seleção de vendedor no PDV
                    </p>
                  </div>
                  <Switch
                    id="exigir-vendedor"
                    checked={configPDV.exigirVendedor}
                    onCheckedChange={(checked) => setConfigPDV({ ...configPDV, exigirVendedor: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Notificações */}
        <TabsContent value="notificacoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notificações</CardTitle>
              <CardDescription>
                Escolha quais notificações você deseja receber
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="notif-estoque" className="text-base">Estoque Mínimo</Label>
                  <p className="text-sm text-muted-foreground">
                    Alerta quando produtos atingirem estoque mínimo
                  </p>
                </div>
                <Switch
                  id="notif-estoque"
                  checked={configNotificacoes.estoqueMinimo}
                  onCheckedChange={(checked) => setConfigNotificacoes({ ...configNotificacoes, estoqueMinimo: checked })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="notif-vendas" className="text-base">Resumo de Vendas Diárias</Label>
                  <p className="text-sm text-muted-foreground">
                    Receber relatório de vendas do dia
                  </p>
                </div>
                <Switch
                  id="notif-vendas"
                  checked={configNotificacoes.vendasDiarias}
                  onCheckedChange={(checked) => setConfigNotificacoes({ ...configNotificacoes, vendasDiarias: checked })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="notif-clientes" className="text-base">Novos Clientes</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando novos clientes forem cadastrados
                  </p>
                </div>
                <Switch
                  id="notif-clientes"
                  checked={configNotificacoes.novosClientes}
                  onCheckedChange={(checked) => setConfigNotificacoes({ ...configNotificacoes, novosClientes: checked })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="notif-os" className="text-base">Ordens de Serviço</Label>
                  <p className="text-sm text-muted-foreground">
                    Alerta sobre OS em andamento e prazos
                  </p>
                </div>
                <Switch
                  id="notif-os"
                  checked={configNotificacoes.osEmAndamento}
                  onCheckedChange={(checked) => setConfigNotificacoes({ ...configNotificacoes, osEmAndamento: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Segurança */}
        <TabsContent value="seguranca" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Segurança e Permissões</CardTitle>
              <CardDescription>
                Configurações de segurança e acesso ao sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-primary" />
                      <Label className="text-base font-semibold">Permissões por Cargo</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Visualize as permissões atribuídas a cada cargo do sistema
                    </p>
                  </div>
                  <Button onClick={() => router.push("/dashboard/configuracoes/permissoes")}>
                    Gerenciar
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Alterar Senha</Label>
                <div className="space-y-2">
                  <Input type="password" placeholder="Senha atual" />
                  <Input type="password" placeholder="Nova senha" />
                  <Input type="password" placeholder="Confirmar nova senha" />
                  <Button variant="outline" className="w-full">
                    Atualizar Senha
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <h4 className="font-semibold text-destructive">Zona de Perigo</h4>
                <p className="mt-2 text-sm text-muted-foreground">
                  Estas ações são irreversíveis. Proceda com cautela.
                </p>
                <div className="mt-4 space-y-2">
                  <Button variant="destructive" className="w-full">
                    Limpar Todos os Dados
                  </Button>
                  <Button variant="outline" className="w-full text-destructive">
                    Resetar Configurações
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="settings.access">
      <ConfiguracoesPage />
    </ProtectedRoute>
  );
}
