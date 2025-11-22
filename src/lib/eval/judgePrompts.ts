import type { ModelMessage } from '@/lib/agent/types';
import type { TutorScenario } from '@/lib/eval/tutorScenarios';

export type JudgeVerdict = {
  overall_score: number;
  subscores: {
    goal_alignment: number;
    scaffolding: number;
    retrieval_practice: number;
    misconception_handling: number;
    plan_and_learner_model_usage: number;
    communication_style: number;
  };
  tool_usage_notes: string;
  progression_notes: string;
  strengths: string[];
  improvements: string[];
};

export function buildJudgeMessages(opts: {
  scenario: TutorScenario;
  transcript: string;
  planSummary?: string;
  learnerModelSummary?: string;
  toolUsageSummary?: string;
}): ModelMessage[] {
  const { scenario, transcript, planSummary, learnerModelSummary, toolUsageSummary } = opts;
  const system = [
    'You are an expert education researcher evaluating an AI tutor.',
    `The tutor is helping a student with ${scenario.topic} at a ${scenario.level} level toward the goal: ${scenario.goal}.`,
    '',
    'Evaluate the tutor on these dimensions (0.0-1.0 each):',
    '1. Goal alignment',
    '2. Scaffolding quality (progression from simple to complex, support removal)',
    '3. Retrieval practice and questioning (frequency and quality)',
    '4. Misconception handling (did it detect and address errors?)',
    '5. Plan and learner model usage (did it use/update plan and learner model appropriately?)',
    '6. Communication style (warmth, clarity, encouragement)',
    '',
    'Also answer:',
    '- Did the tutor overuse tools or present too many different widgets at once?',
    '- Did the tutor advance topics before the student showed adequate understanding?',
    '',
    'Respond with ONLY valid JSON in this format:',
    '{',
    '  "overall_score": 0.0,',
    '  "subscores": {',
    '    "goal_alignment": 0.0,',
    '    "scaffolding": 0.0,',
    '    "retrieval_practice": 0.0,',
    '    "misconception_handling": 0.0,',
    '    "plan_and_learner_model_usage": 0.0,',
    '    "communication_style": 0.0',
    '  },',
    '  "tool_usage_notes": "",',
    '  "progression_notes": "",',
    '  "strengths": [],',
    '  "improvements": []',
    '}',
  ].join('\n');

  const details: string[] = [
    `Scenario: ${scenario.title} (${scenario.topic}, ${scenario.level})`,
    `Goal: ${scenario.goal}`,
    `Success criteria: ${scenario.successCriteria}`,
    `Student persona: ${scenario.studentPersona}`,
  ];
  if (scenario.constraints?.length) {
    details.push(`Constraints: ${scenario.constraints.join('; ')}`);
  }
  if (toolUsageSummary) {
    details.push(`Tool usage: ${toolUsageSummary}`);
  }
  if (planSummary) {
    details.push(`Plan summary:\n${planSummary}`);
  }
  if (learnerModelSummary) {
    details.push(`Learner model:\n${learnerModelSummary}`);
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
