# Tutor Tool Contract

This document defines the contract between tutor tool calls, persisted message payloads, and UI
rendering. It is the source of truth for tool input schemas and persistence rules.

## Tool Names

Tutor tools are invoked via function calls using these names:

- `ask_student_question`
- `create_diagnostic`
- `learning_plan`
- `record_learning`
- `advance_topic`
- `quiz`

## Payload Shapes (Tool → Message.tutor)

Tool handlers normalize inputs and patch `Message.tutor` with these fields:

- `quiz` (type: 'mcq') → `mcq: TutorMCQItem[]` (title optional, per-item `id`, `question`, `choices`, `correct`)
- `create_diagnostic` → `diagnostic: TutorDiagnostic` (items, status, score optional)
- `learning_plan` → `planProposal: TutorPlanProposal` (auto-detects create vs update)
- `record_learning` → `assessmentUpdates: TutorLearnerModelUpdate[]` and learner model side-effects

Tool argument schemas live under `src/lib/tools/definitions/tutor/` and the per-tool handlers under
`src/lib/agent/tools/tutor/handlers/` are responsible for validation and patching.

## Error Contract

- When a tutor tool call cannot be parsed or handled, the tool response now returns
  `{ "ok": false, "error": "..." }` (never bare `{ "ok": false }`).
- `quiz` accepts the canonical payload (`type` + `items`) and also normalizes common legacy aliases
  like `questionType`, `options`, and `correctAnswer` when possible.

## Persistence Rules

- **Persisted**: `Message.tutor` is stored in IndexedDB via `saveMessage` and restored into
  `ui.tutor.byMessageId` during app initialization (`loadRepositorySnapshot`).
- **Ephemeral**: `ui.tutor.byMessageId` contains UI-only state (e.g., user attempts) and is not
  persisted by Zustand.
- **Attempts**: UI interactions (MCQ selections) update `ui.tutor.byMessageId` and optionally
  patch the message payload via store actions: `setTutorAttemptMcq`, `setTutorPlanProposalStatus`.

## UI Rendering Responsibilities

Tutor UI components render from `Message.tutor` and `ui.tutor.byMessageId`:

- `src/components/message/tutor/TutorPanel.tsx` composes the widget cards
- `McqCard`, `DiagnosticCard`, `PlanProposalCard`, `LearnerUpdatesCard` render specific payloads
- `PlanProposalCard` updates plan status and persists via store actions

Tool calls should never mutate UI state directly; they should patch message payloads and let UI
derive the display state from persisted `Message.tutor` plus ephemeral attempts.
