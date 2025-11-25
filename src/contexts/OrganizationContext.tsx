import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

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
  role: "admin" | "contributor";
  is_primary: boolean;
  joined_at: string;
  organization?: Organization;
}

interface OrganizationContextType {
  currentOrganization: Organization | null;
  userOrganizations: UserOrganization[];
  isOrgAdmin: boolean;
  loading: boolean;
  error: string | null;
  refetchOrganization: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
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
        .select(`
          id,
          user_id,
          organization_id,
          role,
          is_primary,
          joined_at,
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
        `)
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
      const transformedMemberships: UserOrganization[] = memberships.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        organization_id: m.organization_id,
        role: m.role,
        is_primary: m.is_primary,
        joined_at: m.joined_at,
        organization: m.organizations,
      }));

      setUserOrganizations(transformedMemberships);

      // Determine current organization:
      // 1. Use default_organization_id from profile
      // 2. Fall back to primary organization
      // 3. Fall back to first organization
      let currentOrg: Organization | null = null;
      let currentMembership: UserOrganization | null = null;

      if (profile?.default_organization_id) {
        currentMembership = transformedMemberships.find(
          (m) => m.organization_id === profile.default_organization_id
        ) || null;
      }

      if (!currentMembership) {
        currentMembership = transformedMemberships.find((m) => m.is_primary) || null;
      }

      if (!currentMembership && transformedMemberships.length > 0) {
        currentMembership = transformedMemberships[0];
      }

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
  }, [user, authLoading]);

  const refetchOrganization = async () => {
    await fetchUserOrganizations();
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
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
};
