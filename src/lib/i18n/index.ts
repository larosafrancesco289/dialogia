// Module: i18n
// Responsibility: The app's own words. `t` / `useT` read the core catalogue
// (`messages/en.ts` is the source); a feature module defines its own catalogue
// the same way, so deleting the module deletes its words. This layer imports
// nothing above it, so every layer may use it.

import en from '@/lib/i18n/messages/en';
import { defineCatalogue } from '@/lib/i18n/catalogue';

export const coreMessages = defineCatalogue(en, {
  it: () => import('./messages/it'),
  fr: () => import('./messages/fr'),
  es: () => import('./messages/es'),
  de: () => import('./messages/de'),
  'pt-BR': () => import('./messages/pt-BR'),
  el: () => import('./messages/el'),
});

export const { t, useT } = coreMessages;

export type Translate = typeof t;

export type MessageKey = keyof typeof en & string;
