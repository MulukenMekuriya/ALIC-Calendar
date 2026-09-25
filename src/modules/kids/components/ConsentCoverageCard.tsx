/**
 * How the signature collection is going.
 *
 * This is the card a Kids Ministry admin reads in mid-October to decide one
 * thing: does the enforcement date hold, or does it move. It exists because
 * the alternative is discovering the answer on the first enforced Sunday,
 * with a queue, which is not a decision anybody gets to make calmly.
 *
 * It deliberately shows BOTH counts. 216 households cover 534 children, so
 * the two numbers diverge by a factor of two and a half: reading only the
 * child count makes the job look larger than it is, and reading only the
 * household count hides a family who signed without naming a new baby.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import { useConsentCoverage } from "../hooks/useConsent";
import { sundaysBefore, signaturesPerSunday } from "../utils/consentSchedule";

interface Props {
  organizationId: string | undefined;
  /** The first enforced Sunday, once a policy row exists. */
  enforceFrom?: string | null;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function ConsentCoverageCard({ organizationId, enforceFrom }: Props) {
  const { data, isLoading, error } = useConsentCoverage(organizationId);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consent forms</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The coverage figures could not be loaded.
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consent forms</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Counting…</CardContent>
      </Card>
    );
  }

  const childPct = pct(data.children_covered, data.children_total);
  const homePct = pct(data.households_signed, data.households_total);
  const sundays = enforceFrom ? sundaysBefore(enforceFrom, new Date()) : null;

  // The number that actually decides it: signatures still needed, divided by
  // the Sundays left to collect them in.
  const homesLeft = Math.max(0, data.households_total - data.households_signed);
  const perSunday = sundays === null ? null : signaturesPerSunday(homesLeft, sundays);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          Consent forms
          <Badge variant={childPct >= 90 ? "default" : "secondary"}>
            {childPct}% of children
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span>Children covered</span>
            <span className="tabular-nums">
              {data.children_covered} of {data.children_total}
            </span>
          </div>
          <Progress value={childPct} />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span>Families who have signed</span>
            <span className="tabular-nums">
              {data.households_signed} of {data.households_total}
            </span>
          </div>
          <Progress value={homePct} />
          <p className="text-xs text-muted-foreground">
            One form covers a whole family, so this is the number of conversations
            still to have — not {data.children_uncovered}.
          </p>
        </div>

        {data.children_no_household > 0 && (
          /*
           * A child with no recorded guardian cannot be signed for at all —
           * the RPC refuses with no_guardian_on_record — so this number is a
           * different job from the rest of the card and must not be buried
           * inside "uncovered", where it would look like a form nobody has
           * got round to.
           */
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            <p className="font-medium">
              {data.children_no_household}{" "}
              {data.children_no_household === 1 ? "child has" : "children have"} no
              parent or guardian on file
            </p>
            <p className="text-muted-foreground mt-1">
              These cannot be signed for until a family record exists. Register the
              family first, then the form will work.
            </p>
          </div>
        )}

        {perSunday !== null && sundays !== null && (
          <div className="rounded-md border p-3 text-sm">
            <p>
              <span className="font-medium tabular-nums">{sundays}</span>{" "}
              {sundays === 1 ? "Sunday" : "Sundays"} left before the form is required,
              and <span className="font-medium tabular-nums">{homesLeft}</span>{" "}
              {homesLeft === 1 ? "family" : "families"} still to sign.
            </p>
            <p className="text-muted-foreground mt-1">
              That is about{" "}
              <span className="font-medium tabular-nums">{perSunday}</span> a Sunday.
              If that looks unrealistic in October, move the date rather than turning
              families away on the first Sunday it applies.
            </p>
          </div>
        )}

        {sundays === 0 && enforceFrom && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            The form is required from {enforceFrom}. Families who have not signed can
            still sign at the desk, and a leader can let a family through for one
            service.
          </div>
        )}

        {data.signatures_unreviewed > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.signatures_unreviewed} signed{" "}
            {data.signatures_unreviewed === 1 ? "form has" : "forms have"} not been
            marked as reviewed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
