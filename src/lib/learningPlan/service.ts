// Module: learningPlan/service
// Responsibility: Provide a single contract for learning plan access, diffing, and persistence.

import type { StoreSetter } from '@/lib/agent/types';
import type { Chat, LearningPlan, LearningPlanNode, Message } from '@/lib/types';
import {
  calculatePlanProgress,
  getAllPrerequisites,
  getNextNode as getNextNodeImpl,
  isNodeReady,
  summarizeLearningPlan,
  updateNodeStatus as updateNodeStatusImpl,
} from '@/lib/learningPlan/progress';
import {
  detectLearningGoal,
  generateLearningPlan,
  PLAN_GENERATOR_SYSTEM,
} from '@/lib/learningPlan/generator';
import { validateLearningPlan } from '@/lib/learningPlan/validate';

export const getNextNode = (plan: LearningPlan): LearningPlanNode | null => getNextNodeImpl(plan);

export const updatePlanStatus = (
  plan: LearningPlan,
  nodeId: string,
  status: LearningPlanNode['status'],
): LearningPlan => updateNodeStatusImpl(plan, nodeId, status);

export const updateNodeStatus = updatePlanStatus;
export { getAllPrerequisites, isNodeReady };

export { calculatePlanProgress, summarizeLearningPlan };

export { detectLearningGoal, generateLearningPlan, PLAN_GENERATOR_SYSTEM, validateLearningPlan };

export function diffPlanUpdates(
  prev: LearningPlan | undefined,
  next: LearningPlan | undefined,
): Message['planUpdates'] | undefined {
  if (!prev || !next) return undefined;
  const prevMap = new Map(prev.nodes.map((node) => [node.id, node]));
  const statusChanges: NonNullable<Message['planUpdates']>['statusChanges'] = [];

  for (const node of next.nodes) {
    const prior = prevMap.get(node.id);
    if (prior && prior.status !== node.status) {
      statusChanges.push({ nodeId: node.id, from: prior.status, to: node.status });
    }
  }

  if (!statusChanges.length) return undefined;
  return { statusChanges };
}

export async function persistLearningPlan(opts: {
  chat: Chat;
  chatId: string;
  plan: LearningPlan;
  set: StoreSetter;
  updateChat?: (chat: Chat) => void;
  persistChat?: (chat: Chat) => Promise<void> | void;
}): Promise<Chat> {
  const { chat, chatId, plan, set, updateChat, persistChat } = opts;
  const updatedChat: Chat = {
    ...chat,
    settings: { ...chat.settings, learningPlan: plan },
    updatedAt: Date.now(),
  };
  set((state) => ({
    chats: state.chats.map((c) => (c.id === chatId ? updatedChat : c)),
  }));
  updateChat?.(updatedChat);
  try {
    await persistChat?.(updatedChat);
  } catch {
    /* best effort */
  }
  return updatedChat;
}
