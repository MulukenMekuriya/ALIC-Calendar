/**
 * Follow-up workflow data access.
 *
 * Definitions (workflows, steps) are ordinary table writes behind RLS. Cards
 * are never written directly: every state change goes through a SECURITY
 * DEFINER function that writes the matching activity row in the same
 * transaction, so a card's history cannot be skipped.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  Workflow,
  WorkflowStep,
  WorkflowSummary,
  BoardCard,
  CardActivity,
  MyCard,
} from "../types";

const church = () => supabase.schema("church");

export const workflowService = {
  // -------------------------------------------------------------------------
  // Definitions
  // -------------------------------------------------------------------------
  async summaries(organizationId: string): Promise<WorkflowSummary[]> {
    const { data, error } = await church().rpc("workflow_summaries", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as WorkflowSummary[];
  },

  async listSteps(workflowId: string): Promise<WorkflowStep[]> {
    const { data, error } = await church()
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("sequence");
    if (error) throw error;
    return data ?? [];
  },

  async createWorkflow(workflow: {
    organization_id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    auto_add_on_status_code?: string | null;
  }): Promise<Workflow> {
    const { data, error } = await church()
      .from("workflows")
      .insert(workflow)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async addStep(step: {
    organization_id: string;
    workflow_id: string;
    sequence: number;
    name: string;
    description?: string | null;
    expected_days?: number | null;
  }): Promise<WorkflowStep> {
    const { data, error } = await church()
      .from("workflow_steps")
      .insert(step)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async setWorkflowActive(workflowId: string, isActive: boolean): Promise<void> {
    const { error } = await church()
      .from("workflows")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", workflowId);
    if (error) throw error;
  },

  // -------------------------------------------------------------------------
  // The board
  // -------------------------------------------------------------------------
  async board(
    organizationId: string,
    workflowId: string | null,
    includeClosed = false,
    onlyMine = false
  ): Promise<BoardCard[]> {
    const { data, error } = await church().rpc("workflow_board", {
      _organization_id: organizationId,
      _workflow_id: workflowId,
      _include_closed: includeClosed,
      _only_mine: onlyMine,
    });
    if (error) throw error;
    return (data ?? []) as unknown as BoardCard[];
  },

  async history(cardId: string): Promise<CardActivity[]> {
    const { data, error } = await church().rpc("workflow_card_history", {
      _card_id: cardId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as CardActivity[];
  },

  async myCards(organizationId: string): Promise<MyCard[]> {
    const { data, error } = await church().rpc("my_workflow_cards", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as MyCard[];
  },

  // -------------------------------------------------------------------------
  // Working a card
  // -------------------------------------------------------------------------
  async addPerson(args: {
    organizationId: string;
    workflowId: string;
    personId: string;
    assigneePersonId?: string | null;
    note?: string | null;
  }): Promise<string> {
    const { data, error } = await church().rpc("add_person_to_workflow", {
      _organization_id: args.organizationId,
      _workflow_id: args.workflowId,
      _person_id: args.personId,
      _assignee_person_id: args.assigneePersonId ?? null,
      _note: args.note ?? null,
    });
    if (error) throw error;
    return data as unknown as string;
  },

  async advance(cardId: string, toStepId: string | null, note: string | null): Promise<void> {
    const { error } = await church().rpc("advance_workflow_card", {
      _card_id: cardId,
      _to_step_id: toStepId,
      _note: note,
    });
    if (error) throw error;
  },

  async assign(cardId: string, assigneePersonId: string | null, note: string | null): Promise<void> {
    const { error } = await church().rpc("assign_workflow_card", {
      _card_id: cardId,
      _assignee_person_id: assigneePersonId,
      _note: note,
    });
    if (error) throw error;
  },

  async snooze(cardId: string, until: string, note: string | null): Promise<void> {
    const { error } = await church().rpc("snooze_workflow_card", {
      _card_id: cardId,
      _until: until,
      _note: note,
    });
    if (error) throw error;
  },

  async complete(cardId: string, outcome: string | null, note: string | null): Promise<void> {
    const { error } = await church().rpc("complete_workflow_card", {
      _card_id: cardId,
      _outcome: outcome,
      _note: note,
    });
    if (error) throw error;
  },

  async remove(cardId: string, reason: string | null): Promise<void> {
    const { error } = await church().rpc("remove_workflow_card", {
      _card_id: cardId,
      _reason: reason,
    });
    if (error) throw error;
  },

  async reopen(cardId: string, note: string | null): Promise<void> {
    const { error } = await church().rpc("reopen_workflow_card", {
      _card_id: cardId,
      _note: note,
    });
    if (error) throw error;
  },

  async addNote(cardId: string, body: string): Promise<void> {
    const { error } = await church().rpc("add_workflow_card_note", {
      _card_id: cardId,
      _body: body,
    });
    if (error) throw error;
  },

  /** Moves anything whose snooze has expired back onto the board. */
  async wakeSnoozed(organizationId: string): Promise<number> {
    const { data, error } = await church().rpc("wake_snoozed_workflow_cards", {
      _organization_id: organizationId,
    });
    if (error) throw error;
    return (data as unknown as number) ?? 0;
  },
};
