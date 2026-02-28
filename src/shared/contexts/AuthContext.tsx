import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isTreasury: boolean;
  isFinance: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTreasury, setIsTreasury] = useState(false);
  const [isFinance, setIsFinance] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  // Track the current user ID so we can skip redundant state updates
  // (e.g. TOKEN_REFRESHED events that fire on tab focus).
  const currentUserIdRef = useRef<string | null>(null);

  const syncSessionWithExternalApp = async (currentSession: Session | null) => {
    if (typeof window === "undefined") return;

    const hasTokens = currentSession?.access_token && currentSession.refresh_token;

    try {
      await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(
          hasTokens
            ? {
                access_token: currentSession.access_token,
                refresh_token: currentSession.refresh_token,
              }
            : {}
        ),
      });
    } catch (error) {
      console.warn("Failed to sync session with primary app:", error);
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      const newUserId = currentSession?.user?.id ?? null;

      // On TOKEN_REFRESHED / other events where the user hasn't changed,
      // only update the session (silently) — don't cascade state updates
      // that would re-render the entire tree and close open dialogs/forms.
      if (event === "TOKEN_REFRESHED" && newUserId === currentUserIdRef.current) {
        // Silently update session reference without touching user/roles
        setSession(currentSession);
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      currentUserIdRef.current = newUserId;
      syncSessionWithExternalApp(currentSession);

      if (currentSession?.user) {
        setTimeout(() => {
          checkRoleStatus(currentSession.user.id);
        }, 0);
      } else {
        setIsAdmin(false);
        setIsTreasury(false);
        setIsFinance(false);
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      currentUserIdRef.current = currentSession?.user?.id ?? null;
      syncSessionWithExternalApp(currentSession);

      if (currentSession?.user) {
        checkRoleStatus(currentSession.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkRoleStatus = async (userId: string) => {
    try {
      // Check all roles for the user from user_organizations table
      const { data, error } = await supabase
        .from("user_organizations")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error checking role status:", error);
        setIsAdmin(false);
        setIsTreasury(false);
        setIsFinance(false);
        return;
      }

      const roles = data?.map((r) => r.role) || [];
      setIsAdmin(roles.includes("admin"));
      setIsTreasury(roles.includes("treasury"));
      setIsFinance(roles.includes("finance"));
    } catch (error) {
      console.error("Error checking role status:", error);
      setIsAdmin(false);
      setIsTreasury(false);
      setIsFinance(false);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setIsTreasury(false);
    setIsFinance(false);
    syncSessionWithExternalApp(null);
    navigate("/auth");
  };

  const requestPasswordReset = async (email: string) => {
    try {
      // Construct the redirect URL based on the current environment
      // This will work for localhost (with any port), production domain, or preview deployments
      const redirectUrl = `${window.location.origin}/reset-password`;

      console.log("Password reset redirect URL:", redirectUrl);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      return { error };
    } catch (error) {
      console.error("Password reset error:", error);
      return { error: error as Error };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin,
        isTreasury,
        isFinance,
        loading,
        signOut,
        requestPasswordReset,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
