'use client';
import { SparklesIcon } from '@heroicons/react/24/outline';
import type { TutorLearnerModelUpdate } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { safeKey } from '@/components/message/tutor/shared';

export function LearnerUpdatesCard({ updates }: { updates: TutorLearnerModelUpdate[] }) {
  const plan = useChatStore((s) => {
    const chat = s.chats.find((c) => c.id === s.selectedChatId);
    return chat?.settings?.features.tutor.learningPlan ?? null;
  });
  const setUI = useChatStore((s) => s.setUI);

  const resolveNodeName = (nodeId: string) =>
    plan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;

  return (
    <div className="marginalia">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <SparklesIcon className="w-3.5 h-3.5 text-accent" />
          Learner Model Updated
        </div>
        <button
          className="text-xs text-accent hover:underline font-medium"
          onClick={() => setUI({ plan: { sheetOpen: true } })}
        >
          View Learning Hub
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {updates.map((update, idx) => {
          const before = update.confidenceBefore ?? null;
          const after = update.confidenceAfter ?? null;
          const delta = before != null && after != null ? Math.round((after - before) * 100) : null;

          return (
            <div
              key={safeKey(update.nodeId, idx, 'lm')}
              className="text-sm flex items-center justify-between"
            >
              <span className="font-medium">{resolveNodeName(update.nodeId)}</span>
              <span className="text-muted-foreground text-xs">
                {delta != null && delta !== 0 ? (
                  <span
                    style={{ color: delta > 0 ? 'var(--color-success)' : 'var(--color-accent)' }}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}% confidence
                  </span>
                ) : (
                  'Updated'
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
