import { getElectronConfiguration, getSlaterZEff } from './wasm-bridge';

export interface ValenceQuantumNumbers {
  n: number;
  l: number;
  m: number;
  s: number;
  zEff: number;
}

/** Subshell letter for an azimuthal quantum number, as in 3d or 4f. */
const SUBSHELL_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i'];

export function hundDifferentiatingElectron(
  l: number,
  electrons: number,
): { m: number; s: number } {
  const boxCount = 2 * l + 1;
  if (electrons <= boxCount) {
    return { m: -l + (electrons - 1), s: 0.5 };
  }
  return { m: -l + (electrons - boxCount - 1), s: -0.5 };
}

/**
 * Quantum numbers of the ground-state valence orbital and Hund's-rule differentiating electron.
 */
export async function calculateValenceQuantumNumbers(z: number): Promise<ValenceQuantumNumbers> {
  const config = await getElectronConfiguration(z);
  const valence = config[config.length - 1];
  const { m, s } = hundDifferentiatingElectron(valence.l, valence.electrons);
  const zEff = await getSlaterZEff(z, valence.n, valence.l);
  return {
    n: valence.n,
    l: valence.l,
    m,
    s,
    zEff: Math.round(zEff * 100) / 100,
  };
}

/** Subshell name for a state, e.g. `4d` for n = 4, l = 2. */
export function subshellName(n: number, l: number): string {
  return `${n}${SUBSHELL_LETTERS[l] ?? '?'}`;
}
