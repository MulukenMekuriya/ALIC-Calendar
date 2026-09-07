/**
 * Put somebody into a workflow by hand.
 *
 * The person search reuses the members module's directory query rather than a
 * giving-style definer function, because opening a card requires
 * members_admin, and members_admin can read church.people through RLS already.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Loader2, Search, UserRound } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { memberService } from "@/modules/members/services";
import { displayName } from "@/modules/members/utils/normalize";
import { useAddPersonToWorkflow } from "../hooks";

interface AddToWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  workflowId: string | null;
  workflowName: string;
}

export function AddToWorkflowDialog({
  open,
  onOpenChange,
  organizationId,
  workflowId,
  workflowName,
}: AddToWorkflowDialogProps) {
  const { toast } = useToast();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("");
  const addPerson = useAddPersonToWorkflow();

  const { data, isFetching } = useQuery({
    queryKey: ["church", "workflows", "person-search", organizationId, term],
    queryFn: () => memberService.list(organizationId, { search: term.trim() }, 0, 10),
    enabled: open && term.trim().length >= 3,
    staleTime: 30_000,
  });

  const submit = async () => {
    if (!workflowId || !selected) return;
    try {
      await addPerson.mutateAsync({
        organizationId,
        workflowId,
        personId: selected.id,
        note: note.trim() || null,
      });
      toast({
        title: "Added",
        description: `${selected.name} is now in ${workflowName}.`,
      });
      setSelected(null);
      setTerm("");
      setNote("");
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not add them",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add somebody to {workflowName}</DialogTitle>
          <DialogDescription>
            Somebody already being followed up in this workflow will not get a
            second card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {selected ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="font-medium">{selected.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search the directory…"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
                {isFetching && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {(data?.rows.length ?? 0) > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                  {data!.rows.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
                      onClick={() =>
                        setSelected({ id: person.id, name: displayName(person) })
                      }
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{displayName(person)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {person.email ?? person.phone ?? "No contact details"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="add-note">Opening note</Label>
            <Textarea
              id="add-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why they are being followed up."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!selected || !workflowId || addPerson.isPending}>
            {addPerson.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
