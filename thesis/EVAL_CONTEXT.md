# Automated Ablation Evaluation — Context Document

> Consolidated from `ABLATION_SESSION_CONTEXT.md`, `ABLATION_TODO.md`, and `RUNNING_ABLATION.md`.
> Last updated: 2026-02-10.

---

## 1. Thesis Concept

The thesis investigates **student agency** in LLM-based tutoring through **Open Learner Models (OLMs)** and **editable learning plans**. When students can see and edit their mastery data and learning plan, they become active participants rather than passive recipients.

**Dialogia** extends the ChatTutor paradigm (Chen et al., CIKM 2024) with:
1. **Editable learning plan** — students request topic reordering, skipping, or focus changes
2. **Open/editable learner model** — students see per-topic numerical mastery scores and contest inaccuracies

**ChatTutor baseline** has:
- A visible course plan (tree structure) — system-managed, student cannot edit
- An internal learning profile (narrative summary) — student never sees it
- System-driven plan progression via automatic tools

**Critical principle**: The 2x2 manipulates what the **STUDENT** can see and edit, NOT the tutor. The tutor ALWAYS sees numerical mastery and the full plan in ALL conditions — this is internal system state.

---

## 2. Factorial Design (2x2)

| | Plan Editable | Plan Read-Only |
|---|---|---|
| **Model Visible+Editable** | `full_system` | `model_only` |
| **Model Hidden** | `plan_only` | `baseline` (ChatTutor) |

### Condition Details

- **full_system**: Student sees plan + can request edits. Student sees mastery + can contest. Active agency cues for both.
- **plan_only**: Student sees plan + can request edits. Student does NOT see mastery. Tests plan agency in isolation.
- **model_only**: Student sees plan (read-only). Student sees mastery + can contest. Tests OLM agency in isolation.
- **baseline**: Student sees plan (read-only). Student does NOT see mastery. ChatTutor equivalent.

### Tool Availability

ALL conditions have: `record_learning`, `advance_topic`, `ask_student_question`, `create_diagnostic`, `quiz`.

Plan-editable conditions (`full_system`, `plan_only`) additionally have: `learning_plan`.

### Simulator Cues

- **Editable** = active agency cue (e.g., "ask the tutor to change the plan")
- **Non-editable** = NO cue (plan/mastery visible as context but student doesn't comment on it)

---

## 3. Automated Evaluation Pipeline

For each run:
1. **Pre-test**: MCQ on scenario topics, with forced errors based on knowledge gaps
2. **Tutoring session**: 5 turns, student simulator + tutor
3. **Post-test**: MCQ with evidence gating (gap questions require verified transcript evidence)
4. **Judge evaluation**: LLM judge scores transcript on 5 weighted dimensions

### What It Tests
Whether student-facing transparency and control improves outcomes. The manipulation is on the student side (simulator cues), not the tutor side.

### What It Does NOT Test
- Real student agency (clicking edit buttons) — that's the user study
- Tutor capability differences — tutor is identical across conditions

---

## 4. Statistical Methods

- **Primary (confirmatory)**: Welch's t-test for Full vs Baseline
- **Secondary (exploratory)**: 2-way ANOVA for Plan × Model main effects + interaction
- **Effect sizes**: Cohen's d (pairwise), partial eta-squared η²_p (ANOVA)
- **Multiple comparison correction**: Holm-Bonferroni step-down, applied to three families (overall, gap, judge) separately
- **Confidence intervals**: 95% CIs for condition means (t-distribution) and mean differences (Welch t)
- **Primary outcome**: Gap-only normalised gain (Hake's g, restricted to knowledge-gap topics)
- **Judge overall_score**: Recomputed from subscores using canonical weights (not trusting LLM arithmetic)

---

## 5. Evidence Gating Mechanism

Post-test gap questions require the simulated student to produce JSON with `{"answer": N, "evidence": "verbatim quote"}`. Verification:
1. **Token overlap**: ≥60% of meaningful evidence tokens appear in transcript (fuzzy matching)
2. **Keyword relevance**: Evidence contains at least one topic-specific keyword from `evidenceKeywords`

If either check fails (or JSON is malformed), the answer is forced to `misconceptionDistractor` — a predetermined wrong answer aligned with the student's misconception. This prevents the LLM from answering correctly based on parametric knowledge rather than tutoring content.

---

## 6. Mechanism Metrics

| Metric | Source | Interpretation |
|--------|--------|---------------|
| Plan edits | `learning_plan` tool calls after student request | Student-directed curriculum changes |
| Mastery overrides | `record_learning` with `source: self_report` | Student contesting mastery assessment |
| Advance topic count | `advance_topic` tool calls | Plan engagement (student-directed in editable, tutor-autonomous in non-editable) |
| Evidence verified | Post-test evidence gating | Whether tutor actually covered gap topics |
| JSON parse failures | Post-test evidence gating | Student model compliance with JSON format |

---

## 7. Key Files

| File | Role |
|------|------|
| `src/tooling/eval/ablationRunner.ts` | Main evaluation orchestrator, statistics, output |
| `src/tooling/eval/ablationConfig.ts` | Condition definitions (2x2 flags) |
| `src/tooling/eval/ablationScenarios.ts` | 4 scenario definitions with questions/gaps |
| `src/tooling/eval/prePostTest.ts` | Pre/post test, evidence gating, statistical functions |
| `src/tooling/eval/judgePrompts.ts` | Judge rubric, dimension weights |
| `src/tooling/headless/simulators.ts` | Student simulator with condition cues |
| `src/lib/agent/compose.ts` | Tutor system prompt composition |
| `src/lib/agent/tutor/state.ts` | Tool filtering per condition |
| `src/lib/agent/tutor/planContext.ts` | Plan context for tutor prompt |
| `src/lib/agent/learner-model/summary.ts` | Mastery summary for tutor prompt |
| `src/lib/learning-plan/progress.ts` | Plan progress summary |

---

## 8. CLI Operational Guide

### Quick Start

```bash
# Full evaluation (320 runs, ~$6-7)
bun run ablation -- --runs 20 --out tmp/thesis-eval

# Smoke test (8 runs)
bun run ablation -- --runs 1 --scenarios linear_equations,bayes_rule --out tmp/smoke-test

# Dry run
bun run ablation -- --runs 20 --dry-run

# List scenarios and conditions
bun run ablation -- --list

# Resume after interruption
bun run ablation -- --resume --out tmp/thesis-eval
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--runs <n>` | 3 | Runs per condition×scenario cell |
| `--conditions <list>` | all | Comma-separated condition names |
| `--scenarios <list>` | all | Comma-separated scenario IDs |
| `--concurrency <n>` | 4 | Max parallel API calls (max 10) |
| `--tutor-model <id>` | `google/gemini-3-flash-preview` | Model for tutoring |
| `--student-model <id>` | `google/gemini-2.5-flash-lite` | Student simulator model |
| `--judge-model <id>` | `anthropic/claude-haiku-4.5` | Quality assessment model |
| `--out <dir>` | `tmp/ablation` | Output directory |
| `--no-shuffle` | - | Disable run order randomisation |
| `--dry-run` | - | Preview without executing |
| `--resume` | - | Resume from checkpoint |

### Output Files

| File | Contents |
|------|----------|
| `ablation-summary.json` | Full raw results |
| `ablation-tables.md` | Markdown tables with CIs, adjusted p-values, eta-squared |
| `ablation-stats.md` | Statistical interpretation and findings |

### Sample Size

20 runs × 4 scenarios × 4 conditions = 320 total. Power: 80% to detect d=0.5 at α=0.05 (requires ~64/group; 80 observations/condition exceeds this).

---

## 9. Design Lessons and Known Limitations

1. **Always ask "whose perspective?"** — The 2x2 factors manipulate the STUDENT's experience, not the tutor's.
2. **Simulator cues ARE the manipulation** — Without proper cues, the student behaves identically across conditions. The cues simulate UI affordances.
3. **ChatTutor's plan is system-managed** — Student sees it but never controls it. Baseline must match: no plan agency cues.
4. **`learnerModelVisible` is a student-facing flag** — The tutor ALWAYS sees mastery (it's internal system state).
5. **`advance_topic` has dual interpretation** — Student-directed in editable conditions, tutor-autonomous in non-editable.
6. **Evidence gating addresses ceiling effects** — LLM students would otherwise answer correctly from parametric knowledge.
7. **Judge overall_score is recomputed** — Not trusted from LLM arithmetic; canonical weights applied programmatically.
8. **`parseAnswer` fallback is seeded** — Deterministic for reproducibility across repeated evaluations.
9. **Holm-Bonferroni correction applied** — Controls family-wise error rate across 6 pairwise comparisons per outcome family.
10. **Null finding on `learning_plan` tool is publishable** — The tool is too complex for mid-session use; decided against adding `reorder_plan`.

---

## 10. Iteration History (2026-02-10)

### Phase 1: Prompt Tuning with Free Models (8 iterations)

Used cheap models (`stepfun/step-3.5-flash:free` tutor, `google/gemini-2.5-flash-lite` student, `nvidia/llama-3.3-nemotron-super-49b-v1:free` judge) to iterate quickly on prompts. Key findings:

- **Iter-1 baseline**: Zero plan edits, zero mastery overrides, zero advance_topic in editable conditions
- **Fix 1** (tutorPreamble.ts): Explicit tool-action mapping for student requests + mastery-based advance_topic trigger
- **Fix 2** (planContext.ts): Sequencing rule for post-practice record_learning + advance_topic
- **Fix 3** (simulators.ts): Concrete plan-edit examples in student agency cue
- **Fix 4** (ablationRunner.ts): Default learner model (40% per topic) so student sees scores from turn 1
- **Fix 5** (simulators.ts): Concrete mastery contestation examples in mastery-editable cue

Post-fix results (n=14): full_system 21% plan edit rate, plan_only 36%, non-editable 0%. Clean separation on plan edits. Student contests mastery scores but free tutor ignores requests (model quality bottleneck).

### Phase 2: Production Model Validation (4 smoke runs)

Tested with production models: Gemini 3 Flash (tutor), Gemini 2.5 Flash Lite (student), Claude Haiku 4.5 (judge).

**Smoke run 1** (before LaTeX fix): full_system got -100% gap-normalised gain because evidence verification failed at 0%. Root cause: LaTeX backslashes in evidence quotes (`\lim`, `\frac`, `\to`) break `JSON.parse`. The `\l` in `\lim` is not a valid JSON escape sequence.

**Fix applied**: `sanitizeLatexInJson()` in prePostTest.ts — escapes `\` before letters. Also strengthened `nodeId` description in record_learning tool definition and `self_report` instructions in planContext.ts.

**Smoke run 2** (after fix):

| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| JSON failures (full_system) | 25% | **0%** |
| Evidence verified (full_system) | 0% | **75%** |
| Plan edits (editable conditions) | 1 | **7** |
| Plan edits (non-editable) | 0 | 0 |
| full_system gap gain | -100% | **+50%** |

Clean mechanism separation: plan edits only in editable conditions, zero in non-editable. `advance_topic` active across all conditions (2–6 per run).

**Remaining issue**: Mastery overrides still 0 — Gemini calls `record_learning` when student contests mastery but uses `source: 'assessment'` instead of `source: 'self_report'`, so it's not tracked as a student-initiated override.

### Phase 3: Alternative Tutor Models

Tested two alternatives to assess model dependency:

| Model | Plan Edits | advance_topic | Tool Calling | Duration | Notes |
|-------|-----------|---------------|-------------|----------|-------|
| **Gemini 3 Flash** | 7 (clean) | 2-6/run | Works | 2.5 min | Best mechanism engagement |
| **Haiku 4.5 (OpenRouter)** | 0 | 0 | Broken | 3.2 min | Writes XML tool calls as text, never executed |
| **Kimi K2.5** | 0 | 2-6/run | Works | 5.9 min | advance_topic but never learning_plan |

Haiku via OpenRouter outputs tool calls in Claude's native XML format (`<function_calls><invoke name=...>`) as plain text instead of using the structured function calling API. Also uses wrong parameter names (`topic_id` instead of `nodeId`). Haiku's tutoring quality was the highest (judge 0.73-0.80) but zero mechanism engagement.

Gemini 3 Flash remains the only viable tutor model for the automated evaluation — the only one that engages with `learning_plan` for plan edits.

---

## 11. Open Questions & Current Status

### Automated Eval Status: Partially Working

The pipeline produces clean mechanism separation on the plan factor (plan edits in editable conditions only) and reasonable learning gains. However:

1. **Model dependency**: Only Gemini 3 Flash engages with `learning_plan`. Results are confounded with model-specific tool-calling behaviour.
2. **Mastery override bottleneck**: Gemini uses `assessment` instead of `self_report` when student contests mastery. The model factor mechanism metric remains untested.
3. **Node ID hallucination**: Gemini sometimes invents node IDs (e.g., "basic-rules" instead of "power-rule"), causing `record_learning` calls to silently fail.
4. **Sample size**: All tests so far are n=2 per condition. Need n≥20 for adequate power.

### UI vs Headless Discrepancy

The actual Dialogia UI calls tools reliably — when using the app interactively, the tutor uses `record_learning`, `advance_topic`, `learning_plan` etc. correctly and consistently. The headless pipeline may behave differently due to:
- Missing conversational context that the UI provides (e.g., visible tool results, plan UI state)
- Differences in how the headless runner composes system prompts vs the live app
- Potentially different API call formatting (the headless runner uses stub models)

This discrepancy suggests that the automated evaluation may underestimate the system's real-world mechanism engagement. The user study with the actual UI is the more valid measure of student agency.

### Decision Point

The automated evaluation demonstrates that the pipeline infrastructure works (evidence gating, statistics, judge scoring, condition separation), but the ecological validity of simulated student agency is limited. Options:

1. **Run full eval with Gemini** — accept limitations, report mechanism metrics alongside learning gains, note model dependency
2. **Focus on user study** — the automated eval has served its purpose validating the pipeline; real agency data comes from humans using the actual UI
3. **Both** — run automated eval for the thesis chapter on system validation, and user study for the main results

### Commits Applied

- `6412a21` — Tutor tool responsiveness + student agency cues
- `a680db3` — Default learner model initialisation
- `9bf0578` — Use `initializeLearnerModel` (0.3 confidence)
- *(uncommitted)* — LaTeX JSON sanitisation, strengthened nodeId/self_report instructions
