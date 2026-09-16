/**
 * Member directory table.
 *
 * Hand-rolled on ui/table, matching how every other list in this app is built
 * (the generic ui/data-table exists but is imported by nothing, so adopting it
 * here would be introducing an unproven abstraction mid-feature).
 */

import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, UserRound, Baby } from "lucide-react";
import type { Member } from "../types";
import { displayName, maskPhone } from "../utils/normalize";
import { formatAge, formatBirthday } from "../utils/age";
import { usePersonPhotos, primaryPhotoUrl } from "../hooks/usePersonPhotos";
import { PersonAvatar } from "./PersonAvatar";

interface MemberTableProps {
  members: Member[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}

export function MemberTable({
  members,
  total,
  page,
  pageSize,
  isLoading,
  onPageChange,
}: MemberTableProps) {
  const navigate = useNavigate();
  /*
   * One call for the page of forty, not one per row. Rows the reader may not
   * see a face for simply come back without one — a directory of 582 people
   * where most have no photograph is the normal case, and initials are the
   * designed state rather than a gap.
   */
  const { data: photos } = usePersonPhotos(members.map((m) => m.id));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  if (isLoading && members.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="py-16 text-center">
        <UserRound className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No members match these filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Birthday</TableHead>
              <TableHead className="hidden sm:table-cell">Age</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Email</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow
                key={member.id}
                className="cursor-pointer"
                onClick={() => navigate(`/members/${member.id}`)}
              >
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2.5">
                    <PersonAvatar
                      url={primaryPhotoUrl(photos, member.id)}
                      name={displayName(member)}
                      size="sm"
                    />
                    {member.is_child && (
                      <Baby className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    {displayName(member)}
                  </span>
                </TableCell>
                {/* Month and year only — no day of month is stored. */}
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {formatBirthday(member)}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {formatAge(member)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {maskPhone(member.phone) ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground truncate max-w-[220px]">
                  {member.email ?? "—"}
                </TableCell>
                <TableCell>
                  {member.is_active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {from}–{to} of {total}
          {isLoading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
