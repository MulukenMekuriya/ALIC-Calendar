/**
 * The teacher's form.
 *
 * Deliberately short. A volunteer writing this has a room to get back to, and
 * a form that takes ten minutes is a form that gets written as "see me".
 *
 * SEVERITY IS ASKED IN PLAIN WORDS, not as a label to interpret. "Did anyone
 * get hurt?" is answerable by someone who has never read a safeguarding
 * policy; "injury" invites a volunteer to decide what the word means.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useMyIncidents, useRaiseIncident, useStillHere } from "../hooks/useKidsLeader";
import { errorMessage } from "../services/rpcError";

const CHOICES = [
  {
    value: "behaviour",
    ask: "Something happened in the room",
    hint: "Behaviour, an upset, something a parent should probably know.",
  },
  {
    value: "injury",
    ask: "Somebody got hurt",
    hint: "Any injury, however small. Leaders are told straight away.",
  },
  {
    value: "safeguarding",
    ask: "I am worried about a child's safety",
    hint: "Anything about a child's wellbeing outside the classroom. Goes to leaders only.",
  },
] as const;

export function RaiseIncidentCard({
  organizationId,
}: {
  organizationId: string | undefined;
}) {
  const { data: here } = useStillHere(organizationId);
  const { data: mine } = useMyIncidents();
  const raise = useRaiseIncident(organizationId);

  const [search, setSearch] = useState("");
  const [childId, setChildId] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [severity, setSeverity] = useState<string>("behaviour");
  const [narrative, setNarrative] = useState("");

  const children = (here ?? []).filter((c) =>
    !search.trim()
      ? true
      : c.child_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report something</CardTitle>
          <CardDescription>
            A Kids Ministry leader reads every one of these. Your words are kept
            exactly as you write them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="incident-child">Which child?</Label>
            {childId ? (
              <div className="flex items-center gap-2 rounded-md border p-2">
                <span className="flex-1 text-sm font-medium">{childName}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setChildId(null);
                    setChildName("");
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="incident-child"
                    className="pl-8"
                    placeholder="Search today's children"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {children.slice(0, 20).map((c) => (
                    <button
                      key={c.check_in_id}
                      type="button"
                      className="w-full rounded-md border p-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => {
                        setChildId(c.child_person_id);
                        setChildName(c.child_name);
                      }}
                    >
                      {c.child_name}
                      <span className="block text-xs text-muted-foreground">
                        {c.room_name}
                      </span>
                    </button>
                  ))}
                  {children.length === 0 && (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      Nobody checked in matches. Reports are raised against a
                      child who was at the service.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>What kind of thing is it?</Label>
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setSeverity(c.value)}
                className={`w-full rounded-md border p-2 text-left text-sm ${
                  severity === c.value ? "border-primary bg-muted/50" : ""
                }`}
              >
                <span className="font-medium">{c.ask}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.hint}
                </span>
              </button>
            ))}
          </div>

          {severity === "safeguarding" && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                If you believe a child has been harmed or is at risk right now,
                reporting to the authorities is not something this form does for
                you, and it is not something you need permission for. Tell a
                Kids Ministry leader today as well.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="narrative">What happened?</Label>
            <Textarea
              id="narrative"
              rows={5}
              value={narrative}
              placeholder="What you saw, in your own words."
              onChange={(e) => setNarrative(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              At least 20 characters. Somebody may read this back in a year, so
              write what you saw rather than what you concluded.
            </p>
          </div>

          <Button
            disabled={
              raise.isPending || !childId || narrative.trim().length < 20
            }
            onClick={async () => {
              if (!childId) return;
              try {
                await raise.mutateAsync({
                  childPersonId: childId,
                  severity,
                  narrative: narrative.trim(),
                });
                toast.success("Report sent to the Kids Ministry leaders", {
                  description:
                    severity === "behaviour"
                      ? "They will decide whether the family is told."
                      : "They have been alerted straight away.",
                });
                setChildId(null);
                setChildName("");
                setNarrative("");
                setSeverity("behaviour");
              } catch (err) {
                toast.error("Could not send", {
                  description: errorMessage(err),
                });
              }
            }}
          >
            {raise.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Send to a leader"
            )}
          </Button>
        </CardContent>
      </Card>

      {(mine ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your reports</CardTitle>
            <CardDescription>
              What became of the ones you have written.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(mine ?? []).map((r) => (
              <div key={r.id} className="rounded-md border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      r.severity === "behaviour" ? "secondary" : "destructive"
                    }
                  >
                    {r.severity}
                  </Badge>
                  <span className="font-medium">{r.child_name}</span>
                  <Badge variant="outline">
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {r.occurred_on}
                  </span>
                </div>
                {r.decline_reason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.decline_reason}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
