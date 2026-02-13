import type { PlanInspectionDepth, PlanNodeSection } from '@/lib/study/planTelemetry';

export type StudyActionType =
  | 'session_start'
  | 'session_end'
  | 'condition_changed'
  | 'message_sent'
  | 'message_received'
  | 'plan_viewed'
  | 'plan_closed'
  | 'plan_edited'
  | 'plan_feedback_sent'
  | 'learner_model_viewed'
  | 'learner_model_edited'
  | 'plan_exposed'
  | 'plan_tab_changed'
  | 'plan_node_opened'
  | 'plan_node_closed'
  | 'plan_node_inspected'
  | 'plan_sort_changed'
  | 'learner_model_details_toggled';

export type StudyActionMetadataMap = {
  session_start: undefined;
  session_end: undefined;
  condition_changed: {
    from: 'A' | 'B' | null;
    to: 'A' | 'B';
  };
  message_sent: {
    messageId: string;
    contentLength: number;
    isHiddenFromUser?: boolean;
    modelId?: string;
  };
  message_received: {
    messageId: string;
    contentLength: number;
    modelId?: string;
  };
  plan_viewed: {
    source: string;
    tab?: 'plan' | 'progress';
    manual?: boolean;
  };
  plan_closed: {
    source: string;
    tab?: 'plan' | 'progress';
    manual?: boolean;
  };
  plan_edited: {
    source?: string;
    editAction?: string;
  };
  plan_feedback_sent: {
    source?: string;
  };
  learner_model_viewed: {
    source: string;
    tab?: 'plan' | 'progress';
    manual?: boolean;
  };
  learner_model_edited: {
    editAction: string;
    nodeId?: string;
  };
  plan_exposed: {
    chatId: string;
    planUpdatedAt: number | null;
    source: string;
  };
  plan_tab_changed: {
    from: 'plan' | 'progress';
    to: 'plan' | 'progress';
    source: string;
  };
  plan_node_opened: {
    nodeId: string;
    nodeName: string;
    section: PlanNodeSection;
    interactionCount: number;
    depth: PlanInspectionDepth;
  };
  plan_node_closed: {
    nodeId: string;
    nodeName: string;
    section: PlanNodeSection;
    dwellMs: number;
    interactionCount: number;
    depth: PlanInspectionDepth;
  };
  plan_node_inspected: {
    nodeId: string;
    nodeName: string;
    section: PlanNodeSection;
    dwellMs: number;
    interactionCount: number;
    depth: PlanInspectionDepth;
  };
  plan_sort_changed: {
    from: 'plan' | 'attention';
    to: 'plan' | 'attention';
    source: string;
  };
  learner_model_details_toggled: {
    expanded: boolean;
    source: string;
  };
};

export type StudyLogEntry<A extends StudyActionType = StudyActionType> = {
  id: string;
  participantId: string;
  condition: 'A' | 'B';
  timestamp: number;
  action: A;
  metadata?: StudyActionMetadataMap[A];
};

export type AnyStudyLogEntry = {
  [A in StudyActionType]: StudyLogEntry<A>;
}[StudyActionType];

export type StudySession = {
  participantId: string;
  condition: 'A' | 'B';
  startedAt: number;
  endedAt?: number;
  entries: AnyStudyLogEntry[];
};
