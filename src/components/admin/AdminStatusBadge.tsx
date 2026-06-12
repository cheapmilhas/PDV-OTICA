import { StatusBadge } from "@/components/ui/status-badge";
import { adminStatusVariant, adminStatusLabel, type StatusKind } from "@/lib/admin-status";

interface AdminStatusBadgeProps {
  kind: StatusKind;
  status: string;
  children?: React.ReactNode;
  className?: string;
}

export function AdminStatusBadge({ kind, status, children, className }: AdminStatusBadgeProps) {
  return (
    <StatusBadge variant={adminStatusVariant(kind, status)} className={className}>
      {children ?? adminStatusLabel(kind, status)}
    </StatusBadge>
  );
}
