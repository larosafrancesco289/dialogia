import type { ModelMessage } from '@/lib/agent/types';
import type { TutorScenario } from '@/tooling/eval/tutorScenarios';
import type { KnowledgeGap } from '@/tooling/eval/ablationScenarios';

export type JudgeVerdict = {
  overall_score: number;
  subscores: {
    time_allocation: number;
    diagnostic_accuracy: number;
    scaffolding_quality: number;
    gap_coverage: number;
    communication: number;
  };
  reasoning: string;
  strengths: string[];
  improvements: string[];
};

/** Dimension weights for computing overall_score. */
export const JUDGE_WEIGHTS = {
  time_allocation: 0.25,
  diagnostic_accuracy: 0.2,
  scaffolding_quality: 0.2,
  gap_coverage: 0.25,
  communication: 0.1,
} as const;

/** Derive the weighted-average formula string from JUDGE_WEIGHTS so it stays in sync. */
const WEIGHT_FORMULA = Object.entries(JUDGE_WEIGHTS)
  .map(([key, w]) => `${key}\u00D7${w}`)
  .join(' + ');

export function buildJudgeMessages(opts: {
  scenario: TutorScenario;
  transcript: string;
  knowledgeGaps?: KnowledgeGap[];
}): ModelMessage[] {
  const { scenario, transcript, knowledgeGaps } = opts;

  const gapInfo = knowledgeGaps?.length
    ? knowledgeGaps
        .map((g) => `- Topic "${g.topicId}": misconception = "${g.misconception ?? 'unknown'}"`)
        .join('\n')
    : 'No specific knowledge gaps provided.';

  const system = `You are an expert education researcher evaluating an AI tutor based ONLY on the conversation transcript provided.

The tutor is helping a student with ${scenario.topic} at a ${scenario.level} level toward the goal: ${scenario.goal}.

The student entered the session with these known knowledge gaps:
${gapInfo}

Evaluate the tutor on these 5 dimensions (0.0-1.0 each). Use the score anchors to guide your ratings:

1. Time Allocation Efficiency
   - 0.0 = Spent equal time on all topics regardless of student performance; wasted time on material the student already knew
   - 0.5 = Some prioritization of weak areas, but still spent notable time on known material
   - 1.0 = Precisely allocated time to areas of weakness; quickly moved past topics the student demonstrated mastery of

2. Diagnostic Accuracy
   - 0.0 = Failed to detect student misconceptions; accepted incorrect reasoning without correction
   - 0.5 = Detected some misconceptions but missed others, or corrections were vague
   - 1.0 = Correctly identified every misconception and addressed each with a targeted, clear explanation

3. Scaffolding Quality
   - 0.0 = No progression; jumped to complex material or provided answers directly without building understanding
   - 0.5 = Some simple-to-complex progression, but hints were inconsistent or support was withdrawn too early
   - 1.0 = Clear progression from simple to complex with appropriate hints that faded as the student demonstrated understanding

4. Gap Coverage Depth
   - 0.0 = Knowledge gap topics were skipped entirely or mentioned only superficially
   - 0.5 = Gap topics were addressed but without practice problems or verification of understanding
   - 1.0 = Gap topics received thorough coverage including explanation, practice, and verification that the misconception was corrected

5. Communication Style (CONTROL — should not differ across tutoring approaches)
   - 0.0 = Cold, confusing, or discouraging; poor rapport
   - 0.5 = Generally clear but lacking warmth or encouragement
   - 1.0 = Warm, clear, encouraging; maintained positive rapport throughout

IMPORTANT: Evaluate based ONLY on what you observe in the conversation transcript. Focus on the pedagogical quality of the tutor's responses. Do NOT consider what tools or features may have been available to the tutor.

Respond with ONLY valid JSON in this format:
{
  "overall_score": 0.0,
  "subscores": {
    "time_allocation": 0.0,
    "diagnostic_accuracy": 0.0,
    "scaffolding_quality": 0.0,
    "gap_coverage": 0.0,
    "communication": 0.0
  },
  "reasoning": "Brief justification for scores",
  "strengths": [],
  "improvements": []
}

The overall_score should be the weighted average: ${WEIGHT_FORMULA}.`;

  const details: string[] = [
    `Scenario: ${scenario.title} (${scenario.topic}, ${scenario.level})`,
    `Goal: ${scenario.goal}`,
    `Success criteria: ${scenario.successCriteria}`,
    `Student persona: ${scenario.studentPersona}`,
  ];
  if (scenario.constraints?.length) {
    details.push(`Constraints: ${scenario.constraints.join('; ')}`);
  }

  const user = [
    details.join('\n'),
    '',
    'Conversation transcript:',
    transcript,
    '',
    'Return only JSON. No commentary.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
