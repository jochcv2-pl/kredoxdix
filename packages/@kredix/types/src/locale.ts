// Langues supportées par Kredix (extrait du HTML de référence)
export type Locale = 'fr' | 'en' | 'de' | 'es' | 'pt' | 'it';

export const SUPPORTED_LOCALES: readonly Locale[] = ['fr', 'en', 'de', 'es', 'pt', 'it'] as const;

// Alias court utilisé par la couche i18n (next-intl).
export const LOCALES = SUPPORTED_LOCALES;

export const DEFAULT_LOCALE: Locale = 'de';

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
};
