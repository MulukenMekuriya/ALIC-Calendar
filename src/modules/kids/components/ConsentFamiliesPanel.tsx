/**
 * Every family with children, and where their consent form stands.
 *
 * The cards above it answer "how many"; this answers "who". It is the list a
 * kids admin works through on a Sunday ("the Bekeles still haven't signed")
 * and the place to send a reminder from.
 *
 * WHO SEES WHAT. The whole kids team sees the list: names, whether each child
 * is covered, who signed and when. Nothing medical. Opening a signed form is
 * kids admins and the office only, decided by the server (can_open, and again
 * by consent_pdf_signed_url, which logs every opening). Sending reminders is
 * kids admins and leaders.
 */

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { FileText, Loader2, Mail, Search } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useConsentRoster, useSendConsentReminders } from "../hooks/useConsent";
import {
  consentService,
  type ConsentRosterRow,
  type ConsentRosterStatus,
} from "../services/consentService";
import { isCovered } from "../utils/consentState";
import { errorMessage } from "../services/rpcError";

type Filter = "needs" | "signed" | "all";

const STATUS: Record<ConsentRosterStatus, { label: string; tone: "ok" | "warn" | "bad" }> = {
  signed: { label: "Signed", tone: "ok" },
  resign_due: { label: "Signed, re-sign due", tone: "warn" },
  partly: { label: "Some children missing", tone: "warn" },
  out_of_date: { label: "Needs signing again", tone: "bad" },
  not_signed: { label: "Not signed", tone: "bad" },
};

const TONE = {
  ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  bad: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

const needsForm = (r: ConsentRosterRow) => r.status !== "signed" && r.status !== "resign_due";

/** Whether the "everyone" button would include this family: the server's rule, in short. */
function cameRecently(r: ConsentRosterRow, today = new Date()): boolean {
  if (!r.last_check_in) return false;
  const days = (today.getTime() - new Date(`${r.last_check_in}T00:00:00`).getTime()) / 86_400_000;
  return days <= 56;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

interface Props {
  organizationId: string | undefined;
  /** kids.write: kids admins and leaders. */
  canRemind: boolean;
}

export function ConsentFamiliesPanel({ organizationId, canRemind }: Props) {
  const { toast } = useToast();
  const { data: rows, isLoading, error } = useConsentRoster(organizationId);
  const send = useSendConsentReminders(organizationId);
  const [filter, setFilter] = useState<Filter>("needs");
  const [query, setQuery] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [sendingFor, setSendingFor] = useState<string | null>(null);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      needs: all.filter(needsForm).length,
      signed: all.length - all.filter(needsForm).length,
      all: all.length,
      remindable: all.filter((r) => needsForm(r) && cameRecently(r) && r.emailable_adults > 0)
        .length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) =>
        filter === "needs" ? needsForm(r) : filter === "signed" ? !needsForm(r) : true,
      )
      .filter(
        (r) =>
          !q ||
          r.household_name.toLowerCase().includes(q) ||
          r.children.some((c) => c.name.toLowerCase().includes(q)),
      );
  }, [rows, filter, query]);

  async function remind(householdIds: string[] | null) {
    setSendingFor(householdIds?.[0] ?? "all");
    try {
      const sent = await send.mutateAsync(householdIds);
      toast({
        title:
          sent.households === 0
            ? "Nothing sent"
            : `Reminder sent to ${sent.households} ${sent.households === 1 ? "family" : "families"}`,
        description:
          sent.households === 0
            ? "They were reminded within the last hour, or there is no email address for them."
            : `${sent.emails} ${sent.emails === 1 ? "email" : "emails"}, each with a link to the form in My Church.`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not send", description: errorMessage(err) });
    } finally {
      setSendingFor(null);
      setConfirmAll(false);
    }
  }

  async function openForm(signatureId: string) {
    // Opened before the await: Safari blocks a window opened after one.
    const win = window.open("", "_blank");
    try {
      const url = await consentService.signedFormUrl(signatureId);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      win?.close();
      toast({ variant: "destructive", title: "Could not open the form", description: errorMessage(err) });
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Families</CardTitle>
          <CardDescription>
            Who has signed, and who still needs to. Reminders go by email with a link to the form
            in My Church; families are also reminded automatically every Thursday evening.
          </CardDescription>
        </div>
        {canRemind && counts.remindable > 0 && (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {!confirmAll ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Remind everyone not signed
              </Button>
            ) : (
              <div className="rounded-md border p-2.5 text-sm space-y-2 sm:max-w-xs">
                <p>
                  Email about {counts.remindable} families whose children came in the last eight
                  weeks? Anyone reminded in the last hour is skipped.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => remind(null)} disabled={send.isPending}>
                    {sendingFor === "all" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Send reminders
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmAll(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="needs">Still needed ({counts.needs})</TabsTrigger>
              <TabsTrigger value="signed">Signed ({counts.signed})</TabsTrigger>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Family or child"
              className="pl-8"
              aria-label="Search families"
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-muted-foreground">The list could not be loaded.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading families…</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filter === "needs" && !query ? "Every family has signed." : "No families match."}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {shown.map((r) => {
              const status = STATUS[r.status];
              return (
                <li
                  key={r.household_id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.household_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status.tone]}`}>
                        {status.label}
                        {r.status === "resign_due" && r.resign_due_by
                          ? ` by ${shortDate(r.resign_due_by)}`
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {r.children.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && ", "}
                          <span className={isCovered(c.state) ? "" : "font-medium text-foreground"}>
                            {c.name}
                          </span>
                        </span>
                      ))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.signed_at
                        ? `Signed ${shortDate(r.signed_at)} by ${r.signed_by} · ${
                            r.source === "portal" ? "My Church" : "at the desk"
                          }`
                        : "No form yet"}
                      {r.last_reminded_at && ` · reminded ${shortDate(r.last_reminded_at)}`}
                      {r.emailable_adults === 0 && " · no email address on file"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {r.can_open && r.has_pdf && r.signature_id && (
                      <Button size="sm" variant="outline" onClick={() => openForm(r.signature_id!)}>
                        <FileText className="h-4 w-4 mr-1.5" />
                        Open form
                      </Button>
                    )}
                    {canRemind && needsForm(r) && r.emailable_adults > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remind([r.household_id])}
                        disabled={send.isPending}
                      >
                        {sendingFor === r.household_id ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4 mr-1.5" />
                        )}
                        Remind
                      </Button>
                    )}
                    {r.status === "signed" && <Badge variant="secondary" className="sm:hidden">On file</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
