export type AtomicEraId = 'dalton' | 'thomson' | 'rutherford' | 'bohr' | 'schrodinger';

export const ATOMIC_ERAS: readonly AtomicEraId[] = [
  'dalton',
  'thomson',
  'rutherford',
  'bohr',
  'schrodinger',
];

export interface Vec3Tuple {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Fine-structure Coulomb constant e² / (4πε₀) in MeV·fm (CODATA 2018). */
export const COULOMB_E2_MEV_FM = 1.439964547842567;
export const ALPHA_Z = 2;
export const GOLD_Z = 79;
/** Scene scale for Rutherford nuclear neighborhood: 1 scene unit = 100 fm. */
export const RUTHERFORD_FM_PER_UNIT = 100;

export interface RutherfordTrajectoryParams {
  /** Alpha kinetic energy E_α in MeV (2.0 .. 10.0). */
  readonly energyMeV: number;
  /** Impact parameter b in femtometres (>= 0). */
  readonly impactParamFm: number;
  /** Azimuthal angle around the beam (+X) axis in radians [0, 2π). */
  readonly azimuthRad: number;
}

export interface RutherfordTrajectory {
  /** Semi-major axis a = d₀ / 2 = (Z_α · Z_Au · e² / 4πε₀) / E_α in fm. */
  readonly semiMajorFm: number;
  /** Closest approach distance r_min = a · (ε + 1) in fm (2a = d₀ for b = 0). */
  readonly closestApproachFm: number;
  /** Hyperbolic eccentricity ε = sqrt(1 + (b / a)²). */
  readonly eccentricity: number;
  /** Exact asymptotic deflection angle θ = 2 · atan2(a, b) in radians (0, π]. */
  readonly scatteringAngleRad: number;
  /** Exact asymptotic deflection angle θ in degrees (0, 180]. */
  readonly scatteringAngleDeg: number;
  /** Max hyperbolic anomaly H_max reaching the scene boundary. */
  readonly maxAnomaly: number;
  /** Half path-time span s_max = a · (ε · sinh(H_max) + H_max) in fm. */
  readonly maxPathFm: number;
  readonly impactParamFm: number;
  readonly azimuthRad: number;
}

export interface DeBroglieWaveState {
  readonly nWave: number;
  readonly isAllowed: boolean;
  readonly nearestInteger: number;
  /** Phase mismatch after 1 revolution in degrees [0, 180]; 0 when allowed. */
  readonly phaseMismatchDeg: number;
  /** Bohr ring radius in 3D scene units. */
  readonly orbitRadius: number;
  /** Winding revolutions to render (1 when allowed, 4 when forbidden). */
  readonly revolutions: number;
}

const THOMSON_ELECTRON_COUNT = 8;
const THOMSON_RING_RADIUS = 1.35;
const THOMSON_LAYER_Y = 0.85;

const R2_PHI_1 = 0.7548776662466927;
const R2_PHI_2 = 0.5698402909980532;

export function computeThomsonElectronPositions(
  timeSec: number,
  amplitude: number,
): Vec3Tuple[] {
  const positions: Vec3Tuple[] = [];

  for (let i = 0; i < THOMSON_ELECTRON_COUNT; i += 1) {
    const isTopLayer = i < 4;
    const y0 = isTopLayer ? THOMSON_LAYER_Y : -THOMSON_LAYER_Y;
    const baseAngle = isTopLayer
      ? (i * Math.PI) / 2
      : ((i - 4) * Math.PI) / 2 + Math.PI / 4;

    const radialOffset = amplitude * 0.28 * Math.sin(3.4 * timeSec + i * 0.95);
    const axialOffset = amplitude * 0.24 * Math.cos(2.7 * timeSec + i * 1.35);
    const angularOffset = amplitude * 0.14 * Math.sin(2.2 * timeSec + i * 1.75);

    const r = THOMSON_RING_RADIUS + radialOffset;
    const angle = baseAngle + angularOffset;

    positions.push({
      x: r * Math.cos(angle),
      y: y0 + axialOffset,
      z: r * Math.sin(angle),
    });
  }

  return positions;
}

export function sampleRutherfordImpact(
  particleIndex: number,
  spreadFm: number,
): { impactParamFm: number; azimuthRad: number } {
  const step = particleIndex + 1;
  const u1 = (step * R2_PHI_1) % 1;
  const u2 = (step * R2_PHI_2) % 1;
  return {
    impactParamFm: spreadFm * Math.pow(u1, 0.72),
    azimuthRad: 2 * Math.PI * u2,
  };
}

export function computeRutherfordTrajectory(
  params: RutherfordTrajectoryParams,
  boundaryRadiusFm?: number,
): RutherfordTrajectory {
  const semiMajorFm = (ALPHA_Z * GOLD_Z * COULOMB_E2_MEV_FM) / params.energyMeV;
  const eccentricity = Math.hypot(1, params.impactParamFm / semiMajorFm);
  const closestApproachFm = semiMajorFm * (eccentricity + 1);
  const scatteringAngleRad = 2 * Math.atan2(semiMajorFm, params.impactParamFm);
  const scatteringAngleDeg = (scatteringAngleRad * 180) / Math.PI;
  const resolvedBoundaryFm =
    boundaryRadiusFm ?? Math.hypot(1050, params.impactParamFm) + 2 * semiMajorFm;
  const coshHMax = Math.max(1, (resolvedBoundaryFm / semiMajorFm - 1) / eccentricity);
  const maxAnomaly = Math.acosh(coshHMax);
  const maxPathFm = semiMajorFm * (eccentricity * Math.sinh(maxAnomaly) + maxAnomaly);

  return {
    semiMajorFm,
    closestApproachFm,
    eccentricity,
    scatteringAngleRad,
    scatteringAngleDeg,
    maxAnomaly,
    maxPathFm,
    impactParamFm: params.impactParamFm,
    azimuthRad: params.azimuthRad,
  };
}

export function evaluateRutherfordPoint(
  traj: RutherfordTrajectory,
  progress: number,
): Vec3Tuple {
  const a = traj.semiMajorFm;
  const b = traj.impactParamFm;
  const eps = traj.eccentricity;
  const s = (2 * progress - 1) * traj.maxPathFm;
  const target = Math.abs(s) / a;

  let h = Math.asinh(target / eps);
  for (let iter = 0; iter < 4; iter += 1) {
    h -= (eps * Math.sinh(h) + h - target) / (eps * Math.cosh(h) + 1);
  }
  const signedH = s < 0 ? -h : h;

  const u = a * (eps + Math.cosh(signedH));
  const v = b * Math.sinh(signedH);
  const sinHalf = 1 / eps;
  const cosHalf = b / (a * eps);

  const xFm = -u * sinHalf + v * cosHalf;
  const rPerpFm = u * cosHalf + v * sinHalf;

  return {
    x: xFm / RUTHERFORD_FM_PER_UNIT,
    y: (rPerpFm * Math.cos(traj.azimuthRad)) / RUTHERFORD_FM_PER_UNIT,
    z: (rPerpFm * Math.sin(traj.azimuthRad)) / RUTHERFORD_FM_PER_UNIT,
  };
}

export function getDeBroglieWaveState(nWave: number): DeBroglieWaveState {
  const nearestInteger = Math.round(nWave);
  const frac = Math.abs(nWave - nearestInteger);
  const isAllowed = frac <= 0.01;
  const phaseMismatchDeg = isAllowed ? 0 : Math.round(frac * 360);
  const orbitRadius = 1.65 + 0.55 * nWave;
  const revolutions = isAllowed ? 1 : 4;

  return {
    nWave,
    isAllowed,
    nearestInteger,
    phaseMismatchDeg,
    orbitRadius,
    revolutions,
  };
}

export function sampleDeBroglieWavePoints(
  nWave: number,
  phaseTimeSec: number,
  segmentsPerRev = 144,
): Vec3Tuple[] {
  const state = getDeBroglieWaveState(nWave);
  const totalSteps = state.revolutions * segmentsPerRev;
  const points: Vec3Tuple[] = [];
  const standingCos = Math.cos(3.2 * phaseTimeSec);
  const standingSin = Math.sin(3.2 * phaseTimeSec);

  for (let i = 0; i <= totalSteps; i += 1) {
    const phi = (i / segmentsPerRev) * 2 * Math.PI;
    let r: number;
    let y: number;

    if (state.isAllowed) {
      const psi = 0.42 * Math.sin(state.nearestInteger * phi) * standingCos;
      r = state.orbitRadius + psi;
      y = 0.08 * Math.cos(state.nearestInteger * phi) * standingSin;
    } else {
      const psi = 0.42 * Math.sin(nWave * phi - 3.6 * phaseTimeSec);
      const turnOffset = (phi / (2 * Math.PI) - 1.5) * 0.13;
      r = state.orbitRadius + psi;
      y = turnOffset + 0.05 * psi;
    }

    points.push({
      x: r * Math.cos(phi),
      y,
      z: r * Math.sin(phi),
    });
  }

  return points;
}
