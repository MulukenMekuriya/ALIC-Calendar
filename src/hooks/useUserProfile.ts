import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/shared/contexts/AuthContext";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  ministry_name: string | null;
}

export const useUserProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone_number, ministry_name")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error("Error fetching profile:", error);
          // Fallback to user email if profile doesn't exist
          setProfile({
            id: user.id,
            full_name: user.email?.split("@")[0] || "User",
            email: user.email || "",
            phone_number: null,
            ministry_name: null,
          });
        } else {
          console.log("Current user ministry from DB:", data.ministry_name);
          setProfile(data);
        }
      } catch (error) {
        console.error("Profile fetch error:", error);
        setProfile({
          id: user.id,
          full_name: user.email?.split("@")[0] || "User",
          email: user.email || "",
          phone_number: null,
          ministry_name: null,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  return { profile, loading };
};
