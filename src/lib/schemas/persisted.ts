import { z } from 'zod';
import { ProviderSort } from '@/lib/models/providerSort';
import {
  MessageRoleEnum,
  MessageSourceEnum,
  ReasoningEffortEnum,
  SearchProviderEnum,
  ToolCallCategoryEnum,
  ToolCallStatusEnum,
  TutorResearchModeEnum,
} from '@/lib/types/enums';
import { LearningPlanSchema } from '@/lib/schemas/learningPlan';
import type { LearnerModel, MessageDeepResearch, MessageMetrics, MessageTutor } from '@/lib/types';

export const GenerationSettingsSchema = z
  .object({
    temperature: z.number().optional(),
    topP: z.number().optional(),
    maxTokens: z.number().optional(),
    reasoningEffort: z.nativeEnum(ReasoningEffortEnum).optional(),
    reasoningTokens: z.number().optional(),
    providerSort: z.nativeEnum(ProviderSort).optional(),
  })
  .passthrough();

export const GenSettingsSnapshotSchema = GenerationSettingsSchema.extend({
  searchEnabled: z.boolean().optional(),
  searchProvider: z.nativeEnum(SearchProviderEnum).optional(),
  tutorEnabled: z.boolean().optional(),
}).passthrough();

export const ChatUiSettingsSchema = z
  .object({
    showThinkingByDefault: z.boolean(),
    showStats: z.boolean(),
    showToolCallLog: z.boolean(),
    showDebugRawJson: z.boolean(),
  })
  .passthrough();

export const ChatSearchSettingsSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.nativeEnum(SearchProviderEnum),
  })
  .passthrough();

export const TutorToolBudgetSchema = z
  .object({
    maxToolsPerTurn: z.number().optional(),
    maxQuizzesPerNode: z.number().optional(),
    maxDiagnosticsPerSession: z.number().optional(),
  })
  .passthrough();

export const TutorSettingsSchema = z
  .object({
    enabled: z.boolean(),
    defaultModelId: z.string().optional(),
    thesisMode: z.boolean().optional(),
    researchMode: z.nativeEnum(TutorResearchModeEnum).optional(),
    toolBudget: TutorToolBudgetSchema.optional(),
    learningPlan: LearningPlanSchema.optional(),
    planGenerated: z.boolean().optional(),
    planGenerationModel: z.string().optional(),
    disablePlanGeneration: z.boolean().optional(),
    planEditable: z.boolean().optional(),
    enableLearnerModel: z.boolean().optional(),
    learnerModelVisible: z.boolean().optional(),
    learnerModel: z.custom<LearnerModel>().optional(),
  })
  .passthrough();

export const ChatSettingsSchema = z
  .object({
    modelId: z.string(),
    parallelModels: z.array(z.string()).optional(),
    system: z.string().optional(),
    generation: GenerationSettingsSchema,
    ui: ChatUiSettingsSchema,
    features: z.object({
      search: ChatSearchSettingsSchema,
      tutor: TutorSettingsSchema,
    }),
  })
  .passthrough();

export const ChatSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    settings: ChatSettingsSchema,
    folderId: z.string().optional(),
  })
  .passthrough();

export const PersistedAttachmentSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['image', 'pdf', 'audio']),
    name: z.string().optional(),
    mime: z.string(),
    size: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    dataURL: z.string().optional(),
    pageCount: z.number().optional(),
    text: z.string().optional(),
    base64: z.string().optional(),
    audioFormat: z.enum(['wav', 'mp3']).optional(),
  })
  .passthrough();

export const ToolCallLogEntrySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    timestamp: z.number(),
    status: z.nativeEnum(ToolCallStatusEnum),
    category: z.nativeEnum(ToolCallCategoryEnum).optional(),
    input: z.record(z.unknown()),
    output: z.record(z.unknown()).optional(),
    error: z.string().optional(),
    duration: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const MessageSchema = z
  .object({
    id: z.string(),
    chatId: z.string(),
    role: z.nativeEnum(MessageRoleEnum),
    content: z.string(),
    hiddenContent: z.string().optional(),
    systemSnapshot: z.string().optional(),
    genSettings: GenSettingsSnapshotSchema.optional(),
    annotations: z.unknown().optional(),
    createdAt: z.number(),
    tokensIn: z.number().optional(),
    tokensOut: z.number().optional(),
    model: z.string().optional(),
    reasoning: z.string().optional(),
    deepResearch: (
      z
        .object({
          trace: z.array(z.unknown()),
          answer: z.string().optional(),
        })
        .passthrough() as z.ZodType<MessageDeepResearch>
    ).optional(),
    metrics: z.custom<MessageMetrics>().optional(),
    attachments: z.array(PersistedAttachmentSchema).optional(),
    metadata: z
      .object({
        hiddenFromUser: z.boolean().optional(),
        kind: z.string().optional(),
        source: z.nativeEnum(MessageSourceEnum).optional(),
        audioLengthMs: z.number().optional(),
      })
      .optional(),
    tutor: z.custom<MessageTutor>().optional(),
    tutorWelcome: z.boolean().optional(),
    learnerModel: z.custom<LearnerModel>().optional(),
    planUpdates: z
      .object({
        statusChanges: z
          .array(
            z.object({
              nodeId: z.string(),
              from: z.string(),
              to: z.string(),
            }),
          )
          .optional(),
        masteryChanges: z
          .array(
            z.object({
              nodeId: z.string(),
              from: z.number(),
              to: z.number(),
            }),
          )
          .optional(),
        summary: z.string().optional(),
      })
      .optional(),
    toolCalls: z.array(ToolCallLogEntrySchema).optional(),
  })
  .passthrough();
