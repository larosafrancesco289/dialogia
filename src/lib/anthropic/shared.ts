import type { ModelMessage, ToolCall, ToolDefinition } from '@/lib/agent/types';
import { isRecord } from '@/lib/utils/guards';
import type {
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicToolChoice,
  AnthropicToolDefinition,
} from '@/lib/types/transport';

export const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_ID_PREFIX = /^anthropic[#:/]/i;

export function toAnthropicModelId(appModelId: string): string {
  if (!appModelId) return appModelId;
  if (ANTHROPIC_ID_PREFIX.test(appModelId)) {
    return appModelId.replace(ANTHROPIC_ID_PREFIX, '');
  }
  return appModelId;
}

function parseJson(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function convertToolDefinition(tool: ToolDefinition): AnthropicToolDefinition | null {
  if (!tool?.function?.name) return null;
  const input_schema = (tool.function.parameters && typeof tool.function.parameters === 'object'
    ? tool.function.parameters
    : { type: 'object', properties: {} }) ?? { type: 'object', properties: {} };
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema,
  };
}

export function convertToolChoice(
  choice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined,
): AnthropicToolChoice | undefined {
  if (!choice) return undefined;
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  if (typeof choice === 'object' && choice?.function?.name) {
    return { type: 'tool', name: choice.function.name };
  }
  return undefined;
}

function isDataUrl(url?: string): boolean {
  return typeof url === 'string' && url.startsWith('data:');
}

function extractBase64FromDataUrl(url?: string): { mediaType: string; data: string } | null {
  if (!url) return null;
  const match = /^data:([^;]+);base64,(.+)$/i.exec(url);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

function convertModelContentToAnthropic(content: ModelMessage['content']): AnthropicContentBlock[] {
  if (content == null) return [];
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed ? [{ type: 'text', text: trimmed }] : [];
  }
  if (!Array.isArray(content)) return [];
  const results: AnthropicContentBlock[] = [];
  for (const block of content) {
    if (!block) continue;
    if (block.type === 'text') {
      if (block.text?.trim()) results.push({ type: 'text', text: block.text });
      continue;
    }
    if (block.type === 'image_url') {
      const url = block.image_url?.url;
      if (!url) continue;
      if (isDataUrl(url)) {
        const parsed = extractBase64FromDataUrl(url);
        if (parsed) {
          results.push({
            type: 'image',
            source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
          });
        }
      } else {
        results.push({ type: 'image', source: { type: 'url', url } });
      }
      continue;
    }
    if (block.type === 'file') {
      // Files (e.g., PDFs) are not yet supported for direct Anthropics calls; skip for now.
      continue;
    }
    if (block.type === 'input_audio') {
      // Audio inputs not yet supported for Anthropics transport.
      continue;
    }
  }
  return results;
}

export function partitionSystemMessages(messages: ModelMessage[]): {
  system?: string;
  rest: ModelMessage[];
} {
  const rest: ModelMessage[] = [];
  const systemParts: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        systemParts.push(msg.content.trim());
      } else if (Array.isArray(msg.content)) {
        const text = msg.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .filter(Boolean)
          .join('\n');
        if (text.trim()) systemParts.push(text.trim());
      }
      continue;
    }
    rest.push(msg);
  }
  const system = systemParts.length ? systemParts.join('\n\n') : undefined;
  return { system, rest };
}

export function toAnthropicMessages(messages: ModelMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'tool') {
      const blocks: AnthropicContentBlock[] = [
        {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id || 'tool',
          content: msg.content
            ? [
                {
                  type: 'text',
                  text: typeof msg.content === 'string' ? msg.content : String(msg.content),
                },
              ]
            : undefined,
        },
      ];
      out.push({ role: 'user', content: blocks });
      continue;
    }
    if (msg.role === 'assistant') {
      const blocks = convertModelContentToAnthropic(msg.content);
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
        for (const toolCall of msg.tool_calls as ToolCall[]) {
          const args =
            typeof toolCall.function?.arguments === 'string'
              ? parseJson(toolCall.function.arguments)
              : isRecord(toolCall.function?.arguments)
                ? toolCall.function.arguments
                : {};
          blocks.push({
            type: 'tool_use',
            id: toolCall.id || toolCall.function?.name || `tool_${blocks.length}`,
            name: toolCall.function?.name || 'tool',
            input: args,
          });
        }
      }
      out.push({
        role: 'assistant',
        content: blocks.length ? blocks : [{ type: 'text', text: '' }],
      });
      continue;
    }
    if (msg.role === 'user') {
      const blocks = convertModelContentToAnthropic(msg.content);
      if (!blocks.length && typeof msg.content === 'string') {
        blocks.push({ type: 'text', text: msg.content });
      }
      out.push({ role: 'user', content: blocks.length ? blocks : [{ type: 'text', text: '' }] });
      continue;
    }
  }
  return out;
}
