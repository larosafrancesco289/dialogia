// Module: i18n/preference
// Responsibility: Apply the person's language setting. "Auto" follows the
// browser's languages, and follows them again when they change.

import { resolveLanguage, type LanguagePreference } from '@/lib/i18n/locales';
import { setLocale } from '@/lib/i18n/state';

let preference: LanguagePreference = 'auto';
let listening = false;

export function applyLanguagePreference(next: LanguagePreference | undefined): Promise<void> {
  preference = next ?? 'auto';
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('languagechange', () => {
      if (preference === 'auto') void setLocale(resolveLanguage('auto'));
    });
  }
  return setLocale(resolveLanguage(preference));
}
