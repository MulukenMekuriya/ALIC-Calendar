/**
 * The login attached to a member record — and the screen for attaching one.
 *
 * church.link_profile_to_person and church.unlinked_logins have existed since
 * 20260320010400, whose closing comment calls the latter "for the link picker".
 * The picker was never built, so the only way a login ever got attached was the
 * email-matching backfill — and this directory arrived from a spreadsheet where
 * most people have no email at all, so that match misses nearly everyone.
 *
 * Meanwhile the portal tells those people "Ask the church office to link your
 * account", and the office had no button to do it with. This is that button.
 *
 * profile_id is not cosmetic. It is what switches on My Church, "My household",
 * a member seeing their own record, their giving history, their children's
 * check-ins, and the volunteer eligibility check at the desk. An unlinked login
 * sees the not-linked card and nothing else, no matter which tab it asks for.
 */

import { useMemo, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  KeyRound,
  Search,
  Loader2,
  Link2,
  Link2Off,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useUnlinkedLogins, useLinkProfile } from "../hooks/useMembers";

interface LinkedLoginCardProps {
  personId: string;
  personName: string;
  /** church.people.profile_id — null when no sign-in is attached. */
  profileId: string | null | undefined;
  organizationId: string | undefined;
  /** members_admin or org admin; the RPC enforces the same thing. */
  canEdit: boolean;
}

export function LinkedLoginCard({
  personId,
  personName,
  profileId,
  organizationId,
  canEdit,
}: LinkedLoginCardProps) {
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const linkProfile = useLinkProfile();
  const isLinked = !!profileId;

  const runLink = async (nextProfileId: string | null, successTitle: string) => {
    try {
      await linkProfile.mutateAsync({ personId, profileId: nextProfileId });
      toast({
        title: successTitle,
        description: nextProfileId
          ? `${personName} can now sign in and see their own household, giving and children.`
          : "Their record stays exactly as it is; only the sign-in was detached.",
      });
      setPicking(false);
      setConfirmUnlink(false);
    } catch (error) {
      // The RPC names its failures. login_already_linked carries the holder's
      // name in DETAIL, which is the one message worth passing through.
      const raw = error instanceof Error ? error.message : String(error);
      const detail =
        typeof error === "object" && error !== null && "details" in error
          ? String((error as { details?: unknown }).details ?? "")
          : "";
      toast({
        title: "Could not link that login",
        description: raw.includes("login_already_linked")
          ? `That sign-in already belongs to ${detail || "another member"}.`
          : raw.includes("not_permitted")
            ? "Only a members admin or an organisation admin can link a login."
            : raw,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Login
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Linking a sign-in is what switches on My Church, their household,
              their giving and their children's check-ins.
            </CardDescription>
          </div>
          {canEdit &&
            (isLinked ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmUnlink(true)}
              >
                <Link2Off className="h-3.5 w-3.5 mr-1" />
                Unlink
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
                <Link2 className="h-3.5 w-3.5 mr-1" />
                Link a login
              </Button>
            ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLinked ? (
          <p className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            A sign-in is linked to this record.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sign-in is linked. If {personName} has an account, their portal
            shows "No member record linked" until one is attached here.
          </p>
        )}
      </CardContent>

      <LoginPicker
        open={picking}
        onOpenChange={setPicking}
        organizationId={organizationId}
        personName={personName}
        pending={linkProfile.isPending}
        onPick={(id) => void runLink(id, "Login linked")}
      />

      <AlertDialog open={confirmUnlink} onOpenChange={setConfirmUnlink}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink this login?</AlertDialogTitle>
            <AlertDialogDescription>
              The member record and all of its history stay exactly as they are.
              The person keeps their sign-in, but it stops showing them their own
              household, giving and children until it is linked again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runLink(null, "Login unlinked")}>
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/**
 * The picker itself.
 *
 * Only offers logins that NO member record claims — church.unlinked_logins does
 * that filtering server-side, so a login cannot be attached to two people by
 * racing two tabs. The RPC re-checks on write regardless.
 */
function LoginPicker({
  open,
  onOpenChange,
  organizationId,
  personName,
  pending,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | undefined;
  personName: string;
  pending: boolean;
  onPick: (profileId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: logins, isLoading, isError, error } = useUnlinkedLogins(
    open ? organizationId : undefined
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logins ?? [];
    return (logins ?? []).filter((l) =>
      `${l.full_name} ${l.email ?? ""}`.toLowerCase().includes(q)
    );
  }, [logins, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a login to {personName}</DialogTitle>
          <DialogDescription>
            Only sign-ins that no member record claims are listed.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-80 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load logins."}
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {(logins?.length ?? 0) === 0
                ? "Every sign-in in this branch is already linked to somebody."
                : "No sign-in matches that."}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((login) => (
                <li
                  key={login.profile_id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {login.full_name || "Unnamed"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {login.email ?? "No email on the account"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onPick(login.profile_id)}
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(logins?.length ?? 0) > 0 && (
          <Badge variant="secondary" className="self-start">
            {filtered.length} of {logins!.length} unlinked
          </Badge>
        )}
      </DialogContent>
    </Dialog>
  );
}
