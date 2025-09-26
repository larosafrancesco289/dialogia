import type { Message } from '@/lib/types';
import { chatCompletion } from '@/lib/openrouter';
import { DEFAULT_TUTOR_MEMORY_FREQUENCY } from '@/lib/constants';
import { estimateTokens } from '@/lib/tokenEstimate';

export const EMPTY_TUTOR_MEMORY = `Memory:\n- Goals:\n  - Not recorded yet.\n- Progress:\n  - Not recorded yet.\n- Preferences:\n  - Not recorded yet.`;

const MAX_TUTOR_MEMORY_TOKENS = 1000;

export type TutorMemoryUpdateResult = {
  memory: string;
  raw: string;
  conversationWindow: string;
};

export type TutorMemorySections = {
  goals: string[];
  progress: string[];
  preferences: string[];
};

const PLACEHOLDER_PATTERN = /not recorded yet\.?/i;

const isSectionHeader = (line: string) => /^-\s*(Goals|Progress|Preferences):/i.test(line.trim());

export function enforceTutorMemoryLimit(text: string): string {
  let value = (text || '').trim();
  if (!value) return EMPTY_TUTOR_MEMORY;
  let tokens = estimateTokens(value) ?? Math.ceil(value.length / 4);
  if (tokens <= MAX_TUTOR_MEMORY_TOKENS) return value;

  const lines = value.split(/\r?\n/);
  const fixedPrefixes = ['Memory:', '- Goals:', '- Progress:', '- Preferences:'];
  // Ensure headings stay in place; remove trailing bullet lines until within limit.
  while (lines.length > 0 && tokens > MAX_TUTOR_MEMORY_TOKENS) {
    const lastIdx = (() => {
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.trim()) return i;
        if (fixedPrefixes.some((prefix) => line.startsWith(prefix))) continue;
        if (isSectionHeader(line)) continue;
        return i;
      }
      return lines.length - 1;
    })();
    lines.splice(lastIdx, 1);
    value = lines.join('\n').trim();
    if (!value) {
      value = EMPTY_TUTOR_MEMORY;
      break;
    }
    tokens = estimateTokens(value) ?? Math.ceil(value.length / 4);
  }
  return value || EMPTY_TUTOR_MEMORY;
}

export function normalizeTutorMemory(input?: string): string {
  let text = (input || '').trim();
  if (!text) return EMPTY_TUTOR_MEMORY;
  if (!/^Memory:/i.test(text)) text = `Memory:\n${text}`;
  const sections: Array<{ heading: string; matcher: RegExp }> = [
    { heading: 'Goals', matcher: /^-\s*Goals:/im },
    { heading: 'Progress', matcher: /^-\s*Progress:/im },
    { heading: 'Preferences', matcher: /^-\s*Preferences:/im },
  ];
  for (const { heading, matcher } of sections) {
    if (!matcher.test(text)) text = `${text}\n- ${heading}:\n  - Not recorded yet.`;
  }
  return enforceTutorMemoryLimit(text);
}

export function extractTutorMemorySections(memory?: string): TutorMemorySections {
  const sections: TutorMemorySections = { goals: [], progress: [], preferences: [] };
  if (!memory) return sections;
  const lines = memory.split(/\r?\n/);
  let current: keyof TutorMemorySections | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^memory:/i.test(line)) continue;
    if (/^-\s*Goals:/i.test(line)) {
      current = 'goals';
      continue;
    }
    if (/^-\s*Progress:/i.test(line)) {
      current = 'progress';
      continue;
    }
    if (/^-\s*Preferences:/i.test(line)) {
      current = 'preferences';
      continue;
    }
    if (!current) continue;
    if (!/^[-*•]/.test(line)) continue;
    const normalized = line.replace(/^[-*•]+\s*/, '').trim();
    if (!normalized || PLACEHOLDER_PATTERN.test(normalized)) continue;
    const cleaned = normalized
      .replace(/^(Goals?|Progress|Preferences)[:\-]\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .trim();
    if (!cleaned) continue;
    sections[current].push(cleaned);
  }
  return sections;
}

const formatList = (items: string[]): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const head = items.slice(0, -1).join(', ');
  const tail = items[items.length - 1];
  return `${head}, and ${tail}`;
};

export function buildTutorWelcomeFallback(rawMemory?: string): string {
  const memory = normalizeTutorMemory(rawMemory);
  const { goals, progress, preferences } = extractTutorMemorySections(memory);
  const intro = 'Welcome back!';
  if (goals.length) return `${intro} Still focused on ${formatList(goals)}?`;
  if (progress.length) return `${intro} Nice progress on ${formatList(progress)}.`;
  if (preferences.length) return `${intro} I'll keep ${formatList(preferences)} in mind.`;
  return `${intro} Ready when you are.`;
}

export async function generateTutorWelcomeMessage(params: {
  apiKey: string;
  model: string;
  memory?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { apiKey, model, memory, signal } = params;
  const normalized = normalizeTutorMemory(memory);
  const prompt = [
    'Learner memory (context only):',
    normalized,
    '',
    'Write a warm welcome that proves you remember them.',
    'Requirements: 1-2 sentences, under 35 words total, second-person voice, no lists, no mention of "memory".',
    'Weave in one specific detail from the learner notes and end by inviting them to start.',
  ].join('\n');
  const messages = [
    {
      role: 'system',
      content:
        'You are a warm, attentive tutor who remembers prior sessions. Reply with a single paragraph of 1-2 sentences (max 35 words) that naturally references the learner details and ends with an invitation to continue.',
    },
    { role: 'user', content: prompt },
  ];
  const response = await chatCompletion({
    apiKey,
    model,
    messages,
    max_tokens: 220,
    temperature: 0.65,
    top_p: 0.9,
    providerSort: 'throughput',
    signal,
  });
  const text = (response?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('tutor_welcome_empty');
  return text;
}

export async function updateTutorMemory(params: {
  apiKey: string;
  model: string;
  existingMemory?: string;
  conversation: Message[];
  frequency?: number;
}): Promise<TutorMemoryUpdateResult> {
  const { apiKey, model, existingMemory, conversation, frequency } = params;
  const memory = normalizeTutorMemory(existingMemory);
  const lastMessages = conversation.slice(-10);
  const formatted = lastMessages
    .map((m) => {
      const role = m.role === 'assistant' ? 'Tutor' : m.role === 'user' ? 'Learner' : m.role;
      const chunks = [m.content];
      if (m.hiddenContent) chunks.push(m.hiddenContent);
      const body = chunks
        .filter((x) => typeof x === 'string' && x.trim())
        .join('\n\n');
      if (!body) return '';
      return `${role}: ${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const conversationWindow = formatted || 'Learner: (no recent dialogue)';
  const userPrompt = [
    'You maintain a persistent learner profile for a tutoring assistant.',
    'Re-write the memory block so it starts with "Memory:" and has concise bullet lists for Goals, Progress, and Preferences.',
    'Update bullets with new facts, remove stale or redundant items, and keep at most three bullets per section.',
    'If a section has nothing new, keep the most relevant prior bullet or leave a single placeholder bullet.',
    'Only return the updated memory block—no commentary.',
    '',
    `Existing memory:\n${memory}`,
    '',
    `Recent dialogue (most recent last):\n${conversationWindow}`,
  ]
    .filter(Boolean)
    .join('\n');
  const messages = [
    {
      role: 'system',
      content:
        'You are a concise note-taker. Output only the revised Markdown memory block with sections for Goals, Progress, and Preferences. Limit each section to short bullet phrases.',
    },
    { role: 'user', content: userPrompt },
  ];
  const response = await chatCompletion({
    apiKey,
    model,
    messages,
    max_tokens: 512,
    top_p: 0.4,
    temperature: 0.2,
  });
  const text = (response?.choices?.[0]?.message?.content || '').trim();
  const normalized = normalizeTutorMemory(text);
  return {
    memory: normalized,
    raw: text,
    conversationWindow,
  };
}

export function getTutorMemoryFrequency(settings?: {
  tutor_memory_frequency?: number;
}): number {
  const fromSettings = settings?.tutor_memory_frequency;
  if (typeof fromSettings === 'number' && fromSettings > 0) return Math.ceil(fromSettings);
  return DEFAULT_TUTOR_MEMORY_FREQUENCY;
}
