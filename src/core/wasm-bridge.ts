import init, {
  sample_orbital_points,
  get_slater_z_eff,
  evaluate_isosurface_grid,
  evaluate_density_grid,
} from '../../crates/atomic-math/pkg/atomic_math';

export interface OrbitalParams {
  n: number;
  l: number;
  m: number;
  useRealOrbital: boolean;
  zEff: number;
  pointCount: number;
}

let wasmInitPromise: Promise<void> | null = null;

export async function ensureWasmLoaded(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = init().then(() => undefined);
  }
  return wasmInitPromise;
}

export async function getSlaterZEff(z: number, n: number, l: number): Promise<number> {
  await ensureWasmLoaded();
  return get_slater_z_eff(z, n, l);
}

export async function sampleOrbitalPoints(params: OrbitalParams): Promise<Float32Array> {
  await ensureWasmLoaded();
  const seed = BigInt(Date.now());
  return sample_orbital_points(
    params.n,
    params.l,
    params.m,
    params.useRealOrbital,
    params.zEff,
    params.pointCount,
    seed,
  );
}

export async function evaluateIsosurfaceGrid(
  n: number,
  l: number,
  m: number,
  useRealOrbital: boolean,
  zEff: number,
  gridSize: number,
  bounds: number,
  contrast: number,
): Promise<Float32Array> {
  await ensureWasmLoaded();
  return evaluate_isosurface_grid(
    n,
    l,
    m,
    useRealOrbital,
    zEff,
    gridSize,
    bounds,
    contrast,
  );
}

export async function evaluateDensityGrid(
  n: number,
  l: number,
  m: number,
  useRealOrbital: boolean,
  zEff: number,
  gridSize: number,
  bounds: number,
): Promise<Float32Array> {
  await ensureWasmLoaded();
  return evaluate_density_grid(
    n,
    l,
    m,
    useRealOrbital,
    zEff,
    gridSize,
    bounds,
  );
}

