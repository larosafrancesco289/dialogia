# REFACTOR_PLAN.md

This document outlines a refactoring plan to improve the architectural health, maintainability, and testability of the Dialogia codebase.

## 1. Executive Summary

The codebase is generally well-structured but has accumulated technical debt in key areas:
-   **`src/lib` clutter**: The library folder is a mix of core business logic, utilities, and sub-modules without a strict hierarchy.
-   **Complex Store Logic**: Zustand stores (`chatSlice.ts`) contain heavy business logic and direct database calls, making them hard to test and maintain.
-   **Monolithic Agent Functions**: Key agent functions (like `buildChatCompletionMessages` and `getTutorToolDefinitions`) are overly long and mix multiple responsibilities.
-   **Type Safety**: Use of `any` in critical store paths reduces confidence in refactors.

**Goal**: Move towards a modular architecture where "stores" are thin UI binders, "services" handle business logic, and "agents" are composed of small, testable units.

## 2. Directory Structure & Organization

### Current Issues
-   `src/lib` contains too many top-level items.
-   `src/lib/agent`, `src/lib/orchestrator`, and `src/lib/tutor` (if applicable) have overlapping responsibilities.
-   `src/lib/store.ts` sits alongside `src/lib/store/`.

### Action Items
1.  **Consolidate Agent Logic**:
    -   Move `src/lib/orchestrator` *into* `src/lib/agent/orchestrator` to centralize all agent-related code.
    -   Move `src/lib/zdr` into `src/lib/agent/policy` or `src/lib/policy` if it applies broadly.
    -   Rename `src/lib/agent/conversation.ts` to `src/lib/agent/prompt-builder/` (directory) to split its logic.

2.  **Structure `src/lib`**:
    -   Group distinct domains. For example:
        -   `src/lib/core/` (config, constants, types)
        -   `src/lib/features/` (tutor, deepResearch, etc.)
        -   `src/lib/services/` (database, API clients)

3.  **Fix Store Module**:
    -   Move `src/lib/store.ts` to `src/lib/store/index.ts` for consistency.

## 3. State Management (`src/lib/store`)

### Current Issues
-   `chatSlice.ts` is a "God Object" handling UI state, DB persistence, and complex business rules (e.g., `newChat`, `updateChatSettings`).
-   Direct `db` calls inside the store make unit testing the store logic nearly impossible without mocking the entire DB.

### Action Items
1.  **Extract `ChatService`**:
    -   Create `src/lib/services/chatService.ts`.
    -   Move `saveChat`, `saveFolder`, `deleteChat` logic here.
    -   Move `newChat` creation logic (calculating default model, priming tutor) to this service.
    -   The store should simply call `ChatService.createChat()` and update its state with the result.

2.  **Refactor `updateChatSettings`**:
    -   Extract the "Tutor Mode" enforcement logic into a pure function in `src/lib/agent/tutor/policy.ts`.
    -   Extract "Parallel Models" normalization to `src/lib/models/normalization.ts`.

3.  **Remove `any`**:
    -   Strictly type the store actions. Use `Partial<StoreState>` return types correctly or use `produce` (Immer) if state updates are complex.

## 4. Agent & Conversation Logic

### Current Issues
-   `src/lib/agent/conversation.ts`: `buildChatCompletionMessages` handles token counting, message history normalization, and attachment processing (PDF/Image/Audio) all in one huge function.
-   `src/lib/agent/tutor.ts`: `getTutorToolDefinitions` is a massive JSON schema dump.

### Action Items
1.  **Decompose `conversation.ts`**:
    -   Extract `TokenBudgeter` class/function to handle history truncation.
    -   Extract `AttachmentProcessor` to handle file type conversions (Base64, specific provider formats).
    -   Create a `PromptBuilder` class that orchestrates these small pieces.

2.  **Refactor `tutor.ts`**:
    -   Move tool definitions to `src/lib/agent/tools/definitions/tutorTools.ts`.
    -   Move context summary logic (`buildTutorContextSummary`) to `src/lib/agent/tutor/context.ts`.
    -   Keep `tutor.ts` as a thin facade or entry point.

3.  **Unify Orchestrator**:
    -   Ensure `src/lib/agent/orchestrator/turn.ts` (currently `src/lib/orchestrator/turn.ts`) remains the single source of truth for the "Loop".
    -   Keep the dependency injection pattern (passing `compose`, `plan`, etc.), as it is excellent for testing.

## 5. UI Components

### Current Issues
-   `Composer.tsx` is large and handles too many concerns (UI, drag-and-drop, shortcuts, local state).

### Action Items
1.  **Composer Refactor**:
    -   Move the "Hero" vs "Sticky" layout logic into sub-components: `ComposerLayout.tsx`.
    -   Keep `Composer.tsx` as the logic container (hooks & state) that renders the layout.

## 6. ZDR Module (`src/lib/zdr`)

### Current Issues
-   Naming is opaque ("ZDR").
-   `ensureZdrLists` has mixed concerns (fetching vs cache management).

### Action Items
1.  **Clarify Purpose**: Add a README in the directory explaining it (Zero Data Retention?).
2.  **Simplify Logic**: Use a standard caching utility (like `swr` or a simple `Cache` class) instead of custom list merging logic if possible.

## 7. Testing Strategy

### Current Issues
-   Testing business logic inside React components or Zustand stores is hard.

### Action Items
-   **Test Services First**: Once `ChatService` is extracted, write unit tests for it (mocking the DB).
-   **Test Prompt Builder**: Write pure unit tests for `buildChatCompletionMessages` refactored parts (e.g., "does it correctly drop messages when over context limit?").
