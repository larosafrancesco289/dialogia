import type { ToolDefinition } from '@/lib/transport/contracts';
import { getWebSearchToolDefinition } from '@/lib/tools/definitions';

export function getSearchToolDefinition(): ToolDefinition[] {
  return getWebSearchToolDefinition();
}
