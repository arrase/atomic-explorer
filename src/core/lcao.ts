import {
  evaluate_lcao_curve,
  evaluate_lcao_state,
} from '../../crates/atomic-math/pkg/atomic_math';
import { ensureWasmLoaded } from './wasm-bridge';

export type BondingPresetId = 'h2_1s' | 'he2_1s' | 'sigma_2pz' | 'pi_2px' | 'polar_sigma';
export type PolarBasisPair = '1s_1s' | '1s_2pz';
export type MoOrderMode = 'bonding' | 'antibonding';

export interface AtomOrbitalSpec {
  readonly n: number;
  readonly l: number;
  readonly m: number;
  readonly zEff: number;
}

export interface BondingPreset {
  readonly id: BondingPresetId;
  readonly atomA: AtomOrbitalSpec;
  readonly atomB: AtomOrbitalSpec;
  readonly defaultRBohr: number;
  readonly electronsBonding: number;
  readonly electronsAntibonding: number;
  readonly symmetry: 'sigma' | 'pi';
  readonly isPolar: boolean;
}

export interface LcaoStateResult {
  readonly overlapS: number;
  readonly cABond: number;
  readonly cBBond: number;
  readonly cAAnti: number;
  readonly cBAnti: number;
  readonly shareABond: number;
  readonly shareBBond: number;
  readonly epsAEv: number;
  readonly epsBEv: number;
  readonly moEpsBondEv: number;
  readonly moEpsAntiEv: number;
  readonly ePotBondEv: number;
  readonly ePotAntiEv: number;
  readonly rEqBohr: number;
  readonly dEEv: number;
  readonly peakRefDensity: number;
  readonly nodalZAnti: number | null;
}

export const BOND_R_MIN = 0.6;
export const BOND_R_MAX = 10.0;
export const LCAO_CURVE_STRIDE = 3;

export const BONDING_PRESETS: readonly BondingPreset[] = [
  {
    id: 'h2_1s',
    atomA: { n: 1, l: 0, m: 0, zEff: 1.0 },
    atomB: { n: 1, l: 0, m: 0, zEff: 1.0 },
    defaultRBohr: 1.4,
    electronsBonding: 2,
    electronsAntibonding: 0,
    symmetry: 'sigma',
    isPolar: false,
  },
  {
    id: 'he2_1s',
    atomA: { n: 1, l: 0, m: 0, zEff: 1.7 },
    atomB: { n: 1, l: 0, m: 0, zEff: 1.7 },
    defaultRBohr: 2.0,
    electronsBonding: 2,
    electronsAntibonding: 2,
    symmetry: 'sigma',
    isPolar: false,
  },
  {
    id: 'sigma_2pz',
    atomA: { n: 2, l: 1, m: 0, zEff: 2.4 },
    atomB: { n: 2, l: 1, m: 0, zEff: 2.4 },
    defaultRBohr: 2.9,
    electronsBonding: 2,
    electronsAntibonding: 0,
    symmetry: 'sigma',
    isPolar: false,
  },
  {
    id: 'pi_2px',
    atomA: { n: 2, l: 1, m: 1, zEff: 2.4 },
    atomB: { n: 2, l: 1, m: 1, zEff: 2.4 },
    defaultRBohr: 2.3,
    electronsBonding: 2,
    electronsAntibonding: 0,
    symmetry: 'pi',
    isPolar: false,
  },
  {
    id: 'polar_sigma',
    atomA: { n: 1, l: 0, m: 0, zEff: 1.0 },
    atomB: { n: 1, l: 0, m: 0, zEff: 1.85 },
    defaultRBohr: 1.1,
    electronsBonding: 2,
    electronsAntibonding: 0,
    symmetry: 'sigma',
    isPolar: true,
  },
];

export async function initLcaoEngine(): Promise<void> {
  await ensureWasmLoaded();
}

export function computeLcaoStateSync(
  atomA: AtomOrbitalSpec,
  atomB: AtomOrbitalSpec,
  rBohr: number,
): LcaoStateResult {
  const raw = evaluate_lcao_state(
    atomA.n,
    atomA.l,
    atomA.m,
    atomA.zEff,
    atomB.n,
    atomB.l,
    atomB.m,
    atomB.zEff,
    rBohr,
  );

  return {
    overlapS: raw[0],
    cABond: raw[1],
    cBBond: raw[2],
    cAAnti: raw[3],
    cBAnti: raw[4],
    shareABond: raw[5],
    shareBBond: raw[6],
    epsAEv: raw[7],
    epsBEv: raw[8],
    moEpsBondEv: raw[9],
    moEpsAntiEv: raw[10],
    ePotBondEv: raw[11],
    ePotAntiEv: raw[12],
    rEqBohr: raw[13],
    dEEv: raw[14],
    peakRefDensity: raw[15],
    nodalZAnti: Number.isNaN(raw[16]) ? null : raw[16],
  };
}

export function computeLcaoCurveSync(
  atomA: AtomOrbitalSpec,
  atomB: AtomOrbitalSpec,
  rMin = BOND_R_MIN,
  rMax = BOND_R_MAX,
  steps = 120,
): Float32Array {
  return evaluate_lcao_curve(
    atomA.n,
    atomA.l,
    atomA.m,
    atomA.zEff,
    atomB.n,
    atomB.l,
    atomB.m,
    atomB.zEff,
    rMin,
    rMax,
    steps,
  );
}

export function calculateBondOrder(
  electronsBonding: number,
  electronsAntibonding: number,
): number {
  return (electronsBonding - electronsAntibonding) / 2;
}
