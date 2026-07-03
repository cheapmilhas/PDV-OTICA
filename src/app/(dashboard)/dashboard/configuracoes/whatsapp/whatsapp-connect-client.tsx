"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft,
  MessageCircle,
  Smartphone,
  QrCode,
  RefreshCw,
  Power,
  Loader2,
  WifiOff,
  CheckCircle2,
  ShieldCheck,
  Lock,
} from "lucide-react";

type ConnStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "FAILED";

interface StatusData {
  status: ConnStatus;
  connectedNumber: string | null;
  connectedAt?: string | null;
  lastEventAt?: string | null;
  evolutionReachable: boolean;
  practicesAccepted?: boolean;
}

interface ConnectData {
  status: ConnStatus;
  qrBase64: string | null;
  pairingCode: string | null;
}

const POLL_MS = 3000;

/** Formata 5511999999999 → +55 (11) 99999-9999 (best-effort, mantém o resto). */
function formatNumber(raw: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 13) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return `+${d}`;
}

export function WhatsappConnectClient() {
  const router = useRouter();

  const [status, setStatus] = useState<ConnStatus>("DISCONNECTED");
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);
  const [reachable, setReachable] = useState(true);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [practicesAccepted, setPracticesAccepted] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const result = await res.json();
      if (result.success) {
        const d = result.data as StatusData;
        setStatus(d.status);
        setConnectedNumber(d.connectedNumber);
        setReachable(d.evolutionReachable);
        if (d.practicesAccepted) setPracticesAccepted(true);
        // Conexão concluída pelo celular → limpa o QR.
        if (d.status === "CONNECTED") {
          setQrBase64(null);
          setPairingCode(null);
        }
      }
    } catch {
      setReachable(false);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Carrega o status inicial.
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling enquanto está conectando (aguardando leitura do QR).
  useEffect(() => {
    if (status === "CONNECTING") {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, POLL_MS);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status, fetchStatus]);

  // Marca o aceite das boas-práticas (otimista). Persiste no servidor; se falhar,
  // não bloqueia a UI (o aceite reaparecerá no próximo carregamento se não gravou).
  function acceptPractices() {
    setPracticesAccepted(true);
    fetch("/api/whatsapp/accept-practices", { method: "POST" }).catch(() => {});
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const result = await res.json();
      if (result.success) {
        const d = result.data as ConnectData;
        setStatus("CONNECTING");
        setQrBase64(d.qrBase64);
        setPairingCode(d.pairingCode);
        setReachable(true);
        if (!d.qrBase64) {
          toast.info("Instância criada. Aguardando o QR Code…");
        }
      } else {
        toast.error(result.error || "Não foi possível iniciar a conexão.");
      }
    } catch {
      toast.error("Erro ao conectar. Verifique se o serviço está disponível.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleRefreshQr() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/whatsapp/refresh-qr");
      const result = await res.json();
      if (result.success) {
        const d = result.data as ConnectData;
        setQrBase64(d.qrBase64);
        setPairingCode(d.pairingCode);
        setStatus("CONNECTING");
      } else {
        toast.error(result.error || "Não foi possível gerar um novo QR Code.");
      }
    } catch {
      toast.error("Erro ao gerar novo QR Code.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleArchiveOldNumber() {
    setArchiving(true);
    try {
      // Preview: conversas anteriores à troca DETECTADA automaticamente.
      const previewRes = await fetch("/api/whatsapp/archive-old-number");
      const preview = await previewRes.json();
      const count = preview?.data?.archived ?? 0;

      let mode: "detected" | "all-current" = "detected";
      if (count > 0) {
        if (
          !confirm(
            `Detectamos ${count} conversa(s) do número anterior. Arquivar? Elas ` +
              `saem do funil ativo (Conversas e Recuperar), mas ficam no histórico. ` +
              `Você pode desfazer.`,
          )
        ) {
          return;
        }
      } else {
        // Sem troca detectada (ex.: você trocou antes desta opção existir).
        // Oferece arquivar TUDO que está no funil hoje — o que fica ativo é só
        // o que chegar do número novo daqui pra frente.
        if (
          !confirm(
            "Não detectamos uma troca de número automática. Se você JÁ trocou o " +
              "número, deseja arquivar TODAS as conversas atuais? Elas saem do " +
              "funil ativo mas ficam no histórico (reversível). O que chegar do " +
              "número novo a partir de agora aparece normalmente.",
          )
        ) {
          return;
        }
        mode = "all-current";
      }

      const res = await fetch("/api/whatsapp/archive-old-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", mode }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`${result.data.archived} conversa(s) arquivada(s).`);
      } else {
        toast.error(result.error || "Não foi possível arquivar.");
      }
    } catch {
      toast.error("Erro ao arquivar conversas.");
    } finally {
      setArchiving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar o WhatsApp desta ótica?")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      const result = await res.json();
      if (result.success) {
        setStatus("DISCONNECTED");
        setConnectedNumber(null);
        setQrBase64(null);
        setPairingCode(null);
        toast.success("WhatsApp desconectado.");
      } else {
        toast.error(result.error || "Não foi possível desconectar.");
      }
    } catch {
      toast.error("Erro ao desconectar.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/configuracoes")}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Conecte o WhatsApp da sua ótica para envio de mensagens
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Conexão</CardTitle>
              <CardDescription>
                Status do número de WhatsApp desta ótica
              </CardDescription>
            </div>
            <StatusBadge status={status} loading={loadingStatus} reachable={reachable} />
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Aviso de serviço indisponível */}
          {!reachable && !loadingStatus && (
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <WifiOff className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                Serviço de WhatsApp indisponível no momento. O status pode estar
                desatualizado. Tente novamente em instantes.
              </p>
            </div>
          )}

          {loadingStatus ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando conexão…
            </div>
          ) : status === "CONNECTED" ? (
            <ConnectedView
              number={connectedNumber}
              onDisconnect={handleDisconnect}
              disconnecting={disconnecting}
            />
          ) : status === "CONNECTING" ? (
            <ConnectingView
              qrBase64={qrBase64}
              pairingCode={pairingCode}
              onRefresh={handleRefreshQr}
              refreshing={refreshing}
              onCancel={handleDisconnect}
              disconnecting={disconnecting}
            />
          ) : (
            <DisconnectedView
              onConnect={handleConnect}
              connecting={connecting}
              practicesAccepted={practicesAccepted}
              onAcceptPractices={acceptPractices}
            />
          )}
        </CardContent>
      </Card>

      {status === "CONNECTED" && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Trocou de número?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se você conectou um número diferente do anterior, arquive as
              conversas do número antigo. Elas saem da aba Conversas e do
              Recuperar (não dá mais para responder por ali), mas continuam no
              histórico. Você pode desfazer depois.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleArchiveOldNumber}
              disabled={archiving}
            >
              {archiving ? "Arquivando…" : "Arquivar conversas do número anterior"}
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        A conexão usa o app WhatsApp do seu celular (igual ao WhatsApp Web).
        Mantenha o celular conectado à internet.
      </p>
    </div>
  );
}

function StatusBadge({
  status,
  loading,
  reachable,
}: {
  status: ConnStatus;
  loading: boolean;
  reachable: boolean;
}) {
  if (loading) {
    return <Badge variant="secondary">Verificando…</Badge>;
  }
  if (!reachable) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        Indisponível
      </Badge>
    );
  }
  if (status === "CONNECTED") {
    return (
      <Badge className="bg-teal-600 hover:bg-teal-600">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Conectado
      </Badge>
    );
  }
  if (status === "CONNECTING") {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Conectando
      </Badge>
    );
  }
  return <Badge variant="secondary">Desconectado</Badge>;
}

/** Boas-práticas anti-bloqueio + checkbox de aceite, antes de conectar. */
function PracticesCard({
  accepted,
  onAccept,
}: {
  accepted: boolean;
  onAccept: () => void;
}) {
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-6 text-left">
      <div className="flex items-center gap-2.5 text-teal-900">
        <ShieldCheck className="h-5 w-5 flex-shrink-0" />
        <p className="font-semibold">Antes de conectar: boas práticas para não bloquear o número</p>
      </div>
      <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-teal-900/90 list-disc pl-5 marker:text-teal-500">
        <li>Use um número que <span className="font-medium">não envie spam</span> e que os clientes reconheçam.</li>
        <li>As mensagens saem <span className="font-medium">aos poucos</span> e só no horário comercial (8h às 18h, dias úteis).</li>
        <li>Envie só para clientes que <span className="font-medium">esperam</span> seu contato (OS, crediário, pós-venda).</li>
        <li>Respeite quem pedir para <span className="font-medium">parar</span>: o descadastro é automático.</li>
        <li>Evite disparos em massa: começar devagar protege seu número de bloqueio.</li>
      </ul>
      <label className="mt-5 flex items-start gap-2.5 cursor-pointer select-none rounded-md border border-transparent p-2 -mx-2 transition-colors hover:bg-teal-100/40">
        <Checkbox
          checked={accepted}
          onCheckedChange={(v) => {
            if (v === true && !accepted) onAccept();
          }}
          disabled={accepted}
          className="mt-0.5"
        />
        <span className="text-sm font-medium text-teal-900">
          Li e entendo as boas práticas para manter meu WhatsApp seguro.
        </span>
      </label>
    </div>
  );
}

function DisconnectedView({
  onConnect,
  connecting,
  practicesAccepted,
  onAcceptPractices,
}: {
  onConnect: () => void;
  connecting: boolean;
  practicesAccepted: boolean;
  onAcceptPractices: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      {!practicesAccepted && (
        <PracticesCard accepted={practicesAccepted} onAccept={onAcceptPractices} />
      )}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Smartphone className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">Nenhum WhatsApp conectado</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Clique em conectar e leia o QR Code com o WhatsApp do celular da ótica.
        </p>
      </div>
      <Button onClick={onConnect} disabled={connecting || !practicesAccepted} size="lg">
        {connecting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <QrCode className="h-4 w-4 mr-2" />
        )}
        {connecting ? "Iniciando…" : "Conectar WhatsApp"}
      </Button>
      {!practicesAccepted && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          Marque a confirmação acima para liberar a conexão.
        </p>
      )}
    </div>
  );
}

function ConnectingView({
  qrBase64,
  pairingCode,
  onRefresh,
  refreshing,
  onCancel,
  disconnecting,
}: {
  qrBase64: string | null;
  pairingCode: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  onCancel: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <ol className="space-y-3 self-start text-left">
        {[
          <>Abra o WhatsApp no celular da ótica</>,
          <>Toque em <span className="font-medium text-foreground">Aparelhos conectados</span></>,
          <>Toque em <span className="font-medium text-foreground">Conectar um aparelho</span> e aponte para o QR abaixo</>,
        ].map((step, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex h-64 w-64 items-center justify-center rounded-lg border-2 border-dashed border-border bg-white p-2">
        {qrBase64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrBase64} alt="QR Code para conectar o WhatsApp" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Gerando QR Code…</span>
          </div>
        )}
      </div>

      {pairingCode && (
        <p className="text-sm text-muted-foreground">
          Ou use o código de pareamento:{" "}
          <span className="font-mono font-semibold tracking-widest text-foreground">
            {pairingCode}
          </span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Gerando…" : "Gerar novo QR"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={disconnecting}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function ConnectedView({
  number,
  onDisconnect,
  disconnecting,
}: {
  number: string | null;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-teal-900">WhatsApp conectado</p>
          <p className="text-sm text-teal-700">
            {number ? formatNumber(number) : "Número conectado"}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="text-destructive hover:text-destructive"
        >
          {disconnecting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Power className="h-4 w-4 mr-2" />
          )}
          {disconnecting ? "Desconectando…" : "Desconectar"}
        </Button>
      </div>
    </div>
  );
}
