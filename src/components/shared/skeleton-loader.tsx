import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/70", className)}
      {...props}
    />
  );
}

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[55%]" style={{ opacity: 1 - i * 0.1 }} />
                <Skeleton className="h-3 w-[30%]" style={{ opacity: 1 - i * 0.1 }} />
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.max(columns - 2, 1) }).map((_, j) => (
                  <Skeleton key={j} className="h-3.5 w-14 hidden md:block" />
                ))}
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface CardSkeletonProps {
  className?: string;
}

export function CardSkeleton({ className }: CardSkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-3.5 w-[40%]" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-7 w-[50%]" />
        <Skeleton className="h-3 w-[70%]" />
      </CardContent>
    </Card>
  );
}

interface StatsSkeletonProps {
  count?: number;
}

export function StatsSkeleton({ count = 3 }: StatsSkeletonProps) {
  return (
    <div className={`grid gap-3 ${count === 4 ? "md:grid-cols-4" : count === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-3.5 w-[45%]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-[35%]" />
            <Skeleton className="h-3 w-[55%] mt-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
