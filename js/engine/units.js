// Length formatting shared by the scale bar, the ruler and the comparison labels.

const UNIT_FACTOR = { m: 1, cm: 1e-2, mm: 1e-3, um: 1e-6, nm: 1e-9, A: 1e-10 };
const UNIT_NAME = {
  en: { m: 'm', cm: 'cm', mm: 'mm', um: 'µm', nm: 'nm', A: 'Å' },
  ru: { m: 'м', cm: 'см', mm: 'мм', um: 'мкм', nm: 'нм', A: 'Å' },
};

const formatters = new Map();
function numberFormat(lang, digits) {
  const key = lang + digits;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
      maximumFractionDigits: digits, useGrouping: false,
    }));
  }
  return formatters.get(key);
}

export function unitName(unit, lang) {
  return (UNIT_NAME[lang] || UNIT_NAME.en)[unit] || unit;
}

/** Formats a value that is already expressed in `unit`, e.g. (0.5, 'mm') -> "0.5 mm" / "0,5 мм". */
export function formatValue(value, unit, lang, digits = 2) {
  return `${numberFormat(lang, digits).format(value)} ${unitName(unit, lang)}`;
}

/** Picks a readable unit for a length in metres. */
export function pickUnit(m) {
  if (m >= 1) return 'm';
  if (m >= 1e-2) return 'cm';
  if (m >= 1e-3) return 'mm';
  if (m >= 1e-6) return 'um';
  if (m >= 1e-9) return 'nm';
  return 'A';
}

export function formatLength(m, lang, digits = 2) {
  const unit = pickUnit(m * 1.0000001);
  return formatValue(m / UNIT_FACTOR[unit], unit, lang, digits);
}

/** A "nice" scale bar length (1, 2 or 5 × 10^n metres) close to `target` metres. */
export function niceLength(target) {
  const e = Math.floor(Math.log10(target));
  const base = Math.pow(10, e);
  const r = target / base;
  const k = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10;
  return k * base;
}

export function toMetres(value, unit) {
  return value * UNIT_FACTOR[unit];
}
