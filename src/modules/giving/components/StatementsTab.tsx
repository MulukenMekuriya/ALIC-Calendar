/**
 * The January job.
 *
 * Nothing loads on mount. Every call to church.giving_statement_recipients
 * writes a row to church.giving_access_audit, and an audit trail that fills up
 * with page loads nobody asked for is an audit trail nobody reads.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Loader2,
  Printer,
  Download,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { CHURCH_BRANDING } from "@/shared/constants/branding";
import { useStatementRecipients } from "../hooks";
import { givingService, printStatements, recipientsToCsv, downloadCsv } from "../services";
import { formatMoney, parseMoneyToCents } from "../utils/money";
import type { StatementChurchInfo } from "../utils/statementTemplate";
import type { StatementRecipient } from "../types";

interface StatementsTabProps {
  organizationId: string;
  year: number;
}

export function StatementsTab({ organizationId, year }: StatementsTabProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [minimum, setMinimum] = useState("0.01");
  const [loaded, setLoaded] = useState(false);
  const [printing, setPrinting] = useState(false);

  const minCents = Math.max(parseMoneyToCents(minimum) ?? 1, 1);
  const { data: recipients, isFetching, isError, error, refetch } =
    useStatementRecipients(organizationId, year, minCents, loaded);

  // The church's own details on the statement come from branding plus the
  // branch in context, so Springfield's statements do not carry Silver
  // Spring's address.
  const churchInfo: StatementChurchInfo = {
    name: CHURCH_BRANDING.name,
    addressLines: [currentOrganization?.name ?? ""].filter(Boolean),
    ein: null,
    email: CHURCH_BRANDING.contact.email,
  };

  const noAddress = (recipients ?? []).filter(
    (r) => !r.address_line1 && !r.city
  ).length;

  const printFor = async (subset: StatementRecipient[]) => {
    if (subset.length === 0) return;
    setPrinting(true);
    try {
      const statements = [];
      for (const recipient of subset) {
        statements.push(
          await givingService.statement(
            organizationId,
            year,
            recipient.household_id,
            recipient.person_id
          )
        );
      }
      const result = await printStatements(statements, churchInfo);
      if (!result.submitted) {
        toast({
          title: "Could not print",
          description: result.error ?? "The print job was not accepted.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Could not build the statements",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Year-end contribution statements</CardTitle>
          <CardDescription>
            One statement per household, or per person where they have no
            household. Anonymous gifts count toward the fund totals but cannot
            be receipted, so they never appear here. Every run is recorded in
            the giving access log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stmt-min">Minimum total</Label>
              <Input
                id="stmt-min"
                className="w-32"
                inputMode="decimal"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
              />
            </div>
            <Button
              onClick={() => {
                setLoaded(true);
                void refetch();
              }}
              disabled={isFetching}
            >
              {isFetching && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <FileText className="h-4 w-4 mr-1" />
              Find recipients for {year}
            </Button>

            {(recipients?.length ?? 0) > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => void printFor(recipients!)}
                  disabled={printing}
                >
                  {printing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-1" />
                  )}
                  Print all {recipients!.length}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadCsv(
                      `statement-recipients-${year}.csv`,
                      recipientsToCsv(recipients!)
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-1" />
                  Address list (CSV)
                </Button>
              </>
            )}
          </div>

          {noAddress > 0 && (
            <p className="mt-3 flex items-start gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {noAddress} recipient{noAddress === 1 ? " has" : "s have"} no
                postal address on record. Their statement will print without
                one — fill the address in on the household first if you are
                posting these.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load recipients."}
        </p>
      )}

      {loaded && !isFetching && (recipients?.length ?? 0) === 0 && !isError && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nobody gave a receiptable gift in {year} above that minimum.
        </p>
      )}

      {(recipients?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Gifts</TableHead>
                    <TableHead className="text-right">Deductible</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients!.map((recipient) => (
                    <TableRow key={recipient.household_id ?? recipient.person_id ?? recipient.recipient_name}>
                      <TableCell>
                        <span className="font-medium">{recipient.recipient_name}</span>
                        {!recipient.household_id && (
                          <Badge variant="outline" className="ml-2">individual</Badge>
                        )}
                        {recipient.email && (
                          <span className="block text-xs text-muted-foreground">
                            {recipient.email}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {recipient.address_line1 || recipient.city ? (
                          <>
                            {recipient.address_line1}
                            {recipient.city && (
                              <span className="block">
                                {[recipient.city, recipient.state].filter(Boolean).join(", ")}{" "}
                                {recipient.postal_code}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-amber-700">no address</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{recipient.gift_count}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatMoney(recipient.deductible_cents)}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {formatMoney(recipient.total_cents)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={printing}
                          onClick={() => void printFor([recipient])}
                        >
                          <Printer className="h-4 w-4" />
                          <span className="sr-only">Print this statement</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
