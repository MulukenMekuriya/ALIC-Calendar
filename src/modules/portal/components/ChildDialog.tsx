/**
 * A child of this household — added by a parent, or corrected by one.
 *
 * One form for both, because "add Selam" and "Selam's surname is spelt wrong"
 * are the same field list stated twice. What differs is only which RPC it
 * posts to and what the save button says.
 *
 * WHY A PARENT MAY DO THIS. The church already lets a family state its own
 * children: church.station_register_visitor_family writes exactly these rows
 * from what a parent types on a kiosk at the check-in desk, with nobody from
 * the office in the loop. Doing it at home on a Tuesday is the same act.
 *
 * ADDING DOES MORE THAN IT LOOKS. church.add_child_to_household also records a
 * parent relationship from every adult in the household and a pickup
 * authorisation for each — without both, the check-in desk would offer nobody
 * when the child is collected and their own mother could not take them home.
 *
 * WHAT IS NOT HERE. Allergies and medical notes (church.person_sensitive) and
 * anything about who may collect a child (church.kids_pickup_restrictions).
 * Those are read at the desk with the child standing there, they sit next to
 * custody records, and widening them deserves its own decision rather than
 * arriving as a side-effect of a form about names. Tell the check-in desk.
 */

import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useSchoolGrades } from "@/modules/members/hooks";
import { PersonPhotoManager } from "@/modules/members/components";
import { useAddMyChild, useUpdateMyChild } from "../hooks";
import { changedFields, isEmptyPatch, type Draft } from "../utils/formPatch";
import { sayWhyNot } from "../utils/sayWhyNot";
import type { MyChild, PortalPatch } from "../types";

/** A Select cannot hold an empty string, so "not recorded" needs a value. */
const NONE = "__none__";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The columns church.people stores as numbers. */
const NUMERIC = ["birth_year", "birth_month"] as const;

interface ChildDialogProps {
  /** The child being corrected, or null when one is being added. */
  child: MyChild | null;
  householdId: string | undefined;
  organizationId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY: Draft = {
  first_name: "",
  last_name: "",
  preferred_name: "",
  birth_month: "",
  birth_year: "",
  school_grade_id: "",
};

export function ChildDialog({
  child,
  householdId,
  organizationId,
  open,
  onOpenChange,
}: ChildDialogProps) {
  const { toast } = useToast();
  const grades = useSchoolGrades(organizationId);
  const add = useAddMyChild();
  const update = useUpdateMyChild();
  const isEdit = child !== null;

  /*
   * Seeded from the parts, not from the display name: church.my_children
   * returns first_name and last_name separately for exactly this reason — a
   * child with two given names does not split back out of "Selam Ruth One".
   *
   * A middle name is not on this form and is therefore never in the draft, so
   * changedFields cannot report it and the RPC cannot clear it.
   */
  const original = useMemo<Draft>(() => {
    if (!child) return EMPTY;
    return {
      ...EMPTY,
      first_name: child.first_name ?? "",
      last_name: child.last_name ?? "",
      preferred_name: child.preferred_name ?? "",
      birth_month: child.birth_month ? String(child.birth_month) : "",
      birth_year: child.birth_year ? String(child.birth_year) : "",
      school_grade_id: child.school_grade_id ?? "",
    };
  }, [child]);

  const [draft, setDraft] = useState<Draft>(original);
  const [error, setError] = useState<string | null>(null);

  const seedKey = child?.person_id ?? "new";
  const [seededFor, setSeededFor] = useState(seedKey);
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDraft(original);
    setError(null);
  }

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const validate = (): string | null => {
    if (!draft.first_name.trim()) return "A first name is needed.";
    if (draft.birth_month && !draft.birth_year)
      return "A birth month needs a birth year as well, otherwise it cannot be turned into an age.";
    return null;
  };

  const submit = async () => {
    setError(null);
    const complaint = validate();
    if (complaint) {
      setError(complaint);
      return;
    }

    try {
      if (isEdit) {
        const patch = changedFields(original, draft, NUMERIC);
        if (isEmptyPatch(patch)) {
          onOpenChange(false);
          return;
        }
        await update.mutateAsync({ childId: child!.person_id, patch });
        toast({ title: "Saved", description: `${draft.first_name}'s record is updated.` });
      } else {
        if (!householdId) return;
        // Not a patch: this builds a new record, so only the fields actually
        // filled in are sent and the rest are simply absent.
        const fresh: PortalPatch = {};
        for (const [key, value] of Object.entries(draft)) {
          const trimmed = value.trim();
          if (trimmed) fresh[key] = trimmed;
        }
        await add.mutateAsync({ householdId, child: fresh });
        toast({
          title: `${draft.first_name} added`,
          description:
            "Every adult in your household is now recorded as a parent and may collect them.",
        });
      }
      onOpenChange(false);
    } catch (e) {
      setError(sayWhyNot(e));
    }
  };

  const pending = add.isPending || update.isPending;

  const Field = ({
    id,
    label,
    children,
  }: {
    id: string;
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${child!.display_name}` : "Add a child"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "A photo helps the check-in desk hand the right child to the right adult. For allergies, medical notes or who may collect them, speak to the desk — those are not changed from here."
              : "A child of your household, so the check-in desk knows them on Sunday. Allergies are recorded at the desk."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-first" label="First name">
            <Input
              id="c-first"
              value={draft.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </Field>
          <Field id="c-last" label="Last name">
            <Input
              id="c-last"
              value={draft.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              placeholder={isEdit ? "" : "Your surname, if left blank"}
            />
          </Field>
          <Field id="c-preferred" label="Called (optional)">
            <Input
              id="c-preferred"
              value={draft.preferred_name}
              onChange={(e) => set("preferred_name", e.target.value)}
            />
          </Field>
          <Field id="c-grade" label="School grade">
            <Select
              value={draft.school_grade_id || NONE}
              onValueChange={(v) => set("school_grade_id", v === NONE ? "" : v)}
            >
              <SelectTrigger id="c-grade">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {(grades.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Month and year, never a day: church.people has never stored one
              for anybody, children included (20260320000400). A month is
              enough to place a child in a classroom and to know whose birthday
              it is. */}
          <Field id="c-bmonth" label="Birth month">
            <Select
              value={draft.birth_month || NONE}
              onValueChange={(v) => set("birth_month", v === NONE ? "" : v)}
            >
              <SelectTrigger id="c-bmonth">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="c-byear" label="Birth year">
            <Input
              id="c-byear"
              inputMode="numeric"
              value={draft.birth_year}
              onChange={(e) => set("birth_year", e.target.value)}
              placeholder="2017"
            />
          </Field>
        </div>

        <p className="text-xs text-muted-foreground">
          The grade is what the children's ministry places a child by, so it is
          worth changing each September.
        </p>

        {/* Photos only when editing: church.add_person_photo needs a person to
            hang them on, and on the add path there is not one yet. Add the
            child, then reopen to put a face to them. */}
        {isEdit && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Photos</p>
            <PersonPhotoManager
              personId={child!.person_id}
              personName={child!.display_name}
              isChild
            />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save" : "Add child"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
