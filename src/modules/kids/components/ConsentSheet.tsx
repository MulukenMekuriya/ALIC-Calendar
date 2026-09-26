/**
 * The consent sheet, shown at the desk before a family is checked in.
 *
 * ONCE PER HOUSEHOLD, NOT ONCE PER CHILD. The caller holds the dismissal in
 * the machine context so the 45-second idle wipe clears it. 216 unsigned
 * families times a per-child dialog is roughly 1,200 dialogs a month, which
 * is how volunteers learn to tap past things — and then the enforcement date
 * arrives having changed nobody's behaviour at all.
 *
 * WHAT IS ON THE TABLET, AND WHAT IS NOT. The short form: the children it
 * covers, participation, all four safety acknowledgments ticked individually,
 * the 911 authorisation, snack, off-site, photo consent per child, and the
 * signature block. The physician and insurance fields, the accommodation
 * description and the full sick-policy wording are left to the portal, where
 * a parent is sitting down.
 *
 * FOUR TICKS, NOT ONE. Section 3's items are listed separately because one
 * combined tick is one thing to deny afterwards and four are four.
 *
 * SECTION 4 DOES NOT ASK FOR MEDICAL TEXT AT A QUEUE. It shows what is
 * already on file and offers "This is correct" or "Something has changed".
 * The second does not open a medical form with people waiting; it records
 * that a follow-up is wanted. A form that silently asserts a negative because
 * nobody asked is worse than no form.
 *
 * TYPED NAME, NOT A DRAWN MARK. A finger-drawn squiggle on a shared tablet is
 * worth LESS evidentially: it matches no specimen the church holds, anyone
 * standing there can draw it, and it carries no metadata. The signer is
 * PICKED from the household's adults — free text alone is what lets "Mickey
 * Mouse" onto a legal record — and the typed string is stored beside them.
 */

import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { consentService, type ScreenedChild } from "../services/consentService";
import { useConsentDocument } from "../hooks/useConsent";
import { sectionsForSurface, missingAcknowledgments } from "../utils/consentDocument";
import { errorMessage } from "../services/rpcError";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  kidsSessionId: string | null;
  /** The screened rows for THIS household only. */
  screened: ScreenedChild[];
  shiftToken?: string | null;
  /** Signed, or set aside. Either way the check-in proceeds from here. */
  onResolved: (outcome: "signed" | "set_aside") => void;
  /** Whether this volunteer may let a family through without signing. */
  canGrantException?: boolean;
}

export function ConsentSheet({
  open,
  onOpenChange,
  organizationId,
  kidsSessionId,
  screened,
  shiftToken,
  onResolved,
  canGrantException = false,
}: Props) {
  const { toast } = useToast();
  const { data: doc, isLoading: docLoading } = useConsentDocument(
    open ? organizationId : undefined,
    "kiosk",
  );

  const [signers, setSigners] = useState<
    { person_id: string; full_name: string; household_id: string; has_email: boolean }[]
  >([]);
  const [prefill, setPrefill] = useState<
    { child_person_id: string; child_name: string; has_record: boolean; allergies: string | null }[]
  >([]);
  const [signerId, setSignerId] = useState("");
  const [printedName, setPrintedName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [photoDeclined, setPhotoDeclined] = useState<Record<string, boolean>>({});
  const [medicalChanged, setMedicalChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [showException, setShowException] = useState(false);

  const enforcing = screened.some((c) => c.enforcing);
  const householdId = screened[0]?.household_id ?? null;
  const childIds = useMemo(() => screened.map((c) => c.child_person_id), [screened]);

  // The prefill call writes an audit row per child, so it is fetched once when
  // the sheet opens rather than on every render.
  useEffect(() => {
    if (!open || childIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const [s, p] = await Promise.all([
          consentService.signers(childIds[0], shiftToken),
          consentService.consentPrefill(childIds, shiftToken),
        ]);
        if (cancelled) return;
        setSigners(s);
        setPrefill(p);
        if (s.length === 1) {
          setSignerId(s[0].person_id);
          setPrintedName(s[0].full_name);
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Could not load the form",
            description: errorMessage(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, childIds, shiftToken, toast]);

  const sections = useMemo(
    () => (doc ? sectionsForSurface(doc.body, "kiosk") : []),
    [doc],
  );

  const missing = useMemo(
    () =>
      doc
        ? missingAcknowledgments(
            doc.required_acknowledgments,
            Object.entries(ticked)
              .filter(([, v]) => v)
              .map(([k]) => k),
          )
        : [],
    [doc, ticked],
  );

  const nobodyCanBeEmailed =
    signers.length > 0 && signers.every((s) => !s.has_email);

  const canSign =
    !!doc && !!householdId && !!signerId && printedName.trim().length >= 2 && missing.length === 0;

  async function onSign() {
    if (!householdId || !doc) return;
    setSaving(true);
    try {
      const answers: Record<string, boolean> = { ...ticked };
      if (medicalChanged) answers.medical_needs_review = true;

      const perChild: Record<string, Record<string, boolean>> = {};
      for (const c of screened) {
        perChild[c.child_person_id] = photoDeclined[c.child_person_id]
          ? { photo_declined: true }
          : { photo_permitted: true };
      }

      await consentService.signAtStation({
        householdId,
        childPersonIds: childIds,
        signerPersonId: signerId,
        signerPrintedName: printedName.trim(),
        answers,
        perChildAnswers: perChild,
        signerRelationship: relationship.trim() || null,
        shiftToken,
      });

      toast({
        title: "Thank you — that is on file",
        description: nobodyCanBeEmailed
          ? "We have no email address for this family, so no copy could be sent. Please take one before they leave."
          : "A copy has been emailed to the person who signed.",
      });
      onResolved("signed");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "That did not save",
        description: errorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onGrantException() {
    if (!kidsSessionId) return;
    setSaving(true);
    try {
      for (const c of screened) {
        await consentService.grantException({
          childPersonId: c.child_person_id,
          kidsSessionId,
          reason: exceptionReason.trim(),
        });
      }
      toast({
        title: "Let through for today",
        description: "The family still needs to fill the form in.",
      });
      onResolved("set_aside");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not do that",
        description: errorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            {doc?.title ?? "Parent / Guardian Consent"}
          </DialogTitle>
          <DialogDescription>
            {enforcing
              ? "This form is needed before the children can go to a classroom. It takes about two minutes."
              : "We are asking every family to fill this in. It takes about two minutes, and check-in carries on either way."}
          </DialogDescription>
        </DialogHeader>

        {docLoading || !doc ? (
          <p className="py-8 text-sm text-muted-foreground">Loading the form…</p>
        ) : (
          <div className="space-y-5">
            {/* Who it covers ------------------------------------------------ */}
            <section className="rounded-md border p-3">
              <p className="text-sm font-medium mb-1.5">This form covers</p>
              <ul className="text-sm space-y-0.5">
                {screened.map((c) => (
                  <li key={c.child_person_id} className="flex flex-wrap items-center gap-2">
                    <span>{c.child_name}</span>
                    {c.state === "child_not_on_signature" && (
                      <Badge variant="outline">Not on the last form</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 4: what is on file ---------------------------------- */}
            <section className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Health and allergies on file</p>
              {prefill.map((p) => (
                <p key={p.child_person_id} className="text-sm">
                  <span className="font-medium">{p.child_name}:</span>{" "}
                  {p.allergies
                    ? p.allergies
                    : p.has_record
                      ? "nothing recorded"
                      : "we have not been told anything"}
                </p>
              ))}
              <label className="flex items-start gap-2 text-sm pt-1">
                <Checkbox
                  checked={medicalChanged}
                  onCheckedChange={(v) => setMedicalChanged(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Something has changed since we were last told
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    We will not ask you to fill it in here — one of the team will follow it
                    up with you, or you can update it at home in My Church.
                  </span>
                </span>
              </label>
            </section>

            {/* The document's own sections ---------------------------------- */}
            {sections
              .filter((s) => s.key !== "child_information" && s.key !== "health_information")
              .map((section) => (
                <section key={section.key} className="space-y-1.5">
                  <p className="text-sm font-medium">{section.heading}</p>
                  {section.text && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {section.text}
                    </p>
                  )}

                  {section.key === "photo_video"
                    ? /* PER CHILD, not per household. photo_consent is a
                         per-child column and one household answer applied to
                         N children overwrites real differences between them. */
                      screened.map((c) => (
                        <label
                          key={c.child_person_id}
                          className="flex items-start gap-2 text-sm pt-0.5"
                        >
                          <Checkbox
                            checked={!!photoDeclined[c.child_person_id]}
                            onCheckedChange={(v) =>
                              setPhotoDeclined((prev) => ({
                                ...prev,
                                [c.child_person_id]: v === true,
                              }))
                            }
                            className="mt-0.5"
                          />
                          <span>Please do not use photographs of {c.child_name}</span>
                        </label>
                      ))
                    : (section.options ?? []).map((option) => {
                        const required = doc.required_acknowledgments.includes(option.key);
                        return (
                          <label
                            key={option.key}
                            className="flex items-start gap-2 text-sm pt-0.5"
                          >
                            <Checkbox
                              checked={!!ticked[option.key]}
                              onCheckedChange={(v) =>
                                setTicked((prev) => ({ ...prev, [option.key]: v === true }))
                              }
                              className="mt-0.5"
                            />
                            <span>
                              {option.text}
                              {required && !ticked[option.key] && (
                                <span className="text-amber-700 dark:text-amber-500">
                                  {" "}
                                  (needed)
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                </section>
              ))}

            {/* The signature ------------------------------------------------ */}
            <section className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Signature</p>

              <div className="space-y-1.5">
                <Label htmlFor="signer">Who is signing?</Label>
                <Select
                  value={signerId}
                  onValueChange={(v) => {
                    setSignerId(v);
                    const s = signers.find((x) => x.person_id === v);
                    if (s) setPrintedName(s.full_name);
                  }}
                >
                  <SelectTrigger id="signer">
                    <SelectValue placeholder="Choose a parent or guardian" />
                  </SelectTrigger>
                  <SelectContent>
                    {signers.map((s) => (
                      <SelectItem key={s.person_id} value={s.person_id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {signers.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-500">
                    We have no parent or guardian on file for this family, so the form
                    cannot be signed yet. Please see a Kids Ministry leader.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="printed">Type your name</Label>
                <Input
                  id="printed"
                  value={printedName}
                  onChange={(e) => setPrintedName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rel">Relationship to the children</Label>
                <Input
                  id="rel"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="Mother, father, guardian…"
                  autoComplete="off"
                />
              </div>

              {nobodyCanBeEmailed && (
                /*
                 * TEN OF 216 HOUSEHOLDS HAVE NO ADULT EMAIL ADDRESS. They
                 * would sign a legal consent and receive nothing at all —
                 * there is no attachment to send and no office reissue, since
                 * the ministry decided the emailed PDF is the whole of it.
                 *
                 * So this asks BEFORE they sign rather than apologising
                 * after, and it says plainly what happens if they go ahead
                 * without one. Amber and specific, not a grey footnote: this
                 * is the one moment the address can still be captured.
                 */
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                  <p className="font-medium">
                    We have no email address for this family
                  </p>
                  <p className="text-muted-foreground mt-1">
                    If they sign now, they will not get a copy of the form and we
                    cannot send it later. Ask for an email address and add it to their
                    record first, or let them know they will not be receiving a copy.
                  </p>
                </div>
              )}

              {missing.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  {missing.length} {missing.length === 1 ? "item" : "items"} above still
                  need agreeing to.
                </p>
              )}
            </section>

            {/* The way out -------------------------------------------------- */}
            {enforcing && canGrantException && (
              <section className="rounded-md border border-dashed p-3 space-y-2">
                {!showException ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowException(true)}
                  >
                    This family cannot sign today
                  </Button>
                ) : (
                  <>
                    <Label htmlFor="exc" className="text-sm">
                      Let them through for this service — why?
                    </Label>
                    <Input
                      id="exc"
                      value={exceptionReason}
                      onChange={(e) => setExceptionReason(e.target.value)}
                      placeholder="Grandparent doing the drop-off"
                    />
                    <p className="text-xs text-muted-foreground">
                      One service only. It is not a waiver, and the family will still be
                      asked next time.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={exceptionReason.trim().length < 5 || saving}
                      onClick={onGrantException}
                    >
                      Let them through today
                    </Button>
                  </>
                )}
              </section>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/*
            In warn mode the way past is plain and unhidden: nothing is being
            refused, and a volunteer who cannot find the "not now" button will
            learn to distrust the whole screen.
          */}
          {!enforcing && (
            <Button
              variant="outline"
              onClick={() => onResolved("set_aside")}
              disabled={saving}
            >
              Not now
            </Button>
          )}
          <Button onClick={onSign} disabled={!canSign || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agree and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
