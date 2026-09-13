/**
 * The chart of designations.
 *
 * Funds are retired, never deleted: church.donations holds a RESTRICT foreign
 * key to them, because a fund that can vanish takes last year's statement with
 * it.
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
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { givingService } from "../services";
import { useGivingFunds, useCreateFund } from "../hooks";
import { normalizeFundCode } from "../utils/csvGiving";

export function FundsTab({
  organizationId,
  canWrite,
}: {
  organizationId: string;
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const { data: funds, isLoading, refetch } = useGivingFunds(organizationId, true);
  const createFund = useCreateFund();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deductible, setDeductible] = useState(true);

  const code = normalizeFundCode(name);
  const codeTaken = (funds ?? []).some((f) => f.code === code);

  const submit = async () => {
    if (!name.trim() || !code || codeTaken) return;
    try {
      await createFund.mutateAsync({
        organization_id: organizationId,
        code,
        name: name.trim(),
        description: description.trim() || null,
        is_tax_deductible: deductible,
      });
      toast({ title: "Fund created", description: name.trim() });
      setOpen(false);
      setName("");
      setDescription("");
      setDeductible(true);
    } catch (error) {
      toast({
        title: "Could not create the fund",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const toggle = async (fundId: string, next: boolean) => {
    try {
      await givingService.setFundActive(fundId, next);
      await refetch();
    } catch (error) {
      toast({
        title: "Could not update the fund",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Funds</h2>
          <p className="text-sm text-muted-foreground">
            What a gift can be designated for. Retiring a fund hides it from new
            gifts; it never removes it from past ones.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New fund
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading funds…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Deductible</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(funds ?? []).map((fund) => (
                  <TableRow key={fund.id} className={fund.is_active ? undefined : "opacity-60"}>
                    <TableCell>
                      <span className="font-medium">{fund.name}</span>
                      {fund.description && (
                        <span className="block text-xs text-muted-foreground">
                          {fund.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fund.code}</TableCell>
                    <TableCell>
                      {fund.is_tax_deductible ? "Yes" : <Badge variant="secondary">No</Badge>}
                    </TableCell>
                    <TableCell>
                      {fund.is_active ? (
                        <Badge variant="outline">active</Badge>
                      ) : (
                        <Badge variant="secondary">retired</Badge>
                      )}
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggle(fund.id, !fund.is_active)}
                        >
                          {fund.is_active ? "Retire" : "Restore"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New fund</DialogTitle>
            <DialogDescription>
              The code is derived from the name and is what a spreadsheet import
              matches on.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fund-name">Name</Label>
              <Input
                id="fund-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Youth Camp"
              />
              {name.trim() !== "" && (
                <p className={"text-xs " + (codeTaken ? "text-destructive" : "text-muted-foreground")}>
                  Code: <span className="font-mono">{code || "—"}</span>
                  {codeTaken && " — already in use."}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fund-desc">Description</Label>
              <Textarea
                id="fund-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={deductible}
                onChange={(e) => setDeductible(e.target.checked)}
              />
              <span>
                Gifts to this fund are tax deductible
                <span className="block text-xs text-muted-foreground">
                  Untick for funds where the donor receives something — camp
                  fees, banquet tickets.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={!name.trim() || !code || codeTaken || createFund.isPending}
            >
              {createFund.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
