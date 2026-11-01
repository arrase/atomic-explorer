import { energyLevelEv } from './physics-constants';
import {
  calculateRadialDipoleIntegral,
  calculateSpontaneousEmissionRate,
  calculateTransitionWavelength,
  isDipoleTransitionAllowed,
} from './wasm-bridge';

export type TransitionMode = 'emission' | 'absorption';
export type SpectralBand = 'uv' | 'visible' | 'ir';
export type ForbiddenReason = 'none' | 'delta_l_zero' | 'delta_l_multi' | 'delta_m';

export interface QuantumState {
  n: number;
  l: number;
  m: number;
}

export interface WavelengthColor {
  r: number; // 0..1 sRGB normalized
  g: number; // 0..1
  b: number; // 0..1
  hex: string;
  band: SpectralBand;
}

export interface TransitionMetrics {
  lowerEnergyEv: number;
  upperEnergyEv: number;
  deltaEEv: number;
  wavelengthNm: number;
  frequencyThz: number;
  seriesIndex: number; // nLower (1=Lyman, 2=Balmer, 3=Paschen, 4=Brackett, 5=Pfund, 6=Humphreys)
  isAllowed: boolean;
  forbiddenReason: ForbiddenReason;
  einsteinA: number; // 0 when !isAllowed
  lifetimeNs: number | null; // 1e9 / einsteinA when einsteinA > 0, else null (metastable)
  dipoleIntegralBohr: number;
  color: WavelengthColor;
}

export interface SpectralLinePreset {
  id: 'h-alpha' | 'h-beta' | 'h-gamma' | 'lyman-alpha' | 'paschen-alpha' | 'forbidden-2s-1s';
  shortLabel: string;
  zEff: number;
  upper: QuantumState;
  lower: QuantumState;
}

export interface IonPreset {
  id: 'H' | 'He+' | 'Li2+';
  label: string;
  zEff: number;
}

export interface SeriesLine {
  nUpper: number;
  wavelengthNm: number;
  color: WavelengthColor;
}

export const ION_PRESETS: readonly IonPreset[] = [
  { id: 'H', label: 'H (Z = 1)', zEff: 1.0 },
  { id: 'He+', label: 'He⁺ (Z = 2)', zEff: 2.0 },
  { id: 'Li2+', label: 'Li²⁺ (Z = 3)', zEff: 3.0 },
];

export const SPECTRAL_PRESETS: readonly SpectralLinePreset[] = [
  {
    id: 'h-alpha',
    shortLabel: 'H-α · 656 nm',
    zEff: 1.0,
    upper: { n: 3, l: 2, m: 0 },
    lower: { n: 2, l: 1, m: 0 },
  },
  {
    id: 'h-beta',
    shortLabel: 'H-β · 486 nm',
    zEff: 1.0,
    upper: { n: 4, l: 1, m: 0 },
    lower: { n: 2, l: 0, m: 0 },
  },
  {
    id: 'h-gamma',
    shortLabel: 'H-γ · 434 nm',
    zEff: 1.0,
    upper: { n: 5, l: 1, m: 0 },
    lower: { n: 2, l: 0, m: 0 },
  },
  {
    id: 'lyman-alpha',
    shortLabel: 'Ly-α · 121.6 nm',
    zEff: 1.0,
    upper: { n: 2, l: 1, m: 0 },
    lower: { n: 1, l: 0, m: 0 },
  },
  {
    id: 'paschen-alpha',
    shortLabel: 'Pa-α · 1875 nm',
    zEff: 1.0,
    upper: { n: 4, l: 3, m: 0 },
    lower: { n: 3, l: 2, m: 0 },
  },
  {
    id: 'forbidden-2s-1s',
    shortLabel: '2s → 1s',
    zEff: 1.0,
    upper: { n: 2, l: 0, m: 0 },
    lower: { n: 1, l: 0, m: 0 },
  },
];

const VISIBLE_MIN_NM = 380;
const VISIBLE_MAX_NM = 750;
const BRUTON_GAMMA = 0.8;
const SPEED_OF_LIGHT_NM_THZ = 299792.458;

function brutonBaseRgb(w: number): [number, number, number] {
  if (w < 440) return [-(w - 440) / (440 - 380), 0, 1];
  if (w < 490) return [0, (w - 440) / (490 - 440), 1];
  if (w < 510) return [0, 1, -(w - 510) / (510 - 490)];
  if (w < 580) return [(w - 510) / (580 - 510), 1, 0];
  if (w < 645) return [1, -(w - 645) / (645 - 580), 0];
  return [1, 0, 0];
}

function brutonEdgeFactor(w: number): number {
  if (w < 420) return 0.3 + (0.7 * (w - 380)) / (420 - 380);
  if (w > 645) return 0.3 + (0.7 * (750 - w)) / (750 - 645);
  return 1.0;
}

function applyGamma(channel: number, factor: number): number {
  return channel <= 0 ? 0 : Math.pow(channel * factor, BRUTON_GAMMA);
}

function channelToHex(channel: number): string {
  return Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0');
}

export function wavelengthToRgb(wavelengthNm: number): WavelengthColor {
  if (wavelengthNm < VISIBLE_MIN_NM) {
    return { r: 0.66, g: 0.33, b: 0.97, hex: '#a855f7', band: 'uv' };
  }
  if (wavelengthNm > VISIBLE_MAX_NM) {
    return { r: 0.75, g: 0.11, b: 0.24, hex: '#be1c3d', band: 'ir' };
  }

  const [baseR, baseG, baseB] = brutonBaseRgb(wavelengthNm);
  const factor = brutonEdgeFactor(wavelengthNm);
  const r = applyGamma(baseR, factor);
  const g = applyGamma(baseG, factor);
  const b = applyGamma(baseB, factor);
  const hex = `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;

  return { r, g, b, hex, band: 'visible' };
}

function clampInt(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, Math.trunc(value)));
  return clamped === 0 ? 0 : clamped;
}

export function clampQuantumState(
  state: QuantumState,
  minN: number,
  maxN: number,
): QuantumState {
  const n = clampInt(state.n, Math.trunc(minN), Math.trunc(maxN));
  const l = clampInt(state.l, 0, n - 1);
  const m = clampInt(state.m, -l, l);
  return { n, l, m };
}

function resolveForbiddenReason(lower: QuantumState, upper: QuantumState): ForbiddenReason {
  const deltaL = Math.abs(upper.l - lower.l);
  if (deltaL === 0) return 'delta_l_zero';
  if (deltaL !== 1) return 'delta_l_multi';
  if (Math.abs(upper.m - lower.m) > 1) return 'delta_m';
  return 'none';
}

export async function computeTransitionMetrics(
  zEff: number,
  lower: QuantumState,
  upper: QuantumState,
): Promise<TransitionMetrics> {
  const lowerEnergyEv = energyLevelEv(lower.n, zEff);
  const upperEnergyEv = energyLevelEv(upper.n, zEff);
  const deltaEEv = Math.abs(upperEnergyEv - lowerEnergyEv);
  const forbiddenReason = resolveForbiddenReason(lower, upper);

  const [wavelengthNm, isAllowed] = await Promise.all([
    calculateTransitionWavelength(zEff, lower.n, upper.n),
    isDipoleTransitionAllowed(lower.l, lower.m, upper.l, upper.m),
  ]);

  let einsteinA = 0;
  let lifetimeNs: number | null = null;
  let dipoleIntegralBohr = 0;

  if (isAllowed) {
    [einsteinA, dipoleIntegralBohr] = await Promise.all([
      calculateSpontaneousEmissionRate(zEff, lower.n, lower.l, upper.n, upper.l),
      calculateRadialDipoleIntegral(lower.n, lower.l, upper.n, upper.l, zEff),
    ]);
    if (einsteinA > 0) {
      lifetimeNs = 1e9 / einsteinA;
    }
  }

  return {
    lowerEnergyEv,
    upperEnergyEv,
    deltaEEv,
    wavelengthNm,
    frequencyThz: SPEED_OF_LIGHT_NM_THZ / wavelengthNm,
    seriesIndex: lower.n,
    isAllowed,
    forbiddenReason,
    einsteinA,
    lifetimeNs,
    dipoleIntegralBohr,
    color: wavelengthToRgb(wavelengthNm),
  };
}

export async function computeSeriesLines(
  zEff: number,
  nLower: number,
  maxUpperN: number = Math.max(8, nLower + 6),
): Promise<SeriesLine[]> {
  const lines: SeriesLine[] = [];
  for (let nUpper = nLower + 1; nUpper <= maxUpperN; nUpper += 1) {
    const wavelengthNm = await calculateTransitionWavelength(zEff, nLower, nUpper);
    lines.push({
      nUpper,
      wavelengthNm,
      color: wavelengthToRgb(wavelengthNm),
    });
  }
  return lines;
}
