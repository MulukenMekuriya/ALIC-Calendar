/**
 * One card, opened.
 *
 * Everything a volunteer does to a card happens here, and every one of those
 * actions writes an activity row — which is why the history is the biggest
 * thing on the panel rather than a collapsed footnote. "We rang twice and
 * nobody rang back" is the fact that outlives whoever made the calls.
 */

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Separator } from "@/shared/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Loader2,
  Phone,
  Mail,
  Home,
  Clock,
  ArrowRight,
  CheckCircle2,
  MoonStar,
  MessageSquarePlus,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  useCardHistory,
  useWorkflowSteps,
  useAddCardNote,
  useAdvanceCard,
  useSnoozeCard,
  useCompleteCard,
  useRemoveCard,
  useReopenCard,
} from "../hooks";
import { OUTCOME_SUGGESTIONS, type BoardCard } from "../types";

const KIND_LABELS: Record<string, string> = {
  created: "Opened",
  note: "Note",
  step_change: "Moved",
  assigned: "Assigned",
  snoozed: "Snoozed",
  completed: "Finished",
  reopened: "Reopened",
  removed: "Removed",
};

interface CardSheetProps {
  card: BoardCard | null;
  workflowId: string | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}

export function CardSheet({ card, workflowId, onOpenChange, canManage }: CardSheetProps) {
  const { toast } = useToast();
  const { data: history, isLoading: historyLoading } = useCardHistory(card?.card_id);
  const { data: steps } = useWorkflowSteps(workflowId ?? undefined);

  const [note, setNote] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [outcome, setOutcome] = useState("");
  const [moveTo, setMoveTo] = useState<string>("");

  const addNote = useAddCardNote();
  const advance = useAdvanceCard();
  const snooze = useSnoozeCard();
  const complete = useCompleteCard();
  const remove = useRemoveCard();
  const reopen = useReopenCard();

  if (!card) return null;
  const isOpen = card.status === "open" || card.status === "snoozed";

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast({ title: success });
      setNote("");
      setOutcome("");
      setSnoozeUntil("");
      setMoveTo("");
    } catch (error) {
      toast({
        title: "That did not work",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet open={!!card} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{card.person_name}</SheetTitle>
          <SheetDescription>
            {card.step_name ?? "No step"} · day {card.days_in_step} on this step
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={card.is_overdue ? "destructive" : "outline"}>
              {card.status === "completed"
                ? `Finished${card.outcome ? ` — ${card.outcome}` : ""}`
                : card.status === "removed"
                  ? `Removed${card.outcome ? ` — ${card.outcome}` : ""}`
                  : card.status === "snoozed"
                    ? `Snoozed until ${card.snooze_until}`
                    : card.due_on
                      ? `Due ${card.due_on}`
                      : "No due date"}
            </Badge>
            {card.assignee_name ? (
              <Badge variant="secondary">{card.assignee_name}</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-700">Unassigned</Badge>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-1.5 text-sm">
            {card.person_phone ? (
              <a href={`tel:${card.person_phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {card.person_phone}
              </a>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                No phone on record
              </p>
            )}
            {card.person_email && (
              <a href={`mailto:${card.person_email}`} className="flex items-center gap-2 hover:underline">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {card.person_email}
              </a>
            )}
            {card.household_name && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Home className="h-4 w-4" />
                {card.household_name}
              </p>
            )}
          </div>

          {isOpen && (
            <>
              <div className="space-y-2">
                <Label htmlFor="card-note">Add a note</Label>
                <Textarea
                  id="card-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Called Sunday evening. Invited to the Tuesday cell."
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() =>
                    run(
                      () => addNote.mutateAsync({ cardId: card.card_id, body: note }),
                      "Note added"
                    )
                  }
                >
                  {addNote.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <MessageSquarePlus className="h-4 w-4 mr-1" />
                  )}
                  Save note
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Move on</Label>
                <div className="flex gap-2">
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Next step" />
                    </SelectTrigger>
                    <SelectContent>
                      {(steps ?? [])
                        .filter((s) => s.is_active)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.sequence}. {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={advance.isPending}
                    onClick={() =>
                      run(
                        () =>
                          advance.mutateAsync({
                            cardId: card.card_id,
                            toStepId: moveTo || null,
                            note: note.trim() || null,
                          }),
                        "Card moved"
                      )
                    }
                  >
                    {advance.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-1" />
                    )}
                    {moveTo ? "Move" : "Next step"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leaving the step blank moves it to the next one in order.
                  Moving past the last step finishes the card.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="card-snooze">Come back to it later</Label>
                <div className="flex gap-2">
                  <Input
                    id="card-snooze"
                    type="date"
                    className="flex-1"
                    min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                    value={snoozeUntil}
                    onChange={(e) => setSnoozeUntil(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!snoozeUntil || snooze.isPending}
                    onClick={() =>
                      run(
                        () =>
                          snooze.mutateAsync({
                            cardId: card.card_id,
                            until: snoozeUntil,
                            note: note.trim() || null,
                          }),
                        "Snoozed"
                      )
                    }
                  >
                    {snooze.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <MoonStar className="h-4 w-4 mr-1" />
                    )}
                    Snooze
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="card-outcome">Finish</Label>
                <Input
                  id="card-outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="How did it end?"
                />
                <div className="flex flex-wrap gap-1.5">
                  {OUTCOME_SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setOutcome(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    disabled={complete.isPending}
                    onClick={() =>
                      run(
                        () =>
                          complete.mutateAsync({
                            cardId: card.card_id,
                            outcome: outcome.trim() || null,
                            note: note.trim() || null,
                          }),
                        "Card finished"
                      )
                    }
                  >
                    {complete.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Finish
                  </Button>
                  {canManage && (
                    <Button
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() =>
                        run(
                          () =>
                            remove.mutateAsync({
                              cardId: card.card_id,
                              reason: outcome.trim() || "Removed from the list",
                            }),
                          "Card removed"
                        )
                      }
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Take off the list
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Finishing and taking off the list are different things, and
                  the reports tell them apart — a removed card is not a
                  follow-up that worked.
                </p>
              </div>
            </>
          )}

          {!isOpen && canManage && (
            <Button
              variant="outline"
              disabled={reopen.isPending}
              onClick={() =>
                run(
                  () => reopen.mutateAsync({ cardId: card.card_id, note: null }),
                  "Card reopened"
                )
              }
            >
              {reopen.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Reopen
            </Button>
          )}

          <Separator />

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-4 w-4" />
              History
            </h3>
            {historyLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <ol className="space-y-3 border-l pl-4">
                {(history ?? []).map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground" />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">
                        {KIND_LABELS[entry.kind] ?? entry.kind}
                      </span>
                      {entry.to_step_name && (
                        <span className="text-xs text-muted-foreground">
                          → {entry.to_step_name}
                        </span>
                      )}
                      {entry.assignee_name && (
                        <span className="text-xs text-muted-foreground">
                          → {entry.assignee_name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString()} ·{" "}
                        {entry.actor_name ?? "Unknown"}
                      </span>
                    </div>
                    {entry.body && <p className="mt-0.5 text-sm">{entry.body}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
