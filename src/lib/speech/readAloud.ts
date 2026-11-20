// Module: speech/readAloud
// Responsibility: Reading a reply aloud with the browser's own voices. One
// reading at a time, app-wide: starting another stops it, and so does leaving
// the page. Nothing is kept; no setting, no stored state.

import { useSyncExternalStore } from 'react';
import { getLocale, intlLocale } from '@/lib/i18n/state';
import { speechChunks } from '@/lib/speech/chunks';
import { speechLabels } from '@/lib/speech/labels';
import { toSpeakableText } from '@/lib/speech/text';
import { pickVoice, readingLanguage } from '@/lib/speech/voice';

/** How long to wait for the voice list, which some browsers fill only after asking. */
const VOICES_WAIT_MS = 1500;

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

/** A moment for a voice list that is still empty, which some browsers fill only once asked. */
function waitForVoices(speech: SpeechSynthesis): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      speech.removeEventListener('voiceschanged', done);
      resolve();
    };
    const timer = window.setTimeout(done, VOICES_WAIT_MS);
    speech.addEventListener('voiceschanged', done);
  });
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
  const mine = ++turn;
  queued = [];
  speech.cancel();
  const lang = readingLanguage(markdown, intlLocale(getLocale()));
  const chunks = speechChunks(toSpeakableText(markdown, speechLabels(lang)));
  if (!chunks.length) {
    setReading(null);
    return;
  }
  setReading(id);
  // Spoken within the click when the voices are known: Safari on a phone
  // speaks only in answer to a tap.
  if (speech.getVoices().length) {
    speak(id, chunks, lang, speech);
    return;
  }
  void waitForVoices(speech).then(() => {
    if (mine === turn) speak(id, chunks, lang, speech);
  });
}

/** Whether the reply `id` is being read aloud now. */
export function useReadingAloud(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readingId === id,
    () => false,
  );
}
