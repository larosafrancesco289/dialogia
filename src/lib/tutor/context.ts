import type { MessageTutor } from '@/lib/types';
import { logger } from '@/lib/logger';

const tutorContextCache = new WeakMap<MessageTutor, { summary?: string; full?: string }>();

// Build a compact, textual summary of the most recent tutor interaction
// so the model can reference what was asked and how the learner answered
// in subsequent turns. Keep it brief to avoid prompt bloat.
export function buildTutorContextSummary(t: MessageTutor | undefined): string | undefined {
  if (!t) return undefined;
  const lines: string[] = [];
  if (t.title) lines.push(`Title: ${String(t.title)}`);
  // Aggregate a quick topic hint if available
  try {
    const topics = new Set<string>();
    const addTopics = (arr?: Array<{ topic?: string }>) => {
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        const topic = typeof it?.topic === 'string' ? it.topic.trim() : '';
        if (topic) topics.add(topic);
      }
    };
    addTopics(t.mcq);
    addTopics(t.fillBlank);
    addTopics(t.openEnded);
    if (topics.size > 0) lines.push(`Topics: ${Array.from(topics).slice(0, 5).join(', ')}`);
  } catch (error) {
    logger.error('Failed to collect tutor topics', error);
  }

  // Helper: trim a string to a max length
  const clip = (s: unknown, n = 80) => {
    const x = (typeof s === 'string' ? s : '').trim();
    return x.length > n ? x.slice(0, n - 1) + '…' : x;
  };

  try {
    const attempts: NonNullable<MessageTutor['attempts']> = t.attempts ?? {};
    const questionnaire = t.questionnaire;
    if (questionnaire && Array.isArray(questionnaire.questions)) {
      const status = questionnaire.status === 'submitted' ? 'submitted' : 'awaiting-response';
      lines.push(`Questionnaire: ${status}`);
      if (status === 'submitted' && questionnaire.responses) {
        const entries = Object.entries(questionnaire.responses).slice(0, 3);
        entries.forEach(([qid, answers]) => {
          const question = questionnaire.questions.find((q) => q.id === qid);
          const label = question?.question ? clip(question.question, 70) : qid;
          const formatted = Array.isArray(answers) ? answers.join(', ') : String(answers);
          lines.push(`  · ${label}: ${clip(formatted, 60)}`);
        });
      }
    }
    if (t.planProposal && t.planProposal.plan) {
      const plan = t.planProposal.plan;
      const status = t.planProposal.status || 'pending';
      const nodes = Array.isArray(plan.nodes) ? plan.nodes.length : 0;
      lines.push(`Plan Proposal: ${clip(plan.goal, 60)} · ${nodes} topics · status: ${status}`);
    }
    if (Array.isArray(t.planSuggestions) && t.planSuggestions.length > 0) {
      lines.push(
        `Plan suggestions: ${t.planSuggestions
          .slice(0, 3)
          .map((s) => s.action)
          .filter(Boolean)
          .join(', ')}`,
      );
    }
    if (t.diagnostic && Array.isArray(t.diagnostic.items) && t.diagnostic.items.length > 0) {
      const status = t.diagnostic.status || 'pending';
      const score =
        typeof t.diagnostic.score === 'number'
          ? `${Math.round(t.diagnostic.score * 100)}%`
          : undefined;
      lines.push(
        `Diagnostic: ${clip(t.diagnostic.topic || 'untitled', 40)} · ${status}${score ? ` · ${score}` : ''}`,
      );
    }
    if (Array.isArray(t.assessmentUpdates) && t.assessmentUpdates.length > 0) {
      const items = t.assessmentUpdates.slice(0, 3).map((u) => {
        const nodeLabel = typeof u.nodeId === 'string' ? u.nodeId : 'unknown';
        const before =
          typeof u.confidenceBefore === 'number' ? Math.round(u.confidenceBefore * 100) : null;
        const after =
          typeof u.confidenceAfter === 'number' ? Math.round(u.confidenceAfter * 100) : null;
        if (before != null && after != null) return `${nodeLabel} ${before}%→${after}%`;
        if (after != null) return `${nodeLabel} ${after}%`;
        return nodeLabel;
      });
      lines.push(`Learner model updates: ${items.join('; ')}`);
    }

    // MCQ summary
    if (Array.isArray(t.mcq) && t.mcq.length > 0) {
      const a: NonNullable<NonNullable<MessageTutor['attempts']>['mcq']> = attempts.mcq ?? {};
      const items = t.mcq.slice(0, 8);
      lines.push('MCQ:');
      items.forEach((q, i: number) => {
        const ans = a[q.id] || {};
        const pickedIdx = typeof ans.choice === 'number' ? ans.choice : undefined;
        const correctIdx = typeof q?.correct === 'number' ? q.correct : undefined;
        const choices: string[] = Array.isArray(q?.choices) ? q.choices : [];
        const pickedLetter =
          typeof pickedIdx === 'number' ? String.fromCharCode(65 + pickedIdx) : undefined;
        const correctLetter =
          typeof correctIdx === 'number' ? String.fromCharCode(65 + correctIdx) : undefined;
        const pickedText =
          typeof pickedIdx === 'number' ? clip(choices[pickedIdx] ?? '', 50) : undefined;
        const correctText =
          typeof correctIdx === 'number' ? clip(choices[correctIdx] ?? '', 50) : undefined;
        const status = ans.done ? (ans.correct ? 'correct' : 'incorrect') : 'unanswered';
        const qText = clip(q.question);
        let suffix = '';
        if (pickedLetter)
          suffix += ` · your: ${pickedLetter}${pickedText ? ` “${pickedText}”` : ''}`;
        if (ans.done && correctLetter) {
          // After submission, include the correct option to ground follow‑ups
          suffix += ` · correct: ${correctLetter}${correctText ? ` “${correctText}”` : ''}`;
        }
        lines.push(`  ${i + 1}. ${qText}${suffix} · ${status}`);
      });
    }
    // Fill‑blank summary
    if (Array.isArray(t.fillBlank) && t.fillBlank.length > 0) {
      const a: NonNullable<NonNullable<MessageTutor['attempts']>['fillBlank']> =
        attempts.fillBlank ?? {};
      const items = t.fillBlank.slice(0, 8);
      lines.push('Fill‑in‑the‑blank:');
      items.forEach((it, i: number) => {
        const ans = a[it.id] || {};
        const qText = clip(it.prompt);
        const submitted = ans.revealed || typeof ans.answer === 'string';
        const status = submitted ? (ans.correct ? 'correct' : 'incorrect') : 'unanswered';
        let suffix =
          typeof ans.answer === 'string' && ans.answer.trim()
            ? ` · your: ${clip(ans.answer, 30)}`
            : '';
        if (ans.revealed && ans.correct === false && typeof it?.answer === 'string') {
          suffix += ` · correct: ${clip(it.answer, 30)}`;
        }
        lines.push(`  ${i + 1}. ${qText}${suffix} · ${status}`);
      });
    }
    // Open‑ended summary (only signal submission; grading appears separately)
    if (Array.isArray(t.openEnded) && t.openEnded.length > 0) {
      const a: NonNullable<NonNullable<MessageTutor['attempts']>['open']> = attempts.open ?? {};
      const g: NonNullable<MessageTutor['grading']> = t.grading ?? {};
      const items = t.openEnded.slice(0, 6);
      lines.push('Open‑ended:');
      items.forEach((it, i: number) => {
        const ans = a[it.id] || {};
        const submitted = typeof ans.answer === 'string' && ans.answer.trim().length > 0;
        const graded = !!g[it.id];
        const qText = clip(it.prompt);
        const suffix = submitted ? ` · submitted${graded ? ' · graded' : ''}` : ' · not submitted';
        lines.push(`  ${i + 1}. ${qText}${suffix}`);
      });
    }
  } catch (error) {
    logger.error('Failed to build tutor summary details', error);
  }

  if (lines.length === 0) return undefined;
  return lines.join('\n');
}

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
    if (Array.isArray(t.flashcards))
      out.flashcards = t.flashcards.map((it) => ({
        id: it.id,
        front: it.front,
        back: it.back,
        hint: it.hint,
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

export function getTutorContext(tutor: MessageTutor | undefined): {
  summary?: string;
  full?: string;
} {
  if (!tutor || typeof tutor !== 'object') return {};
  const cached = tutorContextCache.get(tutor);
  if (cached) return cached;
  const summary = buildTutorContextSummary(tutor);
  const full = buildTutorContextFull(tutor);
  const snapshot = { summary, full };
  tutorContextCache.set(tutor, snapshot);
  return snapshot;
}
