/**
 * Import a processor export into the ledger.
 *
 * Four steps, same shape as the member import: upload, map the columns, look
 * at what would happen, then commit. The look-before-you-write step is not
 * optional — a giving import that half-lands is worse than one that does not
 * land, because nobody can tell by eye which half did.
 *
 * Re-importing the same file is safe. Every row carries the processor's own
 * transaction id, and church.giving_import_commit skips any reference already
 * in the ledger — including one the Stripe webhook recorded first.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
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
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  ArrowLeft,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { givingService } from "../services";
import { useGivingFunds, useGivingBatches, useImportCommit } from "../hooks";
import { formatMoney, SOURCE_LABELS, METHOD_LABELS } from "../utils/money";
import {
  autoMapGivingColumns,
  applyGivingMapping,
  missingRequired,
  localRowError,
  GIVING_TARGETS,
  GIVING_TARGET_LABELS,
  IGNORE,
  type GivingColumnMapping,
  type GivingImportRow,
} from "../utils/csvGiving";
import { PAYMENT_METHODS, type ImportPreviewRow, type ImportResult } from "../types";

/** Matches the member import's ceiling. A bigger file is a database job. */
const MAX_ROWS = 5000;
const NO_BATCH = "__none__";

type Step = "upload" | "map" | "review" | "done";

function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export default function GivingImportPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: funds } = useGivingFunds(orgId);
  const { data: batches } = useGivingBatches(orgId);
  const commit = useImportCommit();

  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<GivingColumnMapping>({});
  const [defaultFund, setDefaultFund] = useState("general");
  const [defaultMethod, setDefaultMethod] = useState("card");
  const [batchId, setBatchId] = useState<string>(NO_BATCH);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const openBatches = (batches ?? []).filter((b) => b.status === "open");

  const readFile = useCallback(
    (file: File) => {
      setFilename(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = stripBOM(new TextDecoder("utf-8").decode(reader.result as ArrayBuffer));
        if (text.includes("�")) {
          toast({
            title: "Encoding problem",
            description:
              "Some characters could not be read. Re-save the file as “CSV UTF-8” and try again.",
            variant: "destructive",
          });
        }

        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h) => h.trim(),
        });

        const rows = (parsed.data ?? []).filter((r) =>
          Object.values(r).some((v) => (v ?? "").trim() !== "")
        );

        if (rows.length === 0) {
          toast({
            title: "Nothing to import",
            description: "That file has no data rows.",
            variant: "destructive",
          });
          return;
        }
        if (rows.length > MAX_ROWS) {
          toast({
            title: "File too large",
            description: `That file has ${rows.length} rows; the limit is ${MAX_ROWS}.`,
            variant: "destructive",
          });
          return;
        }

        const cols = (parsed.meta.fields ?? []).filter(Boolean);
        setHeaders(cols);
        setRawRows(rows);
        setMapping(autoMapGivingColumns(cols));
        setStep("map");
      };
      reader.readAsArrayBuffer(file);
    },
    [toast]
  );

  /** The mapped rows, before the server has looked at them. */
  const mappedRows: GivingImportRow[] = useMemo(
    () =>
      rawRows.map((raw, index) =>
        applyGivingMapping(raw, mapping, index + 1, {
          fundCode: defaultFund,
          method: defaultMethod,
        })
      ),
    [rawRows, mapping, defaultFund, defaultMethod]
  );

  const stillMissing = missingRequired(mapping);
  const locallyBad = mappedRows.filter((r) => localRowError(r) !== null);

  const runDryRun = async () => {
    if (!orgId) return;
    setChecking(true);
    try {
      const rows = await givingService.importDryRun(orgId, mappedRows);
      setPreview(rows);
      setStep("review");
    } catch (error) {
      toast({
        title: "Could not check the file",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  };

  /**
   * Only rows the server found no fault with, carrying the donor it matched.
   * An ambiguous match arrives with a null person_id on purpose — the gift is
   * imported unmatched and waits on the Unmatched list rather than being
   * credited to a guess.
   */
  const importable = useMemo(() => {
    const byNumber = new Map(preview.map((p) => [p.row_number, p]));
    return mappedRows
      .filter((row) => {
        const checked = byNumber.get(row.row_number);
        return checked && !checked.error && !checked.is_duplicate;
      })
      .map((row) => ({
        ...row,
        person_id: byNumber.get(row.row_number)?.matched_person_id ?? null,
      }));
  }, [mappedRows, preview]);

  const duplicates = preview.filter((p) => p.is_duplicate).length;
  const errored = preview.filter((p) => p.error).length;
  const willMatch = importable.filter((r) => r.person_id).length;
  const importTotal = importable.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);

  const runCommit = async () => {
    if (!orgId || importable.length === 0) return;
    try {
      const outcome = await commit.mutateAsync({
        organizationId: orgId,
        batchId: batchId === NO_BATCH ? null : batchId,
        rows: importable,
      });
      setResult(outcome);
      setStep("done");
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 max-w-6xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/giving")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Giving
          </Button>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Import giving</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A Stripe, PayPal, Zelle or Venmo export, or your own offering
            spreadsheet. Re-importing the same file adds nothing.
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {step === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose a file</CardTitle>
              <CardDescription>
                CSV, with a header row. Up to {MAX_ROWS.toLocaleString()} rows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readFile(file);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => fileInput.current?.click()}>
                <Upload className="h-4 w-4 mr-1" />
                Choose CSV
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {step === "map" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  {filename}
                </CardTitle>
                <CardDescription>
                  {rawRows.length} row{rawRows.length === 1 ? "" : "s"}. Check
                  the columns below — anything left on “Ignore” is not imported.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Fund for rows that do not name one</Label>
                    <Select value={defaultFund} onValueChange={setDefaultFund}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(funds ?? []).map((fund) => (
                          <SelectItem key={fund.id} value={fund.code}>{fund.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Method for rows that do not name one</Label>
                    <Select value={defaultMethod} onValueChange={setDefaultMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{METHOD_LABELS[m] ?? m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Add to a counting batch</Label>
                    <Select value={batchId} onValueChange={setBatchId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_BATCH}>No batch</SelectItem>
                        {openBatches.map((batch) => (
                          <SelectItem key={batch.id} value={batch.id}>
                            {batch.name} · {SOURCE_LABELS[batch.source] ?? batch.source}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-md border divide-y">
                  {headers.map((header) => (
                    <div key={header} className="flex items-center gap-3 p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-sm">{header}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          e.g. {rawRows[0]?.[header] || "—"}
                        </div>
                      </div>
                      <Select
                        value={mapping[header] ?? IGNORE}
                        onValueChange={(value) =>
                          setMapping((prev) => ({
                            ...prev,
                            [header]: value as GivingColumnMapping[string],
                          }))
                        }
                      >
                        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORE}>Ignore</SelectItem>
                          {GIVING_TARGETS.map((target) => (
                            <SelectItem key={target} value={target}>
                              {GIVING_TARGET_LABELS[target]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {stillMissing.length > 0 && (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    Still to map: {stillMissing.map((t) => GIVING_TARGET_LABELS[t]).join(", ")}.
                  </p>
                )}

                {stillMissing.length === 0 && locallyBad.length > 0 && (
                  <p className="text-sm text-amber-700">
                    {locallyBad.length} row{locallyBad.length === 1 ? "" : "s"} cannot
                    be read with this mapping. Carry on and you will see exactly
                    which.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button
                onClick={runDryRun}
                disabled={stillMissing.length > 0 || checking}
              >
                {checking && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Check {rawRows.length} row{rawRows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {step === "review" && (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Card><CardContent className="pt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Will import</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{importable.length}</p>
                <p className="text-xs text-muted-foreground">{formatMoney(importTotal)}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Matched to a donor</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{willMatch}</p>
                <p className="text-xs text-muted-foreground">
                  {importable.length - willMatch} will need identifying
                </p>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Already imported</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{duplicates}</p>
                <p className="text-xs text-muted-foreground">skipped</p>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Unusable</p>
                <p className={"mt-1 text-2xl font-bold tabular-nums " + (errored ? "text-destructive" : "")}>
                  {errored}
                </p>
                <p className="text-xs text-muted-foreground">not imported</p>
              </CardContent></Card>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[28rem]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>From the file</TableHead>
                        <TableHead>Matched to</TableHead>
                        <TableHead>Outcome</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row) => (
                        <TableRow
                          key={row.row_number}
                          className={row.error || row.is_duplicate ? "opacity-70" : undefined}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {row.row_number}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.received_on ?? "—"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {row.amount_cents === null ? "—" : formatMoney(row.amount_cents)}
                          </TableCell>
                          <TableCell className="max-w-[14rem] truncate">
                            {row.donor_name ?? <span className="text-muted-foreground">no name</span>}
                          </TableCell>
                          <TableCell>
                            {row.matched_person_id ? (
                              <span>
                                {row.matched_name}
                                <Badge variant="secondary" className="ml-1.5">
                                  {row.match_confidence}
                                </Badge>
                              </span>
                            ) : row.match_confidence === "ambiguous" ? (
                              <Badge variant="outline" className="text-amber-700">
                                more than one match
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.error ? (
                              <span className="text-destructive text-sm">{row.error}</span>
                            ) : row.is_duplicate ? (
                              <Badge variant="secondary">already in the ledger</Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-700">
                                will import
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("map")}>Back to mapping</Button>
              <Button
                onClick={runCommit}
                disabled={importable.length === 0 || commit.isPending}
              >
                {commit.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Import {importable.length} gift{importable.length === 1 ? "" : "s"}
                {importable.length > 0 && ` · ${formatMoney(importTotal)}`}
              </Button>
            </div>
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {step === "done" && result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Imported
              </CardTitle>
              <CardDescription>
                {result.inserted} gift{result.inserted === 1 ? "" : "s"} worth{" "}
                {formatMoney(result.total_cents)}.
                {result.skipped_duplicates > 0 &&
                  ` ${result.skipped_duplicates} were already in the ledger and were skipped.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.unmatched > 0 && (
                <p className="text-sm text-amber-700">
                  {result.unmatched} gift{result.unmatched === 1 ? "" : "s"} arrived
                  without a donor. They are waiting on the Unmatched list.
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={() => navigate("/giving")}>Back to Giving</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("upload");
                    setPreview([]);
                    setRawRows([]);
                    setHeaders([]);
                    setResult(null);
                    setFilename("");
                  }}
                >
                  Import another file
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
