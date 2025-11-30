/**
 * Hooks for managing budget allocation requests
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AllocationRequest,
  AllocationRequestInsert,
  AllocationRequestUpdate,
  AllocationRequestWithRelations,
  AllocationRequestHistory,
  AllocationRequestStatus,
} from "../types";

// Query keys
const ALLOCATION_REQUESTS_KEY = "allocation-requests";
const ALLOCATION_REQUEST_HISTORY_KEY = "allocation-request-history";

// =====================================================
// Query Hooks
// =====================================================

/**
 * Fetch all allocation requests for a fiscal year
 */
export function useAllocationRequests(fiscalYearId?: string) {
  return useQuery({
    queryKey: [ALLOCATION_REQUESTS_KEY, fiscalYearId],
    queryFn: async () => {
      let query = supabase
        .schema("budget")
        .from("allocation_requests")
        .select(`
          *,
          ministry:ministries(*),
          fiscal_year:fiscal_years(*)
        `)
        .order("created_at", { ascending: false });

      if (fiscalYearId) {
        query = query.eq("fiscal_year_id", fiscalYearId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AllocationRequestWithRelations[];
    },
    enabled: true,
  });
}

/**
 * Fetch allocation requests for a specific ministry
 */
export function useMinistryAllocationRequests(
  ministryId?: string,
  fiscalYearId?: string
) {
  return useQuery({
    queryKey: [ALLOCATION_REQUESTS_KEY, "ministry", ministryId, fiscalYearId],
    queryFn: async () => {
      let query = supabase
        .schema("budget")
        .from("allocation_requests")
        .select(`
          *,
          ministry:ministries(*),
          fiscal_year:fiscal_years(*)
        `)
        .order("created_at", { ascending: false });

      if (ministryId) {
        query = query.eq("ministry_id", ministryId);
      }
      if (fiscalYearId) {
        query = query.eq("fiscal_year_id", fiscalYearId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AllocationRequestWithRelations[];
    },
    enabled: !!ministryId,
  });
}

/**
 * Fetch pending allocation requests (for admin review)
 */
export function usePendingAllocationRequests(organizationId?: string) {
  return useQuery({
    queryKey: [ALLOCATION_REQUESTS_KEY, "pending", organizationId],
    queryFn: async () => {
      let query = supabase
        .schema("budget")
        .from("allocation_requests")
        .select(`
          *,
          ministry:ministries(*),
          fiscal_year:fiscal_years(*)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AllocationRequestWithRelations[];
    },
    enabled: !!organizationId,
  });
}

/**
 * Fetch a single allocation request by ID
 */
export function useAllocationRequest(requestId?: string) {
  return useQuery({
    queryKey: [ALLOCATION_REQUESTS_KEY, requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .select(`
          *,
          ministry:ministries(*),
          fiscal_year:fiscal_years(*)
        `)
        .eq("id", requestId)
        .single();

      if (error) throw error;
      return data as AllocationRequestWithRelations;
    },
    enabled: !!requestId,
  });
}

/**
 * Fetch history for an allocation request
 */
export function useAllocationRequestHistory(requestId?: string) {
  return useQuery({
    queryKey: [ALLOCATION_REQUEST_HISTORY_KEY, requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("budget")
        .from("allocation_request_history")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AllocationRequestHistory[];
    },
    enabled: !!requestId,
  });
}

// =====================================================
// Mutation Hooks
// =====================================================

/**
 * Create a new allocation request
 */
export function useCreateAllocationRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestData,
      actorId,
      actorName,
    }: {
      requestData: AllocationRequestInsert;
      actorId: string;
      actorName: string;
    }) => {
      // Create the request
      const { data: request, error: requestError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .insert(requestData)
        .select()
        .single();

      if (requestError) throw requestError;

      // Add history entry
      const { error: historyError } = await supabase
        .schema("budget")
        .from("allocation_request_history")
        .insert({
          request_id: request.id,
          action: "created",
          actor_id: actorId,
          actor_name: actorName,
          new_status: requestData.status || "draft",
        });

      if (historyError) console.error("History insert error:", historyError);

      return request as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * Update an allocation request
 */
export function useUpdateAllocationRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      data,
    }: {
      requestId: string;
      data: AllocationRequestUpdate;
    }) => {
      const { data: updated, error } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .update(data)
        .eq("id", requestId)
        .select()
        .single();

      if (error) throw error;
      return updated as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * Submit an allocation request for review
 */
export function useSubmitAllocationRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      actorId,
      actorName,
    }: {
      requestId: string;
      actorId: string;
      actorName: string;
    }) => {
      // Update status to pending
      const { data: updated, error: updateError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .update({ status: "pending" })
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Add history entry
      const { error: historyError } = await supabase
        .schema("budget")
        .from("allocation_request_history")
        .insert({
          request_id: requestId,
          action: "submitted",
          actor_id: actorId,
          actor_name: actorName,
          old_status: "draft",
          new_status: "pending",
        });

      if (historyError) console.error("History insert error:", historyError);

      return updated as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * Approve an allocation request (admin action)
 */
export function useApproveAllocationRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      approvedAmount,
      adminNotes,
      actorId,
      actorName,
    }: {
      requestId: string;
      approvedAmount: number;
      adminNotes?: string;
      actorId: string;
      actorName: string;
    }) => {
      // Get current request to check requested amount
      const { data: current, error: fetchError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .select("requested_amount, status")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      const newStatus: AllocationRequestStatus =
        approvedAmount === current.requested_amount
          ? "approved"
          : "partially_approved";

      // Update request
      const { data: updated, error: updateError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .update({
          status: newStatus,
          approved_amount: approvedAmount,
          admin_notes: adminNotes || null,
          reviewed_by: actorId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Add history entry
      const { error: historyError } = await supabase
        .schema("budget")
        .from("allocation_request_history")
        .insert({
          request_id: requestId,
          action: newStatus === "approved" ? "approved" : "partially_approved",
          actor_id: actorId,
          actor_name: actorName,
          old_status: current.status,
          new_status: newStatus,
          notes: adminNotes,
        });

      if (historyError) console.error("History insert error:", historyError);

      return updated as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * Deny an allocation request (admin action)
 */
export function useDenyAllocationRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      adminNotes,
      actorId,
      actorName,
    }: {
      requestId: string;
      adminNotes: string;
      actorId: string;
      actorName: string;
    }) => {
      // Get current status
      const { data: current, error: fetchError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .select("status")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      // Update request
      const { data: updated, error: updateError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .update({
          status: "denied",
          admin_notes: adminNotes,
          reviewed_by: actorId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Add history entry
      const { error: historyError } = await supabase
        .schema("budget")
        .from("allocation_request_history")
        .insert({
          request_id: requestId,
          action: "denied",
          actor_id: actorId,
          actor_name: actorName,
          old_status: current.status,
          new_status: "denied",
          notes: adminNotes,
        });

      if (historyError) console.error("History insert error:", historyError);

      return updated as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * Cancel an allocation request
 */
export function useCancelAllocationRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      actorId,
      actorName,
    }: {
      requestId: string;
      actorId: string;
      actorName: string;
    }) => {
      // Get current status
      const { data: current, error: fetchError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .select("status")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;

      // Update request
      const { data: updated, error: updateError } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .update({ status: "cancelled" })
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Add history entry
      const { error: historyError } = await supabase
        .schema("budget")
        .from("allocation_request_history")
        .insert({
          request_id: requestId,
          action: "cancelled",
          actor_id: actorId,
          actor_name: actorName,
          old_status: current.status,
          new_status: "cancelled",
        });

      if (historyError) console.error("History insert error:", historyError);

      return updated as AllocationRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}

/**
 * Delete a draft allocation request
 */
export function useDeleteAllocationRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .schema("budget")
        .from("allocation_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ALLOCATION_REQUESTS_KEY] });
    },
  });
}
