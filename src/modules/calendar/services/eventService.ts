/**
 * Event service - handles all event-related API operations
 */

import { supabase } from "@/integrations/supabase/client";
import type { EventFormData, EventWithRelations, EventFilters, EventStatus } from "../types";

/**
 * Hand a series over to its next occurrence, so the row that currently holds
 * the series together can be deleted without the cascade taking the rest.
 *
 * Does nothing for an event that has no occurrences hanging off it, which is
 * every standalone event.
 */
const promoteNextOccurrence = async (eventId: string): Promise<void> => {
  const { data: children, error } = await supabase
    .from("events")
    .select("id")
    .eq("parent_event_id", eventId)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  if (!children || children.length === 0) return;

  const [heir, ...rest] = children;

  // The series' rule lives on the row being deleted; the heir inherits it.
  const { data: outgoing } = await supabase
    .from("events")
    .select("recurrence_rule, recurrence_end_date")
    .eq("id", eventId)
    .single();

  const { data: promoted, error: promoteError } = await supabase
    .from("events")
    .update({
      parent_event_id: null,
      recurrence_rule: outgoing?.recurrence_rule ?? null,
      recurrence_end_date: outgoing?.recurrence_end_date ?? null,
    })
    .eq("id", heir.id)
    .select("id");

  if (promoteError) throw promoteError;

  // A refusal here is silent, and going ahead would cascade the whole series
  // away. Stop while everything is still intact.
  if (!promoted || promoted.length === 0) {
    throw new Error(
      "This event holds a recurring series together and could not be handed over, so nothing was deleted."
    );
  }

  if (rest.length > 0) {
    const { error: repointError } = await supabase
      .from("events")
      .update({ parent_event_id: heir.id })
      .in("id", rest.map((child) => child.id));

    if (repointError) throw repointError;
  }
};

export const eventService = {
  /**
   * List events for an organization with optional filters
   */
  async list(organizationId: string, filters?: EventFilters): Promise<EventWithRelations[]> {
    let query = supabase
      .from("events")
      .select(`
        *,
        rooms(id, name, color)
      `)
      .eq("organization_id", organizationId)
      .order("starts_at", { ascending: true });

    // Apply filters
    if (filters?.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }
    if (filters?.room_id) {
      query = query.eq("room_id", filters.room_id);
    }
    if (filters?.created_by) {
      query = query.eq("created_by", filters.created_by);
    }
    if (filters?.start_date) {
      query = query.gte("starts_at", filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte("ends_at", filters.end_date);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Fetch creator profiles
    const eventsWithCreators = await Promise.all(
      (data || []).map(async (event) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, ministry_name")
          .eq("id", event.created_by)
          .single();

        return {
          ...event,
          room: event.rooms,
          creator: profile || null,
        } as EventWithRelations;
      })
    );

    return eventsWithCreators;
  },

  /**
   * Get a single event by ID
   */
  async get(eventId: string): Promise<EventWithRelations | null> {
    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        rooms(id, name, color)
      `)
      .eq("id", eventId)
      .single();

    if (error) throw error;
    if (!data) return null;

    // Fetch creator profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, ministry_name")
      .eq("id", data.created_by)
      .single();

    return {
      ...data,
      room: data.rooms,
      creator: profile || null,
    } as EventWithRelations;
  },

  /**
   * Create a new event
   */
  async create(
    organizationId: string,
    userId: string,
    eventData: EventFormData
  ): Promise<EventWithRelations> {
    const { data, error } = await supabase
      .from("events")
      .insert({
        ...eventData,
        organization_id: organizationId,
        created_by: userId,
        status: "draft",
      })
      .select(`
        *,
        rooms(id, name, color)
      `)
      .single();

    if (error) throw error;

    return {
      ...data,
      room: data.rooms,
      creator: null,
    } as EventWithRelations;
  },

  /**
   * Update an existing event
   */
  async update(eventId: string, eventData: Partial<EventFormData>): Promise<EventWithRelations> {
    const { data, error } = await supabase
      .from("events")
      .update({
        ...eventData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .select(`
        *,
        rooms(id, name, color)
      `)
      .single();

    if (error) throw error;

    return {
      ...data,
      room: data.rooms,
      creator: null,
    } as EventWithRelations;
  },

  /**
   * Delete an event
   */
  async delete(eventId: string): Promise<void> {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) throw error;
  },

  /**
   * Delete one event, or every event in its recurring series.
   *
   * The trap is the first occurrence of a series. Every later occurrence points
   * at it through parent_event_id ON DELETE CASCADE, so deleting it "on its
   * own" silently takes the whole year of occurrences with it. Before that row
   * goes, the next occurrence is promoted in its place and the rest are
   * re-pointed at the promotion, so "only this event" means only this event.
   *
   * Returns how many events were actually removed. The row-level policies
   * refuse by matching nothing rather than by erroring, so 0 is how a refusal
   * arrives and the caller has to say so.
   */
  async deleteScoped(
    event: { id: string; parent_event_id?: string | null },
    scope: "single" | "all"
  ): Promise<number> {
    if (scope === "all") {
      const seriesId = event.parent_event_id || event.id;

      // Children first. The cascade would take them anyway, but deleting them
      // by hand is what makes the returned count honest.
      const { data: children, error: childError } = await supabase
        .from("events")
        .delete()
        .eq("parent_event_id", seriesId)
        .select("id");

      if (childError) throw childError;

      const { data: series, error } = await supabase
        .from("events")
        .delete()
        .eq("id", seriesId)
        .select("id");

      if (error) throw error;

      return (children?.length || 0) + (series?.length || 0);
    }

    // A later occurrence has nothing hanging off it and can just go; the row
    // that holds the series together has to hand over first.
    if (!event.parent_event_id) {
      await promoteNextOccurrence(event.id);
    }

    const { data, error } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id)
      .select("id");

    if (error) throw error;

    return data?.length || 0;
  },

  /**
   * Update event status
   */
  async updateStatus(
    eventId: string,
    status: EventStatus,
    reviewerId?: string,
    reviewerNotes?: string
  ): Promise<EventWithRelations> {
    const { data, error } = await supabase
      .from("events")
      .update({
        status,
        reviewer_id: reviewerId,
        reviewer_notes: reviewerNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .select(`
        *,
        rooms(id, name, color)
      `)
      .single();

    if (error) throw error;

    return {
      ...data,
      room: data.rooms,
      creator: null,
    } as EventWithRelations;
  },

  /**
   * Submit event for review
   */
  async submitForReview(eventId: string): Promise<EventWithRelations> {
    return this.updateStatus(eventId, "pending_review");
  },

  /**
   * Approve an event
   */
  async approve(eventId: string, reviewerId: string, notes?: string): Promise<EventWithRelations> {
    return this.updateStatus(eventId, "approved", reviewerId, notes);
  },

  /**
   * Reject an event
   */
  async reject(eventId: string, reviewerId: string, notes: string): Promise<EventWithRelations> {
    return this.updateStatus(eventId, "rejected", reviewerId, notes);
  },

  /**
   * Publish an event
   */
  async publish(eventId: string): Promise<EventWithRelations> {
    return this.updateStatus(eventId, "published");
  },

  /**
   * Get public events for an organization
   */
  async listPublic(
    organizationId: string,
    startDate: string,
    endDate: string
  ): Promise<EventWithRelations[]> {
    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        rooms(id, name, color)
      `)
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .gte("starts_at", startDate)
      .lte("starts_at", endDate)
      .order("starts_at", { ascending: true });

    if (error) throw error;

    return (data || []).map((event) => ({
      ...event,
      room: event.rooms,
      creator: { full_name: "User", email: "", ministry_name: null },
    })) as EventWithRelations[];
  },

  /**
   * Check for room conflicts
   */
  async checkConflicts(
    roomId: string,
    startsAt: string,
    endsAt: string,
    excludeEventId?: string
  ): Promise<EventWithRelations[]> {
    let query = supabase
      .from("events")
      .select(`
        *,
        rooms(id, name, color, allow_overlap)
      `)
      .eq("room_id", roomId)
      .or(`starts_at.lt.${endsAt},ends_at.gt.${startsAt}`);

    if (excludeEventId) {
      query = query.neq("id", excludeEventId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((event) => ({
      ...event,
      room: event.rooms,
      creator: null,
    })) as EventWithRelations[];
  },
};
