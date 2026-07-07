"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MessageCircle, Sparkles, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Can } from "@/components/permissions/can";

/** Intervalo de polling do inbox (ms). Padrão do projeto p/ telas "ao vivo". */
// Intervalo de polling da lista de conversas. Subiu de 7s→30s para cortar
// invocations no Vercel (o inbox fica aberto o dia todo = fonte dominante de
// chamadas). 30s continua responsivo para o atendimento (mensagens novas
// aparecem em até 30s); ao clicar numa conversa a thread carrega na hora.
const POLL_MS = 30000;

interface InboxConversation {
  id: string;
  contactNumber: string;
  contactName: string | null;
  lastMessageAt: string;
  analyzedAt: string | null;
  needsAnalysis: boolean;
  leadId: string | null;
  messageCount: number;
  lastMessageText: string | null;
  analysisIsLead: boolean | null;
  analysisIntent: string | null;
  analysisCustomerKind: string | null;
  analysisReason: string | null;
  needsHumanAttention: boolean;
  attentionTier: "red" | "soft" | null;
}

interface InboxMessage {
  id: string;
  direction: string;
  type: string;
  text: string | null;
  receivedAt: string;
}

type StatusFilter = "pending" | "all";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function ConversationBadge({ conv }: { conv: InboxConversation }) {
  // Guardrail SAGRADO (Item 1): o alarme de atenção PREVALECE sobre os demais
  // rótulos — é o que o dono não pode perder de vista (reclamação/cobrança/irritado).
  if (conv.attentionTier === "red") {
    return (
      <Badge className="bg-red-600 hover:bg-red-600">⚠️ Precisa de atenção</Badge>
    );
  }
  if (conv.attentionTier === "soft") {
    return (
      <Badge className="border-amber-300 bg-amber-50 text-amber-700" variant="outline">
        Garantia/conserto
      </Badge>
    );
  }
  if (conv.leadId) {
    return <Badge className="bg-green-600 hover:bg-green-600">Lead criado</Badge>;
  }
  if (conv.analyzedAt && !conv.needsAnalysis) {
    return <Badge variant="secondary">Analisada</Badge>;
  }
  return <Badge variant="outline">Pendente</Badge>;
}

/**
 * Inbox de conversas de WhatsApp (aba "Conversas" do Funil).
 * Lista conversas com polling leve (pausa em aba oculta / quando inativo) + thread
 * da conversa selecionada + botão "Analisar com IA" (reusa a rota de qualificação).
 *
 * @param active — true quando a aba "Conversas" está visível. O polling só roda
 *   quando active && documento visível, para não gastar requests à toa.
 */
export function WhatsappInbox({ active }: { active: boolean }) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [qualifyingId, setQualifyingId] = useState<string | null>(null);
  // Copiloto interno: resumo + rascunho (a atendente copia; a IA não envia nada).
  const [copilotLoadingId, setCopilotLoadingId] = useState<string | null>(null);
  const [copilot, setCopilot] = useState<{ convId: string; summary: string; draft: string } | null>(null);
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const fetchConversations = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      try {
        const res = await fetch(`/api/whatsapp/conversations?status=${status}`);
        const json = await res.json();
        setConversations(json.data ?? []);
      } catch {
        // silencioso no polling; o spinner manual mostra erro
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [status],
  );

  // Carga inicial + recarrega ao trocar filtro. Só busca quando a aba está
  // ativa — o componente monta junto com o funil (quando WhatsApp habilitado),
  // mas não deve consultar o banco enquanto o usuário está na aba "Funil".
  useEffect(() => {
    if (!active) return;
    void fetchConversations(true);
  }, [active, fetchConversations]);

  // Polling: só quando a aba está ativa E o documento visível.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (document.visibilityState === "visible") void fetchConversations(false);
    };
    timer = setInterval(tick, POLL_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [active, fetchConversations]);

  // Thread da conversa selecionada. AbortController evita corrida: ao clicar
  // rápido entre conversas, a requisição anterior é cancelada — assim a thread
  // exibida sempre corresponde à conversa selecionada (HIGH-2).
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    const controller = new AbortController();
    setMessagesLoading(true);
    fetch(`/api/whatsapp/conversations/${selectedId}/messages`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => setMessages(json.data ?? []))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error("Erro ao carregar mensagens");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMessagesLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  const handleQualify = useCallback(
    async (id: string) => {
      setQualifyingId(id);
      try {
        const res = await fetch(`/api/whatsapp/conversations/${id}/qualify`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json?.error?.message ?? "Não foi possível analisar agora.");
          return;
        }
        if (json.isLead && json.leadId) {
          toast.success("Lead criado a partir da conversa!");
        } else if (json.skipped === "group") {
          toast("Conversa em grupo — não vira lead.");
        } else if (json.skipped === "no_text") {
          toast("Sem texto suficiente para analisar.");
        } else {
          toast("Analisada: não é um lead.");
        }
        await fetchConversations(false);
      } catch {
        toast.error("Erro ao analisar a conversa.");
      } finally {
        setQualifyingId(null);
      }
    },
    [fetchConversations],
  );

  // Copiloto: pede resumo + rascunho à IA (interno). NÃO envia nada ao cliente.
  const handleCopilot = useCallback(async (id: string) => {
    setCopilotLoadingId(id);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${id}/copilot`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error?.message ?? "Não foi possível gerar o rascunho agora.");
        return;
      }
      setCopilot({ convId: id, summary: json.summary ?? "", draft: json.draft ?? "" });
      setDraftEdit(null);
      if (json.parseError) toast("A IA não conseguiu montar o rascunho — leia a conversa e escreva você.", { duration: 5000 });
    } catch {
      toast.error("Erro ao gerar o rascunho.");
    } finally {
      setCopilotLoadingId(null);
    }
  }, []);

  const copyDraft = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiei ✅ Cola no WhatsApp e ajuste se quiser");
    } catch {
      toast(`Copie o rascunho: ${text}`, { duration: 6000 });
    }
  }, []);

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const handleResolveAttention = useCallback(
    async (id: string) => {
      setResolvingId(id);
      try {
        const res = await fetch(`/api/whatsapp/conversations/${id}/resolve-attention`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json?.error?.message ?? "Não foi possível dar baixa agora.");
          return;
        }
        toast.success("Atenção resolvida.");
        await fetchConversations(false);
      } catch {
        toast.error("Erro ao dar baixa na atenção.");
      } finally {
        setResolvingId(null);
      }
    },
    [fetchConversations],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Lista de conversas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as conversas</SelectItem>
              <SelectItem value="pending">Só pendentes</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchConversations(true)}
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma conversa por aqui ainda.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/50 ${
                  selectedId === conv.id ? "border-primary bg-muted/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {conv.contactName ?? conv.contactNumber}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {conv.lastMessageText ?? "—"}
                    </p>
                  </div>
                  <ConversationBadge conv={conv} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatTime(conv.lastMessageAt)}</span>
                  <span>{conv.messageCount} msg</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thread + ações */}
      <div>
        {!selectedId ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8" />
              <p className="text-sm">Selecione uma conversa para ver as mensagens.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Mensagens</p>
                <div className="flex items-center gap-2">
                  {/* Copiloto: mesma permissão que já gate a tela (leads.access). */}
                  <Can permission="leads.access">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => selectedId && handleCopilot(selectedId)}
                      disabled={copilotLoadingId === selectedId}
                    >
                      {copilotLoadingId === selectedId ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Rascunho da IA
                    </Button>
                  </Can>
                  <Can permission="leads.create">
                    <Button
                      size="sm"
                      onClick={() => handleQualify(selectedId)}
                      disabled={qualifyingId === selectedId}
                    >
                      {qualifyingId === selectedId ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Analisar com IA
                    </Button>
                  </Can>
                </div>
              </div>

              {/* Copiloto INTERNO: resumo + rascunho copiável. A IA NUNCA envia —
                  a atendente copia e manda do próprio celular. */}
              {copilot && copilot.convId === selectedId && (
                <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                  {copilot.summary && (
                    <div>
                      <p className="text-xs font-semibold text-violet-800">🤖 Resumo da IA</p>
                      <p className="text-sm text-gray-700">{copilot.summary}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-violet-800">✍️ Sugestão de resposta (rascunho seu)</p>
                    <textarea
                      className="mt-1 w-full rounded border border-violet-200 bg-white p-2 text-sm"
                      rows={3}
                      value={draftEdit ?? copilot.draft}
                      onChange={(e) => setDraftEdit(e.target.value)}
                    />
                    <div className="mt-1 flex items-center gap-2">
                      <Button size="sm" onClick={() => copyDraft(draftEdit ?? copilot.draft)}>
                        Copiar rascunho
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    ⚠️ Isto é só um rascunho pra você. A IA não manda nada — quem responde é você, no seu WhatsApp.
                  </p>
                </div>
              )}

              {/* Guardrail SAGRADO (Item 1): banner de atenção + baixa humana. Só
                  a ação humana apaga o alarme (a IA nunca o apaga). */}
              {selectedConv?.needsHumanAttention && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs">
                  <span className="font-semibold text-red-700">
                    ⚠️ Esta conversa precisa de atenção humana.
                  </span>
                  <Can permission="leads.edit">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => selectedId && handleResolveAttention(selectedId)}
                      disabled={resolvingId === selectedId}
                    >
                      {resolvingId === selectedId ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Marcar resolvido
                    </Button>
                  </Can>
                </div>
              )}

              {/* Resultado da análise da IA — mostra o PORQUÊ, inclusive quando
                  NÃO virou lead (antes só havia o badge cinza mudo). */}
              {selectedConv?.analyzedAt && selectedConv.analysisIsLead != null && (
                <div
                  className={`rounded-md border p-2.5 text-xs ${
                    selectedConv.analysisIsLead
                      ? "border-green-200 bg-green-50"
                      : "border-border bg-muted/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">
                      {selectedConv.analysisIsLead ? "✓ Virou lead" : "Não é lead"}
                    </span>
                    {selectedConv.analysisIntent && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                        {selectedConv.analysisIntent}
                      </span>
                    )}
                    {selectedConv.analysisCustomerKind && (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700">
                        {selectedConv.analysisCustomerKind}
                      </span>
                    )}
                  </div>
                  {selectedConv.analysisReason && (
                    <p className="mt-1 text-muted-foreground">{selectedConv.analysisReason}</p>
                  )}
                </div>
              )}

              {messagesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sem mensagens.
                </p>
              ) : (
                <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          m.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {m.type !== "text" && !m.text ? (
                          <span className="italic opacity-70">[{m.type}]</span>
                        ) : (
                          m.text
                        )}
                        <div className="mt-1 text-[10px] opacity-60">
                          {formatTime(m.receivedAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
