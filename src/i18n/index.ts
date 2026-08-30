import { Language, I18nStrings, GlossaryItem, QuantumExplanation, PropertyExplanation, ConceptExplanation } from './types';
import { strings as esStrings } from './es';
import { strings as enStrings } from './en';
import { strings as frStrings } from './fr';
import { strings as deStrings } from './de';
import { strings as ptStrings } from './pt';
import { strings as itStrings } from './it';
import { strings as nlStrings } from './nl';
import { strings as plStrings } from './pl';
import { strings as ruStrings } from './ru';
import { strings as zhStrings } from './zh';
import { strings as jaStrings } from './ja';
import { strings as koStrings } from './ko';
import { strings as trStrings } from './tr';
import { strings as hiStrings } from './hi';
import { strings as arStrings } from './ar';

export type { Language, I18nStrings, GlossaryItem, QuantumExplanation, PropertyExplanation, ConceptExplanation };

const STORAGE_KEY = 'atomic_explorer_lang';

export const TRANSLATIONS: Record<Language, I18nStrings> = {
  es: esStrings,
  en: enStrings,
  fr: frStrings,
  de: deStrings,
  pt: ptStrings,
  it: itStrings,
  nl: nlStrings,
  pl: plStrings,
  ru: ruStrings,
  zh: zhStrings,
  ja: jaStrings,
  ko: koStrings,
  tr: trStrings,
  hi: hiStrings,
  ar: arStrings,
};

const SUPPORTED_LANGUAGES: Language[] = [
  'es', 'en', 'fr', 'de', 'pt', 'it', 'nl', 'pl', 'ru', 'zh', 'ja', 'ko', 'tr', 'hi', 'ar'
];

function detectSystemLanguage(): Language {
  const savedLang = localStorage.getItem(STORAGE_KEY) as Language | null;
  if (savedLang && SUPPORTED_LANGUAGES.includes(savedLang)) {
    return savedLang;
  }

  const userLanguages = navigator.languages || [navigator.language || ''];
  for (const lang of userLanguages) {
    const code = lang.toLowerCase();
    for (const supported of SUPPORTED_LANGUAGES) {
      if (code.startsWith(supported)) {
        return supported;
      }
    }
  }

  return 'en';
}

let currentLang: Language = detectSystemLanguage();

const listeners: Set<(lang: Language) => void> = new Set();

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  if (!SUPPORTED_LANGUAGES.includes(lang)) return;
  if (currentLang === lang) return;

  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  listeners.forEach((listener) => listener(currentLang));
}

export function getStrings(): I18nStrings {
  return TRANSLATIONS[currentLang];
}

export function onLanguageChange(listener: (lang: Language) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Initial document lang and dir update
document.documentElement.lang = currentLang;
document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
