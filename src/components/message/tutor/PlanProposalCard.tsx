"use client";
import { useState } from "react";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import type { TutorPlanProposal, TutorPlanSuggestion } from "@/lib/types";
import { useChatStore } from "@/lib/store";
import { getNextNode, updateNodeStatus } from "@/lib/learningPlan/service";
import { PlanSuggestionsCard } from "@/components/message/tutor/PlanSuggestionsCard";

export function PlanProposalCard({
  messageId,
  proposal,
  suggestions,
}: {
  messageId: string;
  proposal: TutorPlanProposal;
  suggestions?: TutorPlanSuggestion[] | null;
}) {
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const patchTutorEntry = useChatStore((s) => s.patchTutorEntry);
  const setTutorPlanProposalStatus = useChatStore((s) => s.setTutorPlanProposalStatus);
  const setUI = useChatStore((s) => s.setUI);
  const updateChatSettings = useChatStore((s) => s.updateChatSettings);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const chats = useChatStore((s) => s.chats);
  const selectedChatId = useChatStore((s) => s.selectedChatId);
  const chat = chats.find((c) => c.id === selectedChatId);

  const resolved = proposal.status === "approved" || proposal.status === "declined";
  const disableActions = resolved || approving || declining;
  const nodesCount = proposal.plan.nodes.length;
  const estimatedHours = proposal.plan.metadata?.estimatedHours;

  const applyProposalStatus = async (
    status: "approved" | "declined",
    extra?: Partial<TutorPlanProposal>,
  ) => {
    if (extra && Object.keys(extra).length > 0) {
      const nextProposal: TutorPlanProposal = {
        ...proposal,
        ...extra,
      };
      await patchTutorEntry(messageId, { planProposal: nextProposal }, { persist: false });
    }
    setTutorPlanProposalStatus(messageId, status);
  };

  const handleApprove = async () => {
    if (!chat) return;
    setApproving(true);
    try {
      const now = Date.now();
      let adoptedPlan = { ...proposal.plan, updatedAt: now };
      const hasInProgress = adoptedPlan.nodes.some((n) => n.status === "in_progress");
      if (!hasInProgress && adoptedPlan.nodes.length > 0) {
        const firstReady = getNextNode(adoptedPlan) || adoptedPlan.nodes[0];
        adoptedPlan = updateNodeStatus(adoptedPlan, firstReady.id, "in_progress");
      }
      await updateChatSettings({
        learningPlan: adoptedPlan,
        planGenerated: true,
        enableLearnerModel: true,
      });
      await applyProposalStatus("approved", { plan: adoptedPlan });

      const currentNode = getNextNode(adoptedPlan);
      const nextTopic = currentNode ? currentNode.name : "our next topic";
      const content = `Plan approved. Let's get started with ${nextTopic}!`;
      await sendUserMessage(content, {
        metadata: {
          hiddenFromUser: true,
          kind: "tutor_plan_adoption",
        },
      });
    } catch {
      setUI({ notice: "Failed to apply learning plan. Please try again." });
    } finally {
      setApproving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (declining || approving) return;
    const feedback = window.prompt(
      "What would you like to adjust? Share specifics so the tutor can update the plan.",
      "Could we add more practice for the fundamentals?",
    );
    if (feedback == null || !feedback.trim()) return;
    setDeclining(true);
    try {
      await applyProposalStatus("declined");
      await sendUserMessage(
        `Plan feedback:\n${feedback.trim()}\nPlease update the plan and confirm the changes.`,
      );
    } finally {
      setDeclining(false);
    }
  };

  const confirmationNeeded = proposal.requiresConfirmation !== false;
  const resolvedLabel =
    proposal.status === "approved"
      ? "Plan adopted"
      : proposal.status === "declined"
        ? "Awaiting revisions"
        : null;

  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-accent/10 p-2">
          <ClipboardDocumentCheckIcon className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold leading-tight">
              Personalized learning plan ready
            </span>
            <span className="text-xs text-muted-foreground">
              {nodesCount} topics{estimatedHours ? ` · ~${estimatedHours}h commitment` : ""}
            </span>
          </div>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{proposal.plan.goal}</div>
            {confirmationNeeded && !resolved && proposal.confirmationMessage && (
              <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs leading-relaxed">
                {proposal.confirmationMessage}
              </div>
            )}
          </div>
          {suggestions && suggestions.length > 0 && (
            <div className="mt-4">
              <PlanSuggestionsCard suggestions={suggestions} compact />
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-outline btn-sm"
              onClick={() =>
                setUI({ plan: { sheetOpen: true, sheetPlanOverride: proposal.plan } })
              }
            >
              View full plan
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleApprove}
              disabled={disableActions}
            >
              {approving ? "Applying…" : "Approve plan"}
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleRequestChanges}
              disabled={disableActions}
            >
              {declining ? "Recording…" : "Suggest changes"}
            </button>
            {resolvedLabel && (
              <span className="badge badge-outline uppercase tracking-wide text-[11px] ml-auto">
                {resolvedLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
