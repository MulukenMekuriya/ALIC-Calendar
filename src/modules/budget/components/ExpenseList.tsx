/**
 * ExpenseList - List of expense requests with filtering and actions
 */

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  MoreHorizontal,
  Search,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Send,
  CreditCard,
  Loader2,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import { ExpenseRequestForm } from "./ExpenseRequestForm";
import { ExpenseDetailDialog } from "./ExpenseDetailDialog";
import {
  LeaderApproveDialog,
  LeaderDenyDialog,
  TreasuryApproveDialog,
  TreasuryDenyDialog,
  FinanceProcessDialog,
} from "./ExpenseWorkflowActions";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useDeleteExpense, useSubmitExpenseForReview } from "../hooks";
import type { ExpenseRequestWithRelations, ExpenseStatus } from "../types";
import { EXPENSE_STATUS_CONFIG } from "../types";

interface ExpenseListProps {
  expenses: ExpenseRequestWithRelations[];
  isLoading?: boolean;
  userRole?: "requester" | "leader" | "treasury" | "finance" | "admin";
  onRefresh?: () => void;
}

export function ExpenseList({
  expenses,
  isLoading = false,
  userRole = "requester",
  onRefresh,
}: ExpenseListProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  // State for dialogs
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRequestWithRelations | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLeaderApproveOpen, setIsLeaderApproveOpen] = useState(false);
  const [isLeaderDenyOpen, setIsLeaderDenyOpen] = useState(false);
  const [isTreasuryApproveOpen, setIsTreasuryApproveOpen] = useState(false);
  const [isTreasuryDenyOpen, setIsTreasuryDenyOpen] = useState(false);
  const [isFinanceProcessOpen, setIsFinanceProcessOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">("all");

  // Mutations
  const deleteExpense = useDeleteExpense();
  const submitForReview = useSubmitExpenseForReview();

  // Filter expenses
  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch =
      expense.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.requester_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.ministry?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || expense.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (expense: ExpenseRequestWithRelations) => {
    if (!confirm("Are you sure you want to delete this expense request?")) return;

    try {
      await deleteExpense.mutateAsync(expense.id);
      toast({
        title: "Expense deleted",
        description: "The expense request has been deleted.",
      });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete expense",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (expense: ExpenseRequestWithRelations) => {
    if (!user || !profile) return;

    try {
      await submitForReview.mutateAsync({
        expenseId: expense.id,
        actorId: user.id,
        actorName: profile.full_name,
      });
      toast({
        title: "Expense submitted",
        description: "Your expense request has been submitted for review.",
      });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit expense",
        variant: "destructive",
      });
    }
  };

  const canEdit = (expense: ExpenseRequestWithRelations) =>
    expense.status === "draft" && (expense.requester_id === user?.id || userRole === "admin");

  const canDelete = (expense: ExpenseRequestWithRelations) =>
    expense.status === "draft" && (expense.requester_id === user?.id || userRole === "admin");

  const canSubmit = (expense: ExpenseRequestWithRelations) =>
    expense.status === "draft" && expense.requester_id === user?.id;

  const canLeaderReview = (expense: ExpenseRequestWithRelations) =>
    expense.status === "pending_leader" && (userRole === "leader" || userRole === "admin");

  const canTreasuryReview = (expense: ExpenseRequestWithRelations) =>
    (expense.status === "leader_approved" || expense.status === "pending_treasury") &&
    (userRole === "treasury" || userRole === "admin");

  const canFinanceProcess = (expense: ExpenseRequestWithRelations) =>
    (expense.status === "treasury_approved" || expense.status === "pending_finance") &&
    (userRole === "finance" || userRole === "admin");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Expense Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, requester, or ministry..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ExpenseStatus | "all")}
            >
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(EXPENSE_STATUS_CONFIG).map(([status, config]) => (
                  <SelectItem key={status} value={status}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No expense requests found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Ministry</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium">{expense.title}</TableCell>
                      <TableCell>{expense.ministry?.name || "-"}</TableCell>
                      <TableCell className="font-medium">
                        ${Number(expense.amount).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <ExpenseStatusBadge status={expense.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(expense.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedExpense(expense);
                                setIsDetailDialogOpen(true);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>

                            {canEdit(expense) && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedExpense(expense);
                                  setIsEditDialogOpen(true);
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}

                            {canSubmit(expense) && (
                              <DropdownMenuItem onClick={() => handleSubmit(expense)}>
                                <Send className="mr-2 h-4 w-4" />
                                Submit for Review
                              </DropdownMenuItem>
                            )}

                            {canLeaderReview(expense) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setIsLeaderApproveOpen(true);
                                  }}
                                  className="text-green-600"
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setIsLeaderDenyOpen(true);
                                  }}
                                  className="text-red-600"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Deny
                                </DropdownMenuItem>
                              </>
                            )}

                            {canTreasuryReview(expense) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setIsTreasuryApproveOpen(true);
                                  }}
                                  className="text-green-600"
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve Payment
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setIsTreasuryDenyOpen(true);
                                  }}
                                  className="text-red-600"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Deny Payment
                                </DropdownMenuItem>
                              </>
                            )}

                            {canFinanceProcess(expense) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setIsFinanceProcessOpen(true);
                                  }}
                                  className="text-purple-600"
                                >
                                  <CreditCard className="mr-2 h-4 w-4" />
                                  Process Payment
                                </DropdownMenuItem>
                              </>
                            )}

                            {canDelete(expense) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(expense)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <ExpenseDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        expense={selectedExpense}
      />

      {/* Edit Dialog */}
      {selectedExpense && (
        <ExpenseRequestForm
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          expense={selectedExpense}
          onSuccess={onRefresh}
        />
      )}

      {/* Approval Dialogs */}
      {selectedExpense && (
        <>
          <LeaderApproveDialog
            open={isLeaderApproveOpen}
            onOpenChange={setIsLeaderApproveOpen}
            expense={selectedExpense}
            onSuccess={onRefresh}
          />
          <LeaderDenyDialog
            open={isLeaderDenyOpen}
            onOpenChange={setIsLeaderDenyOpen}
            expense={selectedExpense}
            onSuccess={onRefresh}
          />
          <TreasuryApproveDialog
            open={isTreasuryApproveOpen}
            onOpenChange={setIsTreasuryApproveOpen}
            expense={selectedExpense}
            onSuccess={onRefresh}
          />
          <TreasuryDenyDialog
            open={isTreasuryDenyOpen}
            onOpenChange={setIsTreasuryDenyOpen}
            expense={selectedExpense}
            onSuccess={onRefresh}
          />
          <FinanceProcessDialog
            open={isFinanceProcessOpen}
            onOpenChange={setIsFinanceProcessOpen}
            expense={selectedExpense}
            onSuccess={onRefresh}
          />
        </>
      )}
    </>
  );
}
