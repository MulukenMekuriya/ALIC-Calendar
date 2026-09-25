/**
 * Collecting a child — a door of its own.
 *
 * WHY IT IS NOT A TAB ON THE CHECK-IN STATION. The station is heading towards
 * being a self-service kiosk on a shared lobby tablet that parents operate
 * themselves. Releasing a child must never be something a parent can reach, so
 * check-out needs a surface behind a real login rather than a tab next to one
 * a stranger is holding.
 *
 * That is a route gate AND a server rule: church.resolve_actor decides
 * can_check_out, and check_out_children refuses without it. This page is the
 * door; the database is the lock.
 *
 * It also gives check-out room. On the station it shared a screen with
 * check-in, which is how four buttons ended up in an unwrapped flex row and
 * clipped off both edges of a phone.
 *
 * THE CODE IS NEVER AN ORACLE. A code that matches nothing gets the same
 * answer as a code that matches a child already collected: "not recognised".
 * Anything else lets somebody probe for valid codes at the door.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { kidsStationService, kidsSessionService } from "../services";
import { errorMessage, isDbError } from "../services/rpcError";
import type { KidsSession, PickupMatchRow } from "../types";
import type { PickupCandidate } from "../utils/checkInMachine";
import { defaultCollector } from "../utils/pickupDefault";

export default function CheckOutPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const [session, setSession] = useState<KidsSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<PickupMatchRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<PickupCandidate[]>([]);
  const [collectorId, setCollectorId] = useState<string | null>(null);
  const [collectorName, setCollectorName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        // currentForDesk, not listOpen: a family collecting after the service
        // has been closed still needs their child back.
        const s = await kidsSessionService.currentForDesk(orgId);
        if (!cancelled) setSession(s);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!busy && matches === null) codeRef.current?.focus();
  }, [busy, matches]);

  /** Children on this code still in a room. */
  const stillIn = useMemo(
    () => (matches ?? []).filter((m) => m.status === "checked_in"),
    [matches]
  );
  const restricted = stillIn.some((m) => m.has_restriction);

  function reset() {
    setCode("");
    setMatches(null);
    setSelected([]);
    setCandidates([]);
    setCollectorId(null);
    setCollectorName("");
    setError(null);
    setDone(null);
  }

  async function lookUp() {
    if (!session || code.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await kidsStationService.resolvePickup(session.id, code.trim());
      const open = rows.filter((r) => r.status === "checked_in");
      if (open.length === 0) {
        // Deliberately the same message whether the code is wrong or the
        // children have already gone. No oracle.
        setError("That code was not recognised. Check it and try again.");
        setMatches(null);
        return;
      }
      setMatches(rows);
      setSelected(open.map((r) => r.check_in_id));

      // Who may collect ALL of them: the intersection, not the union. A person
      // authorised for one sibling must not walk out with the other.
      const lists = await Promise.all(
        open.map((r) =>
          kidsStationService.pickupCandidates(r.check_in_id).catch(() => [])
        )
      );
      const counts = new Map<string, { c: PickupCandidate; n: number }>();
      for (const list of lists) {
        for (const c of list) {
          const seen = counts.get(c.person_id);
          if (seen) seen.n += 1;
          else counts.set(c.person_id, { c, n: 1 });
        }
      }
      const intersection = [...counts.values()]
        .filter((v) => v.n === lists.length)
        .map((v) => v.c);
      setCandidates(intersection);

      // Offer the person who brought them. See utils/pickupDefault for the
      // three rules — chiefly that two different droppers, or any pickup
      // restriction in the family, mean no default at all.
      setCollectorId(defaultCollector(lists, intersection));
    } catch (err) {
      setError(
        isDbError(err, "not_permitted_to_check_out")
          ? "Your login cannot release children. Ask a Kids Ministry leader."
          : errorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!session || selected.length === 0) return;
    const name =
      candidates.find((c) => c.person_id === collectorId)?.display_name ??
      collectorName.trim();
    if (!name) {
      setError("Say who is collecting them.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rows = await kidsStationService.checkOut({
        checkInIds: selected,
        presented: code.trim(),
        pickedUpByPersonId: collectorId,
        pickedUpByName: collectorId ? null : name,
      });
      if (rows.length === 0) {
        // Zero rows and no error means nothing was released. Never let anyone
        // walk away on the strength of a screen that looked like it worked.
        setError(
          "Nothing was released. Do NOT hand the children over. Find a Kids Ministry leader."
        );
        return;
      }
      setDone(rows.map((r) => r.child_name));
    } catch (err) {
      setError(
        isDbError(err, "restricted_pickup_attempt")
          ? "This person may not collect this child. Find a Kids Ministry leader."
          : isDbError(err, "override_requires_admin")
            ? "Only a Kids Ministry lead can release without the code."
            : errorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/kids")}>
          <ArrowLeft className="h-4 w-4" />
          Kids Ministry
        </Button>
      </div>

      {!session ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No session today. Children can only be collected against a service
            that was opened.
          </AlertDescription>
        </Alert>
      ) : done ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-5 w-5" />
              Collected
            </CardTitle>
            <CardDescription>
              {done.join(", ")} {done.length === 1 ? "has" : "have"} been signed
              out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stillIn.length > selected.length && (
              <p className="text-sm text-muted-foreground">
                {stillIn.length - selected.length} still in class. The same code
                works until everyone is collected.
              </p>
            )}
            <Button onClick={reset}>Collect another</Button>
          </CardContent>
        </Card>
      ) : matches === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collect a child</CardTitle>
            <CardDescription>
              Scan the parent's slip, or type the code from it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="pickup-code">Pickup code</Label>
            <Input
              id="pickup-code"
              ref={codeRef}
              value={code}
              autoComplete="off"
              className="text-2xl font-mono tracking-[0.3em]"
              placeholder="A1B2C3"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                // A barcode scanner is a keyboard that ends with Enter.
                if (e.key === "Enter") void lookUp();
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="w-full"
              disabled={busy || code.trim().length < 4}
              onClick={() => void lookUp()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Who is going home?</CardTitle>
            <CardDescription>
              Untick a child staying in class. The code keeps working until
              everyone is collected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {restricted && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  There is a restriction on who may collect. Check carefully,
                  and find a Kids Ministry leader if you are unsure.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              {stillIn.map((m) => (
                <label
                  key={m.check_in_id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <Checkbox
                    checked={selected.includes(m.check_in_id)}
                    onCheckedChange={(v) =>
                      setSelected((s) =>
                        v
                          ? [...s, m.check_in_id]
                          : s.filter((x) => x !== m.check_in_id)
                      )
                    }
                  />
                  <span className="flex-1">
                    <span className="font-medium">{m.child_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.room_name} · tag {m.tag_number}
                    </span>
                  </span>
                  {m.has_restriction && (
                    <Badge variant="destructive">Restricted</Badge>
                  )}
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Who is collecting them?</Label>
              {candidates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nobody on file may collect all of these children together.
                  Write the name, and check who they are.
                </p>
              )}
              {candidates.map((c) => (
                <button
                  key={c.person_id}
                  type="button"
                  onClick={() => {
                    setCollectorId(c.person_id);
                    setCollectorName("");
                  }}
                  className={`w-full rounded-md border p-2 text-left text-sm ${
                    collectorId === c.person_id ? "border-primary bg-muted/50" : ""
                  }`}
                >
                  <span className="font-medium">{c.display_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.relationship}
                    {c.dropped_off && (
                      /* Says WHY this one is already chosen. Two people in a
                         household can share a name on this screen, so "the
                         one who brought them in" is often the only thing
                         telling them apart. */
                      <span className="text-primary"> · dropped them off</span>
                    )}
                  </span>
                </button>
              ))}
              <Input
                placeholder="Someone else — write their name"
                value={collectorName}
                onChange={(e) => {
                  setCollectorName(e.target.value);
                  setCollectorId(null);
                }}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button
                disabled={busy || selected.length === 0}
                onClick={() => void release()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Hand over ${selected.length}`
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </DashboardLayout>
  );
}
