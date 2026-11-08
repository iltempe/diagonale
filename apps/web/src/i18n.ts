import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Every namespace of every locale is bundled (small JSON files): switching language is instant.
const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<string, { default: Record<string, unknown> }>;

export const LANGUAGES = ['it', 'en'] as const;
export type Lang = (typeof LANGUAGES)[number];
export const NAMESPACES = ['common', 'editor', 'export', 'ai', 'team', 'planner'] as const;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const m = /\.\/locales\/(\w+)\/(\w+)\.json$/.exec(path);
  if (!m) continue;
  (resources[m[1]!] ??= {})[m[2]!] = mod.default;
}

const STORAGE_KEY = 'diagonale.lang';

export function detectLanguage(): Lang {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved === 'it' || saved === 'en') return saved;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('it') ? 'it' : 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* private mode */
  }
  document.documentElement.lang = lng;
  void import('./lib/cloud').then((m) => m.saveProfileLocale(lng)).catch(() => {});
});
document.documentElement.lang = i18n.language;

export function setLanguage(lng: Lang) {
  void i18n.changeLanguage(lng);
}

export default i18n;
