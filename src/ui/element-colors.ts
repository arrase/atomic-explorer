/**
 * Single source of truth for every colour used by the periodic table.
 *
 * The categorical palette is deliberately built as a single hue family: every
 * entry shares a similar lightness and chroma, so no category shouts louder
 * than its neighbours while the ten remain distinguishable. Values are hex so
 * they work in every `color-mix()` expression without a `@supports` guard.
 */

export type ElementCategory = string;

/** Ordered by atomic-block grouping so the legend reads left-to-right. */
const CATEGORY_COLORS: Record<ElementCategory, string> = {
  'metal alcalino': '#ec8f7e',
  'alcalinotérreo': '#e0b23f',
  'metal de transición': '#7baae8',
  'metal del bloque p': '#5fc3d4',
  'no metal': '#a3a6ec',
  'gas noble': '#b993e0',
  metaloide: '#6bc99b',
  halógeno: '#b0d64d',
  lantánido: '#dc94c2',
  actínido: '#e094b0',
};

const FALLBACK_COLOR = '#8a92a5';

const LEGEND_ORDER: readonly ElementCategory[] = [
  'no metal',
  'gas noble',
  'metal alcalino',
  'alcalinotérreo',
  'metaloide',
  'halógeno',
  'metal de transición',
  'metal del bloque p',
  'lantánido',
  'actínido',
];

/* --------------------------------------------------------------------------
 * Gradient scales (used for the legend bars and the cell interpolation, so the
 * two can never drift apart).
 * ----------------------------------------------------------------------- */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const ELECTRONEGATIVITY_STOPS: readonly string[] = ['#1e3a8f', '#6d28b9', '#a92a52'];
const RADIUS_STOPS: readonly string[] = ['#4c2a8f', '#1e7a8f', '#2a8f5c'];

function hexToRgb(hex: string): Rgb {
  const v = Number.parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Samples a multi-stop gradient at `t` in the 0..1 range. */
function sampleGradient(stops: readonly string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = hexToRgb(stops[index]);
  const to = hexToRgb(stops[index + 1]);
  return rgbToHex({
    r: lerp(from.r, to.r, local),
    g: lerp(from.g, to.g, local),
    b: lerp(from.b, to.b, local),
  });
}

function gradientCss(stops: readonly string[]): string {
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export const ELECTRONEGATIVITY_GRADIENT = gradientCss(ELECTRONEGATIVITY_STOPS);
export const RADIUS_GRADIENT = gradientCss(RADIUS_STOPS);

/* --------------------------------------------------------------------------
 * Public API
 * ----------------------------------------------------------------------- */

export function getCategoryColor(category: ElementCategory): string {
  return CATEGORY_COLORS[category] ?? FALLBACK_COLOR;
}

export function getLegendCategoryOrder(): readonly ElementCategory[] {
  return LEGEND_ORDER;
}

export function getElectronegativityColor(value: number | null): string {
  if (value === null) return '#3a4152';
  // Domain 0.7 (Fr) .. 4.0 (F) matches the legend labels.
  const t = (value - 0.7) / (4.0 - 0.7);
  return sampleGradient(ELECTRONEGATIVITY_STOPS, t);
}

export function getRadiusColor(radiusPm: number): string {
  // Domain 32 pm (He) .. 260 pm (Fr) matches the legend labels.
  const t = (radiusPm - 32) / (260 - 32);
  return sampleGradient(RADIUS_STOPS, t);
}
