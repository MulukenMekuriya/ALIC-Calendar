/**
 * A membership status, coloured the way the Kids Ministry colours a family:
 * members blue, regular attendees teal, visitors amber. Statuses that mean
 * someone has gone (inactive, moved, deceased) are muted; no status at all
 * says so, because that is the thing to fix.
 */

import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  member: "bg-primary/10 text-primary ring-primary/20",
  regular_attendee: "bg-teal-500/10 text-teal-700 ring-teal-500/25 dark:text-teal-300",
  visitor: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300",
};

export function StatusBadge({
  code,
  name,
  className,
}: {
  code: string | null | undefined;
  name: string | null | undefined;
  className?: string;
}) {
  if (!code || !name) {
    return (
      <span className={cn("text-xs italic text-muted-foreground", className)}>No status</span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[code] ?? "bg-muted text-muted-foreground ring-border",
        className,
      )}
    >
      {name}
    </span>
  );
}
