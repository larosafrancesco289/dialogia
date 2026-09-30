import type { ToolDefinition } from '@/lib/transport/contracts';

export const MEMORY_READ_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_read',
    description:
      'Read one folder of your long-term memory about the person: its notes (with ids), its subfolders and, for Learning, their tutor chats and progress. Use it when a folder from the memory index bears on the conversation, and before saving into a folder you have not read this turn.',
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description:
            'The folder as the memory index names it, e.g. "Learning" or "Projects/PhD thesis".',
        },
      },
      required: ['folder'],
    },
  },
};

export const MEMORY_SAVE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_save',
    description:
      'Save one fact about the person to long-term memory, as a short third-person line. To correct or update a fact you already have, pass replaces with that note’s id instead of adding a second note. A folder that does not exist yet is created, which needs new_folder_description.',
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description:
            'Where the note belongs, e.g. "About you", "Learning", or a path like "Projects/PhD thesis".',
        },
        note: { type: 'string', description: 'The fact, one short line.' },
        replaces: {
          type: 'string',
          description: 'The id of the note this one replaces, when correcting or updating it.',
        },
        new_folder_description: {
          type: 'string',
          description: 'Only when the folder is new: one line saying what it holds.',
        },
      },
      required: ['folder', 'note'],
    },
  },
};

export const MEMORY_FORGET_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_forget',
    description:
      'Forget a note, when the person asks you to or it is no longer true and nothing replaces it. The person can restore it for 30 days.',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'The id of the note to forget.' },
      },
      required: ['note'],
    },
  },
};

export const MEMORY_TOOLS = [MEMORY_READ_TOOL, MEMORY_SAVE_TOOL, MEMORY_FORGET_TOOL];
