import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, Calendar, CheckCircle, AlertCircle } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "dots" | "bars" | "pulse";
  className?: string;
}

const LoadingSpinner = ({
  size = "md",
  variant = "default",
  className,
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  if (variant === "dots") {
    return (
      <div className={cn("flex space-x-1", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "bg-primary rounded-full animate-bounce",
              size === "sm"
                ? "w-1.5 h-1.5"
                : size === "md"
                ? "w-2 h-2"
                : size === "lg"
                ? "w-2.5 h-2.5"
                : "w-3 h-3"
            )}
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
    );
  }

  if (variant === "bars") {
    return (
      <div className={cn("flex items-end space-x-1", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "bg-primary animate-pulse",
              size === "sm"
                ? "w-1 h-3"
                : size === "md"
                ? "w-1.5 h-4"
                : size === "lg"
                ? "w-2 h-6"
                : "w-2.5 h-8"
            )}
            style={{
              animationDelay: `${i * 0.15}s`,
              animationDuration: "0.6s",
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div
        className={cn(
          "bg-primary/20 rounded-full animate-ping",
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <Loader2
      className={cn("animate-spin text-primary", sizeClasses[size], className)}
    />
  );
};

interface LoadingStateProps {
  loading?: boolean;
  error?: string | null;
  success?: boolean;
  children: React.ReactNode;
  loadingText?: string;
  errorText?: string;
  successText?: string;
  className?: string;
  variant?: "overlay" | "inline" | "replace";
}

const LoadingState = ({
  loading = false,
  error = null,
  success = false,
  children,
  loadingText = "Loading...",
  errorText = "Something went wrong",
  successText = "Success!",
  className,
  variant = "replace",
}: LoadingStateProps) => {
  if (loading) {
    const loadingContent = (
      <div
        className={cn(
          "flex flex-col items-center justify-center space-y-4 py-8",
          className
        )}
      >
        <LoadingSpinner size="lg" />
        <p className="text-sm text-muted-foreground">{loadingText}</p>
      </div>
    );

    if (variant === "overlay") {
      return (
        <div className="relative">
          {children}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            {loadingContent}
          </div>
        </div>
      );
    }

    if (variant === "inline") {
      return (
        <div>
          {children}
          {loadingContent}
        </div>
      );
    }

    return loadingContent;
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center space-y-4 py-8 text-center",
          className
        )}
      >
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div>
          <p className="text-sm font-medium">{errorText}</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center space-y-4 py-8",
          className
        )}
      >
        <CheckCircle className="h-12 w-12 text-success" />
        <p className="text-sm font-medium text-success">{successText}</p>
      </div>
    );
  }

  return <>{children}</>;
};

// Full page loading component
const PageLoader = ({
  message = "Loading...",
  className,
}: {
  message?: string;
  className?: string;
}) => (
  <div
    className={cn(
      "min-h-screen flex flex-col items-center justify-center bg-background",
      className
    )}
  >
    <div className="flex items-center gap-3 mb-4">
      <div className="bg-gradient-primary p-3 rounded-xl">
        <Calendar className="h-8 w-8 text-primary-foreground" />
      </div>
      <LoadingSpinner size="lg" />
    </div>
    <p className="text-lg font-medium mb-2">ALIC Calendar Manager</p>
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

// Button loading state
interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    { loading = false, loadingText, children, disabled, className, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "flex items-center justify-center gap-2 transition-all",
          loading && "cursor-not-allowed opacity-70",
          className
        )}
        {...props}
      >
        {loading && <LoadingSpinner size="sm" />}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  }
);
LoadingButton.displayName = "LoadingButton";

export { LoadingSpinner, LoadingState, PageLoader, LoadingButton };
