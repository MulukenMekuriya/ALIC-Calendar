/**
 * "There is a newer version" — for the screens somebody is sitting at.
 *
 * Unattended screens do not get this; they reload themselves when nothing is
 * happening. This is for a desk, where the app has no business reloading under
 * somebody who is half way through typing a budget request.
 *
 * Dismissible, because a volunteer in the middle of something should be able
 * to make it go away — and it will come back on the next check, so nothing is
 * lost by letting them.
 */

import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useBuildWatcher } from "@/shared/hooks/useBuildWatcher";
import { updateModeForPath } from "@/shared/lib/buildVersion";

export function UpdateAvailableBanner({ pathname }: { pathname: string }) {
  const { updateReady, reloadNow } = useBuildWatcher(updateModeForPath(pathname));
  const [dismissed, setDismissed] = useState(false);

  if (!updateReady || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border bg-card p-3 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">A newer version is ready</p>
          <p className="text-xs text-muted-foreground">
            This page has been open since an earlier release. Reload when you
            reach a good moment.
          </p>
        </div>
        <Button size="sm" onClick={reloadNow}>
          Reload
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
