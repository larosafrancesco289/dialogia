// Module: speech/readAloud
// Responsibility: Reading a reply aloud with the browser's own voices. One
// reading at a time, app-wide: starting another stops it, and so does leaving
// the page. Nothing is kept; no setting, no stored state.

import { useSyncExternalStore } from 'react';
import { browserLanguages } from '@/lib/i18n/locales';
import { getLocale, intlLocale } from '@/lib/i18n/state';
import { speechChunks } from '@/lib/speech/chunks';
import { speechLabels } from '@/lib/speech/labels';
import { toSpeakableText } from '@/lib/speech/text';
import { pickVoice, readingLanguage } from '@/lib/speech/voice';

let readingId: string | null = null;
// Each reading's turn: a later one, or a stop, makes an earlier one's events moot.
let turn = 0;
// Held so Chrome does not collect an utterance mid-sentence and drop its `end`.
let queued: SpeechSynthesisUtterance[] = [];
const listeners = new Set<() => void>();
let pageHideBound = false;
let supported: boolean | undefined;

function synth(): SpeechSynthesis | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
    return undefined;
  }
  return window.speechSynthesis;
}

/** Whether this browser can read aloud. Asking also starts its voices loading. */
export function canReadAloud(): boolean {
  if (supported === undefined) {
    const speech = synth();
    supported = !!speech;
    // Chrome loads its voices on first asking, so they are ready by the first click.
    speech?.getVoices();
  }
  return supported;
}

function setReading(id: string | null) {
  if (readingId === id) return;
  readingId = id;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stop reading: the one reading `id`, or whatever is being read. */
export function stopReadAloud(id?: string): void {
  if (id !== undefined && id !== readingId) return;
  turn++;
  queued = [];
  setReading(null);
  synth()?.cancel();
}

const onPageHide = () => stopReadAloud();

function bindPageHide() {
  if (pageHideBound) return;
  pageHideBound = true;
  // Chrome goes on speaking through a reload or a navigation away.
  window.addEventListener('pagehide', onPageHide);
}

/** @internal */
export function resetReadAloudForTest(): void {
  turn++;
  queued = [];
  readingId = null;
  supported = undefined;
  listeners.clear();
  if (pageHideBound && typeof window !== 'undefined') {
    window.removeEventListener('pagehide', onPageHide);
  }
  pageHideBound = false;
}

function speak(id: string, chunks: string[], lang: string, speech: SpeechSynthesis) {
  const mine = turn;
  const voice = pickVoice(speech.getVoices(), lang);
  queued = chunks.map((chunk) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang ?? lang;
    if (voice) utterance.voice = voice;
    return utterance;
  });
  const last = queued[queued.length - 1];
  queued.forEach((utterance) => {
    if (utterance === last) {
      utterance.onend = () => {
        if (mine !== turn) return;
        queued = [];
        setReading(null);
      };
    }
    // A stop cancels with an error event too, but it has moved the turn on:
    // only a real failure gets past the check and ends the reading.
    utterance.onerror = () => {
      if (mine === turn) stopReadAloud(id);
    };
  });
  // Chrome can be left paused (a tab that slept), and then says nothing.
  speech.resume();
  queued.forEach((utterance) => speech.speak(utterance));
}

/** Read the reply aloud, or stop if it is the one being read. */
export function toggleReadAloud(id: string, markdown: string): void {
  const speech = synth();
  if (!speech) return;
  if (readingId === id) {
    stopReadAloud(id);
    return;
  }
  bindPageHide();
  // Whatever was being read stops first, here or in the speech queue.
  ++turn;
  queued = [];
  speech.cancel();
  const appLang = intlLocale(getLocale());
  const nonGreekFallback =
    browserLanguages().find((tag) => !tag.toLowerCase().startsWith('el')) ?? 'en';
  // Detect script on speakable prose rather than raw markdown so fenced code,
  // LaTeX commands, and URLs don't tip a Greek reply into an English voice.
  const initialSpeakable = toSpeakableText(markdown, speechLabels(appLang));
  const lang = readingLanguage(initialSpeakable, appLang, nonGreekFallback);
  const speakable =
    lang === appLang ? initialSpeakable : toSpeakableText(markdown, speechLabels(lang));
  const chunks = speechChunks(speakable);
  if (!chunks.length) {
    setReading(null);
    return;
  }
  setReading(id);
  // Always speak synchronously inside the click/tap gesture: iOS Safari drops
  // speech started after an async wait (such as waiting for `voiceschanged`).
  // When voices are not loaded yet, `utterance.lang` still guides the OS voice.
  speak(id, chunks, lang, speech);
}

/** Whether the reply `id` is being read aloud now. */
export function useReadingAloud(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readingId === id,
    () => false,
  );
}
