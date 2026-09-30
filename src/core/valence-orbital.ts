import { getSlaterZEff } from './wasm-bridge';

export interface ValenceQuantumNumbers {
  n: number;
  l: number;
  m: number;
  zEff: number;
}

/**
 * Last Z filled for each subshell in the Aufbau order, with its (n, l).
 *
 * The subshell an element is last filled through is the one that decides its
 * valence shell, so the table only needs one entry per subshell. It is a
 * deliberate simplification: it ignores the exceptions (Cr, Cu, Pd, Pt, ...) and
 * the f-block's own ordering, which move a handful of atoms to a neighbouring
 * subshell. The element's own `electron_config_str` still shows the real
 * configuration - this only picks which orbital to put on screen.
 */
const AUFBAU_TABLE: [number, number, number][] = [
  [2, 1, 0], [4, 2, 0], [10, 2, 1], [12, 3, 0], [18, 3, 1],
  [20, 4, 0], [30, 3, 2], [36, 4, 1], [38, 5, 0], [48, 4, 2],
  [54, 5, 1], [56, 6, 0], [70, 4, 3], [80, 5, 2], [86, 6, 1],
  [88, 7, 0], [102, 5, 3], [112, 6, 2], [Infinity, 7, 1],
];

/** Subshell letter for an azimuthal quantum number, as in 3d or 4f. */
const SUBSHELL_LETTERS = ['s', 'p', 'd', 'f'];

/**
 * Quantum numbers of the valence orbital an element is last filled through.
 *
 * `m` is always 0 and the charge is Slater's, which is the pair the rest of the
 * app is already built around: the 3D tab and this preview must agree on what
 * "the valence orbital of Fe" means, or the preview would advertise a state the
 * big renderer never shows.
 */
export async function calculateValenceQuantumNumbers(z: number): Promise<ValenceQuantumNumbers> {
  const [, n, l] = AUFBAU_TABLE.find(([maxZ]) => z <= maxZ)!;
  const m = 0;
  const zEff = await getSlaterZEff(z, n, l);
  return { n, l, m, zEff: Math.round(zEff * 100) / 100 };
}

/** Subshell name for a state, e.g. `4d` for n = 4, l = 2. */
export function subshellName(n: number, l: number): string {
  return `${n}${SUBSHELL_LETTERS[l] ?? '?'}`;
}
