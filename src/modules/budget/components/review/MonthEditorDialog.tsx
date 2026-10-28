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

  useEffect(() => {
    if (!row || monthIndex === null) return;
    setValues(Object.fromEntries(row.lines.map((l) => [l.index, String(l.months[monthIndex] || "")])));
  }, [row, monthIndex]);

  if (!row || monthIndex === null) return <Dialog open={false} />;

  const parsed = row.lines.map((l) => {
    const raw = (values[l.index] ?? "").trim();
    const n = raw === "" ? 0 : Number(raw);
    return { line: l, n, valid: Number.isFinite(n) && n >= 0 };
  });
  const allValid = parsed.every((p) => p.valid);
  const monthTotal = parsed.reduce((sum, p) => sum + (p.valid ? p.n : 0), 0);
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

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {parsed.map(({ line, valid }) => (
            <div key={line.index} className="grid grid-cols-[1fr_7rem] items-start gap-3">
              <label htmlFor={`month-line-${line.index}`} className="text-sm">
                {line.justification || "No justification given"}
                {line.chartOfAccounts && (
                  <span className="block text-xs text-muted-foreground">{line.chartOfAccounts}</span>
                )}
              </label>
              <div>
                <Input
                  id={`month-line-${line.index}`}
                  inputMode="decimal"
                  className="text-right tabular-nums"
                  value={values[line.index] ?? ""}
                  aria-invalid={!valid}
                  onChange={(e) => setValues((v) => ({ ...v, [line.index]: e.target.value }))}
                />
                {!valid && <p className="text-xs text-destructive mt-1">Enter $0 or more</p>}
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-right">
          {MONTH_LABELS[monthIndex]} total <strong className="tabular-nums">{formatReviewAmount(monthTotal)}</strong>
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={edit.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!allValid || !changed || edit.isPending}>
            {edit.isPending ? "Saving..." : "Save month"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
