import * as React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "rounded" | "circular" | "text";
  pulse?: boolean;
  shimmer?: boolean;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    { className, variant = "default", pulse = true, shimmer = false, ...props },
    ref
  ) => {
    const baseClasses = "bg-muted";

    const variantClasses = {
      default: "rounded-md",
      rounded: "rounded-lg",
      circular: "rounded-full",
      text: "rounded-sm h-4",
    };

    const animationClasses = cn(
      pulse && "animate-pulse",
      shimmer &&
        "relative overflow-hidden after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_2s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent"
    );

    return (
      <div
        ref={ref}
        className={cn(
          baseClasses,
          variantClasses[variant],
          animationClasses,
          className
        )}
        {...props}
      />
    );
  }
);
Skeleton.displayName = "Skeleton";

// Composite skeleton components for common use cases
const SkeletonCard = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-3 p-4 border rounded-lg", className)} {...props}>
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-20 w-full" />
    <div className="flex space-x-2">
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
    </div>
  </div>
);

const SkeletonAvatar = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <Skeleton
    variant="circular"
    className={cn("h-10 w-10", className)}
    {...props}
  />
);

const SkeletonTable = ({
  rows = 5,
  columns = 4,
  className,
  ...props
}: {
  rows?: number;
  columns?: number;
} & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-3", className)} {...props}>
    {/* Header */}
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={`header-${i}`} className="h-4 w-full" />
      ))}
    </div>

    {/* Rows */}
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div
        key={`row-${rowIndex}`}
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton
            key={`cell-${rowIndex}-${colIndex}`}
            className="h-4 w-full"
          />
        ))}
      </div>
    ))}
  </div>
);

const SkeletonCalendar = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-4", className)} {...props}>
    {/* Header with days */}
    <div className="grid grid-cols-8 gap-4">
      <Skeleton className="h-6 w-16" /> {/* Room column */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-4 w-8 mx-auto" />
          <Skeleton className="h-3 w-12 mx-auto" />
        </div>
      ))}
    </div>

    {/* Calendar grid */}
    {Array.from({ length: 4 }).map((_, roomIndex) => (
      <div key={roomIndex} className="p-4 border rounded-lg space-y-2">
        <div className="grid grid-cols-8 gap-4">
          <div className="flex items-center gap-2">
            <Skeleton variant="circular" className="w-3 h-3" />
            <Skeleton className="h-4 w-16" />
          </div>
          {Array.from({ length: 7 }).map((_, dayIndex) => (
            <div key={dayIndex} className="space-y-2 min-h-[100px]">
              {Math.random() > 0.5 && (
                <div className="space-y-1">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-5 w-16" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export {
  Skeleton,
  SkeletonCard,
  SkeletonAvatar,
  SkeletonTable,
  SkeletonCalendar,
};
