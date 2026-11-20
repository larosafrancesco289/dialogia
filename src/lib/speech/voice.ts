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
 * The voice for `lang` ("pt-BR", "en-GB"): an on-device voice always comes
 * before a cloud voice (exact locale first, then same base language) so reply
 * text stays on the device whenever a local voice speaks the language. Within
 * a tier, a voice whose name promises better quality (Enhanced, Premium,
 * Natural, Neural) wins, then the default. Undefined when none matches, and
 * the browser chooses from the utterance's language.
 */
export function pickVoice<T extends VoiceInfo>(voices: readonly T[], lang: string): T | undefined {
  const target = normalTag(lang);
  const primary = primaryOf(lang);
  const exact = voices.filter((voice) => normalTag(voice.lang) === target);
  const sameBase = voices.filter((voice) => primaryOf(voice.lang) === primary);
  return (
    best(exact.filter((voice) => voice.localService)) ??
    best(sameBase.filter((voice) => voice.localService)) ??
    best(exact) ??
    best(sameBase)
  );
}

/**
 * The language a reply is read in: the app's, unless the script clearly shows
 * Greek in a non-Greek app, or Latin-script prose in a Greek app. Nothing
 * records a chat's own language, and telling Latin-script languages apart
 * would take a detector.
 */
export function readingLanguage(
  text: string,
  appLanguage: string,
  fallbackNonGreek = 'en',
): string {
  const greek = text.match(/\p{Script=Greek}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const appIsGreek = primaryOf(appLanguage) === 'el';
  if (!appIsGreek && greek > latin * 2) return 'el';
  if (appIsGreek && latin > greek * 2) return fallbackNonGreek;
  return appLanguage;
}
