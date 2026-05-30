"use client";

import { osDisplayNumber } from "@/lib/os-number";
import { useState, useCallback, useEffect, memo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  AlertTriangle,
  Clock,
  Eye,
  GripVertical,
  Loader2,
  ChevronDown,
  Shield,
  RotateCcw,
  FileText,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInCalendarDays } from "date-fns";
import { formatDateBR } from "@/lib/date-utils";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { ServiceOrderStatus } from "@prisma/client";

// ===== TYPES =====
interface ServiceOrder {
  id: string;
  number: number;
  status: string;
  priority: string;
  promisedDate?: string;
  isDelayed: boolean;
  delayDays?: number;
  isWarranty: boolean;
  isRework: boolean;
  isMedicalError?: boolean;
  warrantySeq?: number | null;
  originalOrder?: { number?: number | null } | null;
  totalAmount?: number;
  createdAt: string;
  hasPrescription?: boolean;
  customer: { id: string; name: string; cpf?: string; phone?: string };
  laboratory?: { id: string; name: string };
  sale?: { id: string } | null;
  _count: { items: number };
}

interface KanbanColumn {
  status: ServiceOrderStatus;
  label: string;
  colorClass: string;
  headerBg: string;
  orders: ServiceOrder[];
  total: number;
  delayedCount: number;
  page: number;
  hasMore: boolean;
  loading: boolean;
}

interface KanbanBoardProps {
  search: string;
  activeBranchId: string;
  onRefresh: () => void;
}

// ===== CONSTANTS =====
const KANBAN_COLUMNS: {
  status: ServiceOrderStatus;
  label: string;
  colorClass: string;
  headerBg: string;
}[] = [
  { status: "DRAFT", label: "Rascunho", colorClass: "border-gray-300", headerBg: "bg-gray-100 text-gray-700" },
  { status: "APPROVED", label: "Aprovada", colorClass: "border-blue-300", headerBg: "bg-blue-100 text-blue-700" },
  { status: "SENT_TO_LAB", label: "No Lab", colorClass: "border-purple-300", headerBg: "bg-purple-100 text-purple-700" },
  { status: "IN_PROGRESS", label: "Em Produção", colorClass: "border-yellow-300", headerBg: "bg-yellow-100 text-yellow-700" },
  { status: "READY", label: "Pronta", colorClass: "border-green-300", headerBg: "bg-green-100 text-green-700" },
  { status: "DELIVERED", label: "Entregue", colorClass: "border-emerald-300", headerBg: "bg-emerald-100 text-emerald-700" },
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["APPROVED"],
  APPROVED: ["SENT_TO_LAB", "IN_PROGRESS"],
  SENT_TO_LAB: ["IN_PROGRESS"],
  IN_PROGRESS: ["READY"],
  READY: ["DELIVERED"],
  DELIVERED: [],
};

const ADMIN_REVERT_TRANSITIONS: Record<string, string[]> = {
  DELIVERED: ["READY"],
  READY: ["IN_PROGRESS", "SENT_TO_LAB"],
  IN_PROGRESS: ["SENT_TO_LAB", "APPROVED"],
  SENT_TO_LAB: ["APPROVED"],
  APPROVED: ["DRAFT"],
};

const PAGE_SIZE = 20;

// ===== HELPERS =====
function isOrderDelayed(order: ServiceOrder): boolean {
  if (!order.promisedDate) return false;
  if (["DELIVERED", "CANCELED"].includes(order.status)) return false;
  return new Date(order.promisedDate) < new Date();
}

function getDelayDays(promisedDate: string): number {
  return differenceInCalendarDays(new Date(), new Date(promisedDate));
}

function getSlaColor(order: ServiceOrder): string {
  if (!order.promisedDate) return "";
  if (["DELIVERED", "CANCELED"].includes(order.status)) return "";
  const daysLeft = differenceInCalendarDays(new Date(order.promisedDate), new Date());
  if (daysLeft < 0) return "border-l-red-500";
  if (daysLeft <= 1) return "border-l-yellow-500";
  return "border-l-green-500";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function osNum(order: ServiceOrder): string {
  return osDisplayNumber(order);
}

function isValidTransition(from: string, to: string, isAdmin: boolean): boolean {
  const forward = VALID_TRANSITIONS[from]?.includes(to) || false;
  if (forward) return true;
  if (isAdmin) {
    return ADMIN_REVERT_TRANSITIONS[from]?.includes(to) || false;
  }
  return false;
}

// ===== KANBAN CARD =====
const KanbanCard = memo(function KanbanCard({
  order,
  isDragging,
}: {
  order: ServiceOrder;
  isDragging?: boolean;
}) {
  const router = useRouter();
  const delayed = isOrderDelayed(order);
  const slaColor = getSlaColor(order);

  return (
    <div
      className={`
        bg-white rounded-lg border shadow-sm p-3 cursor-grab active:cursor-grabbing
        transition-shadow hover:shadow-md
        ${slaColor ? `border-l-4 ${slaColor}` : ""}
        ${delayed ? "ring-1 ring-red-200" : ""}
        ${isDragging ? "opacity-50 shadow-lg scale-105" : ""}
      `}
    >
      {/* Header: OS number + priority */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-black text-blue-700">{osNum(order)}</span>
        <div className="flex items-center gap-1">
          {order.isWarranty && (
            <Shield className="h-3.5 w-3.5 text-blue-500" />
          )}
          {order.isRework && (
            <RotateCcw className="h-3.5 w-3.5 text-orange-500" />
          )}
          {order.isMedicalError && (
            <Stethoscope className="h-3.5 w-3.5 text-red-500" aria-label="Erro médico" />
          )}
          {order.hasPrescription === false && order.status !== "CANCELED" && (
            <FileText className="h-3.5 w-3.5 text-amber-500" aria-label="Sem receita" />
          )}
          <GripVertical className="h-3.5 w-3.5 text-gray-400" />
        </div>
      </div>

      {/* Customer name */}
      <p className="text-sm font-medium text-gray-900 truncate mb-1.5">
        {order.customer.name}
      </p>

      {/* Total amount if available */}
      {order.totalAmount != null && order.totalAmount > 0 && (
        <p className="text-sm font-semibold text-gray-700 mb-1.5">
          {formatCurrency(order.totalAmount)}
        </p>
      )}

      {/* Promised date + SLA */}
      {order.promisedDate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <Clock className="h-3 w-3" />
          <span>{formatDateBR(order.promisedDate)}</span>
        </div>
      )}

      {/* Delay badge */}
      {delayed && order.promisedDate && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-300 mt-1">
          <AlertTriangle className="h-3 w-3" />
          Atrasada {getDelayDays(order.promisedDate)}d
        </span>
      )}

      {/* Quick view button */}
      <div className="mt-2 pt-2 border-t">
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/dashboard/ordens-servico/${order.id}/detalhes`);
          }}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Eye className="h-3 w-3" />
          Ver detalhes
        </button>
      </div>
    </div>
  );
});

// ===== SORTABLE CARD WRAPPER =====
function SortableCard({ order }: { order: ServiceOrder }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: order.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard order={order} isDragging={isDragging} />
    </div>
  );
}

// ===== DROPPABLE COLUMN =====
function KanbanColumnComponent({
  column,
  onLoadMore,
}: {
  column: KanbanColumn;
  onLoadMore: (status: ServiceOrderStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col min-w-[280px] max-w-[320px] rounded-xl border-2 bg-gray-50/50
        transition-colors
        ${column.colorClass}
        ${isOver ? "bg-blue-50/50 border-blue-400" : ""}
      `}
    >
      {/* Column header */}
      <div className={`px-3 py-2.5 rounded-t-[10px] ${column.headerBg}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">{column.label}</h3>
          <div className="flex items-center gap-1.5">
            {column.delayedCount > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300">
                <AlertTriangle className="h-3 w-3" />
                {column.delayedCount}
              </span>
            )}
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-xs font-bold bg-white/70 text-gray-700">
              {column.total}
            </span>
          </div>
        </div>
      </div>

      {/* Column body with cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[100px]">
        <SortableContext
          items={column.orders.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.orders.map((order) => (
            <SortableCard key={order.id} order={order} />
          ))}
        </SortableContext>

        {column.orders.length === 0 && !column.loading && (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            Nenhuma OS
          </div>
        )}

        {column.loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Load more button */}
        {column.hasMore && !column.loading && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-gray-700"
            onClick={() => onLoadMore(column.status)}
          >
            <ChevronDown className="h-3.5 w-3.5 mr-1" />
            Carregar mais
          </Button>
        )}
      </div>
    </div>
  );
}

// ===== MAIN KANBAN BOARD =====
export function KanbanBoard({ search, activeBranchId, onRefresh }: KanbanBoardProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>(
    KANBAN_COLUMNS.map((col) => ({
      ...col,
      orders: [],
      total: 0,
      delayedCount: 0,
      page: 1,
      hasMore: false,
      loading: true,
    }))
  );
  const [activeOrder, setActiveOrder] = useState<ServiceOrder | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Fetch orders for a specific column
  const fetchColumn = useCallback(
    async (status: ServiceOrderStatus, page: number, append: boolean) => {
      const params = new URLSearchParams({
        orderStatus: status,
        page: page.toString(),
        pageSize: PAGE_SIZE.toString(),
        status: "todos",
        sortBy: "promisedDate",
        sortOrder: "asc",
      });
      if (search) params.set("search", search);
      if (activeBranchId !== "ALL") params.set("branchId", activeBranchId);

      try {
        const res = await fetch(`/api/service-orders?${params}`);
        if (!res.ok) throw new Error("Erro ao carregar");
        const json = await res.json();
        const orders: ServiceOrder[] = json.data || [];
        const total: number = json.pagination?.total || 0;
        const hasMore = page * PAGE_SIZE < total;
        const delayedCount = orders.filter(isOrderDelayed).length;

        setColumns((prev) =>
          prev.map((col) => {
            if (col.status !== status) return col;
            const newOrders = append ? [...col.orders, ...orders] : orders;
            const totalDelayed = newOrders.filter(isOrderDelayed).length;
            return {
              ...col,
              orders: newOrders,
              total,
              delayedCount: totalDelayed,
              page,
              hasMore,
              loading: false,
            };
          })
        );
      } catch {
        setColumns((prev) =>
          prev.map((col) =>
            col.status === status ? { ...col, loading: false } : col
          )
        );
      }
    },
    [search, activeBranchId]
  );

  // Initial load: fetch all columns in parallel
  useEffect(() => {
    setColumns((prev) =>
      prev.map((col) => ({ ...col, loading: true, orders: [], page: 1 }))
    );
    KANBAN_COLUMNS.forEach((col) => {
      fetchColumn(col.status, 1, false);
    });
  }, [fetchColumn]);

  const handleLoadMore = useCallback(
    (status: ServiceOrderStatus) => {
      const col = columns.find((c) => c.status === status);
      if (!col || col.loading || !col.hasMore) return;
      setColumns((prev) =>
        prev.map((c) => (c.status === status ? { ...c, loading: true } : c))
      );
      fetchColumn(status, col.page + 1, true);
    },
    [columns, fetchColumn]
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const orderId = event.active.id as string;
      for (const col of columns) {
        const found = col.orders.find((o) => o.id === orderId);
        if (found) {
          setActiveOrder(found);
          break;
        }
      }
    },
    [columns]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveOrder(null);
      const { active, over } = event;

      if (!over) return;

      const orderId = active.id as string;
      const targetStatus = over.id as string;

      // Find the order and its current column
      let sourceOrder: ServiceOrder | undefined;
      let sourceStatus: string | undefined;

      for (const col of columns) {
        const found = col.orders.find((o) => o.id === orderId);
        if (found) {
          sourceOrder = found;
          sourceStatus = col.status;
          break;
        }
      }

      if (!sourceOrder || !sourceStatus || sourceStatus === targetStatus) return;

      // Check if transition is valid (forward only for non-admin; admin can revert)
      // We'll try forward first, and if API returns error, we revert
      const forwardValid = VALID_TRANSITIONS[sourceStatus]?.includes(targetStatus) || false;
      const revertValid = ADMIN_REVERT_TRANSITIONS[sourceStatus]?.includes(targetStatus) || false;

      if (!forwardValid && !revertValid) {
        toast.error(`Transição de "${getColumnLabel(sourceStatus)}" para "${getColumnLabel(targetStatus)}" não é permitida`);
        return;
      }

      // Optimistic update
      setMovingId(orderId);
      const updatedOrder = { ...sourceOrder, status: targetStatus };

      setColumns((prev) =>
        prev.map((col) => {
          if (col.status === sourceStatus) {
            return {
              ...col,
              orders: col.orders.filter((o) => o.id !== orderId),
              total: col.total - 1,
              delayedCount: col.orders.filter((o) => o.id !== orderId).filter(isOrderDelayed).length,
            };
          }
          if (col.status === targetStatus) {
            const newOrders = [...col.orders, updatedOrder as ServiceOrder];
            return {
              ...col,
              orders: newOrders,
              total: col.total + 1,
              delayedCount: newOrders.filter(isOrderDelayed).length,
            };
          }
          return col;
        })
      );

      // API call
      try {
        const res = await fetch(`/api/service-orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || "Erro ao atualizar status");
        }

        toast.success(`OS ${osNum(sourceOrder)} movida para "${getColumnLabel(targetStatus)}"`);
        onRefresh();
      } catch (e: unknown) {
        // Revert optimistic update
        setColumns((prev) =>
          prev.map((col) => {
            if (col.status === targetStatus) {
              return {
                ...col,
                orders: col.orders.filter((o) => o.id !== orderId),
                total: col.total - 1,
                delayedCount: col.orders.filter((o) => o.id !== orderId).filter(isOrderDelayed).length,
              };
            }
            if (col.status === sourceStatus) {
              const newOrders = [...col.orders, sourceOrder as ServiceOrder];
              return {
                ...col,
                orders: newOrders,
                total: col.total + 1,
                delayedCount: newOrders.filter(isOrderDelayed).length,
              };
            }
            return col;
          })
        );

        const message = e instanceof Error ? e.message : "Erro ao atualizar status";
        toast.error(message);
      } finally {
        setMovingId(null);
      }
    },
    [columns, onRefresh]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {columns.map((column) => (
          <KanbanColumnComponent
            key={column.status}
            column={column}
            onLoadMore={handleLoadMore}
          />
        ))}
      </div>

      <DragOverlay>
        {activeOrder ? <KanbanCard order={activeOrder} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function getColumnLabel(status: string): string {
  const col = KANBAN_COLUMNS.find((c) => c.status === status);
  return col?.label || status;
}
