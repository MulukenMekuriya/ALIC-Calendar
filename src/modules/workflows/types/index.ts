/**
 * Follow-up workflow types.
 *
 * A workflow is an ordered list of steps; a card is one person travelling
 * through them. See supabase/migrations/20260322000400 for why this is a card
 * board rather than a status column on church.people.
 */

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type ChurchSchema = { schema: "church" };

export type Workflow = Tables<ChurchSchema, "workflows">;
export type WorkflowInsert = TablesInsert<ChurchSchema, "workflows">;
export type WorkflowStep = Tables<ChurchSchema, "workflow_steps">;
export type WorkflowStepInsert = TablesInsert<ChurchSchema, "workflow_steps">;
export type WorkflowCard = Tables<ChurchSchema, "workflow_cards">;

/** church.workflow_summaries */
export interface WorkflowSummary {
  workflow_id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  auto_add_on_status_code: string | null;
  step_count: number;
  open_count: number;
  overdue_count: number;
  snoozed_count: number;
  my_count: number;
  completed_30d: number;
}

/** church.workflow_board */
export interface BoardCard {
  card_id: string;
  person_id: string;
  person_name: string;
  person_phone: string | null;
  person_email: string | null;
  household_name: string | null;
  step_id: string | null;
  step_name: string | null;
  step_sequence: number | null;
  assignee_person_id: string | null;
  assignee_name: string | null;
  status: "open" | "snoozed" | "completed" | "removed";
  due_on: string | null;
  snooze_until: string | null;
  is_overdue: boolean;
  days_in_step: number;
  outcome: string | null;
  last_note: string | null;
  last_activity_at: string | null;
  created_at: string;
}

/** church.workflow_card_history */
export interface CardActivity {
  id: string;
  kind:
    | "created"
    | "note"
    | "step_change"
    | "assigned"
    | "snoozed"
    | "completed"
    | "reopened"
    | "removed";
  body: string | null;
  from_step_name: string | null;
  to_step_name: string | null;
  assignee_name: string | null;
  actor_name: string | null;
  created_at: string;
}

/** church.my_workflow_cards — what one volunteer owes. */
export interface MyCard {
  card_id: string;
  workflow_id: string;
  workflow_name: string;
  person_name: string;
  person_phone: string | null;
  step_name: string | null;
  due_on: string | null;
  is_overdue: boolean;
  status: string;
}

/**
 * Suggested outcomes, offered as buttons on the finish dialog.
 *
 * Free text underneath, because a fixed list here would be a guess at ALIC's
 * pastoral vocabulary and the column is deliberately TEXT.
 */
export const OUTCOME_SUGGESTIONS = [
  "Joined a home cell",
  "Became a member",
  "Attending regularly",
  "Could not reach them",
  "Not interested",
  "Moved away",
] as const;
