import React, { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { pickCurrentMembership } from "@/shared/lib/currentMembership";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  timezone: string;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  logo_url: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserOrganization {
  id: string;
  user_id: string;
  organization_id: string;
  role: "admin" | "contributor" | "treasury" | "finance" | "member" | "board";
  is_primary: boolean;
  joined_at: string;
  email: string | null;
  organization?: Organization;
}

interface OrganizationContextType {
  currentOrganization: Organization | null;
  userOrganizations: UserOrganization[];
  isOrgAdmin: boolean;
  loading: boolean;
  error: string | null;
  refetchOrganization: () => Promise<void>;
  /**
   * Look at a different branch.
   *
   * Until this existed the branch was decided for you — default_organization_id,
   * then is_primary, then whichever membership came back first — and somebody
   * who belonged to both branches could only ever see one of them. That is
   * survivable for staff who work in one building. It is not survivable for
   * the Board, which is appointed to read MD and VA together.
   *
   * The choice is written back to profiles.default_organization_id, so it
   * survives a reload and a different device rather than being a thing you
   * have to redo every morning.
   */
  switchOrganization: (organizationId: string) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined,
);

export const OrganizationProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [currentOrganization, setCurrentOrganization] =
    useState<Organization | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<
    UserOrganization[]
  >([]);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserOrganizations = async () => {
    if (!user) {
      setCurrentOrganization(null);
      setUserOrganizations([]);
      setIsOrgAdmin(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First, get user's profile to check default_organization_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_organization_id")
        .eq("id", user.id)
        .single();

      // Get user's organization memberships with organization details
      const { data: memberships, error: membershipError } = await supabase
        .from("user_organizations")
        .select(
          `
          id,
          user_id,
          organization_id,
          role,
          is_primary,
          joined_at,
          email,
          organizations:organization_id (
            id,
            name,
            slug,
            country,
            state,
            city,
            address,
            timezone,
            contact_email,
            contact_phone,
            website,
            logo_url,
            is_active,
            settings,
            created_at,
            updated_at
          )
        `,
        )
        .eq("user_id", user.id);

      if (membershipError) {
        console.error("Error fetching user organizations:", membershipError);
        setError(membershipError.message);
        setLoading(false);
        return;
      }

      if (!memberships || memberships.length === 0) {
        console.warn("User has no organization memberships");
        setCurrentOrganization(null);
        setUserOrganizations([]);
        setIsOrgAdmin(false);
        setLoading(false);
        return;
      }

      // Transform the data
      const transformedMemberships: UserOrganization[] = memberships.map(
        (m: any) => ({
          id: m.id,
          user_id: m.user_id,
          organization_id: m.organization_id,
          role: m.role,
          is_primary: m.is_primary,
          joined_at: m.joined_at,
          email: m.email,
          organization: m.organizations,
        }),
      );

      setUserOrganizations(transformedMemberships);

      // Determine current organization: the profile's default, unless the
      // login is only a member there but has a role elsewhere; then primary,
      // then first. See pickCurrentMembership.
      let currentOrg: Organization | null = null;
      const currentMembership = pickCurrentMembership(
        transformedMemberships,
        profile?.default_organization_id,
      );

      if (currentMembership?.organization) {
        currentOrg = currentMembership.organization;
        setIsOrgAdmin(currentMembership.role === "admin");
      }

      setCurrentOrganization(currentOrg);
    } catch (err) {
      console.error("Error in fetchUserOrganizations:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchUserOrganizations();
    }
    // Depend on user?.id (stable string) instead of the user object reference
    // to avoid re-fetching when Supabase refreshes the token on tab focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  const refetchOrganization = async () => {
    await fetchUserOrganizations();
  };

  const switchOrganization = async (organizationId: string) => {
    const membership = userOrganizations.find(
      (m) => m.organization_id === organizationId,
    );

    // Not a branch this person belongs to. The policies would refuse every
    // query that followed, so refusing here is the honest version.
    if (!membership?.organization) return;

    setCurrentOrganization(membership.organization);
    setIsOrgAdmin(membership.role === "admin");

    if (user) {
      const { error: saveError } = await supabase
        .from("profiles")
        .update({ default_organization_id: organizationId })
        .eq("id", user.id);

      // Not fatal: the switch has already happened in this session, it just
      // will not be remembered next time.
      if (saveError) {
        console.error("Could not remember the branch choice:", saveError);
      }
    }

    // Almost every query in the app is keyed by the organisation id, so this
    // is what actually repaints the screen with the other branch's data.
    queryClient.invalidateQueries();
  };

  return (
    <OrganizationContext.Provider
      value={{
        currentOrganization,
        userOrganizations,
        isOrgAdmin,
        loading,
        error,
        refetchOrganization,
        switchOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider",
    );
  }
  return context;
};
