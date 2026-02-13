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
  | 'learner_model_edited';

export type StudyLogEntry = {
  id: string;
  participantId: string;
  condition: 'A' | 'B';
  timestamp: number;
  action: StudyActionType;
  metadata?: Record<string, unknown>;
};

export type StudySession = {
  participantId: string;
  condition: 'A' | 'B';
  startedAt: number;
  endedAt?: number;
  entries: StudyLogEntry[];
};
