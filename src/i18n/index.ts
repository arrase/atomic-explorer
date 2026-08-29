import { Language, I18nStrings, GlossaryItem, QuantumExplanation, PropertyExplanation, ConceptExplanation } from './types';
import { strings as esStrings } from './es';
import { strings as enStrings } from './en';

export type { Language, I18nStrings, GlossaryItem, QuantumExplanation, PropertyExplanation, ConceptExplanation };

const STORAGE_KEY = 'atomic_explorer_lang';

function detectSystemLanguage(): Language {
  const savedLang = localStorage.getItem(STORAGE_KEY);
  if (savedLang === 'es' || savedLang === 'en') {
    return savedLang;
  }

  const userLanguages = navigator.languages || [navigator.language || ''];
  for (const lang of userLanguages) {
    const code = lang.toLowerCase();
    if (code.startsWith('es')) {
      return 'es';
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
  if (lang !== 'es' && lang !== 'en') return;
  if (currentLang === lang) return;

  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;

  listeners.forEach((listener) => listener(currentLang));
}

export function getStrings(): I18nStrings {
  return currentLang === 'es' ? esStrings : enStrings;
}

export function onLanguageChange(listener: (lang: Language) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Initial document lang update
document.documentElement.lang = currentLang;
