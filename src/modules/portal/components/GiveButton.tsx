/**
 * The one giving call to action.
 *
 * Lifted out of MyChurchPage so the page header and the overview's giving card
 * can share it and be visibly different weights: the header carries the filled
 * primary button a member came to press, the card an outline one next to the
 * statement and the gift list. Two identical filled buttons a few hundred
 * pixels apart — which is what the page had — read as a mistake, not as
 * emphasis.
 */

import { Button } from "@/shared/components/ui/button";
import { HandCoins, ExternalLink } from "lucide-react";
import { STRIPE_GIVING_URL } from "@/shared/constants/giving";

export function GiveButton({
  className,
  variant = "default",
  size = "default",
}: {
  className?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
}) {
  return (
    <Button asChild className={className} variant={variant} size={size}>
      <a href={STRIPE_GIVING_URL} target="_blank" rel="noopener noreferrer">
        <HandCoins className="h-4 w-4 mr-1" />
        Give online
        <ExternalLink className="h-3.5 w-3.5 ml-1.5 opacity-70" />
      </a>
    </Button>
  );
}
