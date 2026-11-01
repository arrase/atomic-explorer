import init, {
  sample_orbital_points,
  get_slater_z_eff,
  evaluate_isosurface_grid,
  orbital_peak_density,
  radial_probability_quantile,
  get_electron_configuration,
  sto_radial_wavefunction,
  get_radial_nodes,
  get_polar_nodal_cosines,
  calculate_transition_wavelength,
  is_dipole_transition_allowed,
  calculate_spontaneous_emission_rate,
  calculate_radial_dipole_integral,
  get_nuclear_binding_energy,
  get_nuclear_binding_per_nucleon,
  get_nuclear_radius_fm,
  get_nuclear_optimal_z,
  predict_nuclear_decay,
  evaluate_segre_grid,
  evaluate_valley_ba_curve,
} from '../../crates/atomic-math/pkg/atomic_math';

export interface OrbitalParams {
  n: number;
  l: number;
  m: number;
  useRealOrbital: boolean;
  zEff: number;
  pointCount: number;
}

export interface IsosurfaceGridParams {
  n: number;
  l: number;
  m: number;
  useRealOrbital: boolean;
  zEff: number;
  gridSize: number;
  bounds: number;
  contrast: number;
  isolevel: number;
}

export interface SubshellOccupancy {
  n: number;
  l: number;
  electrons: number;
}

/**
 * Physical sizes the renderer needs before it can lay out a frame.
 *
 * Both numbers come straight from the wavefunction, which is what lets the
 * viewport frame the orbital the same way for hydrogen and for a contracted
 * silver cloud, without a magic constant per n.
 */
export interface OrbitalGeometry {
  /** Radius (a0) enclosing FRAMING_QUANTILE of the electron probability. */
  frameRadius: number;
  /** Half-size (a0) of the box the volumetric modes integrate over. */
  boxExtent: number;
  /** Spherical radial node radii (a0) where R_nl(r) = 0. */
  radialNodes: number[];
}

/** Fraction of the probability the default camera framing must keep on screen. */
export const FRAMING_QUANTILE = 0.985;

const BOX_MARGIN = 1.15;

/**
 * Floats per sample in the buffer returned by `sampleOrbitalPoints`:
 * `[x, y, z, phase_sign, relative_density]`.
 *
 * Mirrors `SAMPLE_STRIDE` in `crates/atomic-math/src/lib.rs`, which is the
 * definition. Keep the two in step when the sample layout changes; the Rust
 * tests assert the buffer length against the Rust constant, so they catch a
 * change there.
 */
export const SAMPLE_STRIDE = 5;

const SUBSHELL_STRIDE = 3;

let wasmInitPromise: Promise<void> | null = null;
let wasmReady = false;

export async function ensureWasmLoaded(): Promise<void> {
  wasmInitPromise ??= init().then(() => {
    wasmReady = true;
  });
  return wasmInitPromise;
}

export async function getSlaterZEff(z: number, n: number, l: number): Promise<number> {
  await ensureWasmLoaded();
  return get_slater_z_eff(z, n, l);
}

/**
 * Stable RNG seed for the point cloud.
 *
 * A fixed seed means the candidate stream is identical between reloads, so the
 * accepted points stay put in space: raising the point count only extends the
 * cloud instead of re-rolling it, and the pattern does not shimmer while the
 * camera orbits. It does *not* make a Z_eff change a continuous morph - the
 * accepted subset is chosen by an acceptance rate that depends on the orbital,
 * so a new Z_eff re-rolls it.
 */
const SAMPLE_SEED = 0x5eed1e5eed1e5eedn;

export async function sampleOrbitalPoints(params: OrbitalParams): Promise<Float32Array> {
  await ensureWasmLoaded();
  return sample_orbital_points(
    params.n,
    params.l,
    params.m,
    params.useRealOrbital,
    params.zEff,
    params.pointCount,
    SAMPLE_SEED,
  );
}

/** Peak of |psi|^2 over all space, the unit the density transfer function uses. */
export async function getOrbitalPeakDensity(
  n: number,
  l: number,
  m: number,
  useRealOrbital: boolean,
  zEff: number,
): Promise<number> {
  await ensureWasmLoaded();
  return orbital_peak_density(n, l, m, useRealOrbital, zEff);
}

/**
 * Bounded memo for {@link resolveOrbitalGeometry}.
 *
 * The key contains Z_eff, which comes from a continuous slider, so an unbounded
 * map would accumulate one entry per drag event for the life of the session. The
 * access pattern is overwhelmingly "same parameters as last time", so a handful
 * of slots captures effectively all of the hit rate without the growth.
 */
const GEOMETRY_CACHE_SIZE = 8;
const geometryCache = new Map<string, OrbitalGeometry>();

/**
 * Resolves the framing radius and the volumetric box for a state.
 *
 * Both only depend on (n, l, Z_eff) and are cheap in WASM, but dragging Z_eff
 * fires a reload per input event, so results are memoised per parameter set.
 */
export async function resolveOrbitalGeometry(
  n: number,
  l: number,
  zEff: number,
): Promise<OrbitalGeometry> {
  const key = `${n}|${l}|${zEff}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  await ensureWasmLoaded();
  const frameRadius = radial_probability_quantile(n, l, zEff, FRAMING_QUANTILE);
  const geometry: OrbitalGeometry = {
    frameRadius,
    boxExtent: frameRadius * BOX_MARGIN,
    radialNodes: Array.from(get_radial_nodes(n, l, zEff)),
  };
  geometryCache.delete(key);
  geometryCache.set(key, geometry);
  if (geometryCache.size > GEOMETRY_CACHE_SIZE) {
    geometryCache.delete(geometryCache.keys().next().value as string);
  }
  return geometry;
}

export async function evaluateIsosurfaceGrid(params: IsosurfaceGridParams): Promise<Float32Array> {
  await ensureWasmLoaded();
  return evaluate_isosurface_grid(
    params.n,
    params.l,
    params.m,
    params.useRealOrbital,
    params.zEff,
    params.gridSize,
    new Float32Array([params.bounds, params.contrast, params.isolevel]),
  );
}

export async function getElectronConfiguration(z: number): Promise<SubshellOccupancy[]> {
  await ensureWasmLoaded();
  const flat = get_electron_configuration(z);
  const subshells: SubshellOccupancy[] = [];
  for (let i = 0; i < flat.length; i += SUBSHELL_STRIDE) {
    subshells.push({
      n: flat[i],
      l: flat[i + 1],
      electrons: flat[i + 2],
    });
  }
  return subshells;
}

export async function getPolarNodalCosines(
  l: number,
  m: number,
  useRealOrbital: boolean,
): Promise<number[]> {
  await ensureWasmLoaded();
  return Array.from(get_polar_nodal_cosines(l, m, useRealOrbital));
}

export async function getStoRadialWavefunction(
  n: number,
  zEff: number,
  r: number,
): Promise<number> {
  await ensureWasmLoaded();
  return sto_radial_wavefunction(n, zEff, r);
}

export function stoRadialProbabilitySync(n: number, zEff: number, r: number): number {
  if (!wasmReady) return 0;
  const val = sto_radial_wavefunction(n, zEff, r);
  return r * r * val * val;
}

export async function calculateTransitionWavelength(
  zEff: number,
  n1: number,
  n2: number,
): Promise<number> {
  await ensureWasmLoaded();
  return calculate_transition_wavelength(zEff, n1, n2);
}

export async function isDipoleTransitionAllowed(
  l1: number,
  m1: number,
  l2: number,
  m2: number,
): Promise<boolean> {
  await ensureWasmLoaded();
  return is_dipole_transition_allowed(l1, m1, l2, m2);
}

export async function calculateSpontaneousEmissionRate(
  zEff: number,
  n1: number,
  l1: number,
  n2: number,
  l2: number,
): Promise<number> {
  await ensureWasmLoaded();
  return calculate_spontaneous_emission_rate(zEff, n1, l1, n2, l2);
}

export async function calculateRadialDipoleIntegral(
  n1: number,
  l1: number,
  n2: number,
  l2: number,
  zEff: number,
): Promise<number> {
  await ensureWasmLoaded();
  return calculate_radial_dipole_integral(n1, l1, n2, l2, zEff);
}

export interface RawNuclideMetrics {
  bindingEnergyMeV: number;
  bindingPerNucleonMeV: number;
  radiusFm: number;
  optimalZ: number;
  decayCode: number;
}

export async function evaluateNuclideWasm(z: number, n: number): Promise<RawNuclideMetrics> {
  await ensureWasmLoaded();
  const a = z + n;
  return {
    bindingEnergyMeV: get_nuclear_binding_energy(z, n),
    bindingPerNucleonMeV: get_nuclear_binding_per_nucleon(z, n),
    radiusFm: get_nuclear_radius_fm(a),
    optimalZ: get_nuclear_optimal_z(a),
    decayCode: predict_nuclear_decay(z, n),
  };
}

export async function getSegreGridWasm(maxZ: number, maxN: number): Promise<Uint8Array> {
  await ensureWasmLoaded();
  return evaluate_segre_grid(maxZ, maxN);
}

export async function getValleyBaCurveWasm(maxA: number): Promise<Float32Array> {
  await ensureWasmLoaded();
  return evaluate_valley_ba_curve(maxA);
}
