import init, { sample_orbital_points } from '../../crates/atomic-math/pkg/atomic_math';

export interface OrbitalParams {
  n: number;
  l: number;
  m: number;
  useRealOrbital: boolean;
  zEff: number;
  pointCount: number;
}

let wasmReady = false;
let wasmInitPromise: Promise<void> | null = null;

async function ensureWasmLoaded(): Promise<boolean> {
  if (wasmReady) return true;

  if (!wasmInitPromise) {
    wasmInitPromise = init()
      .then(() => { wasmReady = true; })
      .catch((err) => {
        console.warn('WASM module not available, using TypeScript fallback:', err);
        wasmInitPromise = null;
      });
  }

  await wasmInitPromise;
  return wasmReady;
}

function sample1s(): [number, number, number] {
  const maxProb = 0.15;
  for (;;) {
    const r = Math.random() * 8;
    const theta = Math.random() * Math.PI;
    const phi = Math.random() * 2 * Math.PI;

    const prob = r * r * Math.sin(theta) * Math.exp(-2 * r);

    if (Math.random() * maxProb < prob) {
      return [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta)
      ];
    }
  }
}

function sample2pz(): [number, number, number] {
  const maxProb = 2.0;
  for (;;) {
    const r = Math.random() * 20;
    const theta = Math.random() * Math.PI;
    const phi = Math.random() * 2 * Math.PI;

    const prob = Math.pow(r, 4) * Math.exp(-r) * Math.pow(Math.cos(theta), 2) * Math.sin(theta);

    if (Math.random() * maxProb < prob) {
      return [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta)
      ];
    }
  }
}

function sampleFallback(params: OrbitalParams): Float32Array {
  const { pointCount, n, l } = params;
  const data = new Float32Array(pointCount * 3);

  for (let i = 0; i < pointCount; i++) {
    const pt = (n === 2 && l === 1) ? sample2pz() : sample1s();
    data[i * 3] = pt[0];
    data[i * 3 + 1] = pt[1];
    data[i * 3 + 2] = pt[2];
  }

  return data;
}

export async function sampleOrbitalPoints(params: OrbitalParams): Promise<Float32Array> {
  const loaded = await ensureWasmLoaded();

  if (loaded) {
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

  return sampleFallback(params);
}
