
import type { ModelMessage } from '@/lib/agent/types';
import type { TutorScenario } from '@/lib/eval/tutorScenarios';

export type JudgeVerdict = {
  overall_score: number;
  subscores: {
    goal_alignment: number;
    scaffolding: number;
    retrieval_practice: number;
    misconception_handling: number;
    session_structure: number;
    communication_style: number;
  };
  progression_notes: string;
  strengths: string[];
  improvements: string[];
};

export function buildJudgeMessages(opts: {
  scenario: TutorScenario;
  transcript: string;
}): ModelMessage[] {
  const { scenario, transcript } = opts;
  const system = `You are an expert education researcher evaluating an AI tutor based ONLY on the conversation transcript provided.

The tutor is helping a student with ${scenario.topic} at a ${scenario.level} level toward the goal: ${scenario.goal}.

Evaluate the tutor on these 6 dimensions (0.0-1.0 each). Use the score anchors below to guide your ratings:

1. Goal alignment
   - 0.0 = Ignored the learning goal entirely; conversation wandered off-topic
   - 0.5 = Partially addressed the goal with significant digressions or incomplete coverage
   - 1.0 = Consistently focused on achieving the stated goal throughout the session

2. Scaffolding quality
   - 0.0 = No progression or support; jumped to complex material or provided no structure
   - 0.5 = Some progression from simple to complex, but inconsistent support or abrupt transitions
   - 1.0 = Clear simple-to-complex progression with appropriate hints that faded as student demonstrated understanding

3. Retrieval practice and questioning
   - 0.0 = No questions asked; purely lecture-style delivery
   - 0.5 = Some questions, but mostly surface-level or poorly timed
   - 1.0 = Frequent, well-timed questions that required the student to actively recall and apply knowledge

4. Misconception handling
   - 0.0 = Missed or ignored student errors and misconceptions
   - 0.5 = Detected some errors but corrections were incomplete or unclear
   - 1.0 = Promptly detected misconceptions and addressed them with clear, targeted explanations

5. Session structure and adaptation
   - 0.0 = Topics presented in illogical order; no adaptation to student responses
   - 0.5 = Reasonable topic sequence but pacing not adjusted based on student understanding
   - 1.0 = Topics sequenced logically with pacing adapted based on student responses (slowing when confused, advancing when mastery shown)

6. Communication style
   - 0.0 = Cold, confusing, or discouraging; poor rapport
   - 0.5 = Generally clear but lacking warmth or encouragement
   - 1.0 = Warm, clear, encouraging; maintained positive rapport throughout

IMPORTANT: Evaluate based ONLY on what you observe in the conversation transcript. Focus on the pedagogical quality of the tutor's responses, not on what tools or features may have been available.

Also note whether the tutor advanced topics before the student showed adequate understanding.

Respond with ONLY valid JSON in this format:
{
  "overall_score": 0.0,
  "subscores": {
    "goal_alignment": 0.0,
    "scaffolding": 0.0,
    "retrieval_practice": 0.0,
    "misconception_handling": 0.0,
    "session_structure": 0.0,
    "communication_style": 0.0
  },
  "progression_notes": "",
  "strengths": [],
  "improvements": []
}`;

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
