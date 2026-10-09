/**
 * The consent form, filled in at home in My Church.
 *
 * The full form: the same questions the desk asks, plus the parts the desk
 * leaves for someone sitting down (the sick policy). Asked through
 * ConsentQuestions, so an either/or question takes exactly one answer here as
 * at the desk, and sign_kids_consent checks it again.
 *
 * The parent signs as themselves. The signer is their own person in the
 * household, not picked from a list: on this path sign_kids_consent refuses
 * anybody else. They type their name, which is stored beside it.
 *
 * It names every child in the household, not only the ones missing: a new
 * form replaces the family's last one, and a child left off it would need
 * yet another.
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
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { ConsentQuestions } from "@/modules/kids/components/ConsentQuestions";
import { useConsentDocument, useSignConsentAtHome } from "@/modules/kids/hooks/useConsent";
import { unansweredSections, type PerChildAnswers } from "@/modules/kids/utils/consentDocument";
import { errorMessage } from "@/modules/kids/services/rpcError";
import { joinNames } from "../utils/nextSteps";

export interface ConsentHousehold {
  organizationId: string;
  householdId: string;
  signerPersonId: string;
  signerName: string;
  children: { id: string; name: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household: ConsentHousehold;
}

export function ConsentFormDialog({ open, onOpenChange, household }: Props) {
  const { toast } = useToast();
  const { data: doc, isLoading } = useConsentDocument(
    open ? household.organizationId : undefined,
    "portal",
  );
  const sign = useSignConsentAtHome();

  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [perChild, setPerChild] = useState<PerChildAnswers>({});
  const [printedName, setPrintedName] = useState(household.signerName);
  const [relationship, setRelationship] = useState("");

  const childIds = useMemo(() => household.children.map((c) => c.id), [household.children]);
  const unanswered = useMemo(
    () => (doc ? unansweredSections(doc, "portal", answers, perChild, childIds) : []),
    [doc, answers, perChild, childIds],
  );
  const canSign = !!doc && unanswered.length === 0 && printedName.trim().length >= 2;

  async function onSign() {
    try {
      await sign.mutateAsync({
        organizationId: household.organizationId,
        householdId: household.householdId,
        childPersonIds: childIds,
        signerPersonId: household.signerPersonId,
        signerPrintedName: printedName.trim(),
        answers,
        perChildAnswers: perChild,
        signerRelationship: relationship.trim() || null,
      });
      toast({
        title: "Thank you. Your form is on file",
        description: "A copy is on its way to your email. Please keep it: it is your record.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "That did not save",
        description: errorMessage(err),
      });
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
            For {joinNames(household.children.map((c) => c.name))}. It takes about five
            minutes.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !doc ? (
          <p className="py-8 text-sm text-muted-foreground">Loading the form…</p>
        ) : (
          <div className="space-y-5">
            <section className="rounded-md border p-3">
              <p className="text-sm font-medium mb-1.5">This form covers</p>
              <ul className="text-sm space-y-0.5">
                {household.children.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Allergies and medical details are kept on each child's record. If anything has
                changed, update it on the My children tab with the heart button.
              </p>
            </section>

            <ConsentQuestions
              doc={doc}
              surface="portal"
              childList={household.children}
              answers={answers}
              perChild={perChild}
              onAnswersChange={setAnswers}
              onPerChildChange={setPerChild}
              unanswered={unanswered}
            />

            <section className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Signature</p>
              <p className="text-sm text-muted-foreground">
                Signing as <span className="font-medium text-foreground">{household.signerName}</span>
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="consent-printed-name">Type your full name</Label>
                <Input
                  id="consent-printed-name"
                  value={printedName}
                  onChange={(e) => setPrintedName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consent-relationship">Relationship to the children</Label>
                <Input
                  id="consent-relationship"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="Mother, father, guardian…"
                  autoComplete="off"
                />
              </div>
              {unanswered.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Still to answer: {unanswered.map((u) => u.heading).join("; ")}
                </p>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sign.isPending}>
            Not now
          </Button>
          <Button onClick={onSign} disabled={!canSign || sign.isPending}>
            {sign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sign the form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
