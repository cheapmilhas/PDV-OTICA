"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const campaignSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  scope: z.enum(["SELLER", "BRANCH", "BOTH"]),
  startDate: z.string().min(1, "Data inicial é obrigatória"),
  endDate: z.string().min(1, "Data final é obrigatória"),
  bonusType: z.enum(["PER_UNIT", "MINIMUM_FIXED", "MINIMUM_PER_UNIT", "PER_PACKAGE", "TIERED"]),
  countMode: z.enum(["BY_QUANTITY", "BY_ITEM", "BY_SALE"]),
  allowStacking: z.boolean().default(false),
  priority: z.number().int().default(0),

  // Campos específicos
  bonusPerUnit: z.number().optional(),
  minimumCount: z.number().int().optional(),
  minimumCountMode: z.enum(["AFTER_MINIMUM", "FROM_MINIMUM"]).optional(),
  fixedBonusAmount: z.number().optional(),
  packageSize: z.number().int().optional(),
  bonusPerPackage: z.number().optional(),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

interface CampaignFormProps {
  campaign?: any;
  onSuccess: () => void;
}

export function CampaignForm({ campaign, onSuccess }: CampaignFormProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema) as any,
    defaultValues: campaign
      ? {
          name: campaign.name,
          description: campaign.description || "",
          scope: campaign.scope,
          startDate: new Date(campaign.startDate).toISOString().split("T")[0],
          endDate: new Date(campaign.endDate).toISOString().split("T")[0],
          bonusType: campaign.bonusType,
          countMode: campaign.countMode,
          allowStacking: campaign.allowStacking,
          priority: campaign.priority,
          bonusPerUnit: campaign.bonusPerUnit || undefined,
          minimumCount: campaign.minimumCount || undefined,
          minimumCountMode: campaign.minimumCountMode || undefined,
          fixedBonusAmount: campaign.fixedBonusAmount || undefined,
          packageSize: campaign.packageSize || undefined,
          bonusPerPackage: campaign.bonusPerPackage || undefined,
        }
      : {
          scope: "SELLER",
          bonusType: "PER_UNIT",
          countMode: "BY_QUANTITY",
          allowStacking: false,
          priority: 0,
        },
  });

  const bonusType = form.watch("bonusType");

  const onSubmit = async (data: CampaignFormData) => {
    try {
      setLoading(true);

      const payload = {
        ...data,
        items: [], // Por enquanto, sem filtros de produtos
      };

      const url = campaign
        ? `/api/product-campaigns/${campaign.id}`
        : "/api/product-campaigns";
      const method = campaign ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: campaign ? "Campanha atualizada" : "Campanha criada",
          description: result.message,
        });
        onSuccess();
      } else {
        throw new Error(result.error?.message || "Erro ao salvar campanha");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao salvar campanha",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informações Básicas */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Informações Básicas</h3>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da Campanha</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Promoção Verão 2024" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Descreva os objetivos e regras da campanha"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Início</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Término</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Configurações da Campanha */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Configurações</h3>

          <FormField
            control={form.control}
            name="scope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Escopo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o escopo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="SELLER">Vendedor</SelectItem>
                    <SelectItem value="BRANCH">Filial</SelectItem>
                    <SelectItem value="BOTH">Ambos</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Define se a bonificação é por vendedor, filial ou ambos
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="countMode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modo de Contagem</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="BY_QUANTITY">Por Quantidade</SelectItem>
                    <SelectItem value="BY_ITEM">Por Item</SelectItem>
                    <SelectItem value="BY_SALE">Por Venda</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Como os produtos são contabilizados para bonificação
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>Maior valor = maior prioridade</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="allowStacking"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Permitir Empilhamento</FormLabel>
                    <FormDescription>
                      Permite acumular com outras campanhas
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Tipo de Bonificação */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Tipo de Bonificação</h3>

          <FormField
            control={form.control}
            name="bonusType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="PER_UNIT">Por Unidade</SelectItem>
                    <SelectItem value="MINIMUM_FIXED">Mínimo Fixo</SelectItem>
                    <SelectItem value="MINIMUM_PER_UNIT">Mínimo por Unidade</SelectItem>
                    <SelectItem value="PER_PACKAGE">Por Pacote</SelectItem>
                    <SelectItem value="TIERED">Faixas Progressivas</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Campos específicos por tipo */}
          {bonusType === "PER_UNIT" && (
            <FormField
              control={form.control}
              name="bonusPerUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bônus por Unidade (R$)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Valor de bônus para cada unidade vendida
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {bonusType === "MINIMUM_FIXED" && (
            <>
              <FormField
                control={form.control}
                name="minimumCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade Mínima</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fixedBonusAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bônus Fixo (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Bônus fixo ao atingir a quantidade mínima
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {bonusType === "MINIMUM_PER_UNIT" && (
            <>
              <FormField
                control={form.control}
                name="minimumCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade Mínima</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bonusPerUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bônus por Unidade (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minimumCountMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modo de Contagem do Mínimo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o modo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="AFTER_MINIMUM">Após o Mínimo</SelectItem>
                        <SelectItem value="FROM_MINIMUM">A Partir do Mínimo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Define se conta a partir do mínimo ou apenas acima dele
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {bonusType === "PER_PACKAGE" && (
            <>
              <FormField
                control={form.control}
                name="packageSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tamanho do Pacote</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Quantidade de unidades por pacote
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bonusPerPackage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bônus por Pacote (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {bonusType === "TIERED" && (
            <div className="p-4 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">
                Faixas progressivas devem ser configuradas manualmente no JSON após a criação
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {campaign ? "Atualizar Campanha" : "Criar Campanha"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
