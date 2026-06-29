"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  MessageCircle,
  Instagram,
  Search,
  UserPlus,
  Footprints,
  HelpCircle,
  User as UserIcon,
  Clock,
  Tag,
  Sparkles,
  AlertTriangle,
  UserCheck,
  Flame,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { differenceInCalendarDays } from "date-fns";
import { intentLabel, INTENT_OPTIONS } from "@/lib/contact-intent-label";
import { useState } from "react";

/** Estrutura do lead consumida do GET /api/leads (envelope `.data`). */
export interface Lead {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  interest?: string | null;
  source?: string | null;
  stageId: string;
  sellerUserId?: string | null;
  estimatedValue?: number | null;
  lostReason?: string | null;
  lastActivityAt: string;
  updatedAt: string;
  seller?: { id: string; name: string } | null;
  // IA contexto cliente (Fase 1/2)
  intent?: string | null;
  /** Palpite ORIGINAL da IA (telemetria de acurácia, Fase 3) — preservado. */
  intentPredicted?: string | null;
  urgent?: boolean | null;
  contactNotPatient?: boolean | null;
  customerMatchKind?: string | null;
  customer?: { id: string; name: string } | null;
  suggestedCustomer?: { id: string; name: string } | null;
}

interface LeadCardProps {
  lead: Lead;
  /** Confirma/recusa o vínculo de cliente sugerido (chama PATCH + refresh). */
  onConfirmCustomer?: (leadId: string, customerId: string | null) => void;
  /** Corrige a intenção classificada pela IA em 1 clique (telemetria). */
  onCorrectIntent?: (leadId: string, intent: string) => void;
}

const SOURCE_ICON: Record<string, React.ElementType> = {
  WHATSAPP: MessageCircle,
  INSTAGRAM: Instagram,
  GOOGLE: Search,
  REFERRAL: UserPlus,
  WALK_IN: Footprints,
  OTHER: HelpCircle,
};

const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  REFERRAL: "Indicação",
  WALK_IN: "Espontâneo",
  OTHER: "Outro",
};

export function LeadCard({ lead, onConfirmCustomer, onCorrectIntent }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id, data: { lead } });
  const [intentMenuOpen, setIntentMenuOpen] = useState(false);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const SourceIcon = lead.source ? SOURCE_ICON[lead.source] ?? HelpCircle : null;
  const stoppedDays = differenceInCalendarDays(
    new Date(),
    new Date(lead.lastActivityAt)
  );
  // intentLabel já é defensivo (fallback p/ desconhecido, null p/ ausente).
  const intent = intentLabel(lead.intent);
  // Mostra o bloco de badges se QUALQUER sinal existe — extraído p/ legibilidade
  // (cada badge tem seu próprio && interno; esta é só a condição do contêiner).
  const hasBadges =
    !!intent || !!lead.urgent || !!lead.contactNotPatient || !!lead.customer ||
    lead.customerMatchKind === "SINGLE" || lead.source === "REFERRAL";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{lead.name}</p>
        {SourceIcon && (
          <span
            className="flex shrink-0 items-center text-muted-foreground"
            title={lead.source ? SOURCE_LABEL[lead.source] ?? lead.source : ""}
          >
            <SourceIcon className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Badges da IA: intenção + urgente + contato≠paciente + cliente reconhecido */}
      {hasBadges && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {/* Indicação = lead quente (veio por recomendação de outro cliente).
              Ícone Flame (≠ do UserPlus da fonte, no canto) reforça "quente". */}
          {lead.source === "REFERRAL" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700" title="Veio por indicação — lead quente">
              <Flame className="h-2.5 w-2.5" />
              Indicação
            </span>
          )}
          {intent && (
            <span className="relative inline-flex">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onCorrectIntent) setIntentMenuOpen((v) => !v);
                }}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  intent.kind === "venda"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-800"
                } ${onCorrectIntent ? "cursor-pointer hover:ring-1 hover:ring-current" : ""}`}
                title={onCorrectIntent ? "Sugerido pela IA — clique p/ corrigir" : "Sugerido pela IA"}
              >
                <Sparkles className="h-2.5 w-2.5" />
                {intent.label}
              </button>
              {intentMenuOpen && onCorrectIntent && (
                // Overlay invisível: clicar em qualquer lugar fora fecha o menu
                // (o z-20 do menu supera o z-10 do overlay). stopPropagation no
                // onPointerDown evita que o clique vire arrasto do card (dnd-kit).
                <div
                  className="fixed inset-0 z-10"
                  onPointerDown={(e) => { e.stopPropagation(); setIntentMenuOpen(false); }}
                />
              )}
              {intentMenuOpen && onCorrectIntent && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full z-20 mt-1 max-h-56 w-44 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
                >
                  <p className="px-2 py-1 text-[9px] font-semibold uppercase text-muted-foreground">
                    Corrigir intenção
                  </p>
                  {INTENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIntentMenuOpen(false);
                        if (opt.value !== lead.intent) onCorrectIntent(lead.id, opt.value);
                      }}
                      className={`flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] hover:bg-muted ${
                        opt.value === lead.intent ? "font-semibold text-primary" : ""
                      }`}
                    >
                      {opt.value === lead.intent && "✓ "}
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
          {lead.urgent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
              <AlertTriangle className="h-2.5 w-2.5" />
              Urgente
            </span>
          )}
          {lead.customer ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700" title={`Vinculado a ${lead.customer.name}`}>
              <UserCheck className="h-2.5 w-2.5" />
              {lead.customer.name}
            </span>
          ) : lead.suggestedCustomer && onConfirmCustomer ? (
            // Botões de 1 clique: o cancelamento do drag é o stopPropagation no
            // onPointerDown (o card é draggable; sem isso o clique vira arrasto).
            <span className="inline-flex items-center gap-1 text-[10px]">
              <span className="text-green-700">É {lead.suggestedCustomer.name}?</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onConfirmCustomer(lead.id, lead.suggestedCustomer!.id); }}
                className="rounded-full bg-green-600 px-2 py-0.5 font-medium text-white hover:bg-green-700"
              >
                Sim ✓
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onConfirmCustomer(lead.id, null); }}
                className="rounded-full border border-border px-2 py-0.5 font-medium text-muted-foreground hover:bg-muted"
              >
                Não
              </button>
            </span>
          ) : null}
          {lead.contactNotPatient && (
            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700" title="O contato fala em nome de outra pessoa">
              fala por outro
            </span>
          )}
        </div>
      )}

      {lead.interest && (
        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          <Tag className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{lead.interest}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {lead.seller?.name && (
          <span className="flex items-center gap-1">
            <UserIcon className="h-3 w-3" />
            <span className="truncate max-w-[120px]">{lead.seller.name}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {stoppedDays <= 0 ? "Hoje" : `Parado há ${stoppedDays}d`}
        </span>
      </div>

      {lead.estimatedValue != null && lead.estimatedValue > 0 && (
        <p className="mt-2 text-sm font-semibold text-primary">
          {formatCurrency(lead.estimatedValue)}
        </p>
      )}

      {lead.lostReason && (
        <p className="mt-1 text-xs text-red-600">Motivo: {lead.lostReason}</p>
      )}
    </div>
  );
}
