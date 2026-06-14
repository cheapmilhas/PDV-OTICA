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
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { differenceInCalendarDays } from "date-fns";

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
