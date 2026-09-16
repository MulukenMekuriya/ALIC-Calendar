/**
 * Faces, fetched a screenful at a time.
 *
 * ONE QUERY PER SCREEN, NOT ONE PER FACE. A directory table of forty people
 * asks for forty photos in a single call and signs forty URLs in a second one;
 * a component that fetched its own would make eighty requests and re-sign them
 * every time the table re-rendered. So the hook takes a LIST of person ids and
 * the avatar component takes a URL, which is the split that keeps that true.
 *
 * The query key is the sorted id list, so two components asking for the same
 * people share one result and a table that re-orders itself does not refetch.
 *
 * SIGNED URLS EXPIRE. They last an hour; this refetches after fifty minutes,
 * which is a page left open over a long meeting getting fresh URLs before the
 * images turn into broken icons rather than after.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { photoService, type PersonPhotoWithUrl } from "../services/photoService";

export const photoKeys = {
  all: ["church", "person-photos"] as const,
  forPeople: (ids: string[]) => [...photoKeys.all, "for", [...ids].sort().join(",")] as const,
};

const FIFTY_MINUTES = 50 * 60 * 1000;

/** person_id → their photos, lowest slot first, each with a signed URL. */
export type PhotosByPerson = Map<string, PersonPhotoWithUrl[]>;

export function usePersonPhotos(personIds: (string | undefined)[], enabled = true) {
  const ids = personIds.filter((id): id is string => !!id);

  return useQuery({
    queryKey: photoKeys.forPeople(ids),
    queryFn: async (): Promise<PhotosByPerson> => {
      const photos = await photoService.list(ids);
      const urls = await photoService.signUrls(photos.map((p) => p.storage_path));

      const byPerson: PhotosByPerson = new Map();
      for (const photo of photos) {
        const withUrl = { ...photo, url: urls.get(photo.storage_path) ?? null };
        byPerson.set(photo.person_id, [...(byPerson.get(photo.person_id) ?? []), withUrl]);
      }
      return byPerson;
    },
    enabled: enabled && ids.length > 0,
    staleTime: FIFTY_MINUTES,
  });
}

/** The avatar for one person: their primary photo, or the lowest slot. */
export function primaryPhotoUrl(
  photos: PhotosByPerson | undefined,
  personId: string | undefined
): string | null {
  if (!photos || !personId) return null;
  const mine = photos.get(personId);
  if (!mine?.length) return null;
  return (mine.find((p) => p.is_primary) ?? mine[0]).url;
}

/*
 * The three writes.
 *
 * All of them invalidate more than the photo cache: church.people.photo_path
 * is kept in step with the primary photo by a trigger, so a member row, a
 * directory list and the portal summary all carry a stale pointer the moment
 * somebody changes their picture.
 */
function useInvalidatePhotos() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: photoKeys.all });
    queryClient.invalidateQueries({ queryKey: ["church", "members"] });
    queryClient.invalidateQueries({ queryKey: ["church", "my-information"] });
    queryClient.invalidateQueries({ queryKey: ["church", "portal"] });
  };
}

export function useUploadPhoto() {
  const invalidate = useInvalidatePhotos();
  return useMutation({
    mutationFn: ({
      personId,
      file,
      makePrimary,
    }: {
      personId: string;
      file: File;
      makePrimary?: boolean;
    }) => photoService.upload(personId, file, makePrimary ?? false),
    onSuccess: invalidate,
  });
}

export function useDeletePhoto() {
  const invalidate = useInvalidatePhotos();
  return useMutation({
    mutationFn: (photoId: string) => photoService.remove(photoId),
    onSuccess: invalidate,
  });
}

export function useSetPrimaryPhoto() {
  const invalidate = useInvalidatePhotos();
  return useMutation({
    mutationFn: (photoId: string) => photoService.setPrimary(photoId),
    onSuccess: invalidate,
  });
}
