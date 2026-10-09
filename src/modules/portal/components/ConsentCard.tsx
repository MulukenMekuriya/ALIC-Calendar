/**
 * The children's consent form, on My Church.
 *
 * One card per household the parent is an adult of. It says where the form
 * stands in the family's own terms (consentState's familyMessage, the same
 * sentences written for this screen) and offers the one thing to do: fill it
 * in, fill it in again, or open the copy on file.
 *
 * The reminder email links to /my?tab=children&consent=1, and `autoOpen` is
 * that link opening the form straight away.
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { FileText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/shared/hooks/use-toast";
import { useMyConsentStatus } from "@/modules/kids/hooks/useConsent";
import { consentService } from "@/modules/kids/services/consentService";
import { familyMessage } from "@/modules/kids/utils/consentState";
import { errorMessage } from "@/modules/kids/services/rpcError";
import { joinNames } from "../utils/nextSteps";
import { ConsentFormDialog } from "./ConsentFormDialog";
import { consentFamilies, firstName, formatConsentDate, type FamilyConsent } from "../utils/consentFamilies";

interface Props {
  enabled?: boolean;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}

export function ConsentCard({ enabled = true, autoOpen = false, onAutoOpened }: Props) {
  const { toast } = useToast();
  const { data: rows } = useMyConsentStatus(enabled);
  const families = useMemo(() => consentFamilies(rows ?? []), [rows]);
  const [openFor, setOpenFor] = useState<FamilyConsent | null>(null);

  // The reminder email's link: open the form for the family that needs it.
  useEffect(() => {
    if (!autoOpen || families.length === 0) return;
    setOpenFor(families.find((f) => f.missing.length > 0 || f.resignBy) ?? families[0]);
    onAutoOpened?.();
  }, [autoOpen, families, onAutoOpened]);

  async function openCopy(signatureId: string) {
    // Opened before the await: a window opened after one is a pop-up, and
    // Safari blocks it.
    const win = window.open("", "_blank");
    try {
      const url = await consentService.signedFormUrl(signatureId);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      toast({ variant: "destructive", title: "Could not open your copy", description: errorMessage(err) });
    }
  }

  if (families.length === 0) return null;

  return (
    <>
      {families.map((family) => {
        const names = joinNames(family.children.map((c) => firstName(c.name)));
        const missingNames = joinNames(family.missing.map((c) => firstName(c.child_name)));
        const needed = family.missing.length > 0;
        const states = new Set(family.missing.map((r) => r.state));
        const message = needed
          ? states.size === 1 && !states.has("no_signature")
            ? familyMessage(family.missing[0].state, missingNames)
            : {
                headline: "Consent form needed",
                body: `We ask every family to fill in a short consent and medical form before the children go to their classrooms. We don't yet have one for ${missingNames}.`,
                action: "Fill in the form",
              }
          : null;

        return (
          <Card
            key={family.householdId}
            className={cn(needed || family.resignBy ? "border-amber-300 dark:border-amber-800" : "")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                {message ? message.headline : "Consent form"}
                {!needed && !family.resignBy && <Badge variant="secondary">On file</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {message ? (
                <p>{message.body}</p>
              ) : family.resignBy ? (
                <p>
                  You updated a medical detail, so we ask you to fill in the form for {names} again
                  by {formatConsentDate(family.resignBy)}. Until then nothing changes.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  We have your consent form for {names}
                  {family.signedAt ? `, signed ${formatConsentDate(family.signedAt)}` : ""}. It stays in
                  effect until you tell us otherwise.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {(needed || family.resignBy) && (
                  <Button onClick={() => setOpenFor(family)}>
                    {message?.action ?? "Fill in the form again"}
                  </Button>
                )}
                {family.signatureId && (
                  <Button variant="outline" onClick={() => openCopy(family.signatureId!)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Open my copy
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {openFor && (
        <ConsentFormDialog
          open
          onOpenChange={(o) => !o && setOpenFor(null)}
          household={openFor}
        />
      )}
    </>
  );
}
