/**
 * Reprinting a lost pickup slip.
 *
 * Before this, a parent who left the slip in the car had exactly one route
 * through: an override. That is meant to be the exceptional, audited,
 * two-person act — making it the routine remedy for mislaid paper is how a
 * control stops meaning anything to the people operating it.
 *
 * REPRINTING KEEPS THE CODE. It used to rotate it, which killed the code on
 * every tag the children were already wearing — the code is printed on the
 * child's tag too — so the new slip matched none of them. The reprint is now
 * a second copy of the same slip: the old one keeps working, and so do the
 * tags (20260322340500).
 *
 * The parent slip always prints. Each child's tag prints too unless it is
 * unticked: a tag still on the child does not need replacing, a lost one does.
 *
 * Search is by name or phone, never by code — the code is the thing they lost.
 */

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Loader2, Search, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { kidsStationService } from "../services";
import { errorMessage } from "../services/rpcError";
import type { ReprintCandidateRow, ReprintedLabelRow } from "../types";

interface ReprintLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  /**
   * Hands the code back so the caller can print it. `rows` is every child the
   * code still collects — the parent slip counts all of them; `tags` is the
   * children whose tags to print.
   */
  onReprinted: (rows: ReprintedLabelRow[], tags: ReprintedLabelRow[]) => void;
}

/** The search row's children, one per name — the same names, in the same order, the reprint returns. */
function childNames(row: ReprintCandidateRow): string[] {
  return (row.children ?? "").split(", ").filter(Boolean);
}

export function ReprintLabelDialog({
  open,
  onOpenChange,
  sessionId,
  onReprinted,
}: ReprintLabelDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReprintCandidateRow[]>([]);
  const [chosen, setChosen] = useState<ReprintCandidateRow | null>(null);
  // The tags NOT to print, by child name. Unticked rather than ticked, so a
  // name that fails to match a returned row prints: an extra tag costs a
  // label, a missing one leaves a child with nothing to collect them by.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (row: ReprintCandidateRow | null) => {
    setChosen(row);
    setSkipped(new Set());
  };

  const toggleTag = (name: string, print: boolean) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (print) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const reset = () => {
    setQuery("");
    setResults([]);
    choose(null);
    setReason("");
    setError(null);
  };

  const search = async (value: string) => {
    setQuery(value);
    choose(null);
    setError(null);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    try {
      setResults(await kidsStationService.findBatchForReprint(value.trim(), sessionId));
    } catch (err) {
      setResults([]);
      setError(errorMessage(err));
    }
  };

  const reprint = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await kidsStationService.reprintLabel(
        chosen.batch_id,
        reason.trim() || null
      );
      if (rows.length === 0) {
        setError("Nothing was reprinted. Look the family up again.");
        return;
      }
      const tags = rows.filter((r) => !skipped.has(r.child_name));
      reset();
      onReprinted(rows, tags);
    } catch (err) {
      const raw = errorMessage(err);
      setError(
        raw.includes("nobody_left_to_collect")
          ? "All of these children have already been collected, so there is nothing to reprint."
          : raw.includes("not_permitted")
            ? "You do not have permission to reprint a label."
            : raw
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reprint a pickup slip</DialogTitle>
          <DialogDescription>
            Search by the parent's name or phone number — not the code, since
            that is what they have lost.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-11 h-12 text-lg"
              placeholder="Name or phone number"
              value={query}
              onChange={(e) => search(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            {results.map((r) => {
              const picked = chosen?.batch_id === r.batch_id;
              return (
                <button
                  key={r.batch_id}
                  type="button"
                  onClick={() => choose(picked ? null : r)}
                  className={cn(
                    "w-full rounded-lg border-2 p-3 text-left transition",
                    picked ? "border-primary bg-primary/5" : "border-muted"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.household_name}</span>
                    <span className="text-sm text-muted-foreground">
                      {r.masked_phone}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {r.children ?? "No children still checked in"}
                  </p>
                </button>
              );
            })}

            {query.trim().length >= 3 && results.length === 0 && !error && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No family found with a child still checked in.
              </p>
            )}
          </div>

          {chosen && (
            <>
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm">
                  The parent slip prints with the <strong>same code</strong> as
                  before, so it still matches the children's tags. Untick any
                  tag that does not need printing again.
                </p>
                {childNames(chosen).map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!skipped.has(name)}
                      onCheckedChange={(c) => toggleTag(name, c === true)}
                    />
                    Tag for {name}
                  </label>
                ))}
              </div>

              <Input
                className="h-11"
                placeholder="Why? e.g. left it in the car (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          )}

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={reprint} disabled={busy || !chosen}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Print a new slip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
