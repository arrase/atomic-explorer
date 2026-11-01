import type { DeepLinkState } from './url-state';

export type GuidedTourId =
  | 'quantum-cloud'
  | 'cosmic-light'
  | 'chemical-bonds'
  | 'metals-exceptions'
  | 'nuclear-heart';

export interface GuidedTourDefinition {
  readonly id: GuidedTourId;
  readonly steps: readonly [DeepLinkState, DeepLinkState, DeepLinkState, DeepLinkState];
}

const GUIDED_TOUR_MAP: Record<GuidedTourId, GuidedTourDefinition> = {
  'quantum-cloud': {
    id: 'quantum-cloud',
    steps: [
      { tab: 'history', era: 'dalton' },
      { tab: 'history', era: 'rutherford' },
      { tab: 'history', era: 'bohr' },
      { tab: 'orbitals', n: 2, l: 1, m: 0, zEff: 1, useRealOrbital: true, mode: 'points' },
    ],
  },
  'cosmic-light': {
    id: 'cosmic-light',
    steps: [
      { tab: 'orbitals', n: 2, l: 0, m: 0, zEff: 1, useRealOrbital: true, mode: 'raymarching' },
      { tab: 'orbitals', n: 3, l: 1, m: 0, zEff: 1, useRealOrbital: true, mode: 'raymarching' },
      { tab: 'spectroscopy', el: 1, n1: 2, n2: 3 },
      { tab: 'periodic-table', el: 10, block: 'p', colorScheme: 'category' },
    ],
  },
  'chemical-bonds': {
    id: 'chemical-bonds',
    steps: [
      { tab: 'orbitals', n: 1, l: 0, m: 0, zEff: 1, useRealOrbital: true, mode: 'isosurface' },
      { tab: 'bonding', preset: 'h2_1s', r: 1.4, anti: false },
      { tab: 'bonding', preset: 'h2_1s', r: 1.4, anti: true },
      { tab: 'molecules', mol: 'H2O' },
    ],
  },
  'metals-exceptions': {
    id: 'metals-exceptions',
    steps: [
      { tab: 'periodic-table', el: 24, block: 'd', colorScheme: 'category' },
      { tab: 'orbitals', n: 4, l: 0, m: 0, zEff: 2.95, useRealOrbital: true, mode: 'points' },
      { tab: 'orbitals', n: 3, l: 2, m: 0, zEff: 4.6, useRealOrbital: true, mode: 'isosurface' },
      {
        tab: 'orbitals',
        n: 3,
        l: 2,
        m: 0,
        zEff: 4.6,
        useRealOrbital: true,
        mode: 'raymarching',
        cut: 'x',
        nodal: true,
      },
    ],
  },
  'nuclear-heart': {
    id: 'nuclear-heart',
    steps: [
      { tab: 'nucleus', z: 2, n: 2 },
      { tab: 'nucleus', z: 26, n: 30 },
      { tab: 'nucleus', z: 6, n: 8 },
      { tab: 'periodic-table', el: 92, block: 'f', colorScheme: 'discovery' },
    ],
  },
};

export const GUIDED_TOURS: readonly GuidedTourDefinition[] = [
  GUIDED_TOUR_MAP['quantum-cloud'],
  GUIDED_TOUR_MAP['cosmic-light'],
  GUIDED_TOUR_MAP['chemical-bonds'],
  GUIDED_TOUR_MAP['metals-exceptions'],
  GUIDED_TOUR_MAP['nuclear-heart'],
];

export function getGuidedTourById(id: GuidedTourId): GuidedTourDefinition {
  return GUIDED_TOUR_MAP[id];
}
