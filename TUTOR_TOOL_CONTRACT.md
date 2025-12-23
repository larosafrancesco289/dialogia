# Tutor Tool Contract

This document defines the contract between tutor tool calls, persisted message payloads, and UI
rendering. It is the source of truth for tool input schemas and persistence rules.

## Tool Names

Tutor tools are invoked via function calls using these names:

- `ask_student_question`
- `create_diagnostic`
- `generate_plan`
- `update_plan`
- `assess_answer`
- `update_learner_model`
- `apply_learner_model_feedback`
- `get_plan_suggestions`
- `quiz_mcq`
- `quiz_fill_blank`
- `quiz_open_ended`
- `flashcards`
- `grade_open_response`
- `add_to_deck`
- `srs_review`

## Payload Shapes (Tool → Message.tutor)

Tool handlers normalize inputs and patch `Message.tutor` with these fields:

- `quiz_mcq` → `mcq: TutorMCQItem[]` (title optional, per-item `id`, `question`, `choices`, `correct`)
- `quiz_fill_blank` → `fillBlank: TutorFillBlankItem[]` (per-item `id`, `prompt`, `answer`)
- `quiz_open_ended` → `openEnded: TutorOpenItem[]` (per-item `id`, `prompt`)
- `flashcards` → `flashcards: TutorFlashcardItem[]`
- `create_diagnostic` → `diagnostic: TutorDiagnostic` (items, status, score optional)
- `generate_plan` / `update_plan` → `planProposal: TutorPlanProposal`
- `get_plan_suggestions` → `planSuggestions: TutorPlanSuggestion[]`
- `assess_answer` → `assessmentUpdates: TutorLearnerModelUpdate[]`
- `update_learner_model` / `apply_learner_model_feedback` → `assessmentUpdates` and learner model
  side-effects (see “Plan & Learner Model”)
- `grade_open_response` → `grading: Record<string, TutorGradingResult>`
- `add_to_deck` / `srs_review` → `flashcards` and SRS metadata as needed

Tool argument schemas live under `src/lib/agent/tools/definitions/tutorTools.ts` and the per-tool
handlers under `src/lib/agent/tools/tutor/handlers/*` are responsible for validation and patching.

## Persistence Rules

- **Persisted**: `Message.tutor` is stored in IndexedDB via `saveMessage` and restored into
  `ui.tutor.byMessageId` during app initialization (`loadRepositorySnapshot`).
- **Ephemeral**: `ui.tutor.byMessageId` contains UI-only state (e.g., user attempts) and is not
  persisted by Zustand.
- **Attempts**: UI interactions (MCQ selections, fill-blank answers, open-ended responses) update
  `ui.tutor.byMessageId` and optionally patch the message payload via store actions:
  `setTutorAttemptMcq`, `setTutorAttemptFillBlank`, `setTutorAttemptOpen`,
  `setTutorPlanProposalStatus`.

## UI Rendering Responsibilities

Tutor UI components render from `Message.tutor` and `ui.tutor.byMessageId`:

- `src/components/message/tutor/TutorPanel.tsx` composes the widget cards
- `McqCard`, `FillBlankCard`, `OpenEndedCard`, `FlashcardsCard`, `DiagnosticCard`,
  `PlanProposalCard`, `LearnerUpdatesCard` render specific payloads
- `PlanProposalCard` updates plan status and persists via store actions

Tool calls should never mutate UI state directly; they should patch message payloads and let UI
derive the display state from persisted `Message.tutor` plus ephemeral attempts.
