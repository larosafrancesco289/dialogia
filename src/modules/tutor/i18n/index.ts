// Module: tutor i18n
// Responsibility: The tutor's own words, in a catalogue of its own beside the
// core one: deleting the module deletes them. `en.ts` is the source; the other
// languages load with the core's, so a screen never mixes two.

import en from '@/modules/tutor/i18n/en';
import { defineCatalogue } from '@/lib/i18n/catalogue';

export const tutorMessages = defineCatalogue(en, {
  it: () => import('./it'),
  fr: () => import('./fr'),
  es: () => import('./es'),
  de: () => import('./de'),
  'pt-BR': () => import('./pt-BR'),
  el: () => import('./el'),
});

export const { t, useT } = tutorMessages;

export type TutorTranslate = typeof t;
