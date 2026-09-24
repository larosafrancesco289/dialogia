// Module: ui/userMessageClamp
// Responsibility: When a long message of yours folds to its first lines. A fold
// that would hide only a line or two costs more than it saves, so there is slack.

export const USER_MESSAGE_MAX_LINES = 14;
const SLACK_LINES = 3;
// The narrowest bubble (a phone) holds about this many characters a line.
const NARROWEST_LINE_CHARS = 30;

/** Cheap test before measuring: whether the text could reach the fold at the narrowest width. */
export function mightNeedClamp(text: string): boolean {
  let lines = 0;
  for (const line of text.split('\n')) {
    lines += Math.max(1, Math.ceil(line.length / NARROWEST_LINE_CHARS));
    if (lines > USER_MESSAGE_MAX_LINES) return true;
  }
  return false;
}

/** Whether rendered text this tall folds, given the height of one of its lines. */
export function exceedsClamp(contentHeight: number, lineHeight: number): boolean {
  if (!(lineHeight > 0)) return false;
  return contentHeight > lineHeight * (USER_MESSAGE_MAX_LINES + SLACK_LINES);
}
