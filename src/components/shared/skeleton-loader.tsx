import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
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
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-[60%]" />
                <Skeleton className="h-3 w-[30%]" />
              </div>
              <div className="flex items-center gap-3">
                {Array.from({ length: Math.max(columns - 2, 1) }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-16 hidden md:block" />
                ))}
                <Skeleton className="h-6 w-24" />
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
        <Skeleton className="h-4 w-[40%]" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-6 w-[60%]" />
        <Skeleton className="h-3 w-[80%]" />
      </CardContent>
    </Card>
  );
}

interface StatsSkeletonProps {
  count?: number;
}

export function StatsSkeleton({ count = 3 }: StatsSkeletonProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-[50%]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-[40%]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
