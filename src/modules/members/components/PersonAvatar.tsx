/**
 * One face, or the initials of somebody who has not uploaded one.
 *
 * DELIBERATELY DUMB. It takes a URL and renders it; it does not fetch. The
 * fetching hook, usePersonPhotos, takes a LIST of people and asks once for the
 * whole screen — a self-fetching avatar in a forty-row directory table would
 * make eighty requests and re-sign them on every render. Keeping the data in
 * the page and the pixels in this component is what stops that happening by
 * accident.
 *
 * The fallback is not a placeholder to be replaced later. Most of the 582
 * people in this directory will never have a photograph, so initials are the
 * normal case and are meant to look deliberate rather than broken.
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-16 w-16 text-base",
  xl: "h-24 w-24 text-xl",
} as const;

interface PersonAvatarProps {
  /** Signed URL, or null when there is no photo (or none the reader may see). */
  url?: string | null;
  /** Used for the initials and the alt text. */
  name?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Two letters at most: "Selam Abebe" → SA, "Selam" → SE. */
export function personInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PersonAvatar({ url, name, size = "md", className }: PersonAvatarProps) {
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {url && <AvatarImage src={url} alt={name ? `Photo of ${name}` : "Photo"} />}
      <AvatarFallback className={SIZES[size]}>{personInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
