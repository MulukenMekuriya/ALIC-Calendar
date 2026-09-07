/**
 * Find the person a gift belongs to.
 *
 * Searches through church.giving_person_search, which is SECURITY DEFINER and
 * returns a name, an email and a household label — never a birthday, an
 * address or anything else on the person record. A treasurer holding
 * giving_admin has no directory permission, and this component is written so
 * they never need one.
 */

import { useState } from "react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, Search, UserRound, X } from "lucide-react";
import { useDonorSearch } from "../hooks";
import type { DonorCandidate } from "../types";

interface DonorPickerProps {
  organizationId: string;
  value: DonorCandidate | null;
  onChange: (donor: DonorCandidate | null) => void;
  /** Shown when nothing is selected. */
  placeholder?: string;
  disabled?: boolean;
}

export function DonorPicker({
  organizationId,
  value,
  onChange,
  placeholder = "Search by name, email or phone…",
  disabled = false,
}: DonorPickerProps) {
  const [term, setTerm] = useState("");
  const { data: candidates, isFetching } = useDonorSearch(organizationId, term);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{value.display_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {value.household_name ?? value.email ?? "No household on record"}
          </div>
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setTerm("");
            }}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear donor</span>
          </Button>
        )}
      </div>
    );
  }

  const tooShort = term.trim().length > 0 && term.trim().length < 3;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          disabled={disabled}
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {tooShort && (
        <p className="text-xs text-muted-foreground">
          Keep typing — searching starts at three characters.
        </p>
      )}

      {!tooShort && term.trim().length >= 3 && (candidates?.length ?? 0) === 0 && !isFetching && (
        <p className="text-xs text-muted-foreground">
          Nobody matches. Leave the gift unmatched and it will wait on the
          Unmatched list until somebody can identify it.
        </p>
      )}

      {(candidates?.length ?? 0) > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
          {candidates!.map((candidate) => (
            <button
              key={candidate.person_id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
              onClick={() => onChange(candidate)}
            >
              <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{candidate.display_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {candidate.email ?? "No email on record"}
                </span>
              </span>
              {candidate.household_name && (
                <Badge variant="secondary" className="shrink-0 max-w-[10rem] truncate">
                  {candidate.household_name}
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
