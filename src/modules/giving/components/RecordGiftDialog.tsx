/**
 * Record one gift by hand — the cheque, the cash envelope, the Zelle a member
 * telephoned about.
 *
 * The donor is optional and that is not an oversight: cash in the offering box
 * is genuinely anonymous, and forcing a name here would produce invented ones.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { DonorPicker } from "./DonorPicker";
import { useGivingFunds, useRecordDonation } from "../hooks";
import { parseMoneyToCents, formatMoney, METHOD_LABELS } from "../utils/money";
import { PAYMENT_METHODS, type DonorCandidate } from "../types";

interface RecordGiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Pre-selects a batch, when the gift is being counted into one. */
  batchId?: string | null;
  batchName?: string | null;
}

const NONE = "__none__";

export function RecordGiftDialog({
  open,
  onOpenChange,
  organizationId,
  batchId = null,
  batchName = null,
}: RecordGiftDialogProps) {
  const { toast } = useToast();
  const { data: funds } = useGivingFunds(organizationId);
  const recordGift = useRecordDonation();

  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [fundId, setFundId] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [checkNumber, setCheckNumber] = useState("");
  const [note, setNote] = useState("");
  const [donor, setDonor] = useState<DonorCandidate | null>(null);
  const [deductible, setDeductible] = useState(true);

  // Default to the first fund once they load, so the common case is one field
  // shorter.
  useEffect(() => {
    if (!fundId && funds && funds.length > 0) setFundId(funds[0].id);
  }, [funds, fundId]);

  const cents = parseMoneyToCents(amount);
  const amountValid = cents !== null && cents > 0;
  const canSubmit = amountValid && !!fundId && !!receivedOn && !recordGift.isPending;

  const reset = () => {
    setAmount("");
    setCheckNumber("");
    setNote("");
    setDonor(null);
    setDeductible(true);
    setReceivedOn(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await recordGift.mutateAsync({
        organization_id: organizationId,
        batch_id: batchId,
        fund_id: fundId,
        person_id: donor?.person_id ?? null,
        amount_cents: cents!,
        received_on: receivedOn,
        method,
        source: "manual",
        check_number: method === "check" ? checkNumber.trim() || null : null,
        donor_name_raw: donor?.display_name ?? null,
        is_tax_deductible: deductible,
        note: note.trim() || null,
      });
      toast({
        title: "Gift recorded",
        description: `${formatMoney(cents)} from ${donor?.display_name ?? "an anonymous donor"}.`,
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not record the gift",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a gift</DialogTitle>
          <DialogDescription>
            {batchName
              ? `Counting into “${batchName}”.`
              : "Not part of a counted batch. Cash and cheques are easier to reconcile inside one."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gift-amount">Amount</Label>
              <Input
                id="gift-amount"
                inputMode="decimal"
                placeholder="150.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amount.trim() !== "" && !amountValid && (
                <p className="text-xs text-destructive">
                  {cents !== null && cents <= 0
                    ? "Must be more than zero."
                    : "That is not an amount."}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-date">Received on</Label>
              <Input
                id="gift-date"
                type="date"
                value={receivedOn}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setReceivedOn(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger><SelectValue placeholder="Choose a fund" /></SelectTrigger>
                <SelectContent>
                  {(funds ?? []).map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{METHOD_LABELS[m] ?? m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {method === "check" && (
            <div className="space-y-1.5">
              <Label htmlFor="gift-check">Cheque number</Label>
              <Input
                id="gift-check"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                placeholder="1042"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Donor</Label>
            <DonorPicker
              organizationId={organizationId}
              value={donor}
              onChange={setDonor}
            />
            {!donor && (
              <p className="text-xs text-muted-foreground">
                Optional. An unnamed gift still counts toward the fund; it just
                cannot appear on anybody's year-end statement.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gift-note">Note</Label>
            <Textarea
              id="gift-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the finance team should see later."
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
              Tax deductible
              <span className="block text-xs text-muted-foreground">
                Untick when the donor received something for it — a banquet
                ticket, a seat on a trip. The statement must not claim it.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {recordGift.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Record {amountValid ? formatMoney(cents) : "gift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
