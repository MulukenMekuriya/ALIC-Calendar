/**
 * Is this session a lobby kiosk?
 *
 * Reads app_metadata from the session JWT, which is set server-side and
 * cannot be written by a client — user_metadata can, so reading that would
 * let any member turn their own browser into a kiosk.
 *
 * Used only for ROUTING: to send the shared lobby login to /kiosk and keep
 * volunteers on /checkin, so "the main login on all the devices" lands in the
 * right place with no training. It is not a security boundary. The boundary
 * is church.resolve_actor, which gives a kiosk can_check_out = false however
 * the browser feels about itself.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useIsKiosk(): { isKiosk: boolean; loading: boolean } {
  const [isKiosk, setIsKiosk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const meta = data.session?.user?.app_metadata as
        | Record<string, unknown>
        | undefined;
      setIsKiosk(meta?.account_type === "kiosk");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { isKiosk, loading };
}
