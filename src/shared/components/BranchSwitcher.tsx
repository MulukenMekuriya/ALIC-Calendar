/**
 * Which branch am I looking at.
 *
 * The app has always been multi-branch in the database and single-branch on
 * the screen: OrganizationContext picked one for you — default_organization_id,
 * then is_primary, then whichever membership came back first — and there was
 * no way to say "show me the other one". Somebody who belongs to both branches
 * could only ever see the branch the app had chosen for them.
 *
 * That is why this exists now: the Board is appointed to read MD and VA
 * together. It is useful to anyone in both buildings, so it is offered to
 * anyone with more than one membership and hidden from everyone else — most
 * people belong to one branch and should not be asked a question that has only
 * one answer.
 *
 * NOT a merged view. Every screen still shows one branch at a time; this
 * changes which one. Board Review is the exception, and shows both branches
 * side by side because that is the decision it exists to support.
 */

import { Building2, Check, ChevronDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useOrganization } from "@/shared/contexts/OrganizationContext";

/** "ALIC MD - Silver Spring" is a mouthful in a header bar. */
const shortBranchName = (name?: string | null): string => {
  if (!name) return "Branch";

  const match = name.match(/\b(MD|VA)\b/);
  if (match) return match[1];

  return name.replace(/^ALIC\s*/i, "").split(/[-–—]/)[0].trim() || name;
};

export function BranchSwitcher() {
  const { currentOrganization, userOrganizations, switchOrganization } =
    useOrganization();

  if (userOrganizations.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Building2 className="h-4 w-4" />
          <span className="font-medium">
            {shortBranchName(currentOrganization?.name)}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {userOrganizations.map((membership) => {
          const isCurrent =
            membership.organization_id === currentOrganization?.id;

          return (
            <DropdownMenuItem
              key={membership.organization_id}
              onClick={() => switchOrganization(membership.organization_id)}
              className="gap-2"
            >
              <Check
                className={`h-4 w-4 ${isCurrent ? "opacity-100" : "opacity-0"}`}
              />
              <span className="flex-1 truncate">
                {membership.organization?.name || "Branch"}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
