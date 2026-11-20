import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canReadAloud,
  resetReadAloudForTest,
  stopReadAloud,
  toggleReadAloud,
} from '@/lib/speech/readAloud';

type FakeUtterance = {
  text: string;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type FakeSynth = {
  spoken: FakeUtterance[];
  cancelCount: number;
  resumeCount: number;
  voices: SpeechSynthesisVoice[];
  listeners: Map<string, Set<() => void>>;
  getVoices: () => SpeechSynthesisVoice[];
  speak: (u: FakeUtterance) => void;
  cancel: () => void;
  resume: () => void;
  addEventListener: (event: string, fn: () => void) => void;
  removeEventListener: (event: string, fn: () => void) => void;
  emit: (event: string) => void;
};

function makeFakeSynth(voices: SpeechSynthesisVoice[] = []): FakeSynth {
  const listeners = new Map<string, Set<() => void>>();
  const synth: FakeSynth = {
    spoken: [],
    cancelCount: 0,
    resumeCount: 0,
    voices,
    listeners,
    getVoices: () => synth.voices,
    speak: (u) => synth.spoken.push(u),
    cancel: () => {
      synth.cancelCount += 1;
    },
    resume: () => {
      synth.resumeCount += 1;
    },
    addEventListener: (event, fn) => {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
    },
    removeEventListener: (event, fn) => {
      listeners.get(event)?.delete(fn);
    },
    emit: (event) => {
      for (const fn of [...(listeners.get(event) ?? [])]) fn();
    },
  };
  return synth;
}

class MockUtterance {
  text: string;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const EN_VOICE = {
  name: 'Samantha Enhanced',
  lang: 'en-US',
  localService: true,
  default: true,
  voiceURI: 'samantha',
} as SpeechSynthesisVoice;

describe('readAloud', () => {
  let prevWindow: unknown;
  let hadWindow: boolean;
  let fakeSynth: FakeSynth;
  let pageHideListeners: Set<() => void>;

  beforeEach(() => {
    resetReadAloudForTest();
    hadWindow = 'window' in globalThis;
    prevWindow = (globalThis as { window?: unknown }).window;
    fakeSynth = makeFakeSynth([EN_VOICE]);
    pageHideListeners = new Set();

    const mockWindow = {
      speechSynthesis: fakeSynth,
      SpeechSynthesisUtterance: MockUtterance,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: (event: string, fn: () => void) => {
        if (event === 'pagehide') pageHideListeners.add(fn);
      },
      removeEventListener: (event: string, fn: () => void) => {
        if (event === 'pagehide') pageHideListeners.delete(fn);
      },
    };
    (globalThis as { window?: unknown; SpeechSynthesisUtterance?: unknown }).window = mockWindow;
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = MockUtterance;
  });

  afterEach(() => {
    resetReadAloudForTest();
    if (hadWindow) {
      (globalThis as { window?: unknown }).window = prevWindow;
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    delete (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  });

  it('detects browser speech synthesis support', () => {
    assert.equal(canReadAloud(), true);
  });

  it('speaks chunks immediately when voices are loaded and toggles off on second click', () => {
    toggleReadAloud('m1', 'Hello world. Second sentence.');
    assert.equal(fakeSynth.resumeCount, 1);
    assert.deepEqual(
      fakeSynth.spoken.map((u) => u.text),
      ['Hello world.', 'Second sentence.'],
    );
    assert.equal(fakeSynth.spoken[0].voice, EN_VOICE);

    // Clicking the same message again stops reading instead of re-speaking.
    toggleReadAloud('m1', 'Hello world. Second sentence.');
    assert.equal(fakeSynth.cancelCount, 2);
    assert.equal(fakeSynth.spoken.length, 2);
  });

  it('cancels the previous message when starting another and ignores stale onend events', () => {
    toggleReadAloud('m1', 'First reply.');
    const firstUtterance = fakeSynth.spoken[0];

    toggleReadAloud('m2', 'Second reply.');
    assert.equal(fakeSynth.cancelCount, 2);
    assert.deepEqual(
      fakeSynth.spoken.map((u) => u.text),
      ['First reply.', 'Second reply.'],
    );

    // A late end event from m1 must not interfere with m2.
    firstUtterance.onend?.();
    // Stopping m1 by id is a no-op while m2 is active.
    stopReadAloud('m1');
    assert.equal(fakeSynth.cancelCount, 2);

    // Stopping m2 cancels speech.
    stopReadAloud('m2');
    assert.equal(fakeSynth.cancelCount, 3);
  });

  it('speaks synchronously with utterance.lang when the voice list is initially empty', () => {
    fakeSynth.voices = [];
    toggleReadAloud('m1', 'Spoken inside the tap gesture.');
    assert.deepEqual(
      fakeSynth.spoken.map((u) => u.text),
      ['Spoken inside the tap gesture.'],
    );
    assert.equal(fakeSynth.spoken[0].voice, null);
    assert.ok(fakeSynth.spoken[0].lang.length > 0);
  });

  it('detects Greek prose even when a reply contains a large English code block', () => {
    const elVoice = {
      name: 'Melina',
      lang: 'el-GR',
      localService: true,
      default: false,
      voiceURI: 'melina',
    } as SpeechSynthesisVoice;
    fakeSynth.voices = [EN_VOICE, elVoice];
    const reply = [
      'Ορίστε ένα παράδειγμα συνάρτησης σε TypeScript που υπολογίζει το άθροισμα:',
      '',
      '```ts',
      'export function calculateTotalAmountWithDiscountAndTax(items: Array<{ price: number; quantity: number }>) {',
      '  const subtotal = items.reduce((accumulator, item) => accumulator + item.price * item.quantity, 0);',
      '  return Math.round(subtotal * 1.24 * 100) / 100;',
      '}',
      '```',
    ].join('\n');

    toggleReadAloud('m-el', reply);
    assert.equal(fakeSynth.spoken[0]?.voice, elVoice);
    assert.equal(fakeSynth.spoken[0]?.lang, 'el-GR');
  });

  it('does not speak when the markdown has no speakable content', () => {
    toggleReadAloud('m1', '   ---   ');
    assert.equal(fakeSynth.spoken.length, 0);
  });

  it('stops reading on pagehide', () => {
    toggleReadAloud('m1', 'Keep reading.');
    const cancelsBefore = fakeSynth.cancelCount;
    for (const fn of pageHideListeners) fn();
    assert.equal(fakeSynth.cancelCount, cancelsBefore + 1);
  });
});
