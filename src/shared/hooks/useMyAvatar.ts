/**
 * The signed-in user's own face, for the app shell.
 *
 * WHY THIS IS NOT the members module's usePersonPhotos. The shell is shared/
 * and shared/ does not import from modules/ — that direction is what keeps the
 * layout renderable on a screen the members module was never loaded for. The
 * bucket name and the URL lifetime come from shared/constants/photos, so the
 * two paths cannot disagree about where photographs live.
 *
 * It reads people.photo_path rather than church.person_photos_for: that column
 * is kept pointing at the primary photo by a trigger, the caller's own person
 * row is readable under the self policy from 20260320001100, and one avatar
 * does not need the other two.
 *
 * A LOGIN WITH NO MEMBER RECORD is the ordinary case for a new account, and it
 * simply has no face. Nothing here treats that as an error.
 *
 * The query key sits UNDER the members module's photo key on purpose: that
 * module invalidates ["church", "person-photos"] whenever anybody changes a
 * photo, so the header updates the moment a member uploads one without
 * shared/ having to know that the members module exists.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PERSON_PHOTO_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "@/shared/constants/photos";

const FIFTY_MINUTES = 50 * 60 * 1000;

export function useMyAvatar(userId: string | undefined) {
  return useQuery({
    queryKey: ["church", "person-photos", "mine", userId ?? ""],
    queryFn: async (): Promise<string | null> => {
      const { data: person, error } = await supabase
        .schema("church")
        .from("people")
        .select("photo_path")
        .eq("profile_id", userId!)
        .not("photo_path", "is", null)
        .limit(1)
        .maybeSingle();

      // PGRST116 is "no rows", which is not a failure: most logins are not
      // linked to a person, and most people have no photograph.
      if (error && error.code !== "PGRST116") throw error;
      if (!person?.photo_path) return null;

      const { data: signed } = await supabase.storage
        .from(PERSON_PHOTO_BUCKET)
        .createSignedUrl(person.photo_path, SIGNED_URL_TTL_SECONDS);

      return signed?.signedUrl ?? null;
    },
    enabled: !!userId,
    staleTime: FIFTY_MINUTES,
  });
}
