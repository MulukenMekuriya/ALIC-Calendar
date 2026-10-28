/**
 * CollapsibleListSection - a titled long list that can be folded away.
 *
 * Made for "All Expense Requests": one row per request for the whole
 * organisation, 185 of them in MD, and a page of its own on a phone. The
 * button folds the list down to its title and one line of totals.
 *
 * Four things keep it from being a nuisance:
 *
 *   - The header sticks under the app header while the list scrolls past, so
 *     Collapse is in reach from row 100 and not only from row 1.
 *   - Collapsing from deep in the list scrolls the header back into view. The
 *     page gets thousands of pixels shorter at that moment, and without this
 *     the browser clamps the scroll position and leaves you at the bottom of
 *     the page, below a header you can no longer see.
 *   - The choice is remembered per browser (localStorage, under `storageKey`).
 *     A section folded because it is too long should still be folded
 *     tomorrow. Storage can be missing or throw (private windows, blocked
 *     site data), and then the section just starts open every time.
 *   - A list that has never been opened this visit is never rendered, and one
 *     that has been is kept mounted while folded, so a status filter chosen
 *     inside it is still there when it is opened again.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "alic.collapsed.";

/** Height of the app header, which the section header sticks beneath. */
const APP_HEADER_PX = 64;

const readCollapsed = (storageKey?: string): boolean => {
  if (!storageKey) return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + storageKey) === "1";
  } catch {
    return false;
  }
};

/** Only a collapsed section is written down: absent means open. */
const writeCollapsed = (storageKey: string | undefined, collapsed: boolean) => {
  if (!storageKey) return;
  try {
    if (collapsed) {
      window.localStorage.setItem(STORAGE_PREFIX + storageKey, "1");
    } else {
      window.localStorage.removeItem(STORAGE_PREFIX + storageKey);
    }
  } catch {
    // Nothing to do: the section still folds, it just is not remembered.
  }
};

interface CollapsibleListSectionProps {
  title: string;
  icon?: ReactNode;
  /** Shown under the title while folded: "185 requests · $52,431". */
  summary?: ReactNode;
  /** Remembers folded/open per browser under this key. Omit to start open. */
  storageKey?: string;
  /**
   * Hold the section open without touching what is remembered. For a search:
   * the results are in the list, so folding it would read as "no results".
   */
  forceOpen?: boolean;
  /** Said beside the title while `forceOpen` holds the section open. */
  forceOpenNote?: string;
  className?: string;
  children: ReactNode;
}

export function CollapsibleListSection({
  title,
  icon,
  summary,
  storageKey,
  forceOpen = false,
  forceOpenNote = "Held open while you search",
  className,
  children,
}: CollapsibleListSectionProps) {
  const [open, setOpen] = useState(() => !readCollapsed(storageKey));
  const isOpen = open || forceOpen;

  const noteId = useId();
  const sectionRef = useRef<HTMLDivElement>(null);

  // Not rendered until first opened; kept once it has been.
  const [everOpened, setEverOpened] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setEverOpened(true);
  }, [isOpen]);

  // However it folded (the button, or a search being cleared), do not strand
  // the reader below a header they can no longer see.
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      const section = sectionRef.current;
      if (section && section.getBoundingClientRect().top < APP_HEADER_PX) {
        section.scrollIntoView?.({ block: "start" });
      }
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    writeCollapsed(storageKey, !next);
  };

  return (
    <Collapsible
      ref={sectionRef}
      open={isOpen}
      onOpenChange={handleOpenChange}
      // Lands the header beneath the app header, with a little air.
      className={cn("scroll-mt-20", className)}
    >
      <div className="sticky top-16 z-20 mb-3 sm:mb-4 bg-background/95 backdrop-blur border-b py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-xl font-semibold flex items-center gap-2">
              {icon}
              {title}
            </h3>
            {!isOpen && summary && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {summary}
              </p>
            )}
            {forceOpen && forceOpenNote && (
              <p id={noteId} className="text-xs text-muted-foreground mt-0.5">
                {forceOpenNote}
              </p>
            )}
          </div>

          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={forceOpen}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${title}`}
              aria-describedby={forceOpen ? noteId : undefined}
            >
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {isOpen ? "Collapse" : "Expand"}
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>

      {/*
        forceMount, and `hidden` set here, because Radix's own handling is the
        opposite of what is wanted twice over: closed, it unmounts the list
        (the status filter chosen inside it would reset), and forceMount alone
        never hides it at all. `hidden` takes it out of view and out of the
        accessibility tree while it stays mounted.
      */}
      <CollapsibleContent forceMount hidden={!isOpen}>
        {everOpened || isOpen ? children : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default CollapsibleListSection;
