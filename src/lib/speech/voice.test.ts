import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, readingLanguage, type VoiceInfo } from '@/lib/speech/voice';

describe('pickVoice', () => {
  it('prefers an exact locale match over a primary-language match', () => {
    const voices: VoiceInfo[] = [
      { name: 'Joana Enhanced', lang: 'pt-PT', localService: true, default: true },
      { name: 'Luciana', lang: 'pt-BR', localService: true },
    ];
    assert.equal(pickVoice(voices, 'pt-BR')?.name, 'Luciana');
  });

  it('falls back to the primary language and normalizes underscores', () => {
    const voices: VoiceInfo[] = [
      { name: 'Samantha', lang: 'en_US', localService: true },
      { name: 'Joana', lang: 'pt_PT', localService: true },
    ];
    assert.equal(pickVoice(voices, 'pt-BR')?.name, 'Joana');
    assert.equal(pickVoice(voices, 'en-GB')?.name, 'Samantha');
  });

  it('prefers local voices over remote ones for privacy, then quality and default', () => {
    const voices: VoiceInfo[] = [
      { name: 'Google US English Natural', lang: 'en-US', localService: false, default: true },
      { name: 'Basic Local', lang: 'en-US', localService: true },
      { name: 'Ava (Enhanced)', lang: 'en-US', localService: true },
    ];
    assert.equal(pickVoice(voices, 'en-US')?.name, 'Ava (Enhanced)');
  });

  it('returns undefined when no voice matches the language', () => {
    const voices: VoiceInfo[] = [{ name: 'Samantha', lang: 'en-US', localService: true }];
    assert.equal(pickVoice(voices, 'ja-JP'), undefined);
  });
});

describe('readingLanguage', () => {
  it('switches to Greek when the text is predominantly Greek and the app is not', () => {
    assert.equal(readingLanguage('Καλημέρα, πώς είσαι σήμερα;', 'en-US'), 'el');
  });

  it('keeps the app language when Greek is only a few symbols in Latin prose', () => {
    assert.equal(readingLanguage('Let α and β be angles in the triangle.', 'en-US'), 'en-US');
  });

  it('preserves the app language when the app is already Greek', () => {
    assert.equal(readingLanguage('Καλημέρα κόσμε', 'el-GR'), 'el-GR');
  });
});
