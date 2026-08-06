import { Language, I18nStrings, GlossaryItem, QuantumExplanation, PropertyExplanation } from './types';
import { strings as esStrings } from './es';
import { strings as enStrings } from './en';

export type { Language, I18nStrings, GlossaryItem, QuantumExplanation, PropertyExplanation };

const STORAGE_KEY = 'atomic_explorer_lang';

function detectSystemLanguage(): Language {
  if (typeof window === 'undefined' || !window.navigator) {
    return 'en';
  }

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

  return 'en'; // Default fallback to English
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
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (err) {
    console.warn('Unable to persist language setting:', err);
  }

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
if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLang;
}
