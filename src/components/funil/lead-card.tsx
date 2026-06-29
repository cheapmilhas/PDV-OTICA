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
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { differenceInCalendarDays } from "date-fns";
import { intentLabel } from "@/lib/contact-intent-label";

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
  urgent?: boolean | null;
  contactNotPatient?: boolean | null;
  customerMatchKind?: string | null;
  customer?: { id: string; name: string } | null;
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

interface LeadCardProps {
  lead: Lead;
}

export function LeadCard({ lead }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id, data: { lead } });

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
      {(intent || lead.urgent || lead.contactNotPatient || lead.customer || lead.customerMatchKind === "SINGLE") && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {intent && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                intent.kind === "venda"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-amber-100 text-amber-800"
              }`}
              title="Sugerido pela IA"
            >
              <Sparkles className="h-2.5 w-2.5" />
              {intent.label}
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
              Cliente
            </span>
          ) : lead.customerMatchKind === "SINGLE" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-green-400 px-2 py-0.5 text-[10px] font-medium text-green-700" title="A IA encontrou um cliente parecido — confirme na ficha">
              <UserCheck className="h-2.5 w-2.5" />
              Cliente? confirmar
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
