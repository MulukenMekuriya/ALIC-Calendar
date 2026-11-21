/**
 * Green / Yellow / Red, marked by the local leaders, and Yellow moved later.
 *
 * A monthly request is marked line by line, month by month, in dollars: each
 * cell can be part Green, part Yellow, the rest Red. An annual request (no
 * months) is one cell. A reason is required whenever any money is Yellow; a
 * word on Red is optional. The ministry reads both. The Board does not mark;
 * it approves the marking or sends the request back.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MONTH_LABELS, formatReviewAmount } from "../../utils/reviewMatrix";
import { cellsOf, splitOf, SPLIT_COLORS, SPLIT_LABELS, type SplitCell, type SplitColor } from "../../utils/split";
import type { AllocationRequest } from "../../types";

export interface MarkResult {
  /** A monthly request's marking. */
  cells?: { index: number; month: string; green: number; yellow: number }[];
  /** An annual request's, in dollars. */
  green?: number;
  yellow?: number;
  yellowReason: string | null;
  notes: string | null;
}

const text = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const round = (n: number) => Math.round(n * 100) / 100;
const parse = (v: string) => (v.trim() === "" ? 0 : Number(v));
const key = (c: { index: number; month: string }) => `${c.index}:${c.month}`;

interface Entry {
  green: string;
  yellow: string;
}

/** One cell's numbers, checked. */
function checkEntry(amount: number, e: Entry) {
  const g = parse(e.green);
  const y = parse(e.yellow);
  if (!Number.isFinite(g) || !Number.isFinite(y)) return { g: 0, y: 0, r: 0, error: "Enter dollars." };
  if (g < 0 || y < 0) return { g, y, r: 0, error: "Not below $0." };
  const r = round(amount - g - y);
  if (r < 0) return { g, y, r: 0, error: `More than ${formatReviewAmount(amount)}.` };
  return { g: round(g), y: round(y), r, error: null };
}

const fill = (amount: number, color: SplitColor | "half"): Entry =>
  color === "green"
    ? { green: text(amount), yellow: "0" }
    : color === "yellow"
      ? { green: "0", yellow: text(amount) }
      : color === "red"
        ? { green: "0", yellow: "0" }
        : { green: text(round(amount / 2)), yellow: text(round(amount - round(amount / 2))) };

interface MarkDialogProps {
  request: AllocationRequest | null;
  ministryName: string;
  /** Start everything Yellow (the row's Yellow button) rather than from the current marking. */
  start?: "current" | "yellow";
  busy: boolean;
  onClose: () => void;
  onSubmit: (result: MarkResult) => Promise<void>;
}

export function SplitDialog({ request, ministryName, start = "current", busy, onClose, onSubmit }: MarkDialogProps) {
  const requested = Number(request?.requested_amount) || 0;
  const cells = useMemo(() => (request ? cellsOf(request, "green") : []), [request]);
  const monthly = cells.length > 0;
  // An annual request is one cell, the whole amount.
  const units: SplitCell[] = useMemo(
    () =>
      monthly
        ? cells
        : [{ index: -1, month: "jan", monthIndex: -1, line: "Whole request", amount: requested, green: requested, yellow: 0, red: 0 }],
    [monthly, cells, requested],
  );

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!request) return;
    const s = splitOf(request);
    const next: Record<string, Entry> = {};
    for (const u of units) {
      if (start === "yellow") next[key(u)] = fill(u.amount, "yellow");
      else if (!monthly && s.state !== "none") next[key(u)] = { green: text(s.green), yellow: text(s.yellow) };
      else next[key(u)] = { green: text(u.green), yellow: text(u.yellow) };
    }
    setEntries(next);
    setReason(request.yellow_reason ?? "");
    setNotes("");
  }, [request, start, units, monthly]);

  const checked = units.map((u) => ({ u, ...checkEntry(u.amount, entries[key(u)] ?? fill(u.amount, "green")) }));
  const totals = checked.reduce((t, c) => ({ g: t.g + c.g, y: t.y + c.y, r: t.r + c.r }), { g: 0, y: 0, r: 0 });
  const cellError = checked.some((c) => c.error);
  const nothing = round(totals.g + totals.y) === 0;
  const needsReason = totals.y > 0;
  const reasonMissing = needsReason && reason.trim() === "";

  const setAll = (color: SplitColor | "half", filter?: (u: SplitCell) => boolean) =>
    setEntries((prev) => {
      const next = { ...prev };
      for (const u of units) if (!filter || filter(u)) next[key(u)] = fill(u.amount, color);
      return next;
    });

  const submit = async () => {
    if (cellError || nothing || reasonMissing) return;
    await onSubmit({
      ...(monthly
        ? { cells: checked.map((c) => ({ index: c.u.index, month: c.u.month, green: c.g, yellow: c.y })) }
        : { green: checked[0].g, yellow: checked[0].y }),
      yellowReason: needsReason ? reason.trim() : null,
      notes: notes.trim() || null,
    });
  };

  // Group the cells under their line.
  const lines = useMemo(() => {
    const map = new Map<number, SplitCell[]>();
    for (const u of units) map.set(u.index, [...(map.get(u.index) ?? []), u]);
    return [...map.entries()];
  }, [units]);

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mark Green / Yellow / Red: {ministryName}</DialogTitle>
          <DialogDescription>
            {formatReviewAmount(requested)} requested.{" "}
            {monthly
              ? "Each line, each month: put its dollars in Green or Yellow; the rest is Red."
              : "Put some or all of it in Green or Yellow; the rest is Red."}{" "}
            The Board gives final approval to this marking or sends it back to you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("green")}>All Green</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("yellow")}>All Yellow</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("half")}>Half Green, half Yellow</Button>
        </div>

        <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
          {lines.map(([index, lineCells]) => (
            <div key={index} className="rounded-md border">
              {monthly && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5">
                  <span className="text-sm font-medium">{lineCells[0].line || `Line ${index + 1}`}</span>
                  <span className="flex gap-1">
                    {(["green", "yellow", "red"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAll(c, (u) => u.index === index)}
                        className={cn("rounded border px-1.5 py-0.5 text-[11px]", SPLIT_COLORS[c].text, SPLIT_COLORS[c].border)}
                        aria-label={`Make all of ${lineCells[0].line || `line ${index + 1}`} ${c}`}
                      >
                        All {c}
                      </button>
                    ))}
                  </span>
                </div>
              )}
              <div className="divide-y">
                {lineCells.map((u) => {
                  const c = checked.find((x) => x.u === u)!;
                  const e = entries[key(u)] ?? fill(u.amount, "green");
                  const label = monthly ? `${MONTH_LABELS[u.monthIndex]} · ${formatReviewAmount(u.amount)}` : formatReviewAmount(u.amount);
                  const set = (part: keyof Entry, v: string) =>
                    setEntries((prev) => ({ ...prev, [key(u)]: { ...e, [part]: v } }));
                  return (
                    <div key={key(u)} className="grid grid-cols-[1fr_5.5rem_5.5rem_5rem] items-center gap-2 px-2 py-1.5">
                      <span className="text-sm tabular-nums">{label}</span>
                      <Input
                        aria-label={`Green for ${u.line} ${monthly ? MONTH_LABELS[u.monthIndex] : ""}`}
                        inputMode="decimal"
                        value={e.green}
                        onChange={(ev) => set("green", ev.target.value)}
                        className={cn("h-8 tabular-nums", SPLIT_COLORS.green.bg, SPLIT_COLORS.green.border)}
                      />
                      <Input
                        aria-label={`Yellow for ${u.line} ${monthly ? MONTH_LABELS[u.monthIndex] : ""}`}
                        inputMode="decimal"
                        value={e.yellow}
                        onChange={(ev) => set("yellow", ev.target.value)}
                        className={cn("h-8 tabular-nums", SPLIT_COLORS.yellow.bg, SPLIT_COLORS.yellow.border)}
                      />
                      <span className={cn("text-right text-sm tabular-nums", c.error ? "text-destructive" : SPLIT_COLORS.red.text)}>
                        {c.error ?? formatReviewAmount(c.r)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          {(["green", "yellow", "red"] as const).map((col) => (
            <div key={col} className={cn("rounded-md border px-2 py-1.5", SPLIT_COLORS[col].bg, SPLIT_COLORS[col].border)}>
              <div className={cn("text-xs", SPLIT_COLORS[col].text)}>{SPLIT_LABELS[col]}</div>
              <div className={cn("font-semibold tabular-nums", SPLIT_COLORS[col].text)}>
                {formatReviewAmount(round(col === "green" ? totals.g : col === "yellow" ? totals.y : totals.r))}
              </div>
            </div>
          ))}
        </div>
        {nothing && !cellError && (
          <p className="text-sm text-destructive">Nothing is Green or Yellow. To refuse the whole request, deny it.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="split-reason">Reason for Yellow{needsReason ? " *" : " (only when some is Yellow)"}</Label>
            <Textarea
              id="split-reason"
              rows={3}
              value={reason}
              disabled={!needsReason}
              placeholder="Justified, but depends on giving because..."
              onChange={(e) => setReason(e.target.value)}
            />
            {reasonMissing && <p className="text-xs text-destructive">Required when any money is Yellow.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="split-notes">Reason for Red (optional)</Label>
            <Textarea
              id="split-notes"
              rows={3}
              value={notes}
              placeholder="Why some is not approved..."
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">The ministry sees the amounts and these reasons.</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || cellError || nothing || reasonMissing}>
            {busy ? "Saving..." : "Approve for the Board"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ReleaseResult {
  cells?: { index: number; month: string; to_green: number; to_red: number }[];
  toGreen?: number;
  toRed?: number;
  notes: string | null;
}

interface ReleaseYellowDialogProps {
  request: AllocationRequest | null;
  ministryName: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (r: ReleaseResult) => Promise<void>;
}

interface Move {
  toGreen: string;
  toRed: string;
}

/** Yellow money, later: move some or all of it to Green (as giving allows) or to Red. */
export function ReleaseYellowDialog({ request, ministryName, busy, onClose, onSubmit }: ReleaseYellowDialogProps) {
  const monthly = !!request?.split_cells;
  const units = useMemo(() => {
    if (!request) return [];
    if (monthly) {
      return cellsOf(request)
        .filter((c) => c.yellow > 0)
        .map((c) => ({ key: key(c), index: c.index, month: c.month, label: `${c.line || `Line ${c.index + 1}`} · ${MONTH_LABELS[c.monthIndex]}`, yellow: c.yellow }));
    }
    return [{ key: "all", index: -1, month: "", label: "Whole request", yellow: Number(request.yellow_amount) || 0 }];
  }, [request, monthly]);

  const [moves, setMoves] = useState<Record<string, Move>>({});
  const [notes, setNotes] = useState("");

  const setAll = (to: "green" | "red") =>
    setMoves(Object.fromEntries(units.map((u) => [u.key, to === "green" ? { toGreen: text(u.yellow), toRed: "0" } : { toGreen: "0", toRed: text(u.yellow) }])));

  useEffect(() => {
    if (!request) return;
    setMoves(Object.fromEntries(units.map((u) => [u.key, { toGreen: text(u.yellow), toRed: "0" }])));
    setNotes("");
  }, [request, units]);

  const checked = units.map((u) => {
    const m = moves[u.key] ?? { toGreen: "0", toRed: "0" };
    const g = parse(m.toGreen);
    const r = parse(m.toRed);
    const error =
      !Number.isFinite(g) || !Number.isFinite(r) ? "Enter dollars." : g < 0 || r < 0 ? "Not below $0." : round(g + r) > u.yellow ? `Only ${formatReviewAmount(u.yellow)}.` : null;
    return { u, m, g: round(g), r: round(r), error };
  });
  const anyError = checked.some((c) => c.error);
  const total = checked.reduce((t, c) => ({ g: t.g + c.g, r: t.r + c.r }), { g: 0, r: 0 });
  const nothing = round(total.g + total.r) === 0;
  const yellow = units.reduce((s, u) => s + u.yellow, 0);

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Move Yellow money: {ministryName}</DialogTitle>
          <DialogDescription>
            {formatReviewAmount(yellow)} is Yellow (justified, waiting on giving). Green is added to the ministry's budget now.
          </DialogDescription>
        </DialogHeader>
        {request?.yellow_reason && (
          <p className={cn("rounded-md border p-2 text-sm", SPLIT_COLORS.yellow.bg, SPLIT_COLORS.yellow.border)}>{request.yellow_reason}</p>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("green")}>All to Green</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("red")}>All to Red</Button>
        </div>
        <div className="max-h-[40vh] divide-y overflow-y-auto rounded-md border">
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 px-2 py-1 text-xs text-muted-foreground">
            <span>Yellow</span>
            <span className={SPLIT_COLORS.green.text}>To Green</span>
            <span className={SPLIT_COLORS.red.text}>To Red</span>
          </div>
          {checked.map(({ u, m, error }) => (
            <div key={u.key} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2 px-2 py-1.5">
              <span className="text-sm">
                {u.label} <span className="tabular-nums text-muted-foreground">{formatReviewAmount(u.yellow)}</span>
                {error && <span className="block text-xs text-destructive">{error}</span>}
              </span>
              <Input
                aria-label={`To Green, ${u.label}`}
                inputMode="decimal"
                value={m.toGreen}
                onChange={(e) => setMoves((p) => ({ ...p, [u.key]: { ...m, toGreen: e.target.value } }))}
                className={cn("h-8 tabular-nums", SPLIT_COLORS.green.bg, SPLIT_COLORS.green.border)}
              />
              <Input
                aria-label={`To Red, ${u.label}`}
                inputMode="decimal"
                value={m.toRed}
                onChange={(e) => setMoves((p) => ({ ...p, [u.key]: { ...m, toRed: e.target.value } }))}
                className={cn("h-8 tabular-nums", SPLIT_COLORS.red.bg, SPLIT_COLORS.red.border)}
              />
            </div>
          ))}
        </div>
        <p className="text-sm">
          Moving <span className={SPLIT_COLORS.green.text}>{formatReviewAmount(round(total.g))} to Green</span> and{" "}
          <span className={SPLIT_COLORS.red.text}>{formatReviewAmount(round(total.r))} to Red</span>; the rest stays Yellow.
        </p>
        <div className="space-y-1">
          <Label htmlFor="release-notes">Note for the ministry (optional)</Label>
          <Textarea id="release-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || anyError || nothing}
            onClick={() =>
              onSubmit(
                monthly
                  ? {
                      cells: checked
                        .filter((c) => c.g + c.r > 0)
                        .map((c) => ({ index: c.u.index, month: c.u.month, to_green: c.g, to_red: c.r })),
                      notes: notes.trim() || null,
                    }
                  : { toGreen: checked[0].g, toRed: checked[0].r, notes: notes.trim() || null },
              )
            }
          >
            {busy ? "Saving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
