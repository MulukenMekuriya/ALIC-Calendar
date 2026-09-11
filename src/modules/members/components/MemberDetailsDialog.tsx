/**
 * The edit form for one member record.
 *
 * Used from two places with the same field list: an administrator on
 * /members/:id, and a member on their own record in My Church. What differs is
 * only which fields are shown — `canAdmin` reveals the four the church
 * reserves to the office — and the database enforces that boundary again in
 * church.update_person_details, so a hand-built request cannot get past it.
 *
 * ONLY CHANGED FIELDS ARE SENT. The RPC treats an absent key as "leave alone"
 * and an explicit null as "clear", so posting the whole form would overwrite
 * values this dialog does not render. The diff is computed on submit.
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useUpdatePersonDetails } from "../hooks/useMembers";
import { useMembershipStatuses } from "../hooks/useReference";
import type { Member } from "../types";

/** Sentinel for "no value", because a Select cannot hold an empty string. */
const NONE = "__none__";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The shape the form holds: every value a string, so inputs stay controlled. */
type Draft = Record<string, string>;

function toDraft(m: Member): Draft {
  return {
    first_name: m.first_name ?? "",
    middle_name: m.middle_name ?? "",
    last_name: m.last_name ?? "",
    preferred_name: m.preferred_name ?? "",
    amharic_name: m.amharic_name ?? "",
    birth_year: m.birth_year ? String(m.birth_year) : "",
    birth_month: m.birth_month ? String(m.birth_month) : "",
    gender: m.gender ?? "",
    marital_status: m.marital_status ?? "",
    email: m.email ?? "",
    phone: m.phone ?? "",
    membership_status_id: m.membership_status_id ?? "",
    member_since: m.member_since ?? "",
    accepted_lord_year: m.accepted_lord_year ? String(m.accepted_lord_year) : "",
    accepted_lord_month: m.accepted_lord_month ? String(m.accepted_lord_month) : "",
    notes: m.notes ?? "",
    member_number: m.member_number ?? "",
  };
}

interface MemberDetailsDialogProps {
  member: Member;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reveals the fields reserved to the members module. */
  canAdmin: boolean;
  organizationId: string | undefined;
}

export function MemberDetailsDialog({
  member,
  open,
  onOpenChange,
  canAdmin,
  organizationId,
}: MemberDetailsDialogProps) {
  const { toast } = useToast();
  const original = useMemo(() => toDraft(member), [member]);
  const [draft, setDraft] = useState<Draft>(original);
  const [error, setError] = useState<string | null>(null);

  const statuses = useMembershipStatuses(organizationId);
  const update = useUpdatePersonDetails();

  const set = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Re-seed when a different member is opened, or the record changes under us.
  const [seededFor, setSeededFor] = useState(member.id);
  if (seededFor !== member.id) {
    setSeededFor(member.id);
    setDraft(original);
    setError(null);
  }

  /** Only what the user actually altered; "" becomes null, to clear. */
  const buildPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(draft)) {
      if (draft[key] === original[key]) continue;
      const raw = draft[key].trim();
      if (raw === "") {
        patch[key] = null;
        continue;
      }
      patch[key] =
        key === "birth_year" ||
        key === "birth_month" ||
        key === "accepted_lord_year" ||
        key === "accepted_lord_month"
          ? Number(raw)
          : raw;
    }
    return patch;
  };

  const submit = async () => {
    setError(null);
    const patch = buildPatch();

    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setError("A first and last name are both required.");
      return;
    }
    // A month with no year cannot be turned into an age, so the database
    // refuses it (chk_people_month_needs_year). Say so here instead.
    if (draft.birth_month.trim() && !draft.birth_year.trim()) {
      setError("A birth month needs a birth year as well.");
      return;
    }
    if (draft.accepted_lord_month.trim() && !draft.accepted_lord_year.trim()) {
      setError("The month you accepted the Lord needs a year as well.");
      return;
    }

    try {
      await update.mutateAsync({ personId: member.id, patch });
      toast({
        title: "Saved",
        description: `${Object.keys(patch).length} field${
          Object.keys(patch).length === 1 ? "" : "s"
        } updated.`,
      });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The RPC's error codes, turned into something a person can act on.
      if (/invalid_email/.test(msg)) setError("That email address is not valid.");
      else if (/requires_members_admin/.test(msg))
        setError("That field can only be changed by the church office.");
      else if (/not_your_record/.test(msg))
        setError("You can only edit your own record.");
      else if (/first_name_required|last_name_required/.test(msg))
        setError("A first and last name are both required.");
      else if (/uq_people_member_number/.test(msg))
        setError("Another member already has that member number.");
      else setError(msg);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit {member.first_name} {member.last_name}
          </DialogTitle>
          <DialogDescription>
            Every change is recorded against this record, with the old and new
            value, so the office can see what moved and who moved it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="f-first" label="First name">
            <Input
              id="f-first"
              value={draft.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </Field>
          <Field id="f-last" label="Last name">
            <Input
              id="f-last"
              value={draft.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </Field>
          <Field id="f-middle" label="Middle name">
            <Input
              id="f-middle"
              value={draft.middle_name}
              onChange={(e) => set("middle_name", e.target.value)}
            />
          </Field>
          <Field id="f-preferred" label="Preferred name">
            <Input
              id="f-preferred"
              value={draft.preferred_name}
              onChange={(e) => set("preferred_name", e.target.value)}
            />
          </Field>
          <Field id="f-amharic" label="Amharic name">
            <Input
              id="f-amharic"
              value={draft.amharic_name}
              onChange={(e) => set("amharic_name", e.target.value)}
              placeholder="ስም"
            />
          </Field>
          <Field id="f-phone" label="Phone">
            <Input
              id="f-phone"
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field id="f-email" label="Email">
            <Input
              id="f-email"
              type="email"
              value={draft.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field id="f-gender" label="Gender">
            <Select
              value={draft.gender || NONE}
              onValueChange={(v) => set("gender", v === NONE ? "" : v)}
            >
              <SelectTrigger id="f-gender">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="unspecified">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="f-marital" label="Marital status">
            <Select
              value={draft.marital_status || NONE}
              onValueChange={(v) => set("marital_status", v === NONE ? "" : v)}
            >
              <SelectTrigger id="f-marital">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {["single", "married", "widowed", "divorced", "separated", "other"].map(
                  (s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </Field>

          {/* Month and year only. No day of birth is stored for anybody,
              children included — see 20260320000400. */}
          <Field id="f-bmonth" label="Birth month">
            <Select
              value={draft.birth_month || NONE}
              onValueChange={(v) => set("birth_month", v === NONE ? "" : v)}
            >
              <SelectTrigger id="f-bmonth">
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
          <Field id="f-byear" label="Birth year">
            <Input
              id="f-byear"
              inputMode="numeric"
              placeholder="e.g. 1990"
              value={draft.birth_year}
              onChange={(e) => set("birth_year", e.target.value.replace(/\D/g, ""))}
            />
          </Field>

          <Field id="f-status" label="Membership status">
            <Select
              value={draft.membership_status_id || NONE}
              onValueChange={(v) =>
                set("membership_status_id", v === NONE ? "" : v)
              }
            >
              <SelectTrigger id="f-status">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {(statuses.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="f-since" label="Member since">
            <Input
              id="f-since"
              type="date"
              value={draft.member_since}
              onChange={(e) => set("member_since", e.target.value)}
            />
          </Field>

          <Field id="f-almonth" label="Accepted the Lord — month">
            <Select
              value={draft.accepted_lord_month || NONE}
              onValueChange={(v) =>
                set("accepted_lord_month", v === NONE ? "" : v)
              }
            >
              <SelectTrigger id="f-almonth">
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
          <Field id="f-alyear" label="Accepted the Lord — year">
            <Input
              id="f-alyear"
              inputMode="numeric"
              value={draft.accepted_lord_year}
              onChange={(e) =>
                set("accepted_lord_year", e.target.value.replace(/\D/g, ""))
              }
            />
          </Field>

          {canAdmin && (
            <Field id="f-number" label="Member number (office only)">
              <Input
                id="f-number"
                value={draft.member_number}
                onChange={(e) => set("member_number", e.target.value)}
              />
            </Field>
          )}

          <div className="sm:col-span-2">
            <Field id="f-notes" label="Notes">
              <Textarea
                id="f-notes"
                rows={4}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
