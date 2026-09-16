/**
 * Photographs of people: the bytes in storage, the rows in the database.
 *
 * TWO STORES, ONE TRUTH. The image lives in the private `person-photos`
 * bucket; church.person_photos records that it exists, whose it is, and which
 * of the three slots it occupies. The row is authoritative — an object with no
 * row is invisible to every screen and unreadable without passing
 * can_view_photos_of, so the failure mode of a half-finished upload is wasted
 * bytes rather than a leaked face.
 *
 * That is why `upload` below cleans up after itself on the error path, and why
 * `remove` deletes the row FIRST: a row with no object is a broken image on
 * somebody's profile, which is the more visible of the two mistakes.
 *
 * NOTHING HERE IS A PERMISSION CHECK. The bucket policies and the RPCs decide
 * who may do what — see supabase/migrations/20260322090000. The validation in
 * this file exists so a member gets a sentence instead of a 400.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  PERSON_PHOTO_BUCKET as BUCKET,
  ALLOWED_PHOTO_TYPES as ALLOWED_TYPES,
  MAX_PHOTO_BYTES as MAX_BYTES,
  MAX_PHOTOS,
  SIGNED_URL_TTL_SECONDS,
} from "@/shared/constants/photos";

const church = () => supabase.schema("church");

export { ALLOWED_TYPES, MAX_BYTES, MAX_PHOTOS, SIGNED_URL_TTL_SECONDS };

export interface PersonPhoto {
  person_id: string;
  photo_id: string;
  storage_path: string;
  slot: number;
  is_primary: boolean;
}

/** A photo with somewhere to point an <img> at. */
export interface PersonPhotoWithUrl extends PersonPhoto {
  url: string | null;
}

export function describeFileProblem(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    // The common case by a mile is an iPhone HEIC, which is worth naming
    // rather than listing four mime types at somebody.
    return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
      ? "iPhone HEIC photos are not supported. In Settings → Camera → Formats, choose “Most Compatible”, or send the photo to yourself first — it converts to JPEG on the way."
      : "That file is not a photo. JPEG, PNG, WebP or GIF.";
  }
  if (file.size > MAX_BYTES) {
    return `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
  }
  return null;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type.split("/")[1] ?? "jpg";
}

export const photoService = {
  /**
   * Upload one photo and record it.
   *
   * The path is `<person_id>/<uuid>.<ext>`, and the person id has to be the
   * first segment: the storage policies read it straight out of the object
   * name to decide who may touch the file, and church.add_person_photo
   * refuses a path that names somebody else.
   */
  async upload(personId: string, file: File, makePrimary = false): Promise<PersonPhoto> {
    const path = `${personId}/${crypto.randomUUID()}.${extensionFor(file)}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    try {
      const { data, error } = await church().rpc("add_person_photo", {
        _person_id: personId,
        _storage_path: path,
        _make_primary: makePrimary,
      });
      if (error) throw error;
      return data as unknown as PersonPhoto;
    } catch (e) {
      // The row is what makes the object reachable, so an object without one
      // is litter. Best-effort: if this fails too, the file is still
      // unreadable by anyone the policies would not have let in anyway.
      await supabase.storage.from(BUCKET).remove([path]);
      throw e;
    }
  },

  /** Every photo of these people that the caller is allowed to see. */
  async list(personIds: string[]): Promise<PersonPhoto[]> {
    if (personIds.length === 0) return [];
    const { data, error } = await church().rpc("person_photos_for", {
      _person_ids: personIds,
    });
    if (error) throw error;
    return (data ?? []) as unknown as PersonPhoto[];
  },

  /**
   * Turn storage paths into URLs an <img> can load.
   *
   * One round trip for the whole page rather than one per face, which matters
   * on the directory table and the room roster.
   */
  async signUrls(paths: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (paths.length === 0) return urls;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;

    for (const row of data ?? []) {
      // A path the policies refuse comes back with an error and no URL. That
      // is not an exception — a mixed list is normal, and the caller renders
      // initials for whatever is missing.
      if (row.signedUrl && row.path) urls.set(row.path, row.signedUrl);
    }
    return urls;
  },

  async remove(photoId: string): Promise<void> {
    const { data, error } = await church().rpc("delete_person_photo", {
      _photo_id: photoId,
    });
    if (error) throw error;

    const path = data as unknown as string | null;
    if (path) await supabase.storage.from(BUCKET).remove([path]);
  },

  async setPrimary(photoId: string): Promise<void> {
    const { error } = await church().rpc("set_primary_photo", { _photo_id: photoId });
    if (error) throw error;
  },
};
