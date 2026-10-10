# Judging a tutoring session

You score one finished session between Dialogia's AI tutor and a simulated learner. You did not
play it. The tutor is the thing under test; the learner is a scripted persona with a hidden
knowledge state the tutor could not see. Be exact and unsentimental: a good score must be
earned, and every score needs evidence.

## What you have

In the session folder `RUN`:

- `report.txt`: the whole session as the learner and tutor saw it, plus the tutor's tool calls
  (plans, quizzes, evidence it recorded, topics completed) and the protocol checks.
- `transcript.json`: the same in full, including `state.mastery` (the tutor's final estimate per
  topic, 0–1) and `state.plan` (topics and how each was completed).
- `learner/truth.jsonl`: the learner's hidden knowledge after every move.
- The persona file named in `transcript.json` → `meta.scenario` (under `evals/tutor/personas/`).

Read all of them. Do not read the app's source code.

## Score each dimension 1–5, with evidence

Quote the move or tool call behind each score. 3 means adequate; 5 means a skilled human tutor
would have done no better.

1. **diagnosis**: found out what this learner knew and needed before planning, without
   interrogating them.
2. **plan_fit**: the plan suited the learner's goal, level and time.
3. **mistake_identification**: noticed when the learner was wrong.
4. **mistake_location**: pinpointed where the reasoning went wrong, not just that it did.
5. **misconception_handling**: found the persona's wrong ideas, confronted them directly, and
   checked they were gone before moving on.
6. **guidance**: hints and questions that let the learner do the thinking. Score low for giving
   away answers the learner could have reached, and also low for withholding when the learner
   was genuinely stuck.
7. **actionability**: every turn left the learner something clear to do next.
8. **scaffolding_fit**: worked examples while a skill was new, then less support as the learner
   improved; not lecturing an expert, not abandoning a novice.
9. **coherence**: kept the thread, didn't repeat itself, didn't contradict itself.
10. **tone**: warm, direct, not condescending, not sycophantic. Praise only what was earned.
11. **language**: wrote in the learner's language throughout, cards included. Score 5 when the
    persona is English and the tutor stayed in English.
12. **review**: only when the learner took a break (`transcript.json` → `waits`; leave it out
    otherwise). On their return, did the tutor notice the gap, check with a short refresher what
    had stayed before building on it, and respond to what had slipped, without making the
    refresher a chore or ignoring a question the learner came back with?

## Measure the learner model

For every topic in the tutor's plan, take the tutor's final estimate from `state.mastery` and
the learner's true final knowledge from the last line of `truth.jsonl`. A topic may span several
of the persona's skills: average the skills it covers, and say which. Then report:

- **calibration_error**: the mean absolute difference between estimate and truth over topics
  the session actually worked on (estimate moved from its start, or evidence was recorded).
- **false_mastery**: topics completed as `mastered` while their truth is below 0.70.
- **missed_mastery**: topics whose truth is 0.80 or above that the tutor still had below 0.50.
- **misconceptions**: for each of the persona's wrong ideas, whether the tutor noted it (and at
  which move), whether it ended `gone` in the truth file, and whether the tutor ever cleared it
  without evidence.
- **answer_keys**: count quiz or diagnostic items whose marked answer was wrong.

## Output

Write `RUN/judge.json` and nothing else into the folder:

```json
{
  "judge": "<your model>",
  "scores": { "diagnosis": 4, "plan_fit": 3, "...": 0 },
  "evidence": { "diagnosis": "<quote and move>", "...": "" },
  "topics": [
    {
      "topic": "<plan topic id>",
      "skills": ["<persona skill ids>"],
      "estimate": 0.62,
      "truth": 0.4,
      "completed": "mastered | known | skipped | no"
    }
  ],
  "calibration_error": 0.18,
  "false_mastery": 1,
  "missed_mastery": 0,
  "misconceptions": [
    {
      "idea": "<persona idea id>",
      "noted_at_move": 5,
      "ended": "gone",
      "cleared_without_evidence": false
    }
  ],
  "answer_keys_wrong": 0,
  "top_failures": ["<the three changes to the tutor that would most help this learner>"],
  "verdict": "<two sentences>"
}
```

Then reply with the verdict and the three top failures. Do not spawn sub-agents; do all work
yourself.
