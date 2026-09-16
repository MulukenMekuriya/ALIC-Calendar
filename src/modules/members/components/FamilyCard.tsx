/**
 * Family relationships, editable.
 *
 * The tab has been a read-only list since the schema was written, which was
 * survivable only while nothing could be wrong. The Breeze import ended that:
 * a member can carry four "Parent" rows naming two children, because the same
 * two kids arrived under two surname spellings and nothing in the app could
 * remove either pair.
 *
 * TWO CALLERS, DELIBERATELY DIFFERENT SIZES.
 *
 *   The office (members_admin) edits any tie on any record, and is the only
 *   one who can remove one.
 *
 *   A member edits how they stand towards THEIR OWN CHILDREN — parent or
 *   guardian, on a child already in their household — and cannot delete.
 *
 * The screen does not decide any of that. Every row arrives carrying an
 * `editable` flag the database computed with the same rule the write path
 * enforces, and the "add" picker is filled by a function that returns only
 * people this caller may actually link to. A second set of rules here would
 * eventually disagree with the first, and the disagreement would be silent.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Home, Baby, Plus, X, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useRelationshipTypes } from "../hooks/useReference";
import {
  useFamily,
  useFamilyCandidates,
  useSetRelationship,
  useRemoveRelationship,
} from "../hooks/useFamily";
import { familyErrorMessage, type FamilyTie } from "../services/familyService";

interface FamilyCardProps {
  personId: string;
  organizationId: string | undefined;
  /** Holds members_admin: may edit anyone, and is the only one who may remove. */
  canAdmin: boolean;
  /** This record belongs to the signed-in user. */
  isSelf: boolean;
}

/** The two an ordinary member may state about their own child. */
const MEMBER_TYPE_CODES = ["parent", "guardian"];

export function FamilyCard({
  personId,
  organizationId,
  canAdmin,
  isSelf,
}: FamilyCardProps) {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [chosenPerson, setChosenPerson] = useState<string | null>(null);
  const [chosenType, setChosenType] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FamilyTie | null>(null);

  const { data: ties, isLoading } = useFamily(personId, { asAdmin: canAdmin, isSelf });
  const { data: allTypes } = useRelationshipTypes(organizationId);
  const { data: candidates, isFetching: searching } = useFamilyCandidates(
    personId,
    search,
    addOpen
  );

  const setRelationship = useSetRelationship();
  const removeRelationship = useRemoveRelationship();

  const canEditAnything = canAdmin || isSelf;

  // An admin may state any type. A member may state the two that name an
  // adult's role towards a child; the database refuses the rest, so offering
  // them would only produce an error the person cannot act on.
  const offerableTypes = (allTypes ?? []).filter(
    (t) => canAdmin || MEMBER_TYPE_CODES.includes(t.code)
  );

  const changeType = (tie: FamilyTie, relationshipTypeId: string) => {
    setRelationship.mutate(
      { personId, relatedPersonId: tie.relatedPersonId, relationshipTypeId },
      {
        onSuccess: () => toast.success("Relationship updated"),
        onError: (e) => toast.error(familyErrorMessage(e)),
      }
    );
  };

  const addRelationship = () => {
    if (!chosenPerson || !chosenType) return;
    setRelationship.mutate(
      {
        personId,
        relatedPersonId: chosenPerson,
        relationshipTypeId: chosenType,
      },
      {
        onSuccess: () => {
          toast.success("Relationship added");
          setAddOpen(false);
          setChosenPerson(null);
          setChosenType(null);
          setSearch("");
        },
        onError: (e) => toast.error(familyErrorMessage(e)),
      }
    );
  };

  const remove = () => {
    if (!confirmRemove?.relationshipId) return;
    removeRelationship.mutate(
      {
        relationshipId: confirmRemove.relationshipId,
        personId,
        relatedPersonId: confirmRemove.relatedPersonId,
      },
      {
        onSuccess: () => {
          toast.success("Relationship removed");
          setConfirmRemove(null);
        },
        onError: (e) => toast.error(familyErrorMessage(e)),
      }
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4" />
              Family relationships
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Each relationship is stored once; the inverse is created
              automatically, so both people always agree.
            </CardDescription>
          </div>
          {canEditAnything && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(true)}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (ties?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No family relationships recorded.
            </p>
          ) : (
            <ul className="divide-y">
              {ties!.map((tie) => (
                <li
                  key={tie.relationshipId ?? tie.relatedPersonId}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <button
                    type="button"
                    className="text-sm font-medium flex items-center gap-2 hover:underline text-left"
                    onClick={() => navigate(`/members/${tie.relatedPersonId}`)}
                  >
                    {tie.isChild && (
                      <Baby className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    {tie.firstName} {tie.lastName}
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {tie.editable && canEditAnything ? (
                      <Select
                        value={
                          offerableTypes.find(
                            (t) => t.code === tie.relationshipCode
                          )?.id ?? undefined
                        }
                        onValueChange={(v) => changeType(tie, v)}
                        disabled={setRelationship.isPending}
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue placeholder={tie.relationshipName} />
                        </SelectTrigger>
                        <SelectContent>
                          {offerableTypes.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{tie.relationshipName}</Badge>
                    )}

                    {/* Removal is the office's alone, by request: detaching
                        yourself from a record is how a custody or safeguarding
                        note would quietly disappear. */}
                    {canAdmin && tie.relationshipId && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmRemove(tie)}
                        aria-label={`Remove ${tie.firstName} ${tie.lastName}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isSelf && !canAdmin && (
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
              You can record yourself as a parent or guardian of a child in your
              household. For anything else — a spouse, or a child who is not on
              your household yet — ask the office.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a family relationship</DialogTitle>
            <DialogDescription>
              {canAdmin
                ? "Anyone in this branch. The inverse is recorded automatically."
                : "A child in your household. Ask the office to add anyone who is not listed."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
              {searching ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (candidates?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground p-3">
                  Nobody to link to.
                </p>
              ) : (
                candidates!.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChosenPerson(c.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-muted ${
                      chosenPerson === c.id ? "bg-muted" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {c.isChild && (
                        <Baby className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {c.firstName} {c.lastName}
                      {c.householdName && (
                        <span className="text-xs text-muted-foreground">
                          {c.householdName}
                        </span>
                      )}
                    </span>
                    {c.alreadyRelated && (
                      <Badge variant="secondary" className="text-[10px]">
                        already linked
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>

            <Select
              value={chosenType ?? undefined}
              onValueChange={setChosenType}
            >
              <SelectTrigger>
                <SelectValue placeholder="How are they related?" />
              </SelectTrigger>
              <SelectContent>
                {offerableTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-xs text-muted-foreground">
              The type describes{" "}
              <strong>this person&rsquo;s</strong> role &mdash; choosing
              &ldquo;Parent&rdquo; records them as the parent of whoever you
              picked above.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addRelationship}
              disabled={
                !chosenPerson || !chosenType || setRelationship.isPending
              }
            >
              {setRelationship.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmRemove?.firstName} {confirmRemove?.lastName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the relationship from both records. It does not
              archive either person, and it does not change who may collect a
              child from Kids Ministry &mdash; that list is the household plus
              the pickup permissions, which are edited separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={removeRelationship.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
