import type { Message } from '@/lib/types';
import type { TutorToolHandler } from '@/modules/tutor/tools/types';
import { resolvePlanNodeId } from '@/modules/tutor/learner-model';
import {
  getNextNode,
  updateNodeStatus,
  isPlanComplete,
} from '@/modules/tutor/learning-plan/service';

type AdvanceTopicArgs = {
  nodeId?: string;
  reason?: string;
};

export const advanceTopicHandler: TutorToolHandler<AdvanceTopicArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return {};
    const args = input as Record<string, unknown>;
    const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() || undefined : undefined;
    const reason = typeof args.reason === 'string' ? args.reason.trim() || undefined : undefined;
    return { nodeId, reason };
  },

  async apply(ctx, args) {
    const plan = ctx.getCurrentPlan?.() ?? ctx.chat.settings.features.tutor?.learningPlan;

    if (!plan) {
      return { handled: true, usedContent: false };
    }

    const currentNode = getNextNode(plan);
    const resolvedId = args.nodeId
      ? (resolvePlanNodeId(plan, args.nodeId) ?? args.nodeId)
      : currentNode?.id;

    if (!resolvedId) {
      // No active topic — plan may already be complete
      return { handled: true, usedContent: false, updatedPlan: plan };
    }

    const node = plan.nodes.find((n) => n.id === resolvedId);
    if (!node) {
      return { handled: true, usedContent: false, updatedPlan: plan };
    }

    if (node.status === 'completed') {
      // Already completed — nothing to do
      return { handled: true, usedContent: false, updatedPlan: plan };
    }

    // Mark the node as completed
    let updatedPlan = updateNodeStatus(plan, resolvedId, 'completed');

    const planUpdates: Message['planUpdates'] = {
      statusChanges: [{ nodeId: resolvedId, from: node.status, to: 'completed' }],
    };

    let summary = `Completed topic: ${node.name}`;
    if (args.reason) {
      summary += ` — ${args.reason}`;
    }

    // Find and start the next ready node
    const nextNode = getNextNode(updatedPlan);
    if (nextNode && nextNode.status !== 'in_progress') {
      updatedPlan = updateNodeStatus(updatedPlan, nextNode.id, 'in_progress');
      planUpdates.statusChanges!.push({
        nodeId: nextNode.id,
        from: nextNode.status,
        to: 'in_progress',
      });
      summary += `\nMoving to next topic: ${nextNode.name}`;
    } else if (isPlanComplete(updatedPlan)) {
      summary += '\n\nLearning plan completed!';
    }

    planUpdates.summary = summary;

    return {
      handled: true,
      usedContent: false,
      updatedPlan,
      planUpdates,
    };
  },
};
