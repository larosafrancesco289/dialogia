"use client";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { safeKey } from "@/components/message/tutor/shared";

export function GradingFeedbackCard({
  grading,
}: {
  grading: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
}) {
  if (!grading || Object.keys(grading).length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-surface/50 p-4">
      <div className="text-sm font-medium mb-3 flex items-center gap-2">
        <ClipboardDocumentCheckIcon className="h-4 w-4 text-primary" />
        Grading Feedback
      </div>
      <div className="space-y-4 text-sm">
        {Object.entries(grading).map(([id, g], idx) => (
          <div key={safeKey(id, idx, "grade")} className="space-y-1">
            <div className="font-medium text-foreground">
              Item {id}
              {g.score != null ? ` · Score: ${Math.round(g.score * 100)}%` : ""}
            </div>
            <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {g.feedback}
            </div>
            {Array.isArray(g.criteria) && g.criteria.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {g.criteria.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
