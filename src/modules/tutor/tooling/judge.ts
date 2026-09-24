// Module: tutor tooling judge
// Responsibility: an optional one-call LLM rating of the tutoring in a simulated session.
// Protocol health is `check.ts`; this is only a second opinion on teaching quality.

import type { Scenario } from '@/modules/tutor/tooling/scenarios';
import type { StudentLLM } from '@/modules/tutor/tooling/student';
import { parseJsonObject } from '@/modules/tutor/tooling/student';

export type Judgement = {
  score?: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
};

const RUBRIC = `You rate one AI tutoring session for a research team. The learner is simulated; lines in [brackets] are what the app sent for them after they used a card (answered a quiz, approved a plan).

Judge the tutor on: finding out what the learner needs before planning; a plan that fits the learner's situation; teaching one idea at a time and making the learner do the thinking; responding to wrong answers and misconceptions; moving on only with evidence.

Reply with JSON only: {"score": 1-5, "verdict": "<one sentence>", "strengths": ["..."], "improvements": ["..."]}`;

export async function judgeSession(
  llm: StudentLLM,
  scenario: Scenario,
  transcript: string,
): Promise<Judgement> {
  const gaps = scenario.gaps.map((g) => `${g.topic} (${g.misconception})`).join('; ');
  const brief = [
    `Learner: ${scenario.persona}`,
    `Goal: ${scenario.goal}`,
    `Weak spots: ${gaps}`,
    `Success looks like: ${scenario.successCriteria}`,
  ].join('\n');
  const text = await llm([
    { role: 'system', content: RUBRIC },
    { role: 'user', content: `${brief}\n\nTranscript:\n${transcript}` },
  ]);
  const parsed = parseJsonObject(text);
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  return {
    ...(typeof parsed?.score === 'number' ? { score: parsed.score } : {}),
    verdict: typeof parsed?.verdict === 'string' ? parsed.verdict : text.trim() || 'No verdict.',
    strengths: list(parsed?.strengths),
    improvements: list(parsed?.improvements),
  };
}
