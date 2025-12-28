/**
 * ExpenseRequestForm - Form for creating and editing expense requests
 */

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Loader2, Send, Save, Paperclip, X, FileText, Image as ImageIcon, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AttachmentData } from "../types";
import { useToast } from "@/shared/hooks/use-toast";
import { useMinistries, useFiscalYears, useActiveFiscalYear } from "../hooks";
import { useCreateExpense, useUpdateExpense, useSubmitExpenseForReview } from "../hooks";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Label } from "@/shared/components/ui/label";
import type { ExpenseRequest, ReimbursementType } from "../types";
import { REIMBURSEMENT_TYPE_LABELS } from "../types";
import {
  getJustificationsForMinistry,
  OTHER_JUSTIFICATION_VALUE,
  OTHER_JUSTIFICATION_LABEL,
} from "../constants/ministryJustifications";

// Form validation schema
const expenseFormSchema = z.object({
  ministry_id: z.string().min(1, "Ministry is required"),
  justification_category: z.string().min(1, "Justification category is required"),
  title: z.string().optional(), // Custom justification when "Other" is selected
  description: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be greater than 0").multipleOf(0.01, "Amount can have at most 2 decimal places"),
  reimbursement_type: z.enum(["zelle", "check", "ach", "admin_online_purchase"]),
  tin: z.string().optional(),
  is_advance_payment: z.boolean().default(false),
  is_different_recipient: z.boolean().default(false),
  recipient_name: z.string().optional(),
  recipient_phone: z.string().optional(),
  recipient_email: z.string().email("Invalid email address").optional().or(z.literal("")),
}).refine((data) => {
  // If "Other" is selected, custom justification (title) is required
  if (data.justification_category === OTHER_JUSTIFICATION_VALUE) {
    return !!data.title && data.title.length >= 3;
  }
  return true;
}, {
  message: "Please specify your justification (at least 3 characters)",
  path: ["title"],
}).refine((data) => {
  if (data.is_different_recipient) {
    return !!data.recipient_name && data.recipient_name.length >= 2;
  }
  return true;
}, {
  message: "Recipient name is required",
  path: ["recipient_name"],
}).refine((data) => {
  if (data.is_different_recipient) {
    return !!data.recipient_phone && data.recipient_phone.length >= 10;
  }
  return true;
}, {
  message: "Recipient phone is required",
  path: ["recipient_phone"],
}).refine((data) => {
  if (data.is_different_recipient) {
    return !!data.recipient_email && data.recipient_email.length > 0;
  }
  return true;
}, {
  message: "Recipient email is required",
  path: ["recipient_email"],
});

// File upload security constants
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "doc", "docx", "xls", "xlsx"] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseRequest | null;
  onSuccess?: () => void;
}

export function ExpenseRequestForm({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: ExpenseRequestFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { currentOrganization, userOrganizations } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousMinistryIdRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);

  const { data: ministries, isLoading: ministriesLoading } = useMinistries(
    currentOrganization?.id
  );
  const { data: fiscalYears, isLoading: fiscalYearsLoading } = useFiscalYears(
    currentOrganization?.id
  );
  const { data: activeFiscalYear } = useActiveFiscalYear(
    currentOrganization?.id
  );

  // Selected fiscal year state - defaults to active fiscal year
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<string | null>(null);

  // Get the effective fiscal year (selected or active)
  const selectedFiscalYear = fiscalYears?.find(
    (fy) => fy.id === (selectedFiscalYearId || activeFiscalYear?.id)
  ) || activeFiscalYear;

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const submitForReview = useSubmitExpenseForReview();

  const isEditing = !!expense;

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      ministry_id: "",
      justification_category: "",
      title: "",
      description: "",
      amount: 0,
      reimbursement_type: "check",
      tin: "",
      is_advance_payment: false,
      is_different_recipient: false,
      recipient_name: "",
      recipient_phone: "",
      recipient_email: "",
    },
  });

  // Watch form fields for conditional rendering
  const isDifferentRecipient = form.watch("is_different_recipient");
  const selectedMinistryId = form.watch("ministry_id");
  const selectedJustificationCategory = form.watch("justification_category");

  // Get the user's default ministry from their profile
  // Note: If the user doesn't have a ministry_name in their profile, they'll need to select one manually
  const userMinistry = ministries?.find(
    (m) => m.name.toLowerCase() === profile?.ministry_name?.toLowerCase()
  );

  // Get the selected ministry for the form
  const selectedMinistry = ministries?.find((m) => m.id === selectedMinistryId);

  // Get justification options for the selected ministry
  const justificationOptions = selectedMinistry
    ? getJustificationsForMinistry(selectedMinistry.name)
    : [];

  // Check if "Other" is selected
  const isOtherJustification = selectedJustificationCategory === OTHER_JUSTIFICATION_VALUE;

  // Get the user's role for the current organization
  const currentUserOrgRole = userOrganizations.find(
    (uo) => uo.organization_id === currentOrganization?.id
  )?.role;

  // Determine if user is a contributor (not admin, treasury, or finance)
  const isContributor = currentUserOrgRole === "contributor";

  // Update form values when expense changes (for editing) or set defaults for new expense
  useEffect(() => {
    if (expense) {
      // Editing existing expense
      // Determine if title is a predefined category or custom "Other"
      const expenseMinistry = ministries?.find((m) => m.id === expense.ministry_id);
      const expenseMinistryJustifications = expenseMinistry
        ? getJustificationsForMinistry(expenseMinistry.name)
        : [];
      const isPredefinedCategory = expenseMinistryJustifications.includes(expense.title);

      form.reset({
        ministry_id: expense.ministry_id,
        justification_category: isPredefinedCategory ? expense.title : OTHER_JUSTIFICATION_VALUE,
        title: isPredefinedCategory ? "" : expense.title,
        description: expense.description || "",
        amount: expense.amount,
        reimbursement_type: expense.reimbursement_type,
        tin: expense.tin || "",
        is_advance_payment: expense.is_advance_payment || false,
        is_different_recipient: expense.is_different_recipient || false,
        recipient_name: expense.recipient_name || "",
        recipient_phone: expense.recipient_phone || "",
        recipient_email: expense.recipient_email || "",
      });
      // Load existing attachments with validation
      const existingAttachments = expense.attachments;
      if (Array.isArray(existingAttachments)) {
        setAttachments(existingAttachments as unknown as AttachmentData[]);
      } else {
        setAttachments([]);
      }
    } else {
      // New expense - default to user's ministry
      form.reset({
        ministry_id: userMinistry?.id || "",
        justification_category: "",
        title: "",
        description: "",
        amount: 0,
        reimbursement_type: "check",
        tin: "",
        is_advance_payment: false,
        is_different_recipient: false,
        recipient_name: "",
        recipient_phone: "",
        recipient_email: "",
      });
      setAttachments([]);
    }
  }, [expense, form, userMinistry?.id, ministries]);

  // Reset justification category when ministry changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousMinistryIdRef.current = selectedMinistryId;
      return;
    }

    // Only reset if ministry actually changed (not initial setting)
    if (!expense && previousMinistryIdRef.current !== selectedMinistryId && previousMinistryIdRef.current !== null) {
      form.setValue("justification_category", "");
      form.setValue("title", "");
    }

    previousMinistryIdRef.current = selectedMinistryId;
  }, [selectedMinistryId, form, expense]);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    // Check max files limit
    if (attachments.length + files.length > MAX_FILES) {
      toast({
        title: "Too many files",
        description: `You can upload a maximum of ${MAX_FILES} files`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const newAttachments: AttachmentData[] = [];

    try {
      for (const file of Array.from(files)) {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds the 10MB limit`,
            variant: "destructive",
          });
          continue;
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not a supported file type. Allowed: PDF, images, Word, Excel`,
            variant: "destructive",
          });
          continue;
        }

        // Validate file extension
        const fileExt = file.name.split(".").pop()?.toLowerCase();
        if (!fileExt || !ALLOWED_EXTENSIONS.includes(fileExt as typeof ALLOWED_EXTENSIONS[number])) {
          toast({
            title: "Invalid file extension",
            description: `${file.name} has an unsupported extension`,
            variant: "destructive",
          });
          continue;
        }

        // Create unique file path with crypto for better randomness
        const randomId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const fileName = `${user.id}/${randomId}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("expense-attachments")
          .upload(fileName, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}`,
            variant: "destructive",
          });
          continue;
        }

        // Store the file path (we'll generate signed URLs when viewing)
        newAttachments.push({
          id: fileName,
          name: file.name,
          url: fileName, // Store the path, not the full URL
          type: file.type,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        });
      }

      setAttachments((prev) => [...prev, ...newAttachments]);

      if (newAttachments.length > 0) {
        toast({
          title: "Files uploaded",
          description: `${newAttachments.length} file(s) uploaded successfully`,
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Remove attachment
  const handleRemoveAttachment = async (attachment: AttachmentData) => {
    try {
      const { error } = await supabase.storage
        .from("expense-attachments")
        .remove([attachment.id]);

      if (error) {
        console.error("Delete error:", error);
      }

      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Check if file is an image
  const isImageFile = (type: string) => type.startsWith("image/");

  const handleSave = async (values: ExpenseFormValues, submit: boolean = false) => {
    if (!currentOrganization || !user || !selectedFiscalYear) {
      toast({
        title: "Error",
        description: "Missing required data. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (!values.ministry_id) {
      toast({
        title: "Error",
        description: "Please select a ministry.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    // Determine the final title: either the selected category or custom "Other" text
    const finalTitle = values.justification_category === OTHER_JUSTIFICATION_VALUE
      ? values.title || ""
      : values.justification_category;

    try {
      if (isEditing && expense) {
        // Update existing expense
        await updateExpense.mutateAsync({
          expenseId: expense.id,
          data: {
            ministry_id: values.ministry_id,
            title: finalTitle,
            description: values.description || null,
            amount: values.amount,
            reimbursement_type: values.reimbursement_type,
            tin: values.tin || null,
            is_advance_payment: values.is_advance_payment,
            is_different_recipient: values.is_different_recipient,
            recipient_name: values.is_different_recipient ? values.recipient_name || null : null,
            recipient_phone: values.is_different_recipient ? values.recipient_phone || null : null,
            recipient_email: values.is_different_recipient ? values.recipient_email || null : null,
            requester_name: profile?.full_name || "Unknown",
            requester_phone: profile?.phone_number || null,
            requester_email: profile?.email || null,
            attachments: attachments as unknown as Record<string, unknown>[],
          },
        });

        if (submit) {
          await submitForReview.mutateAsync({
            expenseId: expense.id,
            actorId: user.id,
            actorName: profile?.full_name || "Unknown",
          });
        }

        toast({
          title: submit ? "Expense submitted" : "Expense updated",
          description: submit
            ? "Your expense request has been submitted for review."
            : "Your expense request has been saved as a draft.",
        });
      } else {
        // Create new expense
        const newExpense = await createExpense.mutateAsync({
          expenseData: {
            organization_id: currentOrganization.id,
            fiscal_year_id: selectedFiscalYear.id,
            ministry_id: values.ministry_id,
            title: finalTitle,
            description: values.description || null,
            amount: values.amount,
            reimbursement_type: values.reimbursement_type,
            tin: values.tin || null,
            is_advance_payment: values.is_advance_payment,
            is_different_recipient: values.is_different_recipient,
            recipient_name: values.is_different_recipient ? values.recipient_name || null : null,
            recipient_phone: values.is_different_recipient ? values.recipient_phone || null : null,
            recipient_email: values.is_different_recipient ? values.recipient_email || null : null,
            requester_id: user.id,
            requester_name: profile?.full_name || "Unknown",
            requester_phone: profile?.phone_number || null,
            requester_email: profile?.email || null,
            status: "draft",
            attachments: attachments as unknown as Record<string, unknown>[],
          },
          actorId: user.id,
          actorName: profile?.full_name || "Unknown",
        });

        if (submit) {
          await submitForReview.mutateAsync({
            expenseId: newExpense.id,
            actorId: user.id,
            actorName: profile?.full_name || "Unknown",
          });
        }

        toast({
          title: submit ? "Expense submitted" : "Expense created",
          description: submit
            ? "Your expense request has been submitted for review."
            : "Your expense request has been saved as a draft.",
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save expense request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = ministriesLoading || fiscalYearsLoading;

  if (!selectedFiscalYear && !fiscalYearsLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Active Fiscal Year</DialogTitle>
            <DialogDescription>
              There is no active fiscal year configured. Please contact an administrator
              to set up a fiscal year before submitting expense requests.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? "Edit Expense Request" : "Expense Request"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing ? "Edit an existing expense request" : "Create a new expense request for reimbursement"}
          </DialogDescription>
          <div className="flex items-center gap-2 mt-2 text-emerald-100 text-sm">
            <Calendar className="h-4 w-4" />
            <Select
              value={selectedFiscalYearId || activeFiscalYear?.id || ""}
              onValueChange={setSelectedFiscalYearId}
            >
              <SelectTrigger className="h-7 w-auto gap-1 border-emerald-400/50 bg-emerald-500/30 text-white hover:bg-emerald-500/50 focus:ring-emerald-300 [&>svg]:text-white">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {fiscalYears?.map((fy) => {
                  const isFuture = fy.year > new Date().getFullYear();
                  return (
                    <SelectItem
                      key={fy.id}
                      value={fy.id}
                      disabled={isFuture}
                      className={isFuture ? "text-muted-foreground opacity-50" : ""}
                    >
                      {fy.name} {fy.is_active && "(Active)"} {isFuture && "(Future)"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form className="flex flex-col flex-1 overflow-hidden">
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Ministry Selection - Show dropdown for admins, auto-assign for contributors */}
              {isContributor ? (
                // Contributors see their ministry displayed (read-only)
                <div>
                  <Label className="text-sm font-medium text-slate-700">
                    Ministry <span className="text-red-500">*</span>
                  </Label>
                  <div className="mt-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700">
                    {userMinistry?.name || profile?.ministry_name || "No ministry assigned"}
                  </div>
                  {!userMinistry && (
                    <p className="text-xs text-red-500 mt-1">
                      Your ministry is not set up in the budget system. Please contact an administrator.
                    </p>
                  )}
                </div>
              ) : (
                // Admins get the full dropdown to select any ministry
                <FormField
                  control={form.control}
                  name="ministry_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">
                        Ministry <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">
                            <SelectValue placeholder="Select ministry" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ministries?.map((ministry) => (
                            <SelectItem key={ministry.id} value={ministry.id}>
                              {ministry.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Justification Category Dropdown */}
              <FormField
                control={form.control}
                name="justification_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-slate-700">
                      Justification <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!selectedMinistryId}
                    >
                      <FormControl>
                        <SelectTrigger className="h-11 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">
                          <SelectValue placeholder={selectedMinistryId ? "Select justification" : "Select a ministry first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {justificationOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                        <SelectItem value={OTHER_JUSTIFICATION_VALUE}>
                          {OTHER_JUSTIFICATION_LABEL}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Custom Justification Input - shown when "Other" is selected */}
              {isOtherJustification && (
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">
                        Please Specify <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your justification..."
                          className="h-11 border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Amount Section */}
              <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl p-5 border border-slate-200/60">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-slate-600">
                          Amount (USD) <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-400 transition-all">
                            <span className="pl-4 pr-1 text-slate-400 text-lg font-medium select-none">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              className="h-12 pl-1 pr-4 text-right text-xl font-semibold border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="reimbursement_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-slate-600">
                          Reimbursement Type <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">
                              <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(
                              Object.entries(REIMBURSEMENT_TYPE_LABELS) as [
                                ReimbursementType,
                                string,
                              ][]
                            ).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* TIN Field */}
                <FormField
                  control={form.control}
                  name="tin"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel className="text-sm font-medium text-slate-600">
                        Taxpayer Identification Number (TIN)
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 12-3456789"
                          className="h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Advance Payment Toggle */}
                <FormField
                  control={form.control}
                  name="is_advance_payment"
                  render={({ field }) => (
                    <FormItem className="mt-4 flex flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium text-slate-700 cursor-pointer">
                          Advance Payment
                        </FormLabel>
                        <p className="text-xs text-slate-500">
                          Request payment before expense is incurred
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Different Recipient Toggle */}
                <FormField
                  control={form.control}
                  name="is_different_recipient"
                  render={({ field }) => (
                    <FormItem className="mt-4 flex flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium text-slate-700 cursor-pointer">
                          Different Payment Recipient
                        </FormLabel>
                        <p className="text-xs text-slate-500">
                          Payment goes to someone other than the requester
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Recipient Fields - shown when is_different_recipient is true */}
                {isDifferentRecipient && (
                  <div className="mt-4 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <p className="text-sm font-medium text-emerald-700">Payment Recipient Information</p>

                    <FormField
                      control={form.control}
                      name="recipient_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-slate-600">
                            Recipient Name <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Full name of payment recipient"
                              className="h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="recipient_phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-slate-600">
                            Recipient Phone <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., (555) 123-4567"
                              className="h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="recipient_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-slate-600">
                            Recipient Email <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="recipient@example.com"
                              className="h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-slate-700">Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain what this expense is for and why it's needed..."
                        className="resize-none min-h-[80px] border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Attachments Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Attachments</span>
                  <span className="text-xs text-slate-400">
                    Max 10MB per file
                  </span>
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {/* Upload button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 border-dashed border-2 bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200 text-emerald-700 hover:text-emerald-800 hover:border-emerald-300 transition-all rounded-xl"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="mr-2 h-4 w-4" />
                  )}
                  {isUploading ? "Uploading..." : "Add Receipts or Documents"}
                </Button>

                {/* Attachment list */}
                {attachments.length > 0 && (
                  <div className="space-y-2 bg-slate-50 rounded-xl p-3">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-lg ${isImageFile(attachment.type) ? 'bg-blue-50' : 'bg-orange-50'}`}>
                            {isImageFile(attachment.type) ? (
                              <ImageIcon className="h-4 w-4 text-blue-500" />
                            ) : (
                              <FileText className="h-4 w-4 text-orange-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {attachment.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatFileSize(attachment.size)}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAttachment(attachment)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>

              {/* Fixed Actions Footer */}
              <div className="flex-shrink-0 border-t bg-slate-50 px-6 py-4">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={form.handleSubmit((values) => handleSave(values, false))}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Draft
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={form.handleSubmit((values) => handleSave(values, true))}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
