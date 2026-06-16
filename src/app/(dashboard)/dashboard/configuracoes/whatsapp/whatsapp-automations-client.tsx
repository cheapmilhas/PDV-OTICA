"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Save, Glasses, HeartHandshake, Cake, CalendarClock, Info, Send, Eye } from "lucide-react";

/** Rótulos por tipo para o resumo do disparo manual. */
const RUN_TYPE_LABEL: Record<string, string> = {
  OS_READY: "Óculos pronto",
  POST_SALE: "Pós-venda",
  BIRTHDAY: "Aniversário",
  INSTALLMENT_DUE: "Crediário",
};

interface RunResult {
  sent: number;
  skipped: number;
  failed: number;
  byType: Record<string, { sent: number; skipped: number; failed: number }>;
}

interface PreviewItem {
  type: string;
  customerName: string;
  phone: string;
  content: string;
}

/** Telefone "5511999999999" → "(11) 99999-9999" (best-effort, BR). */
function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const n = d.startsWith("55") ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return raw;
}

interface AutomationState {
  enabled: boolean;
  template: string;
}
interface AutomationsData {
  osReady: AutomationState;
  postSale: AutomationState & { days: number };
  birthday: AutomationState;
  installmentDue: AutomationState;
}

const TYPE_META = {
  osReady: { icon: Glasses, title: "Óculos pronto", desc: "Avisa o cliente quando a OS fica pronta para retirada", transactional: true },
  postSale: { icon: HeartHandshake, title: "Pós-venda", desc: "Mensagem de acompanhamento alguns dias após a entrega", transactional: false },
  birthday: { icon: Cake, title: "Aniversário", desc: "Felicita o cliente no dia do aniversário", transactional: false },
  installmentDue: { icon: CalendarClock, title: "Crediário a vencer", desc: "Lembra a parcela 3 dias antes do vencimento", transactional: true },
} as const;

const PLACEHOLDER_HINT: Record<string, string> = {
  osReady: "{cliente}, {otica}, {os}",
  postSale: "{cliente}, {otica}",
  birthday: "{cliente}, {otica}",
  installmentDue: "{cliente}, {otica}, {valor}, {vencimento}, {parcela}",
};

interface WhatsappAutomationsClientProps {
  /** Chamado após um disparo manual bem-sucedido (para recarregar o Histórico). */
  onProcessed?: () => void;
}

export function WhatsappAutomationsClient({ onProcessed }: WhatsappAutomationsClientProps = {}) {
  const [data, setData] = useState<AutomationsData | null>(null);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/automations");
      const result = await res.json();
      if (result.success) {
        const d = result.data;
        setDefaults(d.defaults);
        setData({
          osReady: { enabled: d.osReady.enabled, template: d.osReady.template ?? "" },
          postSale: { enabled: d.postSale.enabled, template: d.postSale.template ?? "", days: d.postSale.days ?? 7 },
          birthday: { enabled: d.birthday.enabled, template: d.birthday.template ?? "" },
          installmentDue: { enabled: d.installmentDue.enabled, template: d.installmentDue.template ?? "" },
        });
      }
    } catch {
      toast.error("Erro ao carregar automações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/automations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          osReady: { enabled: data.osReady.enabled, template: data.osReady.template },
          postSale: { enabled: data.postSale.enabled, template: data.postSale.template, days: data.postSale.days },
          birthday: { enabled: data.birthday.enabled, template: data.birthday.template },
          installmentDue: { enabled: data.installmentDue.enabled, template: data.installmentDue.template },
        }),
      });
      const result = await res.json();
      if (result.success) toast.success("Automações salvas!");
      else toast.error(result.error?.message || "Erro ao salvar");
    } catch {
      toast.error("Erro ao salvar automações");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setConfirmOpen(false);
    setRunning(true);
    try {
      const res = await fetch("/api/whatsapp/run-now", { method: "POST" });
      const result = await res.json();
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao processar mensagens");
        return;
      }
      const r: RunResult = result.data;
      if (r.sent === 0 && r.skipped === 0 && r.failed === 0) {
        toast.info("Nada pendente para enviar agora.");
      } else {
        const byType = Object.entries(r.byType)
          .map(([type, b]) => {
            const label = RUN_TYPE_LABEL[type] ?? type;
            const parts: string[] = [];
            if (b.sent) parts.push(`${b.sent} enviada${b.sent > 1 ? "s" : ""}`);
            if (b.skipped) parts.push(`${b.skipped} pulada${b.skipped > 1 ? "s" : ""}`);
            if (b.failed) parts.push(`${b.failed} ${b.failed > 1 ? "falharam" : "falhou"}`);
            return `${label}: ${parts.join(", ")}`;
          })
          .join(" · ");
        toast.success(`${r.sent} enviada(s) · ${r.skipped} pulada(s) · ${r.failed} ${r.failed === 1 ? "falhou" : "falharam"}`, {
          description: byType || undefined,
        });
      }
      setPreviewItems(null); // a prévia anterior ficou obsoleta após enviar
      onProcessed?.();
    } catch {
      toast.error("Erro ao processar mensagens");
    } finally {
      setRunning(false);
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/whatsapp/run-now/preview");
      const result = await res.json();
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao pré-visualizar");
        return;
      }
      setPreviewItems(result.data.preview as PreviewItem[]);
    } catch {
      toast.error("Erro ao pré-visualizar");
    } finally {
      setPreviewing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const keys = ["osReady", "postSale", "birthday", "installmentDue"] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          As mensagens são enviadas 1×/dia para a ótica conectada. Deixe o texto em
          branco para usar o padrão. Variáveis entre chaves são preenchidas
          automaticamente. Mensagens de marketing (pós-venda, aniversário) só vão
          para clientes que aceitam receber.
        </p>
      </div>

      <Card className="border-teal-200 bg-teal-50/40">
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-sm">Disparar mensagens agora</p>
              <p className="text-sm text-muted-foreground">
                Veja o que sairia hoje e dispare na hora, sem esperar o envio automático das 9h.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                onClick={handlePreview}
                disabled={previewing || running}
                variant="outline"
                className="border-teal-300 text-teal-700 hover:bg-teal-100 hover:text-teal-800"
              >
                {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                {previewing ? "Carregando…" : "Pré-visualizar"}
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={running || previewing}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {running ? "Processando…" : "Processar agora"}
              </Button>
            </div>
          </div>

          {previewItems !== null && (
            <div className="rounded-md border border-teal-200 bg-white">
              {previewItems.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Nada pendente para enviar agora.
                </p>
              ) : (
                <>
                  <p className="border-b border-teal-100 px-3 py-2 text-xs font-medium text-teal-800">
                    {previewItems.length} mensagem{previewItems.length > 1 ? "s" : ""} sairia{previewItems.length > 1 ? "m" : ""} agora:
                  </p>
                  <ul className="divide-y divide-gray-100 max-h-72 overflow-auto">
                    {previewItems.map((it, i) => (
                      <li key={i} className="px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{it.customerName || "—"}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {RUN_TYPE_LABEL[it.type] ?? it.type} · {fmtPhone(it.phone)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{it.content}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar mensagens agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai enviar imediatamente todas as mensagens pendentes de hoje (óculos pronto,
              aniversário, pós-venda, crediário) para os clientes elegíveis. Mensagens já enviadas
              hoje não são repetidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunNow}>Sim, enviar agora</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {keys.map((key) => {
        const meta = TYPE_META[key];
        const Icon = meta.icon;
        const st = data[key];
        return (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.title}</CardTitle>
                    <CardDescription>{meta.desc}</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={st.enabled}
                  onCheckedChange={(v) => setData({ ...data, [key]: { ...st, enabled: v } })}
                  aria-label={`Ativar automação ${meta.title}`}
                />
              </div>
            </CardHeader>
            {st.enabled && (
              <CardContent className="space-y-3">
                {key === "postSale" && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="postSaleDays" className="text-sm">Dias após a entrega:</Label>
                    <Input
                      id="postSaleDays"
                      type="number"
                      min={1}
                      max={90}
                      value={(data.postSale.days)}
                      onChange={(e) =>
                        setData({ ...data, postSale: { ...data.postSale, days: parseInt(e.target.value) || 7 } })
                      }
                      className="w-20"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor={`tpl-${key}`} className="text-sm">Mensagem</Label>
                  <Textarea
                    id={`tpl-${key}`}
                    value={st.template}
                    onChange={(e) => setData({ ...data, [key]: { ...st, template: e.target.value } })}
                    placeholder={defaults[key === "osReady" ? "OS_READY" : key === "postSale" ? "POST_SALE" : key === "birthday" ? "BIRTHDAY" : "INSTALLMENT_DUE"]}
                    rows={4}
                    className="font-mono text-sm mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variáveis: <code className="bg-muted px-1 rounded">{PLACEHOLDER_HINT[key]}</code>
                    {" · "}Em branco usa o texto padrão.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? "Salvando…" : "Salvar automações"}
        </Button>
      </div>
    </div>
  );
}
