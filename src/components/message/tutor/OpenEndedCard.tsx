"use client";
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EyeIcon,
  SparklesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import type { TutorOpenItem } from "@/lib/types";
import { useChatStore } from "@/lib/store";
import { contentVariants } from "@/components/message/tutor/shared";
import { StepperDots } from "@/components/message/tutor/StepperDots";
import { useStepper } from "@/components/message/tutor/hooks/useStepper";

export function OpenEndedCard({
  items,
  grading,
  messageId,
}: {
  items: TutorOpenItem[];
  grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
  messageId: string;
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const setTutorAttemptOpen = useChatStore((s) => s.setTutorAttemptOpen);
  const send = useChatStore((s) => s.sendUserMessage);
  const tutorEntry = useChatStore((s) => s.ui.tutor.byMessageId?.[messageId]);
  const attempts = tutorEntry?.attempts;
  const open = useMemo(
    () => (attempts?.open as Record<string, { answer?: string }>) || {},
    [attempts],
  );
  const isPending = useCallback(
    (item: TutorOpenItem) => {
      const answer = open[item.id]?.answer;
      return !answer || !answer.trim();
    },
    [open],
  );
  const { total, activeIndex, goToIndex, goPrevious, goNext, activeItem } = useStepper(
    items,
    isPending,
  );

  if (!total || !activeItem) return null;

  const answer = (open[activeItem.id]?.answer ?? "") as string;
  const persistAnswer = (value: string) => {
    setTutorAttemptOpen(messageId, activeItem.id, value);
  };

  const requestFeedback = () => {
    const trimmed = String(answer || "").trim();
    if (!trimmed) return;
    const prompt = activeItem.prompt.replace(/\n/g, " ").slice(0, 200);
    const msg = `Please grade my answer for open-ended item ${activeItem.id} ("${prompt}").\nAnswer: ${trimmed}\nUse the tool grade_open_response with item_id and feedback (and optional score).`;
    send(msg).catch(() => void 0);
  };

  const gradingEntry = grading && grading[activeItem.id];
  const isSampleVisible = !!revealed[activeItem.id];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
          <span className="font-medium uppercase tracking-wider">
            Question {activeIndex + 1} of {total}
          </span>
          <StepperDots
            items={items}
            activeIndex={activeIndex}
            resolveStatus={(item) => {
              const attempt = open[item.id];
              if (grading && grading[item.id]) {
                const entry = grading[item.id]!;
                if (typeof entry.score === "number") {
                  return entry.score >= 0.95 ? "correct" : "answered";
                }
                return "answered";
              }
              return attempt?.answer && attempt.answer.trim() ? "answered" : "pending";
            }}
            onSelect={goToIndex}
          />
        </div>

        <div className="relative min-h-[250px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem.id}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium leading-relaxed">{activeItem.prompt}</div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() =>
                    setRevealed((state) => ({ ...state, [activeItem.id]: !state[activeItem.id] }))
                  }
                >
                  <EyeIcon className="h-3.5 w-3.5 mr-1" />
                  {isSampleVisible ? "Hide" : "Show"} sample
                </button>
              </div>

              <AnimatePresence>
                {isSampleVisible && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground mb-4">
                      {activeItem.sample_answer ? (
                        <div>
                          <div className="font-bold mb-1 text-foreground">Sample answer</div>
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {activeItem.sample_answer}
                          </div>
                        </div>
                      ) : activeItem.rubric ? (
                        <div>
                          <div className="font-bold mb-1 text-foreground">Rubric</div>
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {activeItem.rubric}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-3">
                <textarea
                  className="textarea flex-1 text-sm min-h-[120px] resize-y"
                  placeholder="Type your response..."
                  value={answer}
                  onChange={(event) => persistAnswer(event.currentTarget.value)}
                />
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={requestFeedback}
                    disabled={!answer.trim()}
                  >
                    Get feedback
                  </button>
                  {gradingEntry && (
                    <span className="text-xs font-medium text-muted-foreground">
                      Last graded{" "}
                      {gradingEntry.score != null
                        ? `· ${Math.round((gradingEntry.score || 0) * 100)}%`
                        : ""}
                    </span>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {gradingEntry && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                      <div className="font-bold mb-1 flex items-center gap-2">
                        <SparklesIcon className="h-4 w-4 text-primary" />
                        Feedback
                        {gradingEntry.score != null && (
                          <span className="badge badge-sm bg-primary/20 text-primary border-transparent">
                            {Math.round((gradingEntry.score || 0) * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {gradingEntry.feedback}
                      </div>
                      {Array.isArray(gradingEntry.criteria) &&
                        gradingEntry.criteria!.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {gradingEntry.criteria!.map((c, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full bg-surface border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1 pl-0 text-muted-foreground hover:text-foreground"
            onClick={goPrevious}
            disabled={activeIndex === 0}
          >
            <ChevronLeftIcon className="h-3 w-3" /> Previous
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1 pr-0 text-muted-foreground hover:text-foreground"
            onClick={goNext}
            disabled={activeIndex >= total - 1}
          >
            Next <ChevronRightIcon className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
