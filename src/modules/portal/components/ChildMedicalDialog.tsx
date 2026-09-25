/**
 * A parent says what they know about their own child.
 *
 * This is the screen that reverses the portal's previous position. It used to
 * say allergies and medical notes were not changed from here and to tell the
 * desk. The parent is the authoritative source, there are ten medical records
 * on file for 534 children, and section 10 of the church's own consent form
 * already makes it the parent's job to tell us about changes. Refusing to let
 * them was the odd part.
 *
 * TWO THINGS THE PARENT IS TOLD PLAINLY, because both are surprising if you
 * only find out afterwards:
 *
 *   1. What they write here is printed on their child's classroom label and
 *      read by volunteers. Nobody should discover that after typing something
 *      they thought was private to the office.
 *   2. Changing it means filling the consent form in again, with a date. Said
 *      up front, so nobody feels ambushed by the email that follows.
 *
 * WHAT IS NOT HERE. Who may collect the child — those are custody records and
 * a different decision. And photo consent, which belongs to section 9 of the
 * consent form where it is asked per child with the explanation it needs.
 */

import { useEffect, useState } from "react";
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
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { useChildMedical, useUpdateChildMedical } from "@/modules/kids/hooks/useConsent";
import { errorMessage, isDbError } from "@/modules/kids/services/rpcError";
import type { AllergySeverity } from "@/modules/kids/services/consentService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childPersonId: string;
  childName: string;
}

/**
 * The four the database permits. There is deliberately no "moderate" — it
 * reads like a real answer and the column rejects it.
 */
const SEVERITIES: { value: AllergySeverity; label: string }[] = [
  { value: "mild", label: "Mild — uncomfortable, not dangerous" },
  { value: "severe", label: "Severe — needs treating straight away" },
  { value: "life_threatening", label: "Life-threatening — carries an EpiPen" },
];

export function ChildMedicalDialog({ open, onOpenChange, childPersonId, childName }: Props) {
  const { toast } = useToast();
  const { data, isLoading } = useChildMedical(open ? childPersonId : undefined);
  const save = useUpdateChildMedical();

  const [allergies, setAllergies] = useState("");
  const [severity, setSeverity] = useState<AllergySeverity | "">("");
  const [medications, setMedications] = useState("");
  const [notes, setNotes] = useState("");
  const [needs, setNeeds] = useState("");
  const [nothingToTell, setNothingToTell] = useState(false);

  useEffect(() => {
    if (!data) return;
    setAllergies(data.allergies ?? "");
    setSeverity(
      data.allergy_severity && data.allergy_severity !== "none"
        ? (data.allergy_severity as AllergySeverity)
        : "",
    );
    setMedications(data.medications ?? "");
    setNotes(data.medical_notes ?? "");
    setNeeds(data.special_needs ?? "");
    // Only pre-tick it when the family has actually said so before. A box
    // that arrives ticked would assert a negative nobody stated — which is
    // exactly the failure this whole field exists to avoid.
    setNothingToTell(data.has_record === true && !data.allergies && !data.medications);
  }, [data]);

  const hasAllergy = allergies.trim().length > 0;
  const needsSeverity = hasAllergy && severity === "";

  async function onSave() {
    try {
      const result = await save.mutateAsync({
        childPersonId,
        allergies: allergies.trim() || null,
        allergySeverity: hasAllergy ? (severity as AllergySeverity) : "none",
        medications: medications.trim() || null,
        medicalNotes: notes.trim() || null,
        specialNeeds: needs.trim() || null,
        noKnownConditions: nothingToTell,
      });

      if (!result?.changed) {
        toast({ title: "Nothing to change", description: "That is what we already had." });
        onOpenChange(false);
        return;
      }

      if (result.consent_now_stale && result.resign_due_by) {
        const due = new Date(`${result.resign_due_by}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        toast({
          title: "Thank you — we have updated it",
          description:
            `${childName}'s classroom will see this from now on. Because the consent form ` +
            `was signed before this change, please fill it in once more by ${due}. ` +
            `We have emailed you about it as well.`,
        });
      } else {
        toast({
          title: "Thank you — we have updated it",
          description: `${childName}'s classroom will see this from now on.`,
        });
      }
      onOpenChange(false);
    } catch (err) {
      // The server refuses an allergy with no severity rather than filing it
      // as "none", so this is a real answer and deserves a real sentence.
      if (isDbError(err, "severity_required_with_allergies")) {
        toast({
          variant: "destructive",
          title: "How serious is it?",
          description:
            "Please choose how serious the allergy is. We would rather ask than guess, " +
            "because the answer changes what a volunteer does.",
        });
        return;
      }
      toast({
        variant: "destructive",
        title: "That did not save",
        description: errorMessage(err),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{childName}'s health and allergies</DialogTitle>
          <DialogDescription>
            You know {childName} better than we do. What you write here is printed on their
            classroom label and read by the volunteers looking after them.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies (food, medication, environmental)</Label>
              <Input
                id="allergies"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Peanuts and tree nuts"
              />
              <p className="text-xs text-muted-foreground">
                Keep it short — this is what goes on the label. Anything longer belongs in
                the notes below, which the desk reads in full.
              </p>
            </div>

            {hasAllergy && (
              <div className="space-y-1.5">
                <Label htmlFor="severity">How serious is it?</Label>
                <Select
                  value={severity}
                  onValueChange={(v) => setSeverity(v as AllergySeverity)}
                >
                  <SelectTrigger id="severity" aria-invalid={needsSeverity}>
                    <SelectValue placeholder="Please choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsSeverity && (
                  <p className="text-xs text-amber-700 dark:text-amber-500">
                    We ask rather than guess — the answer changes what a volunteer does.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="medications">Medications we should know about</Label>
              <Input
                id="medications"
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Our volunteers do not generally give medication. EpiPens are the exception,
                and only with training and a written plan agreed beforehand.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Medical conditions or anything else</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="needs">Support or accommodations</Label>
              <Textarea
                id="needs"
                rows={2}
                value={needs}
                onChange={(e) => setNeeds(e.target.value)}
                placeholder="Triggers, how they communicate, what helps"
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={nothingToTell}
                onCheckedChange={(v) => setNothingToTell(v === true)}
                className="mt-0.5"
              />
              <span>
                {childName} has no known allergies, medical conditions or emergency
                medication needs.
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Worth ticking even when the boxes above are empty — it tells us you were
                  asked and there is nothing, which is not the same as nobody asking.
                </span>
              </span>
            </label>

            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              If you change this after signing the consent form, we will ask you to fill the
              form in once more so the two agree. You get four weeks, nothing is held up in
              the meantime, and we will email you a reminder.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={save.isPending || isLoading || needsSeverity}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
