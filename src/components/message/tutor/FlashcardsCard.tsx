"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import type { TutorFlashcardItem } from "@/lib/types";
import { useChatStore } from "@/lib/store";

export function FlashcardsCard({ items }: { items: TutorFlashcardItem[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const log = useChatStore((s) => s.logTutorResult);
  const send = useChatStore((s) => s.sendUserMessage);
  const total = items.length;
  const cur = items[Math.min(index, total - 1)];

  if (!cur) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4 flex justify-between items-center">
        <span>
          Flashcard {index + 1} of {total}
        </span>
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
          Click to flip
        </span>
      </div>

      <div
        className="perspective-1000 relative h-64 w-full cursor-pointer group"
        onClick={() => setFlipped(!flipped)}
      >
        <motion.div
          className="relative h-full w-full preserve-3d transition-all duration-500"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="absolute inset-0 backface-hidden rounded-xl border border-border bg-surface shadow-sm flex flex-col items-center justify-center p-6 text-center hover:border-primary/50 transition-colors">
            <div className="text-lg font-medium leading-relaxed">{cur.front}</div>
            {cur.hint && (
              <div className="mt-4 text-xs text-muted-foreground italic opacity-0 group-hover:opacity-100 transition-opacity">
                Hint: {cur.hint}
              </div>
            )}
          </div>

          <div
            className="absolute inset-0 backface-hidden rounded-xl border border-primary/20 bg-primary/5 shadow-sm flex flex-col items-center justify-center p-6 text-center"
            style={{ transform: "rotateY(180deg)" }}
          >
            <div className="text-lg font-medium leading-relaxed">{cur.back}</div>
          </div>
        </motion.div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          className="btn btn-outline btn-sm min-w-[100px]"
          onClick={() => {
            log({
              kind: "flashcard",
              itemId: cur.id,
              correct: false,
              topic: cur.topic,
              skill: cur.skill,
              difficulty: cur.difficulty,
            });
            setFlipped(false);
            setIndex((i) => Math.min(i + 1, total - 1));
          }}
        >
          Need Review
        </button>
        <button
          className="btn btn-primary btn-sm min-w-[100px]"
          onClick={() => {
            log({
              kind: "flashcard",
              itemId: cur.id,
              correct: true,
              topic: cur.topic,
              skill: cur.skill,
              difficulty: cur.difficulty,
            });
            setFlipped(false);
            setIndex((i) => Math.min(i + 1, total - 1));
          }}
        >
          Got it
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        <button
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
          title="Save card to your review deck"
          onClick={(event) => {
            event.stopPropagation();
            const payload = {
              cards: [
                {
                  front: cur.front,
                  back: cur.back,
                  hint: cur.hint,
                  topic: cur.topic,
                  skill: cur.skill,
                },
              ],
            };
            const msg = `Please call add_to_deck with the following:\n${JSON.stringify(payload)}`;
            send(msg).catch(() => void 0);
          }}
        >
          Save to deck
        </button>
      </div>
    </div>
  );
}
