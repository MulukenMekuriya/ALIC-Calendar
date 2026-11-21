/**
 * The bulk buttons at the bottom of the table, and the confirmations behind
 * them. Local leaders get "Send for Board Review (N)"; the Board gets "Send
 * back to local leaders" and "Final approval", bottom right. Every one names
 * what it is about to do: the ministries, and the total.
 */

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { formatReviewAmount, type ReviewRow } from "../../utils/reviewMatrix";

export type BulkAction = "send" | "approve" | "return" | "release";

interface ReviewActionBarProps {
  mode: "leaders" | "board";
  /** The ticked rows each button acts on. */
  sendRows: ReviewRow[];
  boardRows: ReviewRow[];
  /** Decided requests with Yellow waiting, ticked for "Move Yellow to Green". */
  releaseRows: ReviewRow[];
  busy: boolean;
  onConfirm: (action: BulkAction, note: string | null) => Promise<void>;
}

const COPY: Record<BulkAction, { title: string; verb: string; detail: string }> = {
  send: {
    title: "Send for Board review",
    verb: "Send for Board review",
    detail: "The Board will see these requests and can recommend amounts. You cannot change their figures while they are with the Board.",
  },
  approve: {
    title: "Final approval",
    verb: "Give final approval",
    detail:
      "Each request is approved as the local leaders marked it: Green is added to the ministry's budget now, Yellow waits on giving, Red is denied. To change a marking, send it back to the local leaders instead. The ministry is told.",
  },
  release: {
    title: "Move Yellow to Green",
    verb: "Move to Green",
    detail:
      "All the Yellow money of these requests becomes Green and is added to the ministries' budgets now. To move only part of one, use Move Yellow on its row.",
  },
  return: {
    title: "Send back to local leaders",
    verb: "Send back",
    detail: "The local leaders will see your recommended amounts and comments and can update the requests.",
  },
};

export function ReviewActionBar({ mode, sendRows, boardRows, releaseRows, busy, onConfirm }: ReviewActionBarProps) {
  const [action, setAction] = useState<BulkAction | null>(null);
  const [note, setNote] = useState("");

  const rows = action === "send" ? sendRows : action === "release" ? releaseRows : boardRows;
  const total = rows.reduce((s, r) => s + (action === "release" ? r.yellow : r.total), 0);
  const needsNote = action === "return";
  const copy = action ? COPY[action] : null;

  const close = () => {
    setAction(null);
    setNote("");
  };

  const confirm = async () => {
    if (!action) return;
    await onConfirm(action, needsNote ? note.trim() : null);
    close();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t p-3 sm:p-4">
        {mode === "leaders" ? (
          <>
            {releaseRows.length > 0 && (
              <Button
                variant="outline"
                className="border-amber-500/70 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                onClick={() => setAction("release")}
                disabled={busy}
              >
                Move Yellow to Green ({releaseRows.length})
              </Button>
            )}
            <Button onClick={() => setAction("send")} disabled={busy || sendRows.length === 0}>
              Send for Board Review ({sendRows.length})
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setAction("return")} disabled={busy || boardRows.length === 0}>
              Send back to local leaders ({boardRows.length})
            </Button>
            <Button onClick={() => setAction("approve")} disabled={busy || boardRows.length === 0}>
              Final approval ({boardRows.length})
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={!!action} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {copy?.title}: {rows.length} {rows.length === 1 ? "request" : "requests"}, {formatReviewAmount(total)}
            </AlertDialogTitle>
            <AlertDialogDescription>{copy?.detail}</AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="max-h-48 overflow-y-auto text-sm space-y-1">
            {rows.map((r) => (
              <li key={r.request.id} className="flex justify-between gap-3">
                <span>{r.ministryName}</span>
                <span className="tabular-nums text-right">
                  {formatReviewAmount(action === "release" ? r.yellow : r.total)}
                  {action === "approve" && r.splitState === "proposed" && (r.yellow > 0 || r.red > 0) && (
                    <span className="block text-xs text-muted-foreground">
                      G {formatReviewAmount(r.green)} · Y {formatReviewAmount(r.yellow)} · R {formatReviewAmount(r.red)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {needsNote && (
            <div className="space-y-1">
              <label htmlFor="bulk-note" className="text-sm font-medium">
                What should the local leaders look at again?
              </label>
              <Textarea id="bulk-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={confirm} disabled={busy || (needsNote && note.trim() === "")}>
              {busy ? "Working..." : copy?.verb}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
