import { QUOTA_TIMEZONE } from '@bagas-share/shared';
import idDict from './id.json';
import enDict from './en.json';

export type Locale = 'id' | 'en';
export type TranslationKey = keyof typeof idDict;

const DICTS: Record<Locale, Record<TranslationKey, string>> = {
  id: idDict,
  en: enDict,
};

const STORAGE_KEY = 'bagas_share_locale';

export function getInitialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'id' || saved === 'en') return saved;
  }
  return 'id'; // Default Bahasa Indonesia (PRD FR13.1, keputusan pemilik O10)
}

export function saveLocale(locale: Locale): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, locale);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const raw = DICTS[locale][key] ?? DICTS.id[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}

/**
 * Format ukuran byte sesuai locale ("48,2 MB" di ID, "48.2 MB" di EN, DESIGN-BRIEF 3.2).
 */
export function formatBytes(bytes: number, locale: Locale): string {
  const safe = Math.max(0, bytes);
  if (safe < 1024) {
    return `${safe} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = safe / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const formatter = new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    minimumFractionDigits: value < 10 && unitIndex > 0 ? 1 : 0,
  });
  return `${formatter.format(value)} ${units[unitIndex]}`;
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function formatWitaDateTime(
  iso: string,
  locale: Locale,
  includeYear = false
): string {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: QUOTA_TIMEZONE,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    };
    if (includeYear) {
      options.year = 'numeric';
    }
    return new Intl.DateTimeFormat(
      locale === 'id' ? 'id-ID' : 'en-US',
      options
    ).format(new Date(iso));
  } catch {
    return iso;
  }
}
