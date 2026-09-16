/**
 * The household's name, address and telephone number, edited by the family.
 *
 * WHAT IS NOT ON THIS FORM, and is the reason the page's old sentence —
 * "a household is shared, so it is not edited from one person's login" — was
 * half right. Who is IN the household stays with the church office, because
 * adding an adult is not an address change: church.station_pickup_candidates
 * builds the collection screen from a child's household, and
 * church.notify_parents mails that household about check-in. The address, on
 * the other hand, is a fact every adult in the house already knows, and the
 * office learns it last.
 *
 * Only what changed is sent. church.update_my_household treats an absent key
 * as "leave alone" and null as "clear", so posting the whole form would
 * overwrite fields this dialog does not render.
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
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useUpdateMyHousehold } from "../hooks";
import { changedFields, isEmptyPatch, type Draft } from "../utils/formPatch";
import { sayWhyNot } from "../utils/sayWhyNot";
import type { MyHouseholdDetail } from "../types";

interface HouseholdDialogProps {
  household: MyHouseholdDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toDraft(h: MyHouseholdDetail): Draft {
  return {
    name: h.name ?? "",
    address_line1: h.address_line1 ?? "",
    address_line2: h.address_line2 ?? "",
    city: h.city ?? "",
    state: h.state ?? "",
    postal_code: h.postal_code ?? "",
    primary_phone: h.primary_phone ?? "",
  };
}

export function HouseholdDialog({ household, open, onOpenChange }: HouseholdDialogProps) {
  const { toast } = useToast();
  const original = useMemo(() => toDraft(household), [household]);
  const [draft, setDraft] = useState<Draft>(original);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateMyHousehold();

  // Re-seed when the household changes under us — a save elsewhere, or the
  // rare member who belongs to two.
  const [seededFor, setSeededFor] = useState(household.household_id);
  if (seededFor !== household.household_id) {
    setSeededFor(household.household_id);
    setDraft(original);
    setError(null);
  }

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    setError(null);
    const patch = changedFields(original, draft);

    if (isEmptyPatch(patch)) {
      onOpenChange(false);
      return;
    }
    if (!draft.name.trim()) {
      setError("The household needs a name — usually the family surname.");
      return;
    }

    try {
      await update.mutateAsync({ householdId: household.household_id, patch });
      toast({
        title: "Household updated",
        description: "The church office sees the new details straight away.",
      });
      onOpenChange(false);
    } catch (e) {
      setError(sayWhyNot(e));
    }
  };

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
          <DialogTitle>Edit household</DialogTitle>
          <DialogDescription>
            The address the church writes to, and the number it rings. To add or
            remove someone from the household, speak to the church office.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="h-name" label="Household name">
              <Input
                id="h-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="The Mekuriya Family"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="h-addr1" label="Address">
              <Input
                id="h-addr1"
                value={draft.address_line1}
                onChange={(e) => set("address_line1", e.target.value)}
                placeholder="902 Sligo Ave"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="h-addr2" label="Apartment, suite (optional)">
              <Input
                id="h-addr2"
                value={draft.address_line2}
                onChange={(e) => set("address_line2", e.target.value)}
              />
            </Field>
          </div>
          <Field id="h-city" label="City">
            <Input
              id="h-city"
              value={draft.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
          <Field id="h-state" label="State">
            <Input
              id="h-state"
              value={draft.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="MD"
            />
          </Field>
          <Field id="h-zip" label="ZIP code">
            <Input
              id="h-zip"
              inputMode="numeric"
              value={draft.postal_code}
              onChange={(e) => set("postal_code", e.target.value)}
            />
          </Field>
          <Field id="h-phone" label="Household phone">
            <Input
              id="h-phone"
              type="tel"
              value={draft.primary_phone}
              onChange={(e) => set("primary_phone", e.target.value)}
            />
          </Field>
        </div>

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
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
