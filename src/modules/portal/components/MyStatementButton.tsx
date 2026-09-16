/**
 * "Can you send me my statement again."
 *
 * It is the most common telephone call the church office takes in January, and
 * until now the only answer was for somebody in the office to find the member,
 * print the document and post it. church.my_statement lets the member do it
 * themselves, through the same template the treasurer's batch uses — one
 * layout, so a member's copy and the office's copy of the same year cannot
 * drift into looking like different documents.
 *
 * Nothing is fetched until the button is pressed. A statement is a thing
 * somebody asks for, not something a page should pull down on mount in case it
 * is wanted.
 *
 * The browser print dialog is the download: "Save as PDF" is in it on every
 * platform this church actually uses, and generating a PDF client-side would
 * mean carrying a PDF library to do worse what the operating system already
 * does well.
 */

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Loader2, FileText } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { CHURCH_BRANDING } from "@/shared/constants/branding";
import { printStatements } from "@/modules/giving/services";
import type { StatementChurchInfo } from "@/modules/giving/utils/statementTemplate";
import { portalService } from "../services";

interface MyStatementButtonProps {
  organizationId: string | undefined;
  year: number;
  /** Overview uses the filled button; the giving tab lists several outlined. */
  variant?: "default" | "outline";
  size?: "default" | "sm";
  label?: string;
}

export function MyStatementButton({
  organizationId,
  year,
  variant = "outline",
  size = "sm",
  label,
}: MyStatementButtonProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [working, setWorking] = useState(false);

  const churchInfo: StatementChurchInfo = {
    name: CHURCH_BRANDING.name,
    addressLines: [currentOrganization?.name ?? ""].filter(Boolean),
    ein: null,
    email: CHURCH_BRANDING.contact.email,
  };

  const run = async () => {
    if (!organizationId) return;
    setWorking(true);
    try {
      const statement = await portalService.statement(organizationId, year);

      // A year with no gifts still produces a valid statement, and printing a
      // page of zeroes is not what the member meant. Say so instead.
      if (statement.gift_count === 0) {
        toast({
          title: `Nothing recorded for ${year}`,
          description:
            "If you gave that year and it is not here, the church office can check how it was recorded.",
        });
        return;
      }

      const result = await printStatements([statement], churchInfo);
      if (!result.submitted) {
        toast({
          title: "Could not open the print dialog",
          description: result.error ?? "Your browser did not accept the print job.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Could not build your statement",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={run} disabled={working || !organizationId}>
      {working ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <FileText className="h-4 w-4 mr-1.5" />
      )}
      {label ?? `${year} statement`}
    </Button>
  );
}
