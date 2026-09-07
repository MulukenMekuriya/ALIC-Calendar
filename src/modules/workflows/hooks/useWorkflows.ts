/**
 * React Query hooks for follow-up workflows.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowService } from "../services";

export const workflowKeys = {
  all: ["church", "workflows"] as const,
  summaries: (orgId: string) => [...workflowKeys.all, "summaries", orgId] as const,
  steps: (workflowId: string) => [...workflowKeys.all, "steps", workflowId] as const,
  board: (orgId: string, workflowId: string | null, closed: boolean, mine: boolean) =>
    [...workflowKeys.all, "board", orgId, workflowId, closed, mine] as const,
  history: (cardId: string) => [...workflowKeys.all, "history", cardId] as const,
  mine: (orgId: string) => [...workflowKeys.all, "mine", orgId] as const,
};

export function useWorkflowSummaries(orgId: string | undefined) {
  return useQuery({
    queryKey: workflowKeys.summaries(orgId ?? ""),
    queryFn: () => workflowService.summaries(orgId!),
    enabled: !!orgId,
  });
}

export function useWorkflowSteps(workflowId: string | undefined) {
  return useQuery({
    queryKey: workflowKeys.steps(workflowId ?? ""),
    queryFn: () => workflowService.listSteps(workflowId!),
    enabled: !!workflowId,
    staleTime: 5 * 60_000,
  });
}

export function useWorkflowBoard(
  orgId: string | undefined,
  workflowId: string | null,
  includeClosed: boolean,
  onlyMine: boolean
) {
  return useQuery({
    queryKey: workflowKeys.board(orgId ?? "", workflowId, includeClosed, onlyMine),
    queryFn: () => workflowService.board(orgId!, workflowId, includeClosed, onlyMine),
    enabled: !!orgId,
  });
}

export function useCardHistory(cardId: string | undefined) {
  return useQuery({
    queryKey: workflowKeys.history(cardId ?? ""),
    queryFn: () => workflowService.history(cardId!),
    enabled: !!cardId,
  });
}

export function useMyWorkflowCards(orgId: string | undefined) {
  return useQuery({
    queryKey: workflowKeys.mine(orgId ?? ""),
    queryFn: () => workflowService.myCards(orgId!),
    enabled: !!orgId,
  });
}

/**
 * Anything that touches a card invalidates the whole module: a card moving
 * changes the board, its own history, the workflow's counts and whatever is on
 * the acting volunteer's own list.
 */
function useCardMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

export function useAddPersonToWorkflow() {
  return useCardMutation((args: Parameters<typeof workflowService.addPerson>[0]) =>
    workflowService.addPerson(args)
  );
}

export function useAdvanceCard() {
  return useCardMutation(
    ({ cardId, toStepId, note }: { cardId: string; toStepId: string | null; note: string | null }) =>
      workflowService.advance(cardId, toStepId, note)
  );
}

export function useAssignCard() {
  return useCardMutation(
    ({ cardId, assigneePersonId, note }: { cardId: string; assigneePersonId: string | null; note: string | null }) =>
      workflowService.assign(cardId, assigneePersonId, note)
  );
}

export function useSnoozeCard() {
  return useCardMutation(
    ({ cardId, until, note }: { cardId: string; until: string; note: string | null }) =>
      workflowService.snooze(cardId, until, note)
  );
}

export function useCompleteCard() {
  return useCardMutation(
    ({ cardId, outcome, note }: { cardId: string; outcome: string | null; note: string | null }) =>
      workflowService.complete(cardId, outcome, note)
  );
}

export function useRemoveCard() {
  return useCardMutation(({ cardId, reason }: { cardId: string; reason: string | null }) =>
    workflowService.remove(cardId, reason)
  );
}

export function useReopenCard() {
  return useCardMutation(({ cardId, note }: { cardId: string; note: string | null }) =>
    workflowService.reopen(cardId, note)
  );
}

export function useAddCardNote() {
  return useCardMutation(({ cardId, body }: { cardId: string; body: string }) =>
    workflowService.addNote(cardId, body)
  );
}

export function useCreateWorkflow() {
  return useCardMutation((args: Parameters<typeof workflowService.createWorkflow>[0]) =>
    workflowService.createWorkflow(args)
  );
}

export function useAddWorkflowStep() {
  return useCardMutation((args: Parameters<typeof workflowService.addStep>[0]) =>
    workflowService.addStep(args)
  );
}
