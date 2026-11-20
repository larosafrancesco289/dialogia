// Module: speech/voice
// Responsibility: Which of the browser's voices reads a reply, and in which
// language. A voice on the device comes first, since a voice that is not
// sends the words to a server to be spoken.

/** What a voice says about itself (`SpeechSynthesisVoice`). */
export type VoiceInfo = {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
};

const QUALITY_RE = /enhanced|premium|natural|neural/i;

const normalTag = (tag: string) => tag.replace(/_/g, '-').toLowerCase();
const primaryOf = (tag: string) => normalTag(tag).split('-')[0];

function score(voice: VoiceInfo): number {
  return (
    (voice.localService ? 4 : 0) + (QUALITY_RE.test(voice.name) ? 2 : 0) + (voice.default ? 1 : 0)
  );
}

function best<T extends VoiceInfo>(voices: T[]): T | undefined {
  return voices.reduce<T | undefined>(
    (chosen, voice) => (!chosen || score(voice) > score(chosen) ? voice : chosen),
    undefined,
  );
}

/**
 * The voice for `lang` ("pt-BR", "en-GB"): one of exactly that language
 * first, then any of the same language ("pt-PT" for "pt-BR"); among them
 * one on the device, then one whose name promises a better voice
 * (Enhanced, Premium, Natural, Neural). Undefined when none speaks it, and
 * the browser chooses from the utterance's language.
 */
export function pickVoice<T extends VoiceInfo>(voices: readonly T[], lang: string): T | undefined {
  const exact = voices.filter((voice) => normalTag(voice.lang) === normalTag(lang));
  if (exact.length) return best(exact);
  return best(voices.filter((voice) => primaryOf(voice.lang) === primaryOf(lang)));
}

/**
 * The language a reply is read in: the app's, unless the reply is plainly in
 * Greek and the app is not, which its letters show without guessing at words.
 * Nothing records a chat's own language, and telling Latin-script languages
 * apart would take a detector.
 */
export function readingLanguage(text: string, appLanguage: string): string {
  const greek = text.match(/\p{Script=Greek}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const appIsGreek = primaryOf(appLanguage) === 'el';
  if (!appIsGreek && greek > latin * 2) return 'el';
  return appLanguage;
}
