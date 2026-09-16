/**
 * Three photographs of one person, added and removed by whoever may.
 *
 * Used from three places with the same field list and the same rules: a member
 * on their own record in My Church, a parent on a child of their household,
 * and the office on anybody. What differs between them is nothing at all —
 * church.can_manage_photos_of decides, and it decides the same way whichever
 * screen asked. That is why this is one component and not three.
 *
 * WHY THREE SLOTS ARE DRAWN EVEN WHEN THEY ARE EMPTY. "Up to three" is a fact
 * about the record, and a single Add button would hide it until somebody hit
 * the limit and got told off by an error message. Empty frames say what is
 * possible before you try.
 *
 * THE PRIMARY IS NOT A FOURTH THING. One of the three is the face that appears
 * everywhere else — the directory row, the header, the check-in desk — and
 * choosing it is a click on the photo itself rather than a separate control.
 *
 * A NOTE ABOUT CHILDREN. Adding a photo of a child records the church's
 * permission to hold it (person_sensitive.photo_consent), because the person
 * entitled to give that permission is exactly the parent doing the uploading.
 * The caption below says so out loud, in the one place somebody is actually
 * deciding. If consent is ever withdrawn the photo stops being visible to
 * everybody — including here, where the frame stays but the image does not.
 */

import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, Star, Trash2, Upload, UserRound } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  usePersonPhotos,
  useUploadPhoto,
  useDeletePhoto,
  useSetPrimaryPhoto,
} from "../hooks/usePersonPhotos";
import { describeFileProblem, MAX_PHOTOS } from "../services/photoService";
import { cn } from "@/lib/utils";

interface PersonPhotoManagerProps {
  personId: string | undefined;
  /** Shown in the alt text and the toasts. */
  personName?: string | null;
  /** Changes the consent sentence; the database decides the rest. */
  isChild?: boolean;
  /** False for a reader who may look but not change — the office viewing
   *  somebody else's record without members_admin, for instance. */
  canEdit?: boolean;
}

export function PersonPhotoManager({
  personId,
  personName,
  isChild = false,
  canEdit = true,
}: PersonPhotoManagerProps) {
  const { toast } = useToast();
  const { data: photosByPerson, isLoading } = usePersonPhotos([personId]);
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const setPrimary = useSetPrimaryPhoto();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);

  const photos = (personId && photosByPerson?.get(personId)) || [];
  const full = photos.length >= MAX_PHOTOS;

  const pick = () => fileInput.current?.click();

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately, so choosing the same file twice in a row still fires.
    event.target.value = "";
    if (!file || !personId) return;

    const problem = describeFileProblem(file);
    if (problem) {
      toast({ title: "Not uploaded", description: problem, variant: "destructive" });
      return;
    }

    try {
      await upload.mutateAsync({ personId, file });
      toast({
        title: "Photo added",
        description: isChild
          ? "The children's team can now see this face at the check-in desk."
          : "Your first photo becomes the one shown beside your name.",
      });
    } catch (e) {
      toast({
        title: "Not uploaded",
        description: sayWhy(e),
        variant: "destructive",
      });
    }
  };

  const onRemove = async (photoId: string, slot: number) => {
    setBusySlot(slot);
    try {
      await remove.mutateAsync(photoId);
      toast({ title: "Photo removed" });
    } catch (e) {
      toast({ title: "Not removed", description: sayWhy(e), variant: "destructive" });
    } finally {
      setBusySlot(null);
    }
  };

  const onMakePrimary = async (photoId: string, slot: number) => {
    setBusySlot(slot);
    try {
      await setPrimary.mutateAsync(photoId);
      toast({ title: "That is the photo people will see" });
    } catch (e) {
      toast({ title: "Not changed", description: sayWhy(e), variant: "destructive" });
    } finally {
      setBusySlot(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading photos…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {photos.map((photo) => (
          <figure key={photo.photo_id} className="relative">
            <div
              className={cn(
                "h-24 w-24 overflow-hidden rounded-lg border bg-muted",
                photo.is_primary && "ring-2 ring-primary ring-offset-2"
              )}
            >
              {photo.url ? (
                <img
                  src={photo.url}
                  alt={`${personName ?? "Photo"} ${photo.slot}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                /* A row with no readable file: a child whose consent was
                   withdrawn, most likely. The frame stays so the photo can
                   still be removed. */
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                  <UserRound className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] leading-tight text-muted-foreground">
                    Not shown
                  </span>
                </div>
              )}
            </div>

            {photo.is_primary && (
              <Badge className="absolute -top-2 left-1 px-1.5 py-0 text-[10px]">shown</Badge>
            )}

            {canEdit && (
              <div className="mt-1.5 flex justify-center gap-1">
                {!photo.is_primary && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Show this one beside my name"
                    disabled={busySlot === photo.slot}
                    onClick={() => onMakePrimary(photo.photo_id, photo.slot)}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  title="Remove this photo"
                  disabled={busySlot === photo.slot}
                  onClick={() => onRemove(photo.photo_id, photo.slot)}
                >
                  {busySlot === photo.slot ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}
          </figure>
        ))}

        {/* The empty frames, so "up to three" is visible before you hit it. */}
        {canEdit &&
          Array.from({ length: MAX_PHOTOS - photos.length }).map((_, i) => (
            <button
              key={`empty-${i}`}
              type="button"
              onClick={pick}
              disabled={upload.isPending}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              {upload.isPending && i === 0 ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              <span className="text-[11px]">Add photo</span>
            </button>
          ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onFile}
      />

      <p className="text-xs text-muted-foreground">
        {full
          ? "Three is the limit. Remove one to add another."
          : "JPEG, PNG, WebP or GIF, up to 5 MB each."}{" "}
        {isChild
          ? "Adding a photo records your permission for the church to hold it; ask the office if you want that withdrawn."
          : "Only you, your household and the church office can see these."}
      </p>
    </div>
  );
}

/** The RPC codes this component can provoke, in words. */
function sayWhy(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/three_photos_is_the_limit/.test(message))
    return "That would be a fourth photo. Remove one first.";
  if (/not_your_photo_to_change/.test(message))
    return "This record is not yours to change. The church office can do it.";
  if (/photo_path_does_not_belong/.test(message))
    return "Something went wrong preparing the upload. Try again.";
  if (/mime type|Payload too large|exceeded the maximum/i.test(message))
    return "The server refused that file. JPEG, PNG, WebP or GIF, up to 5 MB.";
  return message;
}
