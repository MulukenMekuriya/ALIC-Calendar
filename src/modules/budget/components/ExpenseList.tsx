/**
 * ExpenseList - List of expense requests with filtering and actions
 * World-class UI/UX with modern design patterns
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Send,
  CreditCard,
  Loader2,
  FileText,
  User,
  Banknote,
  Phone,
  Mail,
  Building2,
  Calendar,
  DollarSign,
  Receipt,
  UserCheck,
  Hash,
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
  CancelExpenseDialog,
} from "./ExpenseWorkflowActions";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useSearch } from "@/shared/contexts/SearchContext";
import { useDeleteExpense, useSubmitExpenseForReview } from "../hooks";
import type { ExpenseRequestWithRelations, ExpenseStatus } from "../types";
import { EXPENSE_STATUS_CONFIG, REIMBURSEMENT_TYPE_LABELS } from "../types";
import { Badge } from "@/shared/components/ui/badge";

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
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { searchQuery } = useSearch();

  // State for dialogs
  const [selectedExpense, setSelectedExpense] =
    useState<ExpenseRequestWithRelations | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLeaderApproveOpen, setIsLeaderApproveOpen] = useState(false);
  const [isLeaderDenyOpen, setIsLeaderDenyOpen] = useState(false);
  const [isTreasuryApproveOpen, setIsTreasuryApproveOpen] = useState(false);
  const [isTreasuryDenyOpen, setIsTreasuryDenyOpen] = useState(false);
  const [isFinanceProcessOpen, setIsFinanceProcessOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">(
    "all"
  );

  // Mutations
  const deleteExpense = useDeleteExpense();
  const submitForReview = useSubmitExpenseForReview();

  // Filter expenses (EXCLUDE cancelled requests completely)
  const filteredExpenses = expenses.filter((expense) => {
    // First, exclude cancelled requests entirely
    if (expense.status === "cancelled") {
      return false;
    }

    const matchesSearch =
      expense.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.requester_name
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      expense.ministry?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || expense.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (expense: ExpenseRequestWithRelations) => {
    if (!confirm("Are you sure you want to delete this expense request?"))
      return;

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
        description:
          error instanceof Error ? error.message : "Failed to delete expense",
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
        description:
          error instanceof Error ? error.message : "Failed to submit expense",
        variant: "destructive",
      });
    }
  };

  const canEdit = (expense: ExpenseRequestWithRelations) =>
    expense.status === "draft" &&
    (expense.requester_id === user?.id || userRole === "admin");

  const canDelete = (expense: ExpenseRequestWithRelations) =>
    expense.status === "draft" &&
    (expense.requester_id === user?.id || userRole === "admin");

  const canSubmit = (expense: ExpenseRequestWithRelations) =>
    expense.status === "draft" && expense.requester_id === user?.id;

  const canCancel = (expense: ExpenseRequestWithRelations) =>
    expense.status === "pending_leader" &&
    (expense.requester_id === user?.id || userRole === "admin");

  const canLeaderReview = (expense: ExpenseRequestWithRelations) =>
    expense.status === "pending_leader" && userRole === "admin";

  const canTreasuryReview = (expense: ExpenseRequestWithRelations) =>
    (expense.status === "leader_approved" ||
      expense.status === "pending_treasury") &&
    userRole === "treasury";

  const canFinanceProcess = (expense: ExpenseRequestWithRelations) =>
    (expense.status === "treasury_approved" ||
      expense.status === "pending_finance") &&
    userRole === "finance";

  // Helper to get recipient info
  const getRecipientInfo = (expense: ExpenseRequestWithRelations) => {
    const isDifferent = expense.is_different_recipient;
    return {
      name: isDifferent && expense.recipient_name ? expense.recipient_name : expense.requester_name,
      phone: isDifferent && expense.recipient_phone ? expense.recipient_phone : expense.requester_phone,
      email: isDifferent && expense.recipient_email ? expense.recipient_email : expense.requester_email,
      isDifferent,
    };
  };

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
            <p className="text-sm text-muted-foreground">Loading expenses...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <>
        <Card className="border-0 shadow-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b">
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              Expense Requests
              <Badge variant="secondary" className="ml-2 font-normal">
                {filteredExpenses.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 p-4 bg-slate-50/50 border-b">
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as ExpenseStatus | "all")
                }
              >
                <SelectTrigger className="w-full md:w-[220px] bg-white border-slate-200 shadow-sm">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(EXPENSE_STATUS_CONFIG).map(
                    ([status, config]) => (
                      <SelectItem key={status} value={status}>
                        {config.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Table / Cards */}
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                  <FileText className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">No expense requests found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden divide-y">
                  {filteredExpenses.map((expense) => {
                    const recipient = getRecipientInfo(expense);
                    return (
                      <div
                        key={expense.id}
                        className="p-4 hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 line-clamp-2">
                              {expense.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {expense.ministry?.name || "No Ministry"}
                            </div>
                          </div>
                          <ExpenseStatusBadge status={expense.status} />
                        </div>

                        {/* Amount & Date Row */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-emerald-100 rounded-md">
                              <DollarSign className="h-4 w-4 text-emerald-600" />
                            </div>
                            <span className="text-xl font-bold text-slate-900">
                              ${Number(expense.amount).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(expense.created_at), "MMM d, yyyy")}
                          </div>
                        </div>

                        {/* Info Badges */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          <Badge variant="outline" className="text-xs font-normal bg-white">
                            <Receipt className="h-3 w-3 mr-1 text-slate-500" />
                            {REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type]}
                          </Badge>
                          {expense.is_advance_payment && (
                            <Badge className="text-xs font-medium bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                              <Banknote className="h-3 w-3 mr-1" />
                              Advance
                            </Badge>
                          )}
                          {expense.tin && (
                            <Badge variant="outline" className="text-xs font-normal bg-white">
                              <Hash className="h-3 w-3 mr-1 text-slate-500" />
                              TIN: {expense.tin}
                            </Badge>
                          )}
                        </div>

                        {/* Recipient Card */}
                        <div className={`rounded-lg p-3 mb-3 ${recipient.isDifferent ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50 border border-slate-100'}`}>
                          <div className="flex items-center gap-1.5 mb-2">
                            {recipient.isDifferent ? (
                              <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-slate-500" />
                            )}
                            <span className={`text-xs font-medium ${recipient.isDifferent ? 'text-blue-700' : 'text-slate-600'}`}>
                              {recipient.isDifferent ? "Payment Recipient" : "Requester"}
                            </span>
                          </div>
                          <p className="font-medium text-sm text-slate-900 mb-1">{recipient.name}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {recipient.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {recipient.phone}
                              </span>
                            )}
                            {recipient.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {recipient.email}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-3 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 shadow-sm"
                            onClick={() => {
                              setSelectedExpense(expense);
                              setIsDetailDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="shadow-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
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
                              {canCancel(expense) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedExpense(expense);
                                      setIsCancelDialogOpen(true);
                                    }}
                                    className="text-orange-600"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Request
                                  </DropdownMenuItem>
                                </>
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
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-slate-500" />
                            Expense Details
                          </div>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                            Amount
                          </div>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <Receipt className="h-3.5 w-3.5 text-slate-500" />
                            Payment Info
                          </div>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-500" />
                            Recipient
                          </div>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => {
                        const recipient = getRecipientInfo(expense);
                        return (
                          <TableRow
                            key={expense.id}
                            className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedExpense(expense);
                              setIsDetailDialogOpen(true);
                            }}
                          >
                            {/* Expense Details Column */}
                            <TableCell className="py-4">
                              <div className="space-y-1">
                                <p className="font-medium text-slate-900 line-clamp-1 group-hover:text-primary transition-colors">
                                  {expense.title}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    {expense.ministry?.name || "-"}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(expense.created_at), "MMM d, yyyy")}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            {/* Amount Column */}
                            <TableCell className="py-4">
                              <div className="space-y-1">
                                <p className="font-bold text-lg text-slate-900">
                                  ${Number(expense.amount).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </p>
                                {expense.is_advance_payment && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                                    <Banknote className="h-3 w-3 mr-1" />
                                    Advance
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            {/* Payment Info Column */}
                            <TableCell className="py-4">
                              <div className="space-y-1.5">
                                <Badge variant="outline" className="text-xs font-normal bg-white">
                                  {REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type]}
                                </Badge>
                                {expense.tin && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Hash className="h-3 w-3" />
                                    TIN: {expense.tin}
                                  </p>
                                )}
                              </div>
                            </TableCell>

                            {/* Recipient Column */}
                            <TableCell className="py-4">
                              <div className={`rounded-lg p-2.5 ${recipient.isDifferent ? 'bg-blue-50/70' : 'bg-slate-50/70'}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  {recipient.isDifferent ? (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                                      </TooltipTrigger>
                                      <TooltipContent>Different from requester</TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <User className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                  <span className={`text-sm font-medium truncate max-w-[140px] ${recipient.isDifferent ? 'text-blue-700' : 'text-slate-700'}`}>
                                    {recipient.name}
                                  </span>
                                </div>
                                <div className="space-y-0.5 text-xs text-muted-foreground">
                                  {recipient.phone && (
                                    <p className="flex items-center gap-1 truncate max-w-[160px]">
                                      <Phone className="h-3 w-3 flex-shrink-0" />
                                      {recipient.phone}
                                    </p>
                                  )}
                                  {recipient.email && (
                                    <p className="flex items-center gap-1 truncate max-w-[160px]">
                                      <Mail className="h-3 w-3 flex-shrink-0" />
                                      {recipient.email}
                                    </p>
                                  )}
                                  {!recipient.phone && !recipient.email && (
                                    <p className="text-slate-400 italic">No contact info</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            {/* Status Column */}
                            <TableCell className="py-4">
                              <ExpenseStatusBadge status={expense.status} />
                            </TableCell>

                            {/* Actions Column */}
                            <TableCell className="py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-slate-500 hover:text-primary hover:bg-primary/10"
                                      onClick={() => {
                                        setSelectedExpense(expense);
                                        setIsDetailDialogOpen(true);
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View Details</TooltipContent>
                                </Tooltip>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-slate-500 hover:text-slate-700"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
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
                                      <DropdownMenuItem
                                        onClick={() => handleSubmit(expense)}
                                      >
                                        <Send className="mr-2 h-4 w-4" />
                                        Submit for Review
                                      </DropdownMenuItem>
                                    )}

                                    {canCancel(expense) && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setSelectedExpense(expense);
                                            setIsCancelDialogOpen(true);
                                          }}
                                          className="text-orange-600"
                                        >
                                          <XCircle className="mr-2 h-4 w-4" />
                                          Cancel Request
                                        </DropdownMenuItem>
                                      </>
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
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <ExpenseDetailDialog
          open={isDetailDialogOpen}
          onOpenChange={setIsDetailDialogOpen}
          expense={selectedExpense}
          userRole={userRole}
          onLeaderApprove={() => {
            setIsLeaderApproveOpen(true);
          }}
          onLeaderDeny={() => {
            setIsLeaderDenyOpen(true);
          }}
          onTreasuryApprove={() => {
            setIsTreasuryApproveOpen(true);
          }}
          onTreasuryDeny={() => {
            setIsTreasuryDenyOpen(true);
          }}
          onFinanceProcess={() => {
            setIsFinanceProcessOpen(true);
          }}
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
            <CancelExpenseDialog
              open={isCancelDialogOpen}
              onOpenChange={setIsCancelDialogOpen}
              expense={selectedExpense}
              onSuccess={onRefresh}
            />
          </>
        )}
      </>
    </TooltipProvider>
  );
}
