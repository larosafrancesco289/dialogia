// Module: tools/core/memoryTools
// Responsibility: The core memory_read / memory_save / memory_forget tools: handlers
// plus registration. What a call changes is decided in `memory/writes`; the reply
// keeps each change (`Message.memoryWrites`) so the person sees it and can undo it.

import { v4 as uuidv4 } from 'uuid';
import { loadLearningRecords } from '@/lib/modules';
import { notesIn, subfoldersOf } from '@/lib/memory/notebook';
import { noteLine } from '@/lib/memory/prompt';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import {
  alreadySaved,
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
    // Often a folder the model means to save into: a new one needs no read first.
    return done({
      ok: false,
      error: `There is no folder "${text(parsedArgs.folder)}".`,
      hint: `The folders are: ${folders.map((f) => folderPath(folders, f)).join(', ')}. To save into a new folder, call memory_save with its name and new_folder_description: it is created.`,
    });
  }
  const subfolders = subfoldersOf(folders, folder.id).map(
    (f) => `${folderPath(folders, f)}: ${f.description}`,
  );
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
  if (!(await get().changeMemory(plan.change))) {
    return done({
      ok: false,
      error: 'Memory could not be saved just now, so nothing was changed.',
      hint: 'Tell the person it was not saved; they can add it themselves on their Memory page.',
    });
  }
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
  const { memory, ui, chats } = context.get();
  const chat = chats.find((c) => c.id === context.chatId);
  const replaces = text(parsedArgs.replaces) || undefined;
  // Saved already, in an earlier reply say: the model is told where, and nothing is copied.
  const saved = replaces ? undefined : alreadySaved(memory.notes, text(parsedArgs.note));
  if (saved) {
    const folder = memory.folders.find((f) => f.id === saved.folderId);
    return done({
      ok: true,
      id: noteHandle(saved.id),
      action: 'already saved',
      ...(folder ? { folder: folderPath(memory.folders, folder) } : {}),
    });
  }
  const plan = planSave({
    memory,
    folder: text(parsedArgs.folder),
    text: text(parsedArgs.note),
    replaces,
    newFolderDescription: text(parsedArgs.new_folder_description) || undefined,
    chatId: context.chatId,
    tutorChat: !!chat && isTutorRuntimeEnabled(ui, chat),
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
