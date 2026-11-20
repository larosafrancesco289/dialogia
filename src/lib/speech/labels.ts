import { t } from '@/lib/i18n';
import type { SpeechLabels } from '@/lib/speech/text';

/** The words a reply is read with, in the language shown, for a voice speaking `lang`. */
export function speechLabels(lang: string): SpeechLabels {
  return {
    codeSkipped: t('speech.codeSkipped'),
    diagramSkipped: t('speech.diagramSkipped'),
    greekLetters: lang.toLowerCase().startsWith('el') ? 'letters' : 'names',
    math: {
      over: t('speech.math.over'),
      squared: t('speech.math.squared'),
      cubed: t('speech.math.cubed'),
      toThePowerOf: t('speech.math.toThePowerOf'),
      squareRootOf: t('speech.math.squareRootOf'),
      cubeRootOf: t('speech.math.cubeRootOf'),
      // Filled by the formula's own reading, with the root's order.
      nthRootOf: t('speech.math.nthRootOf', { index: '{index}' }),
      times: t('speech.math.times'),
      dividedBy: t('speech.math.dividedBy'),
      plus: t('speech.math.plus'),
      minus: t('speech.math.minus'),
      plusOrMinus: t('speech.math.plusOrMinus'),
      equals: t('speech.math.equals'),
      notEqual: t('speech.math.notEqual'),
      lessThan: t('speech.math.lessThan'),
      greaterThan: t('speech.math.greaterThan'),
      lessOrEqual: t('speech.math.lessOrEqual'),
      greaterOrEqual: t('speech.math.greaterOrEqual'),
      approximately: t('speech.math.approximately'),
      infinity: t('speech.math.infinity'),
      degrees: t('speech.math.degrees'),
    },
  };
}
