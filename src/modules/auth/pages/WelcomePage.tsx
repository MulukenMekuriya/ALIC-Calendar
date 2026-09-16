/**
 * Where the QR code on the screen leads.
 *
 * Somebody is standing in the sanctuary holding a phone. They have about
 * ninety seconds of patience and one thumb. So: one field, one button, and a
 * sentence telling them what just happened. Everything that can be decided for
 * them is decided for them — which branch, whether they are on the books,
 * whether they need an account made or a password set.
 *
 * THE FOUR ANSWERS a search can give, and what each one is for:
 *
 *   claimable   on the books, with an address we can write to. The common case
 *               by a long way — 544 of 613 adults at Silver Spring have an
 *               account already and 54 have ever signed in, so most of the
 *               room is here to set a password on an account they did not know
 *               they had.
 *   ambiguous   two people share that address or number, which is 22 addresses
 *               and 22 numbers on file: couples, and families who gave the
 *               house phone. We ask for a name rather than guessing, because
 *               guessing hands one spouse the other's account.
 *   no_email    on the books, nothing to write to. A dead end on purpose: see
 *               the migration. The welcome desk can see a face; this page
 *               cannot.
 *   not_found   offer to put them on the books.
 *
 * NOTHING HERE TRUSTS THE BROWSER. The page never receives a person id, and
 * the second call re-sends the same address the first one used rather than a
 * handle the server gave out. All of that lives in the member-claim function.
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  MailCheck,
  Phone,
  UserRoundPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLogoSrc } from "@/shared/constants/branding";

type Outcome =
  | "claimable"
  | "ambiguous"
  | "no_email"
  | "not_found"
  | "sent"
  | "registered"
  | "signed_up"
  | "account_exists";

interface ClaimResponse {
  outcome?: Outcome;
  masked_email?: string | null;
  error?: string;
  message?: string;
}

/** Which of the two things they are typing. */
type By = "email" | "phone";

export default function WelcomePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const branch = (params.get("b") ?? "md").toLowerCase();

  const [by, setBy] = useState<By>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const identifier = by === "email" ? email.trim() : phone.trim();
  const canSignUp =
    !!firstName.trim() && !!lastName.trim() && !!email.trim() && password.length >= 8;

  const call = async (
    action: "lookup" | "claim" | "register" | "signup"
  ): Promise<ClaimResponse> => {
    const { data, error: fnError } = await supabase.functions.invoke("member-claim", {
      body: {
        action,
        branch,
        email: by === "email" || action === "register" ? email.trim() : undefined,
        phone: phone.trim() || undefined,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        password: action === "signup" ? password : undefined,
      },
    });

    if (fnError) {
      /*
       * A non-2xx from an edge function arrives as a FunctionsHttpError with
       * the body tucked inside it, so the rate-limit sentence the server wrote
       * is only readable if we go and get it. Without this, somebody who tried
       * six times sees "Edge Function returned a non-2xx status code".
       */
      const withContext = fnError as { context?: { json?: () => Promise<ClaimResponse> } };
      try {
        const body = await withContext.context?.json?.();
        if (body?.message || body?.error) return body;
      } catch {
        // Fall through to the generic sentence below.
      }
      return { error: "unreachable" };
    }
    return (data ?? {}) as ClaimResponse;
  };

  const say = (response: ClaimResponse): boolean => {
    if (response.error) {
      setError(
        response.message ??
          "We could not reach the church's system just now. Try again, or ask at the welcome desk."
      );
      return false;
    }
    setError(null);
    return true;
  };

  const search = async () => {
    if (!identifier) return;
    setBusy(true);
    setError(null);
    const response = await call("lookup");
    if (say(response)) {
      setOutcome(response.outcome ?? "not_found");
      setMaskedEmail(response.masked_email ?? null);

      // Found, unambiguously, with somewhere to write to: send the link
      // without making them press a second button. One less thing to do while
      // standing up.
      if (response.outcome === "claimable") {
        const sent = await call("claim");
        if (say(sent)) {
          setOutcome(sent.outcome ?? "sent");
          setMaskedEmail(sent.masked_email ?? response.masked_email ?? null);
        }
      }
    }
    setBusy(false);
  };

  /*
   * Somebody new: make the account, sign them in, and hand them the full
   * registration form.
   *
   * The account is created by the edge function rather than by
   * supabase.auth.signUp — public signup is off for this project on purpose —
   * and then the browser signs in normally with the password they just chose.
   * They are through to the form without waiting for an email, which is the
   * point: nothing has to arrive in an inbox for a person standing in the
   * building to finish.
   */
  const signUp = async () => {
    setBusy(true);
    setError(null);

    const response = await call("signup");
    if (!say(response)) {
      setBusy(false);
      return;
    }

    // The server looked them up again and found them after all. Send them down
    // the claim path instead of making a second record.
    if (response.outcome === "claimable" || response.outcome === "ambiguous") {
      setOutcome(response.outcome);
      setMaskedEmail(response.masked_email ?? null);
      setBusy(false);
      return;
    }

    if (response.outcome === "account_exists") {
      setOutcome("account_exists");
      setBusy(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (signInError) {
      setError(
        "Your account was created, but signing in failed. Try signing in with the email and password you just chose."
      );
      return;
    }

    /*
     * Straight into My Church. The record and the household already exist —
     * church.register_new_member made both — so the portal has something to
     * show, and its own tabs are where the address, the children and the rest
     * get added, at whatever pace suits somebody who is standing up.
     */
    navigate("/my");
  };

  const startOver = () => {
    setOutcome(null);
    setMaskedEmail(null);
    setError(null);
    setFirstName("");
    setLastName("");
    setPassword("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="text-center">
          <img
            src={getLogoSrc()}
            alt=""
            className="mx-auto h-16 w-16 rounded-xl object-contain"
          />
          <h1 className="mt-3 text-2xl font-bold">Welcome to ALIC</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up your church account — it takes a minute.
          </p>
        </div>

        {/* ------------------------------------------------------- the search */}
        {outcome === null && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Are you on our records?</CardTitle>
              <CardDescription>
                Use the email or phone number the church already has for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={by} onValueChange={(v) => setBy(v as By)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email">
                    <Mail className="mr-1.5 h-4 w-4" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger value="phone">
                    <Phone className="mr-1.5 h-4 w-4" />
                    Phone
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {by === "email" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="w-email">Email address</Label>
                  <Input
                    id="w-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && search()}
                    className="h-12 text-base"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="w-phone">Phone number</Label>
                  <Input
                    id="w-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(301) 555-0100"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && search()}
                    className="h-12 text-base"
                  />
                </div>
              )}

              <Button
                className="h-12 w-full text-base"
                onClick={search}
                disabled={busy || !identifier}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>

              {error && <Problem text={error} />}
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------- the link is away */}
        {(outcome === "sent" || outcome === "registered") && (
          <Card className="border-primary/40">
            <CardContent className="space-y-3 pt-6 text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary" />
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                {outcome === "registered"
                  ? "You are on our records. We have sent you a link to set your password."
                  : "We found you. We have sent a link to set your password to"}
                {outcome === "sent" && maskedEmail && (
                  <>
                    {" "}
                    <span className="font-medium text-foreground">{maskedEmail}</span>.
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                It can take a minute to arrive, and it sometimes lands in spam.
                Nothing yet? The welcome desk can help before you leave.
              </p>
            </CardContent>
          </Card>
        )}

        {/* --------------------------------------------- which one are you? */}
        {outcome === "ambiguous" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Which one is you?</CardTitle>
              <CardDescription>
                More than one person is on file with that{" "}
                {by === "email" ? "email address" : "number"} — usually a couple
                or a family. Add your name and we will find the right record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NameFields
                firstName={firstName}
                lastName={lastName}
                onFirst={setFirstName}
                onLast={setLastName}
              />
              <Button
                className="h-12 w-full text-base"
                onClick={search}
                disabled={busy || !firstName.trim() || !lastName.trim()}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
              {error && <Problem text={error} />}
              <BackLink onClick={startOver} />
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------ nothing to send to */}
        {outcome === "no_email" && (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-3 pt-6 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
              <h2 className="text-lg font-semibold">We have you, but no email</h2>
              <p className="text-sm text-muted-foreground">
                You are on our records, but there is no email address on file to
                send a link to. Please see the welcome desk today — it takes
                them a moment to add one.
              </p>
              <BackLink onClick={startOver} />
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------- new to us */}
        {outcome === "not_found" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRoundPlus className="h-4 w-4" />
                We do not have you yet
              </CardTitle>
              <CardDescription>
                Four things and you are in — no email to wait for. You can add
                your address, your family and your children afterwards.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NameFields
                firstName={firstName}
                lastName={lastName}
                onFirst={setFirstName}
                onLast={setLastName}
              />
              <div className="space-y-1.5">
                <Label htmlFor="r-email">Email address</Label>
                <Input
                  id="r-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-password">Choose a password</Label>
                <Input
                  id="r-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canSignUp && signUp()}
                  className="h-12 text-base"
                />
                <p className="text-xs text-muted-foreground">
                  You will use this and your email address to sign in from now on.
                </p>
              </div>
              <Button
                className="h-12 w-full text-base"
                onClick={signUp}
                disabled={busy || !canSignUp}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create my account
              </Button>
              {error && <Problem text={error} />}
              <BackLink onClick={startOver} />
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------- an account already here */}
        {outcome === "account_exists" && (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-3 pt-6 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
              <h2 className="text-lg font-semibold">You already have an account</h2>
              <p className="text-sm text-muted-foreground">
                There is already an account for that email address, but no
                member record behind it yet. Sign in with the password you set
                before — or reset it if you have forgotten.
              </p>
              <div className="flex flex-col gap-2">
                <Button className="h-12 w-full text-base" onClick={() => navigate("/auth")}>
                  Sign in
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full text-base"
                  onClick={() => navigate("/forgot-password")}
                >
                  I forgot my password
                </Button>
              </div>
              <BackLink onClick={startOver} />
            </CardContent>
          </Card>
        )}

        {/* claimable is a transient state: search() sends the link immediately
            and moves to "sent". It only shows if the send failed, and then the
            error above it says why. */}
        {outcome === "claimable" && (
          <Card>
            <CardContent className="space-y-3 pt-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h2 className="text-lg font-semibold">We found you</h2>
              {error ? <Problem text={error} /> : null}
              <Button className="h-12 w-full text-base" onClick={search} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send my link
              </Button>
              <BackLink onClick={startOver} />
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Already know your password?{" "}
          <a href="/auth" className="font-medium underline underline-offset-2">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

function NameFields({
  firstName,
  lastName,
  onFirst,
  onLast,
}: {
  firstName: string;
  lastName: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="w-first">First name</Label>
        <Input
          id="w-first"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => onFirst(e.target.value)}
          className="h-12 text-base"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="w-last">Last name</Label>
        <Input
          id="w-last"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => onLast(e.target.value)}
          className="h-12 text-base"
        />
      </div>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Start again
    </button>
  );
}
