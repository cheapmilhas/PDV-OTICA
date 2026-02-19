import { HealthCategory } from "@prisma/client";

interface HealthBadgeProps {
  score: number;
  category: HealthCategory;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const categoryConfig: Record<HealthCategory, { color: string; label: string; dotColor: string }> = {
  CRITICAL: {
    color: "text-red-400",
    label: "Crítico",
    dotColor: "bg-red-500",
  },
  AT_RISK: {
    color: "text-yellow-400",
    label: "Em Risco",
    dotColor: "bg-yellow-500",
  },
  HEALTHY: {
    color: "text-green-400",
    label: "Saudável",
    dotColor: "bg-green-500",
  },
  THRIVING: {
    color: "text-blue-400",
    label: "Excelente",
    dotColor: "bg-blue-500",
  },
};

const sizeConfig = {
  sm: {
    dot: "w-2 h-2",
    text: "text-xs",
    gap: "gap-1.5",
  },
  md: {
    dot: "w-2.5 h-2.5",
    text: "text-sm",
    gap: "gap-2",
  },
  lg: {
    dot: "w-3 h-3",
    text: "text-base",
    gap: "gap-2",
  },
};

export function HealthBadge({ score, category, size = "md", showLabel = true }: HealthBadgeProps) {
  const config = categoryConfig[category];
  const sizeStyles = sizeConfig[size];

  return (
    <div className={`flex items-center ${sizeStyles.gap}`}>
      <div className={`${sizeStyles.dot} ${config.dotColor} rounded-full`} />
      <span className={`font-medium ${config.color} ${sizeStyles.text}`}>
        {score}
      </span>
      {showLabel && (
        <span className={`text-gray-500 ${sizeStyles.text}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}
