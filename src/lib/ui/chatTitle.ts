// Module: ui/chatTitle
// Responsibility: A chat's title as shown. The stored default ("New chat") and
// a branch's marker (" (branch)") are markers in the data, kept as they were
// written; on screen they are said in the language shown.

import { t } from '@/lib/i18n';
import { BRANCH_TITLE_SUFFIX, isUntitledChat } from '@/lib/services/chatService';

/** The title without its branch marker, and whether it had one. */
export function splitBranchTitle(title: string): { name: string; branch: boolean } {
  const branch = title.endsWith(BRANCH_TITLE_SUFFIX);
  const name = branch ? title.slice(0, -BRANCH_TITLE_SUFFIX.length) : title;
  return { name: isUntitledChat(name) || !name ? t('chat.untitled') : name, branch };
}

export function displayChatTitle(title: string | undefined): string {
  const { name, branch } = splitBranchTitle(title ?? '');
  return branch ? `${name} ${t('chat.branchMark')}` : name;
}
