/**
 * Add a child to a person, from that person's own record.
 *
 * The Families page can only add a child to a family record that already
 * exists, and most of the imported congregation has none — which is why an
 * admin with a parent in front of them on a Sunday ends up linking an existing
 * adult as their "child", or registering a second copy of the parent. Neither
 * produces a child the check-in desk can see.
 *
 * church.add_child_to_person makes the family record where there is none and
 * then does everything church.add_child_to_household does, so the child lands
 * with a parent relationship and a pickup authorisation and is on the desk
 * immediately.
 */

import { useState } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { householdService } from "../services/householdService";
import { useSchoolGrades } from "../hooks/useReference";
import { MONTH_NAMES } from "../types";

const NONE = "__none__";

export function AddChildToPersonDialog({
  open,
  personId,
  personName,
  organizationId,
  onClose,
  onAdded,
}: {
  open: boolean;
  personId: string;
  /** Used in the copy, so the dialog says whose child this is. */
  personName: string;
  organizationId: string | undefined;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { data: grades } = useSchoolGrades(organizationId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    birth_year: "",
    birth_month: NONE,
    school_grade_id: NONE,
  });

  const reset = () =>
    setForm({
      first_name: "",
      last_name: "",
      birth_year: "",
      birth_month: NONE,
      school_grade_id: NONE,
    });

  const save = async () => {
    setSaving(true);
    try {
      const result = await householdService.addChildToPerson(personId, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || undefined,
        birth_year: form.birth_year.trim() || undefined,
        birth_month: form.birth_month === NONE ? undefined : form.birth_month,
        school_grade_id:
          form.school_grade_id === NONE ? undefined : form.school_grade_id,
      });
      toast.success(`${form.first_name.trim()} was added`, {
        description: result.householdCreated
          ? `A family record was created for ${personName}, and the check-in desk can find ${form.first_name.trim()} now.`
          : `They are on ${personName}'s family, and the check-in desk can find them now.`,
      });
      reset();
      onClose();
      onAdded();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      toast.error("Could not add the child", {
        description: raw.includes("parent_is_a_child")
          ? `${personName} is marked as a child. Change that on Edit first, or add the child to the adult responsible for them.`
          : raw.includes("parent_is_archived")
            ? `${personName}'s record is archived.`
            : raw.includes("not_permitted")
              ? "Only the church office can add a child to somebody else's record."
              : raw,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {personName}&rsquo;s child</DialogTitle>
          <DialogDescription>
            A new member record for the child. {personName} becomes their parent
            and is authorised to collect them, and the check-in desk can find
            them by {personName}&rsquo;s name straight away. If {personName} has
            no family record yet, one is created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c-first">
                First name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="c-first"
                value={form.first_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, first_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-last">Last name</Label>
              <Input
                id="c-last"
                placeholder="Same as the family"
                value={form.last_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, last_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c-year">Birth year</Label>
              <Input
                id="c-year"
                inputMode="numeric"
                placeholder="2019"
                value={form.birth_year}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    birth_year: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Birth month</Label>
              <Select
                value={form.birth_month}
                onValueChange={(v) => setForm((f) => ({ ...f, birth_month: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not known" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not known</SelectItem>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>School grade</Label>
            <Select
              value={form.school_grade_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, school_grade_id: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Not on file" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not on file</SelectItem>
                {(grades ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The grade is what picks the classroom. Without it the desk
                still takes the child — church.pick_room_for_child falls back
                to the age band and then to any open room — but a leader has to
                move them, so it is worth asking for now. */}
            {form.school_grade_id === NONE && (
              <p className="text-xs text-muted-foreground">
                The grade decides their classroom. Without it they are placed
                wherever there is room and flagged for a leader to move.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button disabled={saving || !form.first_name.trim()} onClick={save}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add child
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
