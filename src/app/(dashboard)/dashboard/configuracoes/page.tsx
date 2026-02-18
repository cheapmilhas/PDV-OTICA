"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Save,
  FileText,
  MessageSquare,
  RotateCcw,
  Info,
  Palette,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

// Mensagens padrão
const MENSAGENS_PADRAO = {
  agradecimento: `Olá {cliente}!

Muito obrigado pela sua compra na {empresa}!

Esperamos que você esteja satisfeito com seu novo {produto}. Se precisar de qualquer assistência, estamos sempre à disposição.

Volte sempre!
{empresa}
{telefone}`,

  orcamento: `Olá {cliente}!

Segue o orçamento solicitado:

{detalhes_orcamento}

Valor total: {valor}

Este orçamento é válido por 7 dias.

Ficamos à disposição para esclarecer dúvidas.

Atenciosamente,
{empresa}
{telefone}`,

  lembrete: `Olá {cliente}!

Este é um lembrete amigável sobre seu compromisso na {empresa}.

Data: {data}
Horário: {horario}

Aguardamos você!

{empresa}
{telefone}`,

  aniversario: `Feliz Aniversário, {cliente}!

A equipe da {empresa} deseja um dia maravilhoso!

Como presente, preparamos uma condição especial para você. Venha nos visitar!

{empresa}
{telefone}`
};

function ConfiguracoesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Estados para configurações da empresa
  const [dadosEmpresa, setDadosEmpresa] = useState({
    nome: "Ótica Visão Perfeita",
    cnpj: "12.345.678/0001-90",
    email: "contato@oticavisaoperfeita.com.br",
    telefone: "(11) 3456-7890",
    whatsapp: "(11) 98765-4321",
    endereco: "Rua das Flores, 123",
    cidade: "São Paulo",
    estado: "SP",
    cep: "01234-567",
    site: "www.oticavisaoperfeita.com.br",
    instagram: "@oticavisaoperfeita",
  });

  // Estados para mensagens personalizadas
  const [mensagens, setMensagens] = useState({
    agradecimento: MENSAGENS_PADRAO.agradecimento,
    orcamento: MENSAGENS_PADRAO.orcamento,
    lembrete: MENSAGENS_PADRAO.lembrete,
    aniversario: MENSAGENS_PADRAO.aniversario,
  });

  // Estados para configurações de PDF
  const [configPDF, setConfigPDF] = useState({
    mostrarLogo: true,
    mostrarEndereco: true,
    mostrarContato: true,
    rodape: "Obrigado pela preferência!",
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

  const handleRestaurarMensagem = (tipo: keyof typeof MENSAGENS_PADRAO) => {
    setMensagens({
      ...mensagens,
      [tipo]: MENSAGENS_PADRAO[tipo]
    });
    toast({
      title: "Mensagem restaurada",
      description: "A mensagem padrão foi restaurada com sucesso.",
    });
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
      <Tabs defaultValue="empresa" className="space-y-4">
        <TabsList>
          <TabsTrigger value="aparencia" asChild>
            <Link href="/dashboard/configuracoes/aparencia" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Aparência
              <ExternalLink className="h-3 w-3" />
            </Link>
          </TabsTrigger>
          <TabsTrigger value="empresa">
            <Building2 className="mr-2 h-4 w-4" />
            Dados da Empresa
          </TabsTrigger>
          <TabsTrigger value="mensagens">
            <MessageSquare className="mr-2 h-4 w-4" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="pdf">
            <FileText className="mr-2 h-4 w-4" />
            Configurações de PDF
          </TabsTrigger>
        </TabsList>

        {/* Tab Dados da Empresa */}
        <TabsContent value="empresa" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informações da Empresa
              </CardTitle>
              <CardDescription>
                Dados que serão utilizados em documentos e mensagens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome da Empresa</Label>
                  <Input
                    id="nome"
                    value={dadosEmpresa.nome}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={dadosEmpresa.cnpj}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cnpj: e.target.value })}
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
                    value={dadosEmpresa.email}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <Input
                    id="telefone"
                    value={dadosEmpresa.telefone}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, telefone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    value={dadosEmpresa.whatsapp}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, whatsapp: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="site">Site</Label>
                  <Input
                    id="site"
                    value={dadosEmpresa.site}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, site: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  value={dadosEmpresa.instagram}
                  onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, instagram: e.target.value })}
                  placeholder="@sua_empresa"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="endereco" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Endereço
                </Label>
                <Input
                  id="endereco"
                  value={dadosEmpresa.endereco}
                  onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, endereco: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={dadosEmpresa.cidade}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cidade: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <Input
                    id="estado"
                    value={dadosEmpresa.estado}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, estado: e.target.value })}
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={dadosEmpresa.cep}
                    onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cep: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Mensagens */}
        <TabsContent value="mensagens" className="space-y-4">
          {/* Card de Ajuda */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Info className="h-5 w-5" />
                Variáveis Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm text-blue-900">
                <div>
                  <p className="font-semibold mb-2">Dados da Empresa:</p>
                  <ul className="space-y-1 ml-4">
                    <li><code className="bg-blue-100 px-1 rounded">{"{ empresa }"}</code> - Nome da empresa</li>
                    <li><code className="bg-blue-100 px-1 rounded">{"{ telefone }"}</code> - Telefone da empresa</li>
                    <li><code className="bg-blue-100 px-1 rounded">{"{ whatsapp }"}</code> - WhatsApp da empresa</li>
                    <li><code className="bg-blue-100 px-1 rounded">{"{ endereco }"}</code> - Endereço completo</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold mb-2">Dados do Cliente/Venda:</p>
                  <ul className="space-y-1 ml-4">
                    <li><code className="bg-blue-100 px-1 rounded">{"{ cliente }"}</code> - Nome do cliente</li>
                    <li><code className="bg-blue-100 px-1 rounded">{"{ produto }"}</code> - Nome do produto</li>
                    <li><code className="bg-blue-100 px-1 rounded">{"{ valor }"}</code> - Valor total</li>
                    <li><code className="bg-blue-100 px-1 rounded">{"{ data }"}</code> - Data</li>
                    <li><code className="bg-blue-100 px-1 rounded">{"{ horario }"}</code> - Horário</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mensagem de Agradecimento */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Agradecimento</CardTitle>
                  <CardDescription>
                    Enviada após a conclusão de uma venda
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("agradecimento")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={mensagens.agradecimento}
                onChange={(e) => setMensagens({ ...mensagens, agradecimento: e.target.value })}
                rows={8}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Mensagem de Orçamento */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Orçamento</CardTitle>
                  <CardDescription>
                    Enviada ao compartilhar um orçamento com o cliente
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("orcamento")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={mensagens.orcamento}
                onChange={(e) => setMensagens({ ...mensagens, orcamento: e.target.value })}
                rows={10}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Mensagem de Lembrete */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Lembrete</CardTitle>
                  <CardDescription>
                    Enviada para lembrar compromissos agendados
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("lembrete")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={mensagens.lembrete}
                onChange={(e) => setMensagens({ ...mensagens, lembrete: e.target.value })}
                rows={8}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Mensagem de Aniversário */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Aniversário</CardTitle>
                  <CardDescription>
                    Enviada automaticamente no aniversário do cliente
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("aniversario")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={mensagens.aniversario}
                onChange={(e) => setMensagens({ ...mensagens, aniversario: e.target.value })}
                rows={8}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Configurações de PDF */}
        <TabsContent value="pdf" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Personalização de Documentos PDF
              </CardTitle>
              <CardDescription>
                Configure como os documentos PDF serão gerados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">Mostrar Logo da Empresa</Label>
                    <p className="text-sm text-muted-foreground">
                      Incluir logotipo no cabeçalho dos documentos
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={configPDF.mostrarLogo}
                    onChange={(e) => setConfigPDF({ ...configPDF, mostrarLogo: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">Mostrar Endereço</Label>
                    <p className="text-sm text-muted-foreground">
                      Exibir endereço completo no rodapé
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={configPDF.mostrarEndereco}
                    onChange={(e) => setConfigPDF({ ...configPDF, mostrarEndereco: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">Mostrar Informações de Contato</Label>
                    <p className="text-sm text-muted-foreground">
                      Incluir telefone, email e redes sociais
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={configPDF.mostrarContato}
                    onChange={(e) => setConfigPDF({ ...configPDF, mostrarContato: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="rodape">Mensagem de Rodapé</Label>
                <Input
                  id="rodape"
                  value={configPDF.rodape}
                  onChange={(e) => setConfigPDF({ ...configPDF, rodape: e.target.value })}
                  placeholder="Mensagem que aparece no final do documento"
                />
                <p className="text-xs text-muted-foreground">
                  Esta mensagem aparecerá ao final de todos os documentos PDF gerados
                </p>
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
    <ProtectedRoute permission="settings.view">
      <ConfiguracoesPage />
    </ProtectedRoute>
  );
}
