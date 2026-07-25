import type { ChatSettings, TutorToolBudget } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import { DEFAULT_BASE_SYSTEM } from '@/lib/agent/prompts/baseSystem';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { migrateChatSettingsRecord } from '@/lib/settings/migrations';
import { resolveDynamicModelId } from '@/lib/models/dynamicDefaults';
import { applyTutorDefaults } from '@/lib/tutor/defaults';
import { ChatSettingsSchema } from '@/lib/schemas/persisted';
import { asNumber, isRecord } from '@/lib/utils/guards';
import { ReasoningEffortEnum, type ReasoningEffort } from '@/lib/types/enums';
import { ProviderSort } from '@/lib/models/providerSort';

type NormalizeChatSettingsOptions = {
  fallbackModelId?: string;
  fallbackSystem?: string;
  fallbackTutorModelId?: string;
  ui?: UiSnapshot;
  applyTutorDefaults?: boolean;
};

const normalizeTutorToolBudget = (value: unknown): TutorToolBudget | undefined => {
  if (!isRecord(value)) return undefined;
  const budget: TutorToolBudget = {};
  const maxToolsPerTurn = asNumber(value.maxToolsPerTurn);
  const maxQuizzesPerNode = asNumber(value.maxQuizzesPerNode);
  const maxDiagnosticsPerSession = asNumber(value.maxDiagnosticsPerSession);
  if (maxToolsPerTurn != null) budget.maxToolsPerTurn = maxToolsPerTurn;
  if (maxQuizzesPerNode != null) budget.maxQuizzesPerNode = maxQuizzesPerNode;
  if (maxDiagnosticsPerSession != null) budget.maxDiagnosticsPerSession = maxDiagnosticsPerSession;
  return Object.keys(budget).length ? budget : undefined;
};

export function normalizeChatSettings(
  input: unknown,
  opts: NormalizeChatSettingsOptions = {},
): ChatSettings {
  const fallbackModelId = opts.fallbackModelId ?? resolveDynamicModelId(DEFAULT_MODEL_ID, []);
  const fallbackSystem = opts.fallbackSystem ?? DEFAULT_BASE_SYSTEM;
  const fallbackTutorModelId =
    opts.fallbackTutorModelId ?? resolveDynamicModelId(DEFAULT_TUTOR_MODEL_ID, []);
  const { next } = migrateChatSettingsRecord(input);
  const record = isRecord(next) ? next : {};

  const modelId =
    typeof record.modelId === 'string' && record.modelId.trim() ? record.modelId : fallbackModelId;
  const system = typeof record.system === 'string' ? record.system : fallbackSystem;

  const generationRecord = isRecord(record.generation) ? record.generation : {};
  const uiRecord = isRecord(record.ui) ? record.ui : {};
  const featuresRecord = isRecord(record.features) ? record.features : {};
  const searchRecord = isRecord(featuresRecord.search) ? featuresRecord.search : {};
  const tutorRecord = isRecord(featuresRecord.tutor) ? featuresRecord.tutor : {};

  const settings: ChatSettings = {
    modelId,
    system,
    generation: {
      temperature: asNumber(generationRecord.temperature),
      topP: asNumber(generationRecord.topP),
      maxTokens: asNumber(generationRecord.maxTokens),
      reasoningEffort:
        typeof generationRecord.reasoningEffort === 'string' &&
        Object.values(ReasoningEffortEnum).includes(
          generationRecord.reasoningEffort as ReasoningEffort,
        )
          ? (generationRecord.reasoningEffort as ReasoningEffort)
          : undefined,
      reasoningTokens: asNumber(generationRecord.reasoningTokens),
      providerSort: Object.values(ProviderSort).includes(
        generationRecord.providerSort as ProviderSort,
      )
        ? (generationRecord.providerSort as ProviderSort)
        : undefined,
    },
    ui: {
      showThinkingByDefault: Boolean(uiRecord.showThinkingByDefault),
      showStats: Boolean(uiRecord.showStats),
      showToolCallLog: Boolean(uiRecord.showToolCallLog),
      showDebugRawJson:
        typeof uiRecord.showDebugRawJson === 'boolean' ? uiRecord.showDebugRawJson : true,
    },
    features: {
      search: {
        enabled: typeof searchRecord.enabled === 'boolean' ? searchRecord.enabled : false,
        provider:
          searchRecord.provider === 'tavily' || searchRecord.provider === 'brave'
            ? 'tavily'
            : searchRecord.provider === 'openrouter'
              ? 'openrouter'
              : 'tavily',
      },
      tutor: {
        enabled: typeof tutorRecord.enabled === 'boolean' ? tutorRecord.enabled : false,
        defaultModelId:
          typeof tutorRecord.defaultModelId === 'string' ? tutorRecord.defaultModelId : undefined,
        toolBudget: normalizeTutorToolBudget(tutorRecord.toolBudget),
        learningPlan: isRecord(tutorRecord.learningPlan)
          ? (tutorRecord.learningPlan as ChatSettings['features']['tutor']['learningPlan'])
          : undefined,
        planGenerated:
          typeof tutorRecord.planGenerated === 'boolean' ? tutorRecord.planGenerated : undefined,
        planGenerationModel:
          typeof tutorRecord.planGenerationModel === 'string'
            ? tutorRecord.planGenerationModel
            : undefined,
        disablePlanGeneration:
          typeof tutorRecord.disablePlanGeneration === 'boolean'
            ? tutorRecord.disablePlanGeneration
            : undefined,
        planEditable:
          typeof tutorRecord.planEditable === 'boolean' ? tutorRecord.planEditable : undefined,
        enableLearnerModel:
          typeof tutorRecord.enableLearnerModel === 'boolean'
            ? tutorRecord.enableLearnerModel
            : undefined,
        learnerModelVisible:
          typeof tutorRecord.learnerModelVisible === 'boolean'
            ? tutorRecord.learnerModelVisible
            : undefined,
        learnerModel: tutorRecord.learnerModel as ChatSettings['features']['tutor']['learnerModel'],
      },
    },
  };

  const parsed = ChatSettingsSchema.safeParse(settings);
  const base = parsed.success ? parsed.data : settings;

  if (opts.applyTutorDefaults && base.features.tutor.enabled) {
    const ensured = applyTutorDefaults({
      ui: opts.ui,
      chat: { settings: base },
      fallbackDefaultModelId: fallbackTutorModelId,
    }).nextSettings;
    return ensured;
  }

  if (base.features.tutor.enabled && !base.features.tutor.defaultModelId) {
    return {
      ...base,
      features: {
        ...base.features,
        tutor: {
          ...base.features.tutor,
          defaultModelId: fallbackTutorModelId,
        },
      },
    };
  }

  return base;
}
