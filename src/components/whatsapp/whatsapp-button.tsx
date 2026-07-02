"use client";

import { Button } from "@/components/ui/button";
import { buildWaMeUrl } from "@/lib/whatsapp-deeplink";
import toast from "react-hot-toast";

interface WhatsAppButtonProps {
  /** Telefone do cliente (qualquer formato BR; normalizado internamente). */
  phone?: string | null;
  /** Texto pronto que a atendente vai colar no WhatsApp. */
  draftText: string;
  /** Rótulo do botão (default: "Avisar no WhatsApp"). */
  label?: string;
  /** Tamanho do Button (shadcn). */
  size?: "sm" | "default" | "lg";
  /** Chamado após abrir o WhatsApp (ex.: registrar "fulana pegou"). */
  onOpened?: () => void;
  className?: string;
}

/**
 * Botão reutilizável "Abrir no WhatsApp".
 *
 * 1 toque = copia o rascunho pro clipboard + abre `wa.me` com o número certo.
 * O sistema NÃO envia a mensagem — a atendente cola e manda do próprio celular.
 * Some quando o telefone é inválido (não abre conversa com número errado).
 * Fallback visível se o clipboard falhar (nunca falha calada).
 */
export function WhatsAppButton({
  phone,
  draftText,
  label = "Avisar no WhatsApp",
  size = "sm",
  onOpened,
  className,
}: WhatsAppButtonProps) {
  const url = buildWaMeUrl(phone);
  if (!url) return null; // sem telefone válido → não renderiza

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      toast.success("Texto copiado ✅ Cola lá no WhatsApp");
    } catch {
      // Clipboard bloqueado (permissão): mostra o texto pra copiar manual.
      toast(`Abri o WhatsApp — copie o texto: ${draftText}`, { duration: 6000 });
    }
    window.open(url, "_blank", "noopener,noreferrer");
    onOpened?.();
  };

  return (
    <Button
      size={size}
      onClick={handleClick}
      className={`bg-[#25D366] hover:bg-[#1da851] text-white ${className ?? ""}`}
    >
      <svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 00-8.6 15l-1.4 5 5.1-1.3A10 10 0 1012 2z" />
      </svg>
      {label}
    </Button>
  );
}
