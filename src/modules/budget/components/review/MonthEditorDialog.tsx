/**
 * Edit one month of one request: a figure per line item.
 *
 * Only local leaders get here. The figures go to budget.edit_request_month,
 * which recomputes the totals and refuses the save if the request changed
 * since this screen was drawn.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useEditRequestMonth } from "../../hooks/useBoardReview";
import { errorMessage } from "@/shared/lib/errorMessage";
import { MONTH_LABELS, formatReviewAmount, type ReviewRow } from "../../utils/reviewMatrix";
import { MONTH_KEYS } from "../../utils/monthlyItems";

interface MonthEditorDialogProps {
  row: ReviewRow | null;
  monthIndex: number | null;
  onClose: () => void;
}

export function MonthEditorDialog({ row, monthIndex, onClose }: MonthEditorDialogProps) {
  const [values, setValues] = useState<Record<number, string>>({});
  const edit = useEditRequestMonth();
  const { toast } = useToast();
  const open = !!row && monthIndex !== null;

  // Only the lines that have something in this month. A month with nothing in
  // it has no such lines, so all of them are offered to put an amount on.
  const lines = row && monthIndex !== null
    ? (row.lines.some((l) => l.months[monthIndex] > 0)
        ? row.lines.filter((l) => l.months[monthIndex] > 0)
        : row.lines)
    : [];

  useEffect(() => {
    if (!row || monthIndex === null) return;
    setValues(Object.fromEntries(lines.map((l) => [l.index, String(l.months[monthIndex] || "")])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, monthIndex]);

  if (!row || monthIndex === null) return <Dialog open={false} />;

  const parsed = lines.map((l) => {
    const raw = (values[l.index] ?? "").trim();
    const n = raw === "" ? 0 : Number(raw);
    return { line: l, n, valid: Number.isFinite(n) && n >= 0 };
  });
  const allValid = parsed.every((p) => p.valid);
  const monthTotal = parsed.reduce((sum, p) => sum + (p.valid ? p.n : 0), 0);
  const wasTotal = lines.reduce((sum, l) => sum + l.months[monthIndex], 0);
  const changed = parsed.some((p) => p.n !== p.line.months[monthIndex]);

  const save = async () => {
    try {
      await edit.mutateAsync({
        requestId: row.request.id,
        month: MONTH_KEYS[monthIndex],
        amounts: parsed.map((p) => ({ index: p.line.index, amount: p.n })),
        expectedUpdatedAt: row.request.updated_at,
      });
      toast({ title: `${MONTH_LABELS[monthIndex]} updated`, description: row.ministryName });
      onClose();
    } catch (error) {
      toast({ title: "The month could not be saved", description: errorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row.ministryName} · {MONTH_LABELS[monthIndex]}
          </DialogTitle>
          <DialogDescription>
            Change what this ministry asked for in {MONTH_LABELS[monthIndex]}. The request goes back to under review.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (allValid && changed && !edit.isPending) void save();
          }}
        >
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {parsed.map(({ line, valid }, i) => (
              <div key={line.index} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={`month-line-${line.index}`} className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">
                      {line.justification || "No justification given"}
                    </span>
                    {line.chartOfAccounts && (
                      <span className="block text-xs text-muted-foreground">{line.chartOfAccounts}</span>
                    )}
                  </label>
                  <div className="relative w-36 shrink-0">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">$</span>
                    <Input
                      id={`month-line-${line.index}`}
                      inputMode="decimal"
                      autoFocus={i === 0}
                      onFocus={(e) => e.currentTarget.select()}
                      className="pl-7 text-right tabular-nums"
                      value={values[line.index] ?? ""}
                      aria-invalid={!valid}
                      onChange={(e) => setValues((v) => ({ ...v, [line.index]: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>was {formatReviewAmount(line.months[monthIndex])}</span>
                  {!valid && <span className="text-destructive">Enter $0 or more</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{MONTH_LABELS[monthIndex]} total</span>
            <span>
              <strong className="tabular-nums">{formatReviewAmount(monthTotal)}</strong>
              {changed && (
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  ({monthTotal - wasTotal >= 0 ? "+" : "−"}
                  {formatReviewAmount(Math.abs(monthTotal - wasTotal))})
                </span>
              )}
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={edit.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!allValid || !changed || edit.isPending}>
              {edit.isPending ? "Saving..." : "Save month"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
