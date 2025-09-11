import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { saveMessage } from '@/lib/db';
import { buildChatCompletionMessages } from '@/lib/agent/conversation';
import { stripLeadingToolJson } from '@/lib/agent/streaming';
import {
  streamChatCompletion,
  chatCompletion,
  fetchZdrModelIds,
  fetchZdrProviderIds,
} from '@/lib/openrouter';
import {
  getTutorPreamble,
  getTutorToolDefinitions,
  buildTutorContextSummary,
  buildTutorContextFull,
} from '@/lib/agent/tutor';
import { loadTutorProfile, summarizeTutorProfile } from '@/lib/tutorProfile';
import { addCardsToDeck, getDueCards } from '@/lib/tutorDeck';
import {
  isReasoningSupported,
  findModelById,
  isVisionSupported,
  isAudioInputSupported,
  isToolCallingSupported,
  isImageOutputSupported,
} from '@/lib/models';
import { MAX_FALLBACK_RESULTS } from '@/lib/constants';
// telemetry removed for commit cleanliness

export function createMessageSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  return {
    async appendAssistantMessage(content: string, opts?: { modelId?: string }) {
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      const now = Date.now();
      const assistantMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'assistant',
        content,
        createdAt: now,
        model: opts?.modelId || chat.settings.model,
        reasoning: '',
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), assistantMsg],
        },
      }));
      await saveMessage(assistantMsg);
    },

    async persistTutorStateForMessage(messageId) {
      const st = get();
      const uiTutor = st.ui.tutorByMessageId?.[messageId];
      if (!uiTutor) return;
      let updatedMsg: any | undefined;
      for (const [cid, list] of Object.entries(st.messages)) {
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          const target = list[idx];
          let hidden = '';
          try {
            const recap = buildTutorContextSummary(uiTutor as any);
            const json = buildTutorContextFull(uiTutor as any);
            const parts: string[] = [];
            if (recap) parts.push(`Tutor Recap:\n${recap}`);
            if (json) parts.push(`Tutor Data JSON:\n${json}`);
            hidden = parts.join('\n\n');
          } catch {}
          // Replace hiddenContent for this assistant message (do not append repeatedly)
          const nm = { ...target, tutor: uiTutor, hiddenContent: hidden } as any;
          set((s) => ({
            messages: {
              ...s.messages,
              [cid]: list.map((m) => (m.id === messageId ? nm : m)),
            },
          }));
          updatedMsg = nm;
          break;
        }
      }
      try {
        if (updatedMsg) await saveMessage(updatedMsg);
      } catch {}
    },
    async sendUserMessage(
      content: string,
      opts?: { attachments?: import('@/lib/types').Attachment[] },
    ) {
      const useProxy = process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
      const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
      if (!key && !useProxy)
        return set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
        }));
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      // Filter attachments by model capabilities (vision/audio allowed only when supported)
      const modelMetaVisionCheck = findModelById(get().models, chat.settings.model);
      const canVision = isVisionSupported(modelMetaVisionCheck);
      const canAudio = isAudioInputSupported(modelMetaVisionCheck);
      const rawAttachments = (opts?.attachments || []).filter((a) => {
        if (a.kind === 'image') return !!canVision;
        if (a.kind === 'pdf') return true;
        if (a.kind === 'audio') return !!canAudio;
        return false;
      });
      // Convert PDF Files to data URLs on-the-fly for OpenRouter file blocks.
      const toDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(file);
        });
      // Audio: convert to base64 and set format when needed. PDFs: ensure dataURL exists.
      const toBase64FromDataUrl = (dataUrl: string): string | undefined => {
        const idx = dataUrl.indexOf('base64,');
        return idx >= 0 ? dataUrl.slice(idx + 'base64,'.length) : undefined;
      };
      const attachments = await Promise.all(
        rawAttachments.map(async (a) => {
          if (a.kind === 'pdf' && a.file && !a.dataURL) {
            try {
              const dataURL = await toDataUrl(a.file);
              return { ...a, dataURL };
            } catch {
              return a;
            }
          }
          if (a.kind === 'audio') {
            let base64 = a.base64;
            let dataURL = a.dataURL;
            // Ensure we have a preview URL for UI and base64 for sending
            if (!dataURL && a.file) {
              try {
                dataURL = await toDataUrl(a.file);
              } catch {}
            }
            if (!base64 && dataURL) base64 = toBase64FromDataUrl(dataURL);
            // Determine audio format from mime or name
            const fmt: 'wav' | 'mp3' | undefined = a.audioFormat
              ? a.audioFormat
              : a.mime?.includes('wav')
                ? 'wav'
                : a.mime?.includes('mpeg') || a.mime?.includes('mp3')
                  ? 'mp3'
                  : (a.name || '').toLowerCase().endsWith('.wav')
                    ? 'wav'
                    : (a.name || '').toLowerCase().endsWith('.mp3')
                      ? 'mp3'
                      : undefined;
            return { ...a, dataURL, base64, audioFormat: fmt } as any;
          }
          return a;
        }),
      );
      // Determine if any PDFs exist in conversation (prior or this turn) to enable parser plugin
      const priorList = get().messages[chatId] ?? [];
      const hadPdfEarlier = priorList.some(
        (m) => Array.isArray(m.attachments) && m.attachments.some((x: any) => x?.kind === 'pdf'),
      );
      const hasPdf = attachments.some((a) => a.kind === 'pdf') || hadPdfEarlier;
      // Strict ZDR enforcement: block sending to non-ZDR models when enabled
      if (get().ui.zdrOnly !== false) {
        const modelId = chat.settings.model;
        let allowedModelIds = new Set(get().zdrModelIds || []);
        if (allowedModelIds.size === 0) {
          try {
            allowedModelIds = await fetchZdrModelIds();
            set({ zdrModelIds: Array.from(allowedModelIds) } as any);
          } catch {}
        }
        if (allowedModelIds.size > 0) {
          if (!allowedModelIds.has(modelId)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not ZDR. Choose a ZDR model in Settings.`,
              },
            }));
          }
        } else {
          // Fallback to provider-based allowance when explicit list unavailable
          let providers = new Set(get().zdrProviderIds || []);
          if (providers.size === 0) {
            try {
              providers = await fetchZdrProviderIds();
              set({ zdrProviderIds: Array.from(providers) } as any);
            } catch {}
          }
          const providerPrefix = (modelId || '').split('/')[0];
          if (!providerPrefix || !providers.has(providerPrefix)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not from a ZDR provider. Choose a ZDR model in Settings.`,
              },
            }));
          }
        }
      }
      const now = Date.now();
      const userMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'user',
        content,
        createdAt: now,
        // Persist full attachments for statefulness across turns (PDF dataURL included)
        attachments: attachments.length ? attachments : undefined,
      };
      const assistantMsg: Message = {
        id: uuidv4(),
        chatId,
        role: 'assistant',
        content: '',
        createdAt: now + 1,
        model: chat.settings.model,
        reasoning: '',
        attachments: [],
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), userMsg, assistantMsg],
        },
        ui: { ...s.ui, isStreaming: true },
      }));
      await saveMessage(userMsg);
      await saveMessage(assistantMsg);

      // DeepResearch branch: if toggled, use server endpoint and attach sources panel
      if (get().ui.nextDeepResearch) {
        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any }) as any);
          set((s) => ({ ui: { ...s.ui, isStreaming: true } }));
          // Indicate loading in sources panel under this assistant message
          set((s) => ({
            ui: {
              ...s.ui,
              braveByMessageId: {
                ...(s.ui.braveByMessageId || {}),
                [assistantMsg.id]: { query: content.trim(), status: 'loading' },
              },
            },
          }));
          const res = await fetch('/api/deep-research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: content, model: chat.settings.model }),
            cache: 'no-store',
            signal: controller.signal,
          } as any);
          const json: any = await res.json().catch(() => ({}));
          const sources = Array.isArray(json?.sources) ? json.sources : [];
          if (!res.ok) throw new Error(json?.error || `deep_failed_${res.status}`);
          // Update sources panel and content
          set((s) => ({
            ui: {
              ...s.ui,
              braveByMessageId: {
                ...(s.ui.braveByMessageId || {}),
                [assistantMsg.id]: { query: content.trim(), status: 'done', results: sources },
              },
              // Toggle off after use (like a sticky toggle, not one-shot)
              nextDeepResearch: s.ui.nextDeepResearch,
            },
          }));
          const final = {
            ...assistantMsg,
            content: json?.answer || '',
          } as any;
          set((s) => {
            const list = s.messages[chatId] ?? [];
            const updated = list.map((m) => (m.id === assistantMsg.id ? final : m));
            return { messages: { ...s.messages, [chatId]: updated } } as any;
          });
          await saveMessage(final);
          set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
          set((s) => ({ ...s, _controller: undefined }) as any);
        } catch (e: any) {
          const msg = String(e?.message || 'DeepResearch failed');
          set((s) => ({
            ui: {
              ...s.ui,
              isStreaming: false,
              notice: `DeepResearch: ${msg}`,
              braveByMessageId: {
                ...(s.ui.braveByMessageId || {}),
                [assistantMsg.id]: { query: content.trim(), status: 'error', error: msg },
              },
            },
          }));
          set((s) => ({ ...s, _controller: undefined }) as any);
        }
        return;
      }

      const msgs = buildChatCompletionMessages({
        chat,
        priorMessages: priorList,
        models: get().models,
        newUserContent: content,
        newUserAttachments: attachments,
      });
      // Enable OpenRouter PDF parsing when any PDFs exist in the conversation
      const plugins = hasPdf ? [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] : undefined;
      if (chat.title === 'New Chat') {
        const draft = content.trim().slice(0, 40);
        await get().renameChat(chat.id, draft || 'New Chat');
      }

      const searchEnabled = !!chat.settings.search_with_brave;
      const searchProvider: 'brave' | 'openrouter' =
        ((chat.settings as any)?.search_provider as any) || 'brave';
      const attemptPlanning =
        !!chat.settings.tutor_mode || (searchEnabled && searchProvider === 'brave');
      const providerSort = get().ui.routePreference === 'cost' ? 'price' : 'throughput';
      const toolPreambleText =
        'You have access to a function tool named "web_search" that retrieves up-to-date web results.\n\nWhen you need current, factual, or source-backed information, call the tool first. If you call a tool, respond with ONLY tool_calls (no user-facing text). After the tool returns, write the final answer that cites sources inline as [n] using the numbering provided.\n\nweb_search(args): { query: string, count?: integer 1-10 }. Choose a focused query and a small count, and avoid unnecessary calls.';
      const tutorPreambleText = getTutorPreamble();
      const preambles: string[] = [];
      if (searchEnabled && searchProvider === 'brave') preambles.push(toolPreambleText);
      if (chat.settings.tutor_mode && tutorPreambleText) preambles.push(tutorPreambleText);
      if (chat.settings.tutor_mode) {
        try {
          const prof = await loadTutorProfile(chat.id);
          const summary = summarizeTutorProfile(prof);
          if (summary) preambles.push(`Learner Profile:\n${summary}`);
        } catch {}
        // Include steering preference once, then clear it
        if (get().ui.nextTutorNudge) {
          const n = get().ui.nextTutorNudge!;
          preambles.push(`Learner Preference: ${n.replace(/_/g, ' ')}`);
          set((s) => ({ ui: { ...s.ui, nextTutorNudge: undefined } }));
        }
      }
      const combinedSystemForThisTurn = attemptPlanning
        ? (preambles.join('\n\n') || undefined) &&
          (chat.settings.system && chat.settings.system.trim()
            ? `${preambles.join('\n\n')}\n\n${chat.settings.system}`
            : preambles.join('\n\n'))
        : undefined;
      if (attemptPlanning) {
        try {
          const controller = new AbortController();
          set((s) => ({ ...s, _controller: controller as any }) as any);
          const tutorTools = chat.settings.tutor_mode
            ? (getTutorToolDefinitions() as any[])
            : ([] as any[]);
          const baseTools = searchEnabled && searchProvider === 'brave'
            ? [
                {
                  type: 'function',
                  function: {
                    name: 'web_search',
                    description:
                      'Search the public web for up-to-date information. Use only when necessary. Return results to ground your answer and cite sources as [n].',
                    parameters: {
                      type: 'object',
                      properties: {
                        query: { type: 'string', description: 'The search query to run.' },
                        count: {
                          type: 'integer',
                          description: 'How many results to retrieve (1-10).',
                          minimum: 1,
                          maximum: 10,
                        },
                      },
                      required: ['query'],
                    },
                  },
                },
              ]
            : [];
          const toolDefinition = [...baseTools, ...tutorTools];
          const planningSystem = { role: 'system', content: combinedSystemForThisTurn! } as const;
          const planningMessages: any[] = [
            planningSystem,
            ...msgs.filter((m) => m.role !== 'system'),
          ];
          let convo = planningMessages.slice();
          let rounds = 0;
          let finalContent: string | null = null;
          let finalUsage: any | undefined = undefined;
          let usedTool = false;
          let usedTutorTool = false; // any tutor tool call (non-web)
          let usedTutorContentTool = false; // interactive content tools (quiz_*, flashcards)
          let aggregatedResults: { title?: string; url?: string; description?: string }[] = [];
          const extractInlineWebSearchArgs = (
            text: string,
          ): { query: string; count?: number } | null => {
            try {
              const candidates: Array<Record<string, any>> = [];
              const jsonMatches = text.match(/\{[\s\S]*?\}/g) || [];
              for (const m of jsonMatches) {
                try {
                  candidates.push(JSON.parse(m));
                } catch {}
              }
              for (const c of candidates) {
                if (typeof c.query === 'string') {
                  const q = String(c.query).trim();
                  if (q) {
                    const cnt = Number.isFinite(c.count)
                      ? Math.max(1, Math.min(10, Math.floor(c.count)))
                      : undefined;
                    return { query: q, count: cnt };
                  }
                }
                if (typeof c.name === 'string' && c.name === 'web_search') {
                  const arg = c.arguments;
                  if (typeof arg === 'string') {
                    try {
                      const inner = JSON.parse(arg);
                      if (inner && typeof inner.query === 'string' && inner.query.trim()) {
                        const cnt = Number.isFinite(inner.count)
                          ? Math.max(1, Math.min(10, Math.floor(inner.count)))
                          : undefined;
                        return { query: inner.query.trim(), count: cnt };
                      }
                    } catch {}
                  } else if (arg && typeof arg === 'object' && typeof arg.query === 'string') {
                    const q = String(arg.query).trim();
                    if (q) {
                      const cnt = Number.isFinite(arg.count)
                        ? Math.max(1, Math.min(10, Math.floor(arg.count)))
                        : undefined;
                      return { query: q, count: cnt };
                    }
                  }
                }
              }
            } catch {}
            return null;
          };
          const extractInlineTutorCalls = (text: string): Array<{ name: string; args: any }> => {
            const out: Array<{ name: string; args: any }> = [];
            if (typeof text !== 'string' || !text) return out;
            const names = [
              'quiz_mcq',
              'quiz_fill_blank',
              'quiz_open_ended',
              'flashcards',
              'grade_open_response',
              'add_to_deck',
              'srs_review',
            ];
            const findJsonAfter = (s: string, from: number): any | undefined => {
              const idx = s.indexOf('{', from);
              if (idx < 0) return undefined;
              let depth = 0;
              let inStr = false;
              let esc = false;
              let end = -1;
              for (let i = idx; i < s.length; i++) {
                const ch = s[i];
                if (esc) {
                  esc = false;
                  continue;
                }
                if (ch === '\\') {
                  esc = true;
                  continue;
                }
                if (ch === '"') inStr = !inStr;
                if (!inStr) {
                  if (ch === '{') depth++;
                  else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                      end = i + 1;
                      break;
                    }
                  }
                }
              }
              if (end < 0) return undefined;
              try {
                return JSON.parse(s.slice(idx, end));
              } catch {
                return undefined;
              }
            };
            for (const name of names) {
              const i = text.indexOf(name);
              if (i < 0) continue;
              // look for ':' or '(' then the first '{'
              const j = Math.max(text.indexOf(':', i), text.indexOf('(', i));
              const from = j >= 0 ? j : i;
              const args = findJsonAfter(text, from);
              if (args && typeof args === 'object') out.push({ name, args });
            }
            return out;
          };

          while (rounds < 3) {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
            const supportsTools = isToolCallingSupported(modelMeta);
            // Store debug payload for planning (non-streaming) request in tutor/plan mode
            try {
              const debugBody: any = {
                model: chat.settings.model,
                messages: convo,
                stream: false,
              };
              if (typeof chat.settings.temperature === 'number')
                debugBody.temperature = chat.settings.temperature;
              if (typeof chat.settings.top_p === 'number') debugBody.top_p = chat.settings.top_p;
              if (typeof chat.settings.max_tokens === 'number')
                debugBody.max_tokens = chat.settings.max_tokens;
              if (supportsReasoning) {
                const rc: any = {};
                if (typeof chat.settings.reasoning_effort === 'string')
                  rc.effort = chat.settings.reasoning_effort;
                if (typeof chat.settings.reasoning_tokens === 'number')
                  rc.max_tokens = chat.settings.reasoning_tokens;
                if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
              }
              if (supportsTools) debugBody.tools = toolDefinition as any;
              if (supportsTools) debugBody.tool_choice = 'auto';
              if (providerSort === 'price' || providerSort === 'throughput') {
                debugBody.provider = { sort: providerSort };
              }
              // Avoid PDF parsing costs during planning; only enable plugins in final streaming call
              // so PDFs are parsed once per user turn.
              // (Leave out debugBody.plugins here.)
              set((s) => ({
                ui: {
                  ...s.ui,
                  debugByMessageId: {
                    ...(s.ui.debugByMessageId || {}),
                    [assistantMsg.id]: {
                      body: JSON.stringify(debugBody, null, 2),
                      createdAt: Date.now(),
                    },
                  },
                },
              }));
            } catch {}
            const resp = await chatCompletion({
              apiKey: key || '',
              model: chat.settings.model,
              messages: convo as any,
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
              reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
              tools: supportsTools ? (toolDefinition as any) : undefined,
              // Let the model decide whether to call the tool when supported
              tool_choice: supportsTools ? ('auto' as any) : undefined,
              signal: controller.signal,
              providerSort,
              // Intentionally omit plugins here to skip parsing PDFs during planning
              // (final streaming call will include plugins if needed)
              plugins: undefined,
            });
            finalUsage = resp?.usage;
            const choice = resp?.choices?.[0];
            const message = choice?.message || {};
            let toolCalls =
              Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
                ? message.tool_calls
                : message?.function_call
                  ? [
                      {
                        id: 'call_0',
                        type: 'function',
                        function: {
                          name: message.function_call.name,
                          arguments: message.function_call.arguments,
                        },
                      },
                    ]
                  : [];
            if ((!toolCalls || toolCalls.length === 0) && typeof message?.content === 'string') {
              const inline = extractInlineWebSearchArgs(message.content);
              if (inline) {
                toolCalls = [
                  {
                    id: 'call_0',
                    type: 'function',
                    function: { name: 'web_search', arguments: JSON.stringify(inline) },
                  },
                ];
              } else {
                const tutorCalls = extractInlineTutorCalls(message.content);
                if (tutorCalls.length > 0) {
                  // Emulate function calls for tutor tools
                  toolCalls = tutorCalls.map((c, idx) => ({
                    id: `inline_${idx}`,
                    type: 'function',
                    function: { name: c.name, arguments: JSON.stringify(c.args) },
                  }));
                }
              }
            }
            if (toolCalls && toolCalls.length > 0) {
              usedTool = true;
              convo.push({ role: 'assistant', content: null, tool_calls: toolCalls } as any);
            }
            // Do not force tool calls; only proceed when the model chooses to call tools
            if (!toolCalls || toolCalls.length === 0) {
              const text = typeof message?.content === 'string' ? message.content : '';
              finalContent = stripLeadingToolJson(text);
              break;
            }
            // Helper to attach tutor payloads; returns { ok, json } where json echos normalized items
            const attachTutorPayload = (
              name: string,
              args: any,
            ): { ok: boolean; json?: string } => {
              const keyId = assistantMsg.id;
              const mapKey =
                name === 'quiz_mcq'
                  ? 'mcq'
                  : name === 'quiz_fill_blank'
                    ? 'fillBlank'
                    : name === 'quiz_open_ended'
                      ? 'openEnded'
                      : name === 'flashcards'
                        ? 'flashcards'
                        : undefined;
              if (!mapKey) return { ok: false };
              try {
                const items: any[] = Array.isArray(args?.items) ? args.items : [];
                if (items.length === 0) return { ok: false };
                const normed = items.slice(0, 40).map((it, idx) => {
                  const raw = (it as any).id;
                  const s = typeof raw === 'string' ? raw.trim() : '';
                  const id = !s || s === 'null' || s === 'undefined' ? uuidv4() : s;
                  return { id, ...it };
                });
                let updatedMsg: any | undefined;
                set((s) => {
                  const nextTutor = {
                    ...(s.ui.tutorByMessageId?.[keyId] || {}),
                    title: s.ui.tutorByMessageId?.[keyId]?.title || args?.title,
                    [mapKey]: [
                      ...((s.ui.tutorByMessageId?.[keyId] as any)?.[mapKey] || []),
                      ...normed,
                    ],
                  } as any;
                  // Update UI map
                  const ui = {
                    ...s.ui,
                    tutorByMessageId: {
                      ...(s.ui.tutorByMessageId || {}),
                      [keyId]: nextTutor,
                    },
                  };
                  // Persist onto the assistant message for durability
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => {
                    if (m.id !== keyId) return m;
                    const prevTutor = (m as any).tutor || {};
                    const mergedTutor = {
                      ...prevTutor,
                      title: prevTutor.title || args?.title,
                      [mapKey]: [...(((prevTutor as any)[mapKey] as any[]) || []), ...normed],
                    } as any;
                    // Build hidden assistant content: recap + full data JSON
                    let hidden = '';
                    try {
                      const recap = buildTutorContextSummary(mergedTutor);
                      const json = buildTutorContextFull(mergedTutor);
                      const parts = [] as string[];
                      if (recap) parts.push(`Tutor Recap:\n${recap}`);
                      if (json) parts.push(`Tutor Data JSON:\n${json}`);
                      hidden = parts.join('\n\n');
                    } catch {}
                    // Replace hiddenContent for this assistant message
                    const nm = { ...m, tutor: mergedTutor, hiddenContent: hidden } as any;
                    updatedMsg = nm;
                    return nm;
                  });
                  return { ui, messages: { ...s.messages, [chatId]: updated } } as any;
                });
                try {
                  if (updatedMsg) void saveMessage(updatedMsg);
                } catch {}
                // Build a normalized JSON payload to send back to the model as tool output
                try {
                  const body: any = { items: normed };
                  if (typeof args?.title === 'string') body.title = args.title;
                  const json = JSON.stringify(body);
                  return { ok: true, json };
                } catch {}
                return { ok: true };
              } catch {
                return { ok: false };
              }
            };
            const attachTutorMeta = async (name: string, args: any) => {
              const keyId = assistantMsg.id;
              if (name === 'grade_open_response') {
                const rawId = args?.item_id;
                const itemId = (() => {
                  const s = typeof rawId === 'string' ? rawId.trim() : '';
                  if (!s || s === 'null' || s === 'undefined') return '';
                  return s;
                })();
                const feedback = String(args?.feedback || '').trim();
                const score = typeof args?.score === 'number' ? args.score : undefined;
                const criteria = Array.isArray(args?.criteria) ? args.criteria : undefined;
                if (!itemId || !feedback) return false;
                let updatedMsg: any | undefined;
                set((s) => {
                  const current = (s.ui.tutorByMessageId?.[keyId] || {}) as any;
                  const nextTutor = {
                    ...current,
                    grading: {
                      ...(current.grading || {}),
                      [itemId]: { feedback, score, criteria },
                    },
                  } as any;
                  const ui = {
                    ...s.ui,
                    tutorByMessageId: {
                      ...(s.ui.tutorByMessageId || {}),
                      [keyId]: nextTutor,
                    },
                  };
                  // Persist grading into message
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => {
                    if (m.id !== keyId) return m;
                    const prevTutor = (m as any).tutor || {};
                    const mergedTutor = {
                      ...prevTutor,
                      grading: {
                        ...(prevTutor.grading || {}),
                        [itemId]: { feedback, score, criteria },
                      },
                    } as any;
                    let hidden = '';
                    try {
                      const recap = buildTutorContextSummary(mergedTutor);
                      const json = buildTutorContextFull(mergedTutor);
                      const parts = [] as string[];
                      if (recap) parts.push(`Tutor Recap:\n${recap}`);
                      if (json) parts.push(`Tutor Data JSON:\n${json}`);
                      hidden = parts.join('\n\n');
                    } catch {}
                    // Replace hiddenContent for this assistant message
                    const nm = { ...m, tutor: mergedTutor, hiddenContent: hidden } as any;
                    updatedMsg = nm;
                    return nm;
                  });
                  return { ui, messages: { ...s.messages, [chatId]: updated } } as any;
                });
                try {
                  if (updatedMsg) await saveMessage(updatedMsg);
                } catch {}
                return true;
              }
              if (name === 'add_to_deck') {
                try {
                  const cards = Array.isArray(args?.cards) ? args.cards : [];
                  if (cards.length > 0) await addCardsToDeck(chat.id, cards);
                } catch {}
                return true;
              }
              if (name === 'srs_review') {
                // handled below when pushing tool output JSON
                return true;
              }
              return false;
            };
            for (const tc of toolCalls) {
              const name = tc?.function?.name as string;
              let args: any = {};
              try {
                const rawArgs = (tc?.function as any)?.arguments;
                if (typeof rawArgs === 'string') args = JSON.parse(rawArgs || '{}');
                else if (rawArgs && typeof rawArgs === 'object') args = rawArgs;
              } catch {}
              if (
                name !== 'web_search' &&
                name !== 'quiz_mcq' &&
                name !== 'quiz_fill_blank' &&
                name !== 'quiz_open_ended' &&
                name !== 'flashcards' &&
                name !== 'grade_open_response' &&
                name !== 'add_to_deck' &&
                name !== 'srs_review'
              )
                continue;
              if (name !== 'web_search') {
                usedTutorTool = true;
                if (
                  name === 'quiz_mcq' ||
                  name === 'quiz_fill_blank' ||
                  name === 'quiz_open_ended' ||
                  name === 'flashcards'
                ) {
                  usedTutorContentTool = true;
                }
                if (name === 'srs_review') {
                  const cnt = Math.min(
                    Math.max(parseInt(String(args?.due_count || '10'), 10) || 10, 1),
                    40,
                  );
                  let due: any[] = [];
                  try {
                    const cards = await getDueCards(chat.id, cnt);
                    due = cards.map((c) => ({
                      id: c.id,
                      front: c.front,
                      back: c.back,
                      hint: c.hint,
                      topic: c.topic,
                      skill: c.skill,
                    }));
                  } catch {}
                  const jsonPayload = JSON.stringify(due);
                  convo.push({
                    role: 'tool',
                    name,
                    tool_call_id: tc.id,
                    content: jsonPayload,
                  } as any);
                  usedTool = true;
                  continue;
                }
                const didMeta = await attachTutorMeta(name, args);
                const result = attachTutorPayload(name, args);
                if (result.ok || didMeta) {
                  usedTool = true;
                  // Provide structured JSON tool output so the model can see the created items
                  convo.push({
                    role: 'tool',
                    name,
                    tool_call_id: tc.id,
                    content: result.json || 'ok',
                  } as any);
                }
                continue;
              }
              let rawQuery = String(args?.query || '').trim();
              const count = Math.min(
                Math.max(parseInt(String(args?.count || '5'), 10) || 5, 1),
                10,
              );
              if (!rawQuery) rawQuery = content.trim().slice(0, 256);
              if (searchProvider === 'brave')
                set((s) => ({
                  ui: {
                    ...s.ui,
                    braveByMessageId: {
                      ...(s.ui.braveByMessageId || {}),
                      [assistantMsg.id]: { query: rawQuery, status: 'loading' },
                    },
                  },
                }));
              try {
                // Per-request controller with timeout, tied to the main controller as well
                const fetchController = new AbortController();
                const onAbort = () => fetchController.abort();
                controller.signal.addEventListener('abort', onAbort);
                const to = setTimeout(() => fetchController.abort(), 20000);
                const res =
                  searchProvider === 'brave'
                    ? await fetch(
                        `/api/brave?q=${encodeURIComponent(rawQuery)}&count=${count}`,
                        {
                          method: 'GET',
                          headers: { Accept: 'application/json' },
                          cache: 'no-store',
                          signal: fetchController.signal,
                        } as any,
                      )
                    : undefined;
                clearTimeout(to);
                controller.signal.removeEventListener('abort', onAbort);
                if (res && res.ok) {
                  const data: any = await res.json();
                  const results = (data?.results || []) as any[];
                  set((s) => ({
                    ui: {
                      ...s.ui,
                      braveByMessageId: {
                        ...(s.ui.braveByMessageId || {}),
                        [assistantMsg.id]: { query: rawQuery, status: 'done', results },
                      },
                    },
                  }));
                  aggregatedResults = results;
                  // Provide structured JSON tool output per OpenRouter function-calling docs
                  const jsonPayload = JSON.stringify(
                    results.slice(0, MAX_FALLBACK_RESULTS).map((r: any) => ({
                      title: r?.title,
                      url: r?.url,
                      description: r?.description,
                    })),
                  );
                  convo.push({
                    role: 'tool',
                    name: 'web_search',
                    tool_call_id: tc.id,
                    content: jsonPayload,
                  } as any);
                } else {
                  if (res && res.status === 400)
                    set((s) => ({ ui: { ...s.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
                  convo.push({
                    role: 'tool',
                    name: 'web_search',
                    tool_call_id: tc.id,
                    content: 'No results',
                  } as any);
                }
              } catch {
                if (searchProvider === 'brave')
                  set((s) => ({
                    ui: {
                      ...s.ui,
                      braveByMessageId: {
                        ...(s.ui.braveByMessageId || {}),
                        [assistantMsg.id]: {
                          query: rawQuery,
                          status: 'error',
                          results: [],
                          error: 'Network error',
                        },
                      },
                    },
                  }));
                convo.push({
                  role: 'tool',
                  name: 'web_search',
                  tool_call_id: tc.id,
                  content: 'No results',
                } as any);
              }
            }
            const followup = searchEnabled && searchProvider === 'brave'
              ? 'Write the final answer. Cite sources inline as [n].'
              : 'Continue the lesson concisely. Give brief guidance and next step. Do not repeat items already rendered.';
            convo.push({ role: 'user', content: followup } as any);
            rounds++;
          }
          // Stream the final answer using planning context (optionally including search results)
          const baseSystem =
            combinedSystemForThisTurn || chat.settings.system || 'You are a helpful assistant.';
          const linesForSystem = (aggregatedResults || [])
            .slice(0, MAX_FALLBACK_RESULTS)
            .map(
              (r, i) =>
                `${i + 1}. ${(r.title || r.url || 'Result').toString()} — ${r.url || ''}${r.description ? ` — ${r.description}` : ''}`,
            )
            .join('\n');
          const sourcesBlock =
            usedTool && linesForSystem && searchProvider === 'brave'
              ? `\n\nWeb search results (Brave):\n${linesForSystem}\n\nInstructions: Use these results to answer and cite sources inline as [n].`
              : '';
          const finalSystem = `${baseSystem}${sourcesBlock}`;
          // Snapshot the exact system + generation settings for this assistant turn
          try {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
            const gen = {
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
              reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
              search_with_brave: !!chat.settings.search_with_brave,
              search_provider: searchProvider,
              tutor_mode: !!chat.settings.tutor_mode,
              providerSort,
            } as any;
            set((s) => {
              const list = s.messages[chatId] ?? [];
              const updated = list.map((m) =>
                m.id === assistantMsg.id
                  ? ({ ...m, systemSnapshot: finalSystem, genSettings: gen } as any)
                  : m,
              );
              return { messages: { ...s.messages, [chatId]: updated } } as any;
            });
          } catch {}
          // If an interactive tutor content tool was used (quiz/flashcards) and no web search occurred,
          // skip follow-up text for this assistant turn to avoid duplicating quiz in plain text.
          if (usedTutorContentTool && (!aggregatedResults || aggregatedResults.length === 0)) {
            set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
            const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
            const finalMsg = {
              ...assistantMsg,
              // Preserve any content that may have been appended when handling the tool call
              content: current?.content || '',
              reasoning: current?.reasoning,
              attachments: current?.attachments,
              // Preserve tutor payload and hidden content for model context
              tutor: (current as any)?.tutor,
              hiddenContent: (current as any)?.hiddenContent,
            } as any;
            set((s) => {
              const list = s.messages[chatId] ?? [];
              const updated = list.map((m) => (m.id === assistantMsg.id ? finalMsg : m));
              return { messages: { ...s.messages, [chatId]: updated } } as any;
            });
            await saveMessage(finalMsg);
            set((s) => ({ ...s, _controller: undefined }) as any);
            return;
          }
          const streamingMessages = (
            [{ role: 'system', content: finalSystem } as const] as any[]
          ).concat(msgs.filter((m) => m.role !== 'system'));

          const tStartPlan = performance.now();
          let tFirstPlan: number | undefined;
          let startedStreamingContentPlan = true; // content should be user-facing now
          let leadingBufferPlan = '';
          {
            const modelMeta = findModelById(get().models, chat.settings.model);
            const supportsReasoning = isReasoningSupported(modelMeta);
            const supportsTools = isToolCallingSupported(modelMeta);
            // Store debug payload for this final streaming call (planning mode)
            try {
              const debugBody: any = {
                model: chat.settings.model,
                messages: streamingMessages,
                stream: true,
                stream_options: { include_usage: true },
              };
              if (isImageOutputSupported(modelMeta)) debugBody.modalities = ['image', 'text'];
              if (typeof chat.settings.temperature === 'number')
                debugBody.temperature = chat.settings.temperature;
              if (typeof chat.settings.top_p === 'number') debugBody.top_p = chat.settings.top_p;
              if (typeof chat.settings.max_tokens === 'number')
                debugBody.max_tokens = chat.settings.max_tokens;
              if (supportsReasoning) {
                const rc: any = {};
                if (typeof chat.settings.reasoning_effort === 'string')
                  rc.effort = chat.settings.reasoning_effort;
                if (typeof chat.settings.reasoning_tokens === 'number')
                  rc.max_tokens = chat.settings.reasoning_tokens;
                if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
              }
              if (supportsTools) {
                debugBody.tools = toolDefinition as any;
                debugBody.tool_choice = 'none';
              }
              if (providerSort === 'price' || providerSort === 'throughput') {
                debugBody.provider = { sort: providerSort };
              }
              // For standard mode, include PDF parser and OpenRouter web plugin when selected
              const combinedPluginsStd = (() => {
                const arr: any[] = [];
                if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
                if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
                return arr;
              })();
              if (combinedPluginsStd.length > 0) debugBody.plugins = combinedPluginsStd;
              set((s) => ({
                ui: {
                  ...s.ui,
                  debugByMessageId: {
                    ...(s.ui.debugByMessageId || {}),
                    [assistantMsg.id]: {
                      body: JSON.stringify(debugBody, null, 2),
                      createdAt: Date.now(),
                    },
                  },
                },
              }));
            } catch {}
            await streamChatCompletion({
              apiKey: key || '',
              model: chat.settings.model,
              messages: streamingMessages,
              modalities: isImageOutputSupported(modelMeta)
                ? (['image', 'text'] as any)
                : undefined,
              temperature: chat.settings.temperature,
              top_p: chat.settings.top_p,
              max_tokens: chat.settings.max_tokens,
              reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
              reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
              signal: controller.signal,
              // Include tool schema for validation on follow-up call; disable further tool use
              tools: supportsTools ? (toolDefinition as any) : undefined,
              tool_choice: supportsTools ? ('none' as any) : undefined,
              providerSort,
              plugins: (() => {
                const arr: any[] = [];
                if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
                if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
                return arr.length > 0 ? arr : undefined;
              })(),
              callbacks: {
                onAnnotations: (ann) => {
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) =>
                      m.id === assistantMsg.id ? ({ ...m, annotations: ann } as any) : m,
                    );
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                },
                onImage: (dataUrl) => {
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) => {
                      if (m.id !== assistantMsg.id) return m;
                      const prev = Array.isArray(m.attachments) ? m.attachments : [];
                      if (prev.some((a) => a.kind === 'image' && a.dataURL === dataUrl)) return m;
                      const mime = (() => {
                        const m = dataUrl.slice(5, dataUrl.indexOf(';'));
                        return m || 'image/png';
                      })();
                      const next = [
                        ...prev,
                        {
                          id: uuidv4(),
                          kind: 'image',
                          name: 'generated',
                          mime,
                          dataURL: dataUrl,
                        },
                      ];
                      return { ...m, attachments: next } as any;
                    });
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                },
                onToken: (delta) => {
                  if (tFirstPlan == null) tFirstPlan = performance.now();
                  if (!startedStreamingContentPlan) {
                    leadingBufferPlan += delta;
                    const hasStructure =
                      leadingBufferPlan.trimStart().startsWith('{') ||
                      leadingBufferPlan.trimStart().startsWith('```');
                    if (hasStructure) {
                      const stripped = stripLeadingToolJson(leadingBufferPlan);
                      const rest = stripped.trimStart();
                      if (rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
                        startedStreamingContentPlan = true;
                        const toEmit = stripped;
                        leadingBufferPlan = '';
                        set((s) => {
                          const list = s.messages[chatId] ?? [];
                          const updated = list.map((m) =>
                            m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                          );
                          return { messages: { ...s.messages, [chatId]: updated } } as any;
                        });
                      }
                    } else if (leadingBufferPlan.length > 512) {
                      startedStreamingContentPlan = true;
                      const toEmit = leadingBufferPlan;
                      leadingBufferPlan = '';
                      set((s) => {
                        const list = s.messages[chatId] ?? [];
                        const updated = list.map((m) =>
                          m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                        );
                        return { messages: { ...s.messages, [chatId]: updated } } as any;
                      });
                    }
                  } else {
                    set((s) => {
                      const list = s.messages[chatId] ?? [];
                      const updated = list.map((m) =>
                        m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
                      );
                      return { messages: { ...s.messages, [chatId]: updated } } as any;
                    });
                  }
                },
                onReasoningToken: (delta) => {
                  if (tFirstPlan == null) tFirstPlan = performance.now();
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, reasoning: (m.reasoning || '') + delta }
                        : m,
                    );
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                },
                onDone: async (full, extras) => {
                  set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
                  const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
                  const tEnd = performance.now();
                  const ttftMs = tFirstPlan
                    ? Math.max(0, Math.round(tFirstPlan - tStartPlan))
                    : undefined;
                  const completionMs = Math.max(0, Math.round(tEnd - tStartPlan));
                  const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
                  const completionTokens =
                    extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                  const tokensPerSec =
                    completionTokens && completionMs
                      ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                      : undefined;
                  const finalMsg = {
                    ...assistantMsg,
                    content: stripLeadingToolJson(full || ''),
                    reasoning: current?.reasoning,
                    attachments: current?.attachments,
                    systemSnapshot: (current as any)?.systemSnapshot,
                    genSettings: (current as any)?.genSettings,
                    metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                    tokensIn: promptTokens,
                    tokensOut: completionTokens,
                  } as any;
                  // telemetry posting removed
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) => (m.id === assistantMsg.id ? finalMsg : m));
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                  await saveMessage(finalMsg);
                  set((s) => ({ ...s, _controller: undefined }) as any);
                },
                onError: (err) => {
                  set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                  set((s) => ({ ...s, _controller: undefined }) as any);
                },
              },
            });
          }
          return;
        } catch (e: any) {
          if (e?.message === 'unauthorized')
            set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
          if (e?.message === 'rate_limited')
            set((s) => ({
              ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
            }));
          set((s) => ({ ...s, _controller: undefined }) as any);
          return;
        }
      }

      try {
        const controller = new AbortController();
        set((s) => ({ ...s, _controller: controller as any }) as any);
        const tStart = performance.now();
        let tFirst: number | undefined;
        // No automatic fallback web search; the model will call the tool when necessary
        const streamingMessages = msgs;
        let startedStreamingContent = attemptPlanning ? false : true;
        let leadingBuffer = '';
        {
          const modelMeta = findModelById(get().models, chat.settings.model);
          const supportsReasoning = isReasoningSupported(modelMeta);
          // Store debug payload for this streaming call (standard mode)
          try {
            const debugBody: any = {
              model: chat.settings.model,
              messages: streamingMessages,
              stream: true,
              stream_options: { include_usage: true },
            };
            if (isImageOutputSupported(modelMeta)) debugBody.modalities = ['image', 'text'];
            if (typeof chat.settings.temperature === 'number')
              debugBody.temperature = chat.settings.temperature;
            if (typeof chat.settings.top_p === 'number') debugBody.top_p = chat.settings.top_p;
            if (typeof chat.settings.max_tokens === 'number')
              debugBody.max_tokens = chat.settings.max_tokens;
            if (supportsReasoning) {
              const rc: any = {};
              if (typeof chat.settings.reasoning_effort === 'string')
                rc.effort = chat.settings.reasoning_effort;
              if (typeof chat.settings.reasoning_tokens === 'number')
                rc.max_tokens = chat.settings.reasoning_tokens;
              if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
            }
            if (providerSort === 'price' || providerSort === 'throughput') {
              debugBody.provider = { sort: providerSort };
            }
            const combinedPluginsStd = (() => {
              const arr: any[] = [];
              if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
              if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
              return arr;
            })();
            if (combinedPluginsStd.length > 0) debugBody.plugins = combinedPluginsStd;
            set((s) => ({
              ui: {
                ...s.ui,
                debugByMessageId: {
                  ...(s.ui.debugByMessageId || {}),
                  [assistantMsg.id]: {
                    body: JSON.stringify(debugBody, null, 2),
                    createdAt: Date.now(),
                  },
                },
              },
            }));
          } catch {}
          await streamChatCompletion({
            apiKey: key || '',
            model: chat.settings.model,
            messages: streamingMessages,
            modalities: isImageOutputSupported(modelMeta) ? (['image', 'text'] as any) : undefined,
            temperature: chat.settings.temperature,
            top_p: chat.settings.top_p,
            max_tokens: chat.settings.max_tokens,
            reasoning_effort: supportsReasoning ? chat.settings.reasoning_effort : undefined,
            reasoning_tokens: supportsReasoning ? chat.settings.reasoning_tokens : undefined,
            signal: controller.signal,
            providerSort,
            plugins: (() => {
              const arr: any[] = [];
              if (Array.isArray(plugins) && plugins.length > 0) arr.push(...plugins);
              if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
              return arr.length > 0 ? arr : undefined;
            })(),
            callbacks: {
              onAnnotations: (ann) => {
                // Persist annotations on the assistant message so future turns can skip PDF re-parsing
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) =>
                    m.id === assistantMsg.id ? ({ ...m, annotations: ann } as any) : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onImage: (dataUrl) => {
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => {
                    if (m.id !== assistantMsg.id) return m;
                    const prev = Array.isArray(m.attachments) ? m.attachments : [];
                    if (prev.some((a) => a.kind === 'image' && a.dataURL === dataUrl)) return m;
                    const mime = (() => {
                      const m = dataUrl.slice(5, dataUrl.indexOf(';'));
                      return m || 'image/png';
                    })();
                    const next = [
                      ...prev,
                      {
                        id: uuidv4(),
                        kind: 'image',
                        name: 'generated',
                        mime,
                        dataURL: dataUrl,
                      },
                    ];
                    return { ...m, attachments: next } as any;
                  });
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                if (!startedStreamingContent) {
                  leadingBuffer += delta;
                  const hasStructure =
                    leadingBuffer.trimStart().startsWith('{') ||
                    leadingBuffer.trimStart().startsWith('```');
                  if (hasStructure) {
                    const stripped = stripLeadingToolJson(leadingBuffer);
                    const rest = stripped.trimStart();
                    if (rest && !(rest.startsWith('{') || rest.startsWith('```'))) {
                      startedStreamingContent = true;
                      const toEmit = stripped;
                      leadingBuffer = '';
                      set((s) => {
                        const list = s.messages[chatId] ?? [];
                        const updated = list.map((m) =>
                          m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                        );
                        return { messages: { ...s.messages, [chatId]: updated } } as any;
                      });
                    }
                  } else if (leadingBuffer.length > 512) {
                    startedStreamingContent = true;
                    const toEmit = leadingBuffer;
                    leadingBuffer = '';
                    set((s) => {
                      const list = s.messages[chatId] ?? [];
                      const updated = list.map((m) =>
                        m.id === assistantMsg.id ? { ...m, content: m.content + toEmit } : m,
                      );
                      return { messages: { ...s.messages, [chatId]: updated } } as any;
                    });
                  }
                } else {
                  set((s) => {
                    const list = s.messages[chatId] ?? [];
                    const updated = list.map((m) =>
                      m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m,
                    );
                    return { messages: { ...s.messages, [chatId]: updated } } as any;
                  });
                }
              },
              onReasoningToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) =>
                    m.id === assistantMsg.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onDone: async (full, extras) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
                const current = get().messages[chatId]?.find((m) => m.id === assistantMsg.id);
                const tEnd = performance.now();
                const ttftMs = tFirst ? Math.max(0, Math.round(tFirst - tStart)) : undefined;
                const completionMs = Math.max(0, Math.round(tEnd - tStart));
                const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
                const completionTokens =
                  extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec =
                  completionTokens && completionMs
                    ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                    : undefined;
                const final = {
                  ...assistantMsg,
                  content: stripLeadingToolJson(full || ''),
                  reasoning: current?.reasoning,
                  attachments: current?.attachments,
                  systemSnapshot: (current as any)?.systemSnapshot,
                  genSettings: (current as any)?.genSettings,
                  tutor: (current as any)?.tutor,
                  hiddenContent: (current as any)?.hiddenContent,
                  annotations: (current as any)?.annotations || extras?.annotations,
                  metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                  tokensIn: promptTokens,
                  tokensOut: completionTokens,
                } as any;
                set((s) => {
                  const list = s.messages[chatId] ?? [];
                  const updated = list.map((m) => (m.id === assistantMsg.id ? final : m));
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
                await saveMessage(final);
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
              onError: (err) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
            },
          });
        }
      } catch (e: any) {
        if (e?.message === 'unauthorized')
          set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
        if (e?.message === 'rate_limited')
          set((s) => ({
            ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
          }));
        set((s) => ({ ...s, _controller: undefined }) as any);
      }
    },

    stopStreaming() {
      const controller = (get() as any)._controller as AbortController | undefined;
      controller?.abort();
      set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
      set((s) => ({ ...s, _controller: undefined }) as any);
    },

    async editUserMessage(messageId, newContent, opts) {
      const chatId = get().selectedChatId!;
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'user') return;
      const updated = { ...target, content: newContent };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
        },
      }));
      await saveMessage(updated);
      if (opts?.rerun) {
        if (get().ui.isStreaming) get().stopStreaming();
        const nextAssistant = (get().messages[chatId] ?? [])
          .slice(idx + 1)
          .find((m) => m.role === 'assistant');
        if (nextAssistant)
          get()
            .regenerateAssistantMessage(nextAssistant.id)
            .catch(() => void 0);
      }
    },

    async editAssistantMessage(messageId, newContent) {
      const chatId = get().selectedChatId!;
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = list[idx];
      if (target.role !== 'assistant') return;
      const updated = { ...target, content: newContent } as Message;
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] ?? []).map((m) => (m.id === messageId ? updated : m)),
        },
      }));
      await saveMessage(updated);
    },

    async regenerateAssistantMessage(messageId, opts) {
      const useProxy = process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
      const key = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY as string | undefined;
      if (!key && !useProxy)
        return set((s) => ({
          ui: { ...s.ui, notice: 'Missing NEXT_PUBLIC_OPENROUTER_API_KEY in .env' },
        }));
      const chatId = get().selectedChatId!;
      const chat = get().chats.find((c) => c.id === chatId)!;
      // ZDR enforcement for regenerate with provider fallback
      if (get().ui.zdrOnly !== false) {
        const modelId = opts?.modelId || chat.settings.model;
        let allowedModelIds = new Set(get().zdrModelIds || []);
        if (allowedModelIds.size === 0) {
          try {
            allowedModelIds = await fetchZdrModelIds();
            set({ zdrModelIds: Array.from(allowedModelIds) } as any);
          } catch {}
        }
        if (allowedModelIds.size > 0) {
          if (!allowedModelIds.has(modelId)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not ZDR. Choose a ZDR model in Settings.`,
              },
            }));
          }
        } else {
          let providers = new Set(get().zdrProviderIds || []);
          if (providers.size === 0) {
            try {
              providers = await fetchZdrProviderIds();
              set({ zdrProviderIds: Array.from(providers) } as any);
            } catch {}
          }
          const providerPrefix = (modelId || '').split('/')[0];
          if (!providerPrefix || !providers.has(providerPrefix)) {
            return set((s) => ({
              ui: {
                ...s.ui,
                notice: `ZDR-only is enabled. The selected model (\n${modelId}\n) is not from a ZDR provider. Choose a ZDR model in Settings.`,
              },
            }));
          }
        }
      }
      const list = get().messages[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const payloadBefore = buildChatCompletionMessages({
        chat,
        priorMessages: list.slice(0, idx),
        models: get().models,
      });
      // Prefer the exact system snapshot captured when the original assistant message was generated
      // so regen reproduces the same context regardless of current chat settings.
      const original = list[idx] as any;
      const systemSnapshot: string | undefined = original?.systemSnapshot;
      const genSnapshot: any = original?.genSettings || {};
      const msgs = systemSnapshot
        ? ([{ role: 'system', content: systemSnapshot } as const] as any[]).concat(
            payloadBefore.filter((m: any) => m.role !== 'system'),
          )
        : payloadBefore;
      // Detect PDFs anywhere prior to this assistant message to enable parser plugin
      const hadPdfEarlier = list
        .slice(0, idx)
        .some(
          (m) => Array.isArray(m.attachments) && m.attachments.some((a: any) => a?.kind === 'pdf'),
        );
      const replacement: Message = {
        id: messageId,
        chatId,
        role: 'assistant',
        content: '',
        createdAt: list[idx].createdAt,
        model: opts?.modelId || chat.settings.model,
        reasoning: '',
        attachments: [],
        systemSnapshot: (original as any)?.systemSnapshot,
        genSettings: (original as any)?.genSettings,
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: list.map((m) => (m.id === messageId ? replacement : m)),
        },
        ui: { ...s.ui, isStreaming: true },
      }));
      try {
        const controller = new AbortController();
        set((s) => ({ ...s, _controller: controller as any }) as any);
        const tStart = performance.now();
        let tFirst: number | undefined;
        {
          const modelMeta = findModelById(get().models, replacement.model!);
          const supportsReasoning = isReasoningSupported(modelMeta);
          const tempUsed =
            typeof genSnapshot.temperature === 'number'
              ? genSnapshot.temperature
              : chat.settings.temperature;
          const topPUsed =
            typeof genSnapshot.top_p === 'number' ? genSnapshot.top_p : chat.settings.top_p;
          const maxTokUsed =
            typeof genSnapshot.max_tokens === 'number'
              ? genSnapshot.max_tokens
              : chat.settings.max_tokens;
          const rEffortUsed = supportsReasoning
            ? (genSnapshot.reasoning_effort ?? chat.settings.reasoning_effort)
            : undefined;
          const rTokUsed = supportsReasoning
            ? (genSnapshot.reasoning_tokens ?? chat.settings.reasoning_tokens)
            : undefined;
          // Store debug payload for regenerate streaming call (using snapshot where available)
          try {
            const debugBody: any = {
              model: replacement.model!,
              messages: msgs,
              stream: true,
              stream_options: { include_usage: true },
            };
            if (hadPdfEarlier)
              debugBody.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
            if ((genSnapshot?.search_provider || (chat.settings as any)?.search_provider) === 'openrouter') {
              debugBody.plugins = [...(debugBody.plugins || []), { id: 'web' }];
            }
            if (isImageOutputSupported(modelMeta)) debugBody.modalities = ['image', 'text'];
            if (typeof tempUsed === 'number') debugBody.temperature = tempUsed;
            if (typeof topPUsed === 'number') debugBody.top_p = topPUsed;
            if (typeof maxTokUsed === 'number') debugBody.max_tokens = maxTokUsed;
            if (supportsReasoning) {
              const rc: any = {};
              if (typeof rEffortUsed === 'string') rc.effort = rEffortUsed;
              if (typeof rTokUsed === 'number') rc.max_tokens = rTokUsed;
              if (Object.keys(rc).length > 0) debugBody.reasoning = rc;
            }
            if (
              genSnapshot?.providerSort === 'price' ||
              genSnapshot?.providerSort === 'throughput'
            ) {
              debugBody.provider = { sort: genSnapshot.providerSort };
            }
            set((s) => ({
              ui: {
                ...s.ui,
                debugByMessageId: {
                  ...(s.ui.debugByMessageId || {}),
                  [replacement.id]: {
                    body: JSON.stringify(debugBody, null, 2),
                    createdAt: Date.now(),
                  },
                },
              },
            }));
          } catch {}
          await streamChatCompletion({
            apiKey: key || '',
            model: replacement.model!,
            messages: msgs,
            modalities: isImageOutputSupported(modelMeta) ? (['image', 'text'] as any) : undefined,
            temperature: tempUsed,
            top_p: topPUsed,
            max_tokens: maxTokUsed,
            reasoning_effort: rEffortUsed,
            reasoning_tokens: rTokUsed,
            signal: controller.signal,
            providerSort: genSnapshot?.providerSort,
            plugins: (() => {
              const arr: any[] = [];
              if (hadPdfEarlier) arr.push({ id: 'file-parser', pdf: { engine: 'pdf-text' } });
              const prov = genSnapshot?.search_provider || (chat.settings as any)?.search_provider;
              if (prov === 'openrouter') arr.push({ id: 'web' });
              return arr.length > 0 ? arr : undefined;
            })(),
            callbacks: {
              onAnnotations: (ann) => {
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) =>
                    m.id === replacement.id ? ({ ...m, annotations: ann } as any) : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onImage: (dataUrl) => {
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) => {
                    if (m.id !== replacement.id) return m;
                    const prev = Array.isArray(m.attachments) ? m.attachments : [];
                    if (prev.some((a) => a.kind === 'image' && a.dataURL === dataUrl)) return m;
                    const mime = (() => {
                      const m = dataUrl.slice(5, dataUrl.indexOf(';'));
                      return m || 'image/png';
                    })();
                    const next = [
                      ...prev,
                      {
                        id: uuidv4(),
                        kind: 'image',
                        name: 'generated',
                        mime,
                        dataURL: dataUrl,
                      },
                    ];
                    return { ...m, attachments: next } as any;
                  });
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onToken: (delta) => {
                if (tFirst == null) tFirst = performance.now();
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) =>
                    m.id === replacement.id ? { ...m, content: m.content + delta } : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onReasoningToken: (delta) => {
                set((s) => {
                  const list2 = s.messages[chatId] ?? [];
                  const updated = list2.map((m) =>
                    m.id === replacement.id ? { ...m, reasoning: (m.reasoning || '') + delta } : m,
                  );
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
              },
              onDone: async (full, extras) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false } }));
                const current = get().messages[chatId]?.find((m) => m.id === replacement.id);
                const tEnd = performance.now();
                const ttftMs = tFirst ? Math.max(0, Math.round(tFirst - tStart)) : undefined;
                const completionMs = Math.max(0, Math.round(tEnd - tStart));
                const promptTokens = extras?.usage?.prompt_tokens ?? extras?.usage?.input_tokens;
                const completionTokens =
                  extras?.usage?.completion_tokens ?? extras?.usage?.output_tokens;
                const tokensPerSec =
                  completionTokens && completionMs
                    ? +(completionTokens / (completionMs / 1000)).toFixed(2)
                    : undefined;
                const final = {
                  ...replacement,
                  content: full,
                  reasoning: current?.reasoning,
                  attachments: current?.attachments,
                  annotations: (current as any)?.annotations || extras?.annotations,
                  metrics: { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec },
                  tokensIn: promptTokens,
                  tokensOut: completionTokens,
                } as any;
                // telemetry posting removed
                set((s) => {
                  const list3 = s.messages[chatId] ?? [];
                  const updated = list3.map((m) => (m.id === replacement.id ? final : m));
                  return { messages: { ...s.messages, [chatId]: updated } } as any;
                });
                await saveMessage(final);
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
              onError: (err) => {
                set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: err.message } }));
                set((s) => ({ ...s, _controller: undefined }) as any);
              },
            },
          });
        }
      } catch (e: any) {
        if (e?.message === 'unauthorized')
          set((s) => ({ ui: { ...s.ui, isStreaming: false, notice: 'Invalid API key' } }));
        if (e?.message === 'rate_limited')
          set((s) => ({
            ui: { ...s.ui, isStreaming: false, notice: 'Rate limited. Retry later.' },
          }));
        set((s) => ({ ...s, _controller: undefined }) as any);
      }
    },
  } satisfies Partial<StoreState>;
}
