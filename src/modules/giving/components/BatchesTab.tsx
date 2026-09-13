/**
 * Counting sessions.
 *
 * The variance column is the reason this screen exists: a batch whose entered
 * total does not equal the total two people counted into the bag is the thing
 * a treasurer is looking for, and church.post_giving_batch refuses to post one.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Loader2, Plus, Lock, AlertTriangle, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { RecordGiftDialog } from "./RecordGiftDialog";
import { useGivingBatches, useCreateBatch, usePostBatch } from "../hooks";
import { formatMoney, parseMoneyToCents, SOURCE_LABELS } from "../utils/money";
import { BATCH_SOURCES, type BatchRow } from "../types";

interface BatchesTabProps {
  organizationId: string;
  canWrite: boolean;
  onViewBatch: (batchId: string) => void;
}

export function BatchesTab({ organizationId, canWrite, onViewBatch }: BatchesTabProps) {
  const { toast } = useToast();
  const { data: batches, isLoading } = useGivingBatches(organizationId);
  const createBatch = useCreateBatch();
  const postBatch = usePostBatch();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState<string>("cash");
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [addingTo, setAddingTo] = useState<BatchRow | null>(null);

  const submitBatch = async () => {
    if (!name.trim()) return;
    try {
      await createBatch.mutateAsync({
        organization_id: organizationId,
        name: name.trim(),
        source,
        received_on: receivedOn,
        expected_total_cents: parseMoneyToCents(expected),
        notes: notes.trim() || null,
      });
      toast({ title: "Batch opened", description: name.trim() });
      setCreating(false);
      setName("");
      setExpected("");
      setNotes("");
    } catch (error) {
      toast({
        title: "Could not open the batch",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const post = async (batch: BatchRow) => {
    try {
      const result = await postBatch.mutateAsync(batch.id);
      toast({
        title: "Batch posted",
        description: `${result.gift_count} gifts, ${formatMoney(result.total_cents)}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: message.includes("out_of_balance") ? "Out of balance" : "Could not post",
        description: message.includes("out_of_balance")
          ? "The entered total does not match the counted total. Fix one or the other before posting."
          : message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Counting batches</h2>
          <p className="text-sm text-muted-foreground">
            Open one per counting session or per processor payout, enter the
            gifts, then post it to freeze the amounts.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Open a batch
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading batches…
            </div>
          ) : (batches?.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No batches yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Entered</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches!.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <button
                          className="text-left hover:underline"
                          onClick={() => onViewBatch(batch.id)}
                        >
                          <span className="block font-medium">{batch.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {SOURCE_LABELS[batch.source] ?? batch.source} ·{" "}
                            {batch.gift_count} gift{batch.gift_count === 1 ? "" : "s"}
                            {batch.unmatched_count > 0 && ` · ${batch.unmatched_count} unmatched`}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{batch.received_on}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {batch.expected_total_cents === null ? (
                          <span className="text-muted-foreground">not counted</span>
                        ) : (
                          formatMoney(batch.expected_total_cents)
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatMoney(batch.entered_total_cents)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {batch.variance_cents === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : batch.variance_cents === 0 ? (
                          <span className="inline-flex items-center text-emerald-600">
                            <Check className="h-3.5 w-3.5 mr-1" />
                            balanced
                          </span>
                        ) : (
                          <span className="inline-flex items-center font-medium text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                            {batch.variance_cents > 0 ? "+" : ""}
                            {formatMoney(batch.variance_cents)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {batch.status === "posted" ? (
                          <Badge variant="secondary" className="whitespace-nowrap">
                            <Lock className="h-3 w-3 mr-1" />
                            posted
                          </Badge>
                        ) : (
                          <Badge variant="outline">open</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canWrite && batch.status === "open" && (
                          <div className="flex gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => setAddingTo(batch)}>
                              Add gift
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => post(batch)}
                              disabled={postBatch.isPending || batch.gift_count === 0}
                            >
                              Post
                            </Button>
                          </div>
                        )}
                        {batch.status === "posted" && batch.posted_by_name && (
                          <span className="text-xs text-muted-foreground">
                            by {batch.posted_by_name}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open a counting batch</DialogTitle>
            <DialogDescription>
              The counted total is what two people agreed was in the bag. Leave
              it blank only if nobody counted separately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="batch-name">Name</Label>
              <Input
                id="batch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sunday 4 Jan — cash & cheques"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BATCH_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>{SOURCE_LABELS[s] ?? s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-date">Received on</Label>
                <Input
                  id="batch-date"
                  type="date"
                  value={receivedOn}
                  onChange={(e) => setReceivedOn(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-expected">Counted total</Label>
              <Input
                id="batch-expected"
                inputMode="decimal"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="2,450.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-notes">Notes</Label>
              <Textarea
                id="batch-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Counted by Tesfaye and Meron."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={submitBatch} disabled={!name.trim() || createBatch.isPending}>
              {createBatch.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Open batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecordGiftDialog
        open={!!addingTo}
        onOpenChange={(open) => { if (!open) setAddingTo(null); }}
        organizationId={organizationId}
        batchId={addingTo?.id ?? null}
        batchName={addingTo?.name ?? null}
      />
    </div>
  );
}
