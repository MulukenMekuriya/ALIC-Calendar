/**
 * Where photographs of people live, and what the bucket will accept.
 *
 * In shared/ rather than in the members module because two layers need the
 * same four facts and only one of them may import the other: the members
 * module owns the photo screens, and the app shell draws the signed-in user's
 * own face in its header. A second copy of the bucket name is how one of them
 * ends up uploading somewhere nothing can read.
 *
 * These MUST match the bucket created in
 * supabase/migrations/20260322090000_a_face_to_the_name.sql. A mismatch shows
 * up as an upload the browser accepted and the server refused.
 */

export const PERSON_PHOTO_BUCKET = "person-photos";

export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Three per person, capped by the table itself — see the migration. */
export const MAX_PHOTOS = 3;

/**
 * How long a signed URL lasts. Long enough to read a page without re-signing,
 * short enough that a URL pasted into a chat stops working the same morning.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
