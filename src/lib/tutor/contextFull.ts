import type { MessageTutor } from '@/lib/types';

// Build a full, structured JSON block for the last practice so the model
// has exact items, choices, correct answers, and attempts. This is larger
// than the summary and should be controlled by a UI preference.
export function buildTutorContextFull(t: MessageTutor | undefined): string | undefined {
  if (!t) return undefined;
  try {
    const out: Record<string, unknown> = {};
    if (t.title) out.title = String(t.title);
    if (Array.isArray(t.mcq))
      out.mcq = t.mcq.map((q) => ({
        id: q.id,
        question: q.question,
        choices: q.choices,
        correct: q.correct,
        explanation: q.explanation,
        topic: q.topic,
        skill: q.skill,
        difficulty: q.difficulty,
      }));
    if (Array.isArray(t.fillBlank))
      out.fill_blank = t.fillBlank.map((it) => ({
        id: it.id,
        prompt: it.prompt,
        answer: it.answer,
        aliases: it.aliases,
        explanation: it.explanation,
        topic: it.topic,
        skill: it.skill,
        difficulty: it.difficulty,
      }));
    if (Array.isArray(t.openEnded))
      out.open_ended = t.openEnded.map((it) => ({
        id: it.id,
        prompt: it.prompt,
        sample_answer: it.sample_answer,
        rubric: it.rubric,
        topic: it.topic,
        skill: it.skill,
        difficulty: it.difficulty,
      }));
    if (t.questionnaire)
      out.questionnaire = {
        status: t.questionnaire.status,
        submittedAt: t.questionnaire.submittedAt,
        questions: Array.isArray(t.questionnaire.questions)
          ? t.questionnaire.questions.map((q) => ({
              id: q.id,
              question: q.question,
              category: q.category,
              allowMultiple: q.allowMultiple,
              followUpBehavior: q.followUpBehavior,
              options: q.options,
            }))
          : [],
        responses: t.questionnaire.responses,
      };
    if (t.planProposal && t.planProposal.plan)
      out.plan_proposal = {
        status: t.planProposal.status,
        requiresConfirmation: t.planProposal.requiresConfirmation,
        confirmationMessage: t.planProposal.confirmationMessage,
        requestedAt: t.planProposal.requestedAt,
        resolvedAt: t.planProposal.resolvedAt,
        plan: t.planProposal.plan,
      };
    if (Array.isArray(t.planSuggestions))
      out.plan_suggestions = t.planSuggestions.map((s) => ({
        action: s.action,
        priority: s.priority,
        description: s.description,
        rationale: s.rationale,
        estimatedImpact: s.estimatedImpact,
        implementationDetails: s.implementationDetails,
      }));
    if (t.diagnostic)
      out.diagnostic = {
        diagnosticId: t.diagnostic.diagnosticId,
        topic: t.diagnostic.topic,
        depth: t.diagnostic.depth,
        status: t.diagnostic.status,
        score: t.diagnostic.score,
        items: Array.isArray(t.diagnostic.items)
          ? t.diagnostic.items.map((di) => ({
              id: di.id,
              question: di.question,
              choices: di.choices,
              correct: di.correct,
              explanation: di.explanation,
              skill: di.skill,
              difficulty: di.difficulty,
            }))
          : [],
        interpretation: t.diagnostic.interpretation,
      };
    if (Array.isArray(t.assessmentUpdates))
      out.assessment_updates = t.assessmentUpdates.map((u) => ({
        nodeId: u.nodeId,
        confidenceBefore: u.confidenceBefore,
        confidenceAfter: u.confidenceAfter,
        masteryLevel: u.masteryLevel,
        tutorComment: u.tutorComment,
        evidence: Array.isArray(u.evidence)
          ? u.evidence.map((ev) => ({
              question: ev.question,
              studentAnswer: ev.studentAnswer,
              correctAnswer: ev.correctAnswer,
              result: ev.result,
              questionType: ev.questionType,
              skill: ev.skill,
              difficulty: ev.difficulty,
              hintsUsed: ev.hintsUsed,
              feedback: ev.feedback,
            }))
          : [],
      }));

    const attempts = t.attempts;
    const grading = t.grading;
    if (attempts && Object.keys(attempts).length > 0) out.attempts = attempts;
    if (grading && Object.keys(grading).length > 0) out.grading = grading;

    const json = JSON.stringify(out);
    if (!json || json === '{}') return undefined;
    return json;
  } catch {
    return undefined;
  }
}
