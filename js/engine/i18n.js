// Texts live in i18n/<lang>.json. English comes first: every first visit opens in English;
// Russian is chosen with the EN / RU button (or ?lang=ru), and that choice is remembered
// when storage allows.

const STORAGE_KEY = 'into-the-edge:lang';
export const LANGS = ['en', 'ru'];

export function detectLanguage(params) {
  const fromUrl = params.get('lang');
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch (e) { /* storage blocked */ }
  return 'en';
}

export function rememberLanguage(lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage blocked */ }
}

export class I18n {
  constructor(base = 'i18n/') {
    this.base = base;
    this.cache = new Map();
    this.lang = 'en';
    this.dict = {};
    this.fallback = {};
  }

  async load(lang) {
    if (!this.cache.has(lang)) {
      const res = await fetch(`${this.base}${lang}.json`);
      if (!res.ok) throw new Error(`Cannot load ${lang}.json`);
      this.cache.set(lang, await res.json());
    }
    if (!this.cache.has('en') && lang !== 'en') await this.load('en');
    this.fallback = this.cache.get('en') || {};
    this.dict = this.cache.get(lang);
    this.lang = lang;
    return this.dict;
  }

  lookup(dict, key) {
    let v = dict;
    for (const part of key.split('.')) {
      if (v == null) return undefined;
      v = v[part];
    }
    return v;
  }

  /** t('ui.play'), t('drill.levels.3.caption'); {name} placeholders are filled from vars. */
  t(key, vars) {
    let v = this.lookup(this.dict, key);
    if (v === undefined) v = this.lookup(this.fallback, key);
    if (v === undefined) return key;
    if (typeof v === 'string' && vars) v = v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return v;
  }

  has(key) {
    return this.lookup(this.dict, key) !== undefined || this.lookup(this.fallback, key) !== undefined;
  }
}
