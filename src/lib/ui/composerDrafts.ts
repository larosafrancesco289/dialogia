// Module: ui/composerDrafts
// Responsibility: Unsent composer text, per chat. It outlives any one Composer
// (an empty chat mounts the welcome screen's own) and a reload of the tab.
// sessionStorage keeps it to the tab: a draft is not a preference.

const STORAGE_KEY = 'dialogia:drafts';

let drafts: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (drafts) return drafts;
  drafts = {};
  try {
    const parsed: unknown = JSON.parse(globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') {
      for (const [scope, text] of Object.entries(parsed)) {
        if (typeof text === 'string' && text) drafts[scope] = text;
      }
    }
  } catch {
    // Storage blocked or corrupt: drafts live in memory only.
  }
  return drafts;
}

export function readDraft(scope: string): string {
  return load()[scope] ?? '';
}

export function writeDraft(scope: string, text: string): void {
  const all = load();
  if (text) all[scope] = text;
  else delete all[scope];
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // As above.
  }
}

export function resetDraftsForTest(): void {
  drafts = null;
}
