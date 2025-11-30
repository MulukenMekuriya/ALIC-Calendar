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
  FormDescription,
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
import { Loader2, DollarSign, Send, Save, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AttachmentData } from "../types";
import { useToast } from "@/shared/hooks/use-toast";
import { useMinistries } from "../hooks";
import { useActiveFiscalYear } from "../hooks";
import { useCreateExpense, useUpdateExpense, useSubmitExpenseForReview } from "../hooks";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { ExpenseRequest, ReimbursementType } from "../types";
import { REIMBURSEMENT_TYPE_LABELS } from "../types";

// Form validation schema
const expenseFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reimbursement_type: z.enum(["cash", "check", "bank_transfer", "zelle", "other"]),
});

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
  const { currentOrganization } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ministries, isLoading: ministriesLoading } = useMinistries(
    currentOrganization?.id
  );
  const { data: activeFiscalYear, isLoading: fiscalYearLoading } = useActiveFiscalYear(
    currentOrganization?.id
  );

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const submitForReview = useSubmitExpenseForReview();

  const isEditing = !!expense;

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      title: "",
      description: "",
      amount: 0,
      reimbursement_type: "check",
    },
  });

  // Get the user's ministry from their profile
  const userMinistry = ministries?.find(
    (m) => m.name.toLowerCase() === profile?.ministry_name?.toLowerCase()
  );

  // Update form values when expense changes (for editing)
  useEffect(() => {
    if (expense) {
      form.reset({
        title: expense.title,
        description: expense.description || "",
        amount: expense.amount,
        reimbursement_type: expense.reimbursement_type,
      });
      // Load existing attachments
      setAttachments((expense.attachments as AttachmentData[]) || []);
    } else {
      form.reset({
        title: "",
        description: "",
        amount: 0,
        reimbursement_type: "check",
      });
      setAttachments([]);
    }
  }, [expense, form]);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    setIsUploading(true);
    const newAttachments: AttachmentData[] = [];

    try {
      for (const file of Array.from(files)) {
        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds the 10MB limit`,
            variant: "destructive",
          });
          continue;
        }

        // Create unique file path
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

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

        // Get the public URL
        const { data: urlData } = supabase.storage
          .from("expense-attachments")
          .getPublicUrl(fileName);

        newAttachments.push({
          id: fileName,
          name: file.name,
          url: urlData.publicUrl,
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
    if (!currentOrganization || !user || !activeFiscalYear) {
      toast({
        title: "Error",
        description: "Missing required data. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (!userMinistry) {
      toast({
        title: "Error",
        description: "You are not assigned to a ministry. Please contact an administrator.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && expense) {
        // Update existing expense
        await updateExpense.mutateAsync({
          expenseId: expense.id,
          data: {
            ministry_id: userMinistry.id,
            title: values.title,
            description: values.description || null,
            amount: values.amount,
            reimbursement_type: values.reimbursement_type,
            requester_name: profile?.full_name || "Unknown",
            requester_phone: profile?.phone_number || null,
            requester_email: profile?.email || null,
            attachments: attachments,
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
            fiscal_year_id: activeFiscalYear.id,
            ministry_id: userMinistry.id,
            title: values.title,
            description: values.description || null,
            amount: values.amount,
            reimbursement_type: values.reimbursement_type,
            requester_id: user.id,
            requester_name: profile?.full_name || "Unknown",
            requester_phone: profile?.phone_number || null,
            requester_email: profile?.email || null,
            status: "draft",
            attachments: attachments,
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

  const isLoading = ministriesLoading || fiscalYearLoading;

  if (!activeFiscalYear && !fiscalYearLoading) {
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {isEditing ? "Edit Expense Request" : "New Expense Request"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your expense request details."
              : "Fill out the form to submit a new expense request."}
            <span className="block mt-1 text-xs">
              {activeFiscalYear && <>Fiscal Year: {activeFiscalYear.name}</>}
              {activeFiscalYear && userMinistry && <> • </>}
              {userMinistry && <>Ministry: {userMinistry.name}</>}
            </span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !userMinistry ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              You are not assigned to a ministry. Please contact an administrator to be assigned to a ministry before submitting expense requests.
            </p>
            <Button className="mt-4" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title / Purpose *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Youth Ministry Supplies" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Provide details about the expense..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Describe what the expense is for and why it's needed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (USD) *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="pl-7"
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
                      <FormLabel>Reimbursement Method *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
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

              {/* Attachments Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Attachments</FormLabel>
                  <span className="text-xs text-muted-foreground">
                    Max 10MB per file. Supports images, PDFs, Word, Excel.
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
                  className="w-full border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="mr-2 h-4 w-4" />
                  )}
                  {isUploading ? "Uploading..." : "Add Attachments"}
                </Button>

                {/* Attachment list */}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isImageFile(attachment.type) ? (
                            <ImageIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-orange-500 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {attachment.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(attachment.size)}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAttachment(attachment)}
                          className="flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={form.handleSubmit((values) => handleSave(values, false))}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  onClick={form.handleSubmit((values) => handleSave(values, true))}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Submit for Review
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
