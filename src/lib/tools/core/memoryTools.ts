// Module: tools/core/memoryTools
// Responsibility: The core memory_read / memory_save / memory_forget tools: handlers
// plus registration. What a call changes is decided in `memory/writes`; the reply
// keeps each change (`Message.memoryWrites`) so the person sees it and can undo it.

import { v4 as uuidv4 } from 'uuid';
import { loadLearningRecords } from '@/lib/modules';
import { notesIn, orderedFolders } from '@/lib/memory/notebook';
import { noteLine } from '@/lib/memory/prompt';
import {
  folderPath,
  noteHandle,
  planForget,
  planSave,
  resolveFolder,
  type WritePlan,
} from '@/lib/memory/writes';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import {
  MEMORY_FORGET_TOOL,
  MEMORY_READ_TOOL,
  MEMORY_SAVE_TOOL,
} from '@/lib/tools/definitions/memory';
import type { ToolExecutionContext, ToolResult } from '@/lib/tools/execution';
import { getToolLogCategory, registerTool, type PlanningToolHandler } from '@/lib/tools/registry';
import { MEMORY_LEARNING_FOLDER_ID } from '@/lib/types';
import type { StoreGetter } from '@/lib/store/types';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const done = (result: ToolResult) => ({
  usedTool: result.ok,
  usedContentTool: false,
  result,
});

const readMemory: PlanningToolHandler = async ({ parsedArgs, context }) => {
  const { folders, notes } = context.get().memory;
  const folder = resolveFolder(folders, text(parsedArgs.folder));
  if (!folder) {
    return done({
      ok: false,
      error: `There is no folder "${text(parsedArgs.folder)}".`,
      hint: 'Use a folder name from the memory index.',
    });
  }
  const subfolders = orderedFolders(folders)
    .filter(({ folder: f }) => f.parentId === folder.id)
    .map(({ folder: f }) => `${folderPath(folders, f)}: ${f.description}`);
  const tutorChats =
    folder.id === MEMORY_LEARNING_FOLDER_ID
      ? // The turn's store is the whole store; its type names only core fields.
        (await loadLearningRecords({ get: context.get as unknown as StoreGetter })).map(
          (record) => ({
            goal: record.goal,
            finished: record.finished,
            topics: record.topics.map(
              (t) => `${t.name}: ${t.status}${t.percent !== undefined ? `, ${t.percent}%` : ''}`,
            ),
          }),
        )
      : undefined;
  return done({
    ok: true,
    folder: folderPath(folders, folder),
    description: folder.description,
    notes: notesIn(notes, folder.id).map(noteLine),
    ...(subfolders.length ? { subfolders } : {}),
    ...(tutorChats?.length ? { tutorChats } : {}),
  });
};

/** Applies a planned write and keeps it on the reply. */
async function apply(plan: WritePlan, context: ToolExecutionContext) {
  if (!plan.ok) return done({ ok: false, error: plan.error, hint: plan.hint });
  const { get, set, chatId, assistantMessage } = context;
  await get().changeMemory(plan.change);
  set((state) => {
    const result = updateMessageById(state, chatId, assistantMessage.id, (msg) => ({
      ...msg,
      memoryWrites: [...(msg.memoryWrites ?? []), plan.write],
    }));
    return result ?? {};
  });
  return done({ ok: true, id: noteHandle(plan.write.noteId), action: plan.write.action });
}

const saveMemory: PlanningToolHandler = async ({ parsedArgs, context }) => {
  const plan = planSave({
    memory: context.get().memory,
    folder: text(parsedArgs.folder),
    text: text(parsedArgs.note),
    replaces: text(parsedArgs.replaces) || undefined,
    newFolderDescription: text(parsedArgs.new_folder_description) || undefined,
    chatId: context.chatId,
    now: Date.now(),
    newId: uuidv4,
  });
  return apply(plan, context);
};

const forgetMemory: PlanningToolHandler = async ({ parsedArgs, context }) =>
  apply(
    planForget({ memory: context.get().memory, note: text(parsedArgs.note), now: Date.now() }),
    context,
  );

/**
 * A handler whose call stays in the reply's tool log with how it went, as a
 * search's does; unlogged, the row shown while the call streamed would be
 * dropped as never run. `record` is what the log keeps of a result.
 */
const logged =
  (
    name: string,
    handler: PlanningToolHandler,
    record: (result: ToolResult) => Record<string, unknown> = (result) => result,
  ): PlanningToolHandler =>
  async (args) => {
    const log = args.context.logger.start({
      name,
      input: args.parsedArgs,
      category: getToolLogCategory(name),
    });
    const outcome = await handler(args);
    const { result } = outcome;
    if (result?.ok) log.success(record(result));
    else log.error(result, result?.error);
    return outcome;
  };

// The log is kept with the reply, so a read keeps no copy of the notes: a note
// forgotten later is not still sitting in an old reply's tool log.
const readRecord = (result: ToolResult) => ({
  ok: result.ok,
  folder: result.folder,
  notes: Array.isArray(result.notes) ? result.notes.length : 0,
});

export function registerMemoryTools(): void {
  const metadata = { module: 'core', kind: 'action' as const };
  registerTool('memory_read', {
    definition: MEMORY_READ_TOOL,
    metadata,
    handler: logged('memory_read', readMemory, readRecord),
  });
  registerTool('memory_save', {
    definition: MEMORY_SAVE_TOOL,
    metadata,
    handler: logged('memory_save', saveMemory),
  });
  registerTool('memory_forget', {
    definition: MEMORY_FORGET_TOOL,
    metadata,
    handler: logged('memory_forget', forgetMemory),
  });
}
