import elementsData from '../../assets/data/elements.json';
import isotopesData from '../../assets/data/isotopes.json';
import {
  evaluateNuclideWasm,
  getSegreGridWasm,
  getValleyBaCurveWasm,
} from './wasm-bridge';

export const MAX_Z = 118;
export const MAX_N = 180;
export const MAX_CURVE_A = 250;
export const MAGIC_NUMBERS = [2, 8, 20, 28, 50, 82, 126] as const;

export type SemfDecayMode =
  | 'stable'
  | 'beta_minus'
  | 'beta_plus'
  | 'alpha'
  | 'proton_drip'
  | 'neutron_drip';

export type DecayMode = SemfDecayMode | 'gamma';

export type HalfLifeUnit = 'min' | 'h' | 'd' | 'yr' | 'Myr' | 'Gyr';

export type IsotopeNoteKey =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'he3'
  | 'he4'
  | 'c12'
  | 'c13'
  | 'c14'
  | 'o16'
  | 'f18'
  | 'k40'
  | 'ca40'
  | 'fe56'
  | 'co60'
  | 'tc99m'
  | 'i131'
  | 'cs137'
  | 'pb208'
  | 'po210'
  | 'ra226'
  | 'u235'
  | 'u238'
  | 'pu239'
  | 'am241';

export interface IsotopePreset {
  id: IsotopeNoteKey;
  z: number;
  n: number;
  symbol: string;
  metastable: boolean;
  decayMode: DecayMode;
  halfLifeValue: number | null;
  halfLifeUnit: HalfLifeUnit | null;
}

export interface NuclideState {
  z: number;
  n: number;
  a: number;
  symbol: string;
  bindingEnergyMeV: number;
  bindingPerNucleonMeV: number;
  radiusFm: number;
  atomRadiusPm: number;
  scaleRatio: number;
  optimalZ: number;
  decayMode: DecayMode;
  isMagicZ: boolean;
  isMagicN: boolean;
  preset: IsotopePreset | null;
}

export interface NuclearChartsData {
  segreGrid: Uint8Array;
  valleyPoints: [number, number][];
  baCurve: Float32Array;
}

export const FAMOUS_ISOTOPES: readonly IsotopePreset[] = isotopesData as readonly IsotopePreset[];

const SEMF_DECAY_MODES: readonly SemfDecayMode[] = [
  'stable',
  'beta_minus',
  'beta_plus',
  'alpha',
  'proton_drip',
  'neutron_drip',
];

const PRESETS_BY_ID = Object.fromEntries(
  FAMOUS_ISOTOPES.map((preset) => [preset.id, preset]),
) as Record<IsotopeNoteKey, IsotopePreset>;

const MAGIC_SET = new Set<number>(MAGIC_NUMBERS);

const DECAY_DELTAS: Record<Exclude<DecayMode, 'stable'>, readonly [number, number]> = {
  alpha: [-2, -2],
  beta_minus: [1, -1],
  beta_plus: [-1, 1],
  gamma: [0, 0],
  proton_drip: [-1, 0],
  neutron_drip: [0, -1],
};

export function decodeDecayCode(code: number): SemfDecayMode {
  return SEMF_DECAY_MODES[code];
}

export function findGroundPreset(z: number, n: number): IsotopePreset | null {
  for (const preset of FAMOUS_ISOTOPES) {
    if (!preset.metastable && preset.z === z && preset.n === n) {
      return preset;
    }
  }
  return null;
}

export function getPresetById(id: IsotopeNoteKey): IsotopePreset {
  return PRESETS_BY_ID[id];
}

export function computeDecayDaughter(
  z: number,
  n: number,
  mode: DecayMode,
): { z: number; n: number } | null {
  if (mode === 'stable') return null;
  const [dz, dn] = DECAY_DELTAS[mode];
  const nextZ = z + dz;
  const nextN = n + dn;
  if (nextZ < 1 || nextZ > MAX_Z || nextN < 0 || nextN > MAX_N) {
    return null;
  }
  return { z: nextZ, n: nextN };
}

export async function evaluateNuclide(
  z: number,
  n: number,
  explicitPreset?: IsotopePreset | null,
): Promise<NuclideState> {
  const raw = await evaluateNuclideWasm(z, n);
  const element = elementsData[z - 1];
  const preset = explicitPreset ? explicitPreset : findGroundPreset(z, n);
  const decayMode: DecayMode = preset ? preset.decayMode : decodeDecayCode(raw.decayCode);
  const atomRadiusPm = element.radius_pm;

  return {
    z,
    n,
    a: z + n,
    symbol: element.symbol,
    bindingEnergyMeV: raw.bindingEnergyMeV,
    bindingPerNucleonMeV: raw.bindingPerNucleonMeV,
    radiusFm: raw.radiusFm,
    atomRadiusPm,
    scaleRatio: (atomRadiusPm * 1000) / raw.radiusFm,
    optimalZ: raw.optimalZ,
    decayMode,
    isMagicZ: MAGIC_SET.has(z),
    isMagicN: MAGIC_SET.has(n),
    preset,
  };
}

function computeValleyPoints(): [number, number][] {
  const points: [number, number][] = [];
  for (let a = 2; a <= 260; a++) {
    const zOpt = a / (2 + (0.711 / 47.4) * Math.cbrt(a) ** 2);
    const nOpt = a - zOpt;
    if (zOpt <= MAX_Z && nOpt <= MAX_N) {
      points.push([zOpt, nOpt]);
    }
  }
  return points;
}

let chartsPromise: Promise<NuclearChartsData> | null = null;

export function loadNuclearChartsData(): Promise<NuclearChartsData> {
  if (!chartsPromise) {
    chartsPromise = Promise.all([
      getSegreGridWasm(MAX_Z, MAX_N),
      getValleyBaCurveWasm(MAX_CURVE_A),
    ]).then(([segreGrid, baCurve]) => ({
      segreGrid,
      valleyPoints: computeValleyPoints(),
      baCurve,
    }));
  }
  return chartsPromise;
}
