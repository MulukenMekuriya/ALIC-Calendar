import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { LoadingButton } from "@/shared/components/ui/loading";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Mail,
  Lock,
  User,
  Church,
  Calendar,
  Users,
  DoorOpen,
  Wallet,
  ArrowRight,
  Shield,
} from "lucide-react";
import { z } from "zod";
import { CHURCH_BRANDING } from "@/shared/constants/branding";
import { cn } from "@/shared/lib/utils";
import {
  whySignInFailed,
  type SignInProblem,
} from "../utils/whySignInFailed";

/**
 * Both credentials are trimmed before they are validated or sent.
 *
 * WHY THE PASSWORD TOO, which is not the usual advice. Every password this
 * system issues is handed to somebody in an email — the Breeze import sent 542
 * of them, and the Kids Ministry roster another 18 — and a volunteer copying
 * one out of a message routinely picks up a trailing space with it. GoTrue
 * then returns a bare 400 "Invalid login credentials", which is
 * indistinguishable from a wrong password, so the person retypes the same
 * thing and fails again. That is the whole failure, and it is invisible: the
 * field shows one more dot than the password has characters.
 *
 * The cost is that a password with a deliberate leading or trailing space
 * cannot be typed here. Nothing in this system issues one, and a member
 * choosing their own at ForcePasswordChange goes through the same trim.
 */
const authSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  password: z
    .string()
    .trim()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password too long"),
  fullName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name too long")
    .optional(),
});

/**
 * Self-registration, off.
 *
 * The Sign Up tab created a real account in the VA branch for anyone on the
 * internet who confirmed an email. Every ALIC account that should exist is
 * created deliberately — by an administrator through the create-user function,
 * or by the Children's Ministry invite flow that handle_new_user redeems — so
 * there is nothing legitimate for a stranger to sign up to.
 *
 * THIS FLAG IS THE UI ONLY. supabase.auth.signUp still answers over the network;
 * turn self-registration off in Supabase Auth settings as well. What makes that
 * survivable meanwhile is 20260321001500/1600: a signup that does get through
 * lands on the 'member' tier and reaches no internal tool.
 *
 * The form below is kept rather than deleted because a member portal would want
 * it back. Flip this to true to restore it.
 */
const PUBLIC_SIGNUP_ENABLED = false;

/**
 * What the schema refused, said the way the panel says everything else.
 *
 * Zod's own strings are written for the person who wrote the form
 * ("Invalid email address"), and the panel is read by somebody who is trying
 * to get into their own account.
 */
const problemFromValidation = (error: z.ZodError): SignInProblem => {
  const message = error.errors[0]?.message ?? "";

  if (/email/i.test(message)) {
    return {
      title: "Check the email address",
      description:
        "That does not look like a complete email address. It needs an @ and a domain after it, like name@example.com.",
    };
  }

  if (/at least 6/i.test(message)) {
    // Not a rule about what a password may be — it is the shortest password
    // this system ever issues, so anything under it is a half-typed one.
    return {
      title: "The password looks incomplete",
      description:
        "It is shorter than any password set up here. Type the whole of it, or use the reset link below if you no longer have it.",
      link: { label: "Reset your password", to: "/forgot-password" },
    };
  }

  return { title: "Check your details", description: message };
};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailValid, setEmailValid] = useState(false);
  const [passwordValid, setPasswordValid] = useState(false);
  const [activeTab, setActiveTab] = useState("signin");
  /**
   * The last reason the sign-in did not work, held until the member changes
   * something. A toast was wrong for this: it leaves the screen on its own
   * while the person is still staring at the password field, and it appears in
   * a corner rather than beside the thing that failed.
   */
  const [signInProblem, setSignInProblem] = useState<SignInProblem | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Editing either credential retracts the complaint about the last attempt:
  // leaving "Wrong email or password" on screen while somebody retypes reads
  // as a verdict on what they are typing now.
  const clearSignInProblem = () => setSignInProblem(null);

  // Real-time validation
  const validateEmail = (email: string) => {
    const isValid = z.string().email().safeParse(email).success;
    setEmailValid(isValid);
    return isValid;
  };

  const validatePassword = (password: string) => {
    const isValid = password.length >= 6;
    setPasswordValid(isValid);
    return isValid;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSignInProblem(null);

    try {
      const validated = authSchema.parse({ email, password });

      const { error } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });

      if (error) {
        setSignInProblem(whySignInFailed(error));
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        // The form never reached the network. Say so in the same panel, so
        // there is one place a member looks to find out what is wrong,
        // whichever side of the request the answer came from.
        setSignInProblem(problemFromValidation(error));
      } else {
        setSignInProblem(whySignInFailed(error));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    // The form is not rendered when self-registration is off, so this only
    // catches a stale tab left open across a deploy.
    if (!PUBLIC_SIGNUP_ENABLED) {
      toast({
        title: "Accounts are created by an administrator",
        description:
          "Ask your ministry lead or the church office to set up your access.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);

    try {
      const validated = authSchema.parse({ email, password, fullName });

      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        {
          email: validated.email,
          password: validated.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: validated.fullName,
            },
          },
        }
      );

      if (signUpError) {
        toast({
          title: "Sign up failed",
          description: signUpError.message,
          variant: "destructive",
        });
        return;
      }

      if (authData.user) {
        // Profile and organization assignment are handled automatically by database trigger
        // See: handle_new_user() function in migrations
        toast({
          title: "Account created",
          description: "Please check your email to confirm your account.",
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: Calendar,
      label: "Event Scheduling",
      description: "Plan and manage church events",
    },
    {
      icon: DoorOpen,
      label: "Room Management",
      description: "Book and organize spaces",
    },
    {
      icon: Users,
      label: "User Management",
      description: "Manage members and roles",
    },
    {
      icon: Wallet,
      label: "Budget Management",
      description: "Track finances and expenses",
    },
  ];

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/80" />

        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-1/2 -right-32 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 left-1/4 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse delay-1000" />

          {/* Grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-primary-foreground">
          {/* Logo with glow effect */}
          <div className="mb-10 relative group">
            <div className="absolute inset-0 bg-white/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500" />
            <div className="relative bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-2xl transition-transform duration-500 hover:scale-105">
              <img
                src={CHURCH_BRANDING.logo.main}
                alt={CHURCH_BRANDING.logo.alt}
                className="h-24 w-24 object-contain drop-shadow-2xl"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  target.nextElementSibling?.classList.remove("hidden");
                }}
              />
              <Church className="h-24 w-24 text-white hidden" />
            </div>
          </div>

          {/* Church name and title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-3 tracking-tight drop-shadow-lg">
              {CHURCH_BRANDING.name}
            </h1>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">
                {CHURCH_BRANDING.app.title}
              </span>
            </div>
          </div>

          {/* Feature cards grid */}
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            {features.map((feature, index) => (
              <div
                key={feature.label}
                className="group p-4 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 cursor-default"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-white/10 rounded-xl group-hover:bg-white/20 transition-colors">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <span className="font-semibold text-sm">{feature.label}</span>
                </div>
                <p className="text-xs text-white/70 pl-11">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex justify-center lg:hidden mb-8">
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
              <div className="relative bg-gradient-to-br from-primary to-primary/80 p-5 rounded-2xl shadow-xl">
                <img
                  src={CHURCH_BRANDING.logo.main}
                  alt={CHURCH_BRANDING.logo.alt}
                  className="h-14 w-14 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    target.nextElementSibling?.classList.remove("hidden");
                  }}
                />
                <Church className="h-14 w-14 text-white hidden" />
              </div>
            </div>
          </div>

          {/* Card with glassmorphism */}
          <Card className="border-0 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
            <CardHeader className="space-y-4 pb-6 pt-8">
              <div className="text-center">
                <CardTitle className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                  {activeTab === "signin" ? "Welcome back" : "Get started"}
                </CardTitle>
                <CardDescription className="text-base mt-3 text-muted-foreground">
                  {activeTab === "signin"
                    ? `Sign in to manage ${CHURCH_BRANDING.shortName} operations`
                    : "Create your account to join"}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 px-8 pb-8">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                {/* With self-registration off there is only one tab, and a
                    tab strip of one is just a heading that looks clickable. */}
                {PUBLIC_SIGNUP_ENABLED && (
                  <TabsList className="grid w-full grid-cols-2 mb-8 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <TabsTrigger
                      value="signin"
                      className="text-sm font-medium rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm transition-all duration-200"
                    >
                      Sign In
                    </TabsTrigger>
                    <TabsTrigger
                      value="signup"
                      className="text-sm font-medium rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm transition-all duration-200"
                    >
                      Sign Up
                    </TabsTrigger>
                  </TabsList>
                )}

                <TabsContent value="signin" className="mt-0 space-y-6">
                  <form onSubmit={handleSignIn} className="space-y-5">
                    {/*
                      Above the fields rather than below the button, because a
                      member on a phone whose keyboard is open cannot see the
                      bottom of the card at all. aria-live carries it to a
                      screen reader, which would otherwise be told nothing:
                      the focus never moves when a sign-in fails.
                    */}
                    <div aria-live="assertive" aria-atomic="true">
                      {signInProblem && (
                        <Alert
                          variant="destructive"
                          className="border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100"
                        >
                          <AlertCircle className="h-4 w-4 !text-rose-600 dark:!text-rose-400" />
                          <AlertTitle>{signInProblem.title}</AlertTitle>
                          <AlertDescription className="mt-1 text-rose-800/90 dark:text-rose-200/90">
                            {signInProblem.description}
                            {signInProblem.link && (
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 mt-2 block text-sm font-semibold text-rose-900 underline dark:text-rose-100"
                                onClick={() =>
                                  navigate(signInProblem.link!.to)
                                }
                              >
                                {signInProblem.link.label}
                              </Button>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="signin-email"
                          className="text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Email address
                        </Label>
                        <div className="relative group">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signin-email"
                            type="email"
                            autoComplete="email"
                            placeholder="Enter your email"
                            value={email}
                            aria-invalid={signInProblem ? true : undefined}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              validateEmail(e.target.value);
                              clearSignInProblem();
                            }}
                            className="pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                            required
                            maxLength={255}
                          />
                          {email && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              {emailValid ? (
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-rose-500" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="signin-password"
                          className="text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Password
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signin-password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            value={password}
                            aria-invalid={signInProblem ? true : undefined}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              validatePassword(e.target.value);
                              clearSignInProblem();
                            }}
                            className="pl-11 pr-11 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                            required
                            maxLength={100}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        variant="link"
                        className="text-sm text-primary hover:text-primary/80 px-0 font-medium"
                        onClick={() => navigate("/forgot-password")}
                      >
                        Forgot password?
                      </Button>
                    </div>

                    <LoadingButton
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 text-primary-foreground font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5"
                      loading={loading}
                      loadingText="Signing you in..."
                      /*
                        Only the request in flight disables this. It used to be
                        greyed out whenever the schema was unhappy, which is a
                        button that refuses to say why — the member sees a dead
                        Sign In and no text anywhere explaining it. Pressing it
                        now always produces a sentence, either from the schema
                        or from GoTrue.
                      */
                      disabled={loading}
                    >
                      <span className="flex items-center justify-center gap-2">
                        Sign In
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </LoadingButton>
                  </form>
                </TabsContent>

                {PUBLIC_SIGNUP_ENABLED && (
                <TabsContent value="signup" className="mt-0 space-y-6">
                  <form onSubmit={handleSignUp} className="space-y-5">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="signup-name"
                          className="text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Full name
                        </Label>
                        <div className="relative group">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signup-name"
                            type="text"
                            placeholder="Enter your full name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                            required
                            maxLength={100}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="signup-email"
                          className="text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Email address
                        </Label>
                        <div className="relative group">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signup-email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              validateEmail(e.target.value);
                            }}
                            className="pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                            required
                            maxLength={255}
                          />
                          {email && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              {emailValid ? (
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-rose-500" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="signup-password"
                          className="text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Password
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signup-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a password"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              validatePassword(e.target.value);
                            }}
                            className="pl-11 pr-11 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                            required
                            maxLength={100}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {password && (
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full transition-all duration-300 rounded-full",
                                  password.length >= 8
                                    ? "w-full bg-emerald-500"
                                    : password.length >= 6
                                    ? "w-2/3 bg-amber-500"
                                    : "w-1/3 bg-rose-500"
                                )}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-xs font-medium",
                                password.length >= 8
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : password.length >= 6
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-rose-600 dark:text-rose-400"
                              )}
                            >
                              {password.length >= 8
                                ? "Strong"
                                : password.length >= 6
                                ? "Good"
                                : "Weak"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <LoadingButton
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 text-primary-foreground font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5"
                      loading={loading}
                      loadingText="Creating your account..."
                      disabled={
                        loading ||
                        !emailValid ||
                        !passwordValid ||
                        !fullName.trim()
                      }
                    >
                      <span className="flex items-center justify-center gap-2">
                        Create Account
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </LoadingButton>
                  </form>
                </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Auth;
