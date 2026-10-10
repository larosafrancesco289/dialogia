# Tutor evaluations

Simulated learners play the real tutor, one move at a time, and judges score the sessions.
Nothing here needs real users. The tutor runs through the app's own pipeline on a real model
(`bun run tutor:step`), which is the only part billed to an API key: a few cents a session on
Claude Haiku 5.5. The learners and the judges are Claude Code subagents.

## The pieces

| File                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `personas/*.md`       | Who the learner is, what they truly know, which wrong ideas they hold.    |
| `LEARNER.md`          | How a subagent plays a persona: the moves, the dice, the hidden state.    |
| `JUDGE.md`            | How a subagent scores a finished session, and the shape of `judge.json`.  |
| `trends.jsonl`        | One line per judged session, appended by `bun run tutor:evals summarize`. |
| `runs/` (git-ignored) | Each session's folder: the saved chat, transcript, report, truth, judge.  |

A session folder ends up holding:

- `session.json`: the saved chat, written by the stepper after every move.
- `learner/truth.jsonl`: the learner's hidden knowledge after every tutor turn. The tutor never
  sees it.
- `transcript.json` and `report.txt`: written by `finish`, with the protocol checks.
- `judge.json`: the judge's scores.

## Running a batch (from Claude Code)

1. **Key.** Put `ANTHROPIC_API_KEY` (and `ANTHROPIC_WORKSPACE_ID` if the key is
   workspace-scoped) in `.env.local`. `--provider openrouter` with `OPENROUTER_API_KEY` serves the
   same Haiku 5.5 instead.
2. **Learners.** For each persona, start one subagent (Sonnet is enough) with `LEARNER.md`, the
   persona file and its own run folder: `evals/tutor/runs/<batch>/<persona>`. They run in
   parallel, since each session has its own folder and its own process per move.
3. **Judges.** For each finished session, start a fresh subagent (Opus) with `JUDGE.md` and the
   session folder. A judge never played the session it scores.
4. **Summarise.** `bun run tutor:evals -- summarize evals/tutor/runs/<batch>` prints the table and
   appends to `trends.jsonl`, keyed by the tutor's prompt hash, model and persona.

Compare a prompt or engine change by running the same personas before and after: the prompt hash
changes with any edit to the system prompt or a tool definition, so each series stays separate.
Single sessions are noisy; compare medians over two or three sessions per persona.

## Coming back after a break

Spaced review is only visible across days, so a learner can leave and return: `wait <days>` moves
the saved chat that far into the past, and the next move runs at today's clock. Tell the learner
in its brief when to take the break; `LEARNER.md` says how its hidden knowledge fades meanwhile,
and the judge scores the return (`review`) only in sessions that had one (`transcript.json` →
`waits`).
