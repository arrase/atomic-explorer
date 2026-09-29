import init, {
  sample_orbital_points,
  get_slater_z_eff,
  evaluate_isosurface_grid,
  orbital_peak_density,
  radial_probability_quantile,
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

let wasmInitPromise: Promise<void> | null = null;

export async function ensureWasmLoaded(): Promise<void> {
  wasmInitPromise ??= init().then(() => undefined);
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
