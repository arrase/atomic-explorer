import * as THREE from 'three';
import { SAMPLE_STRIDE } from '../core/wasm-bridge';

export type ColorPalette = 'default' | 'fire' | 'emerald' | 'spectrum';

export const PALETTE_CONFIG: Record<ColorPalette, { id: number; posColor: number; negColor: number }> = {
  default: { id: 0, posColor: 0x00ccff, negColor: 0xff6611 },
  fire: { id: 1, posColor: 0xffcc33, negColor: 0x6600cc },
  emerald: { id: 2, posColor: 0x66ffb2, negColor: 0xcc9900 },
  spectrum: { id: 3, posColor: 0x22ccff, negColor: 0xff2255 },
};

/**
 * Fraction of the electron probability the point cloud is required to show.
 *
 * The transfer function's floor is derived from this: the cloud is drawn down
 * to whatever density still contains this much probability, so a compact 1s and
 * a diffuse 7s are both drawn at the same statistical standard. Nothing is
 * hidden arbitrarily, and the same slider means the same thing for every
 * orbital.
 *
 * Deliberately a little below the FRAMING_QUANTILE the camera is fitted to.
 * The visible set {|psi|^2 >= floor} always reaches slightly past the radius
 * that holds the same probability, because in the tail the density is low in
 * every direction at once; framing from the smaller of the two lets that soft
 * rim bleed off the edge of the viewport instead of being cut off by it.
 */
const VISIBLE_QUANTILE = 0.97;

/** Guard rails for the derived floor, in case the sample is degenerate. */
const MIN_DENSITY_FLOOR = 1e-8;
const MAX_DENSITY_FLOOR = 0.05;

/**
 * Opacity of a single dot sitting at the peak of the density.
 *
 * Chosen against the ink budget of the densest part of an average cloud: a dot
 * covers about a tenth of its bounding disc, so `POINT_OPACITY * dot_size^2`
 * sets how much of the body ends up opaque, and this lands it near half
 * coverage. Higher values make the body solid but let isolated samples in the
 * halo show up as hard speckles.
 */
const POINT_OPACITY = 0.75;

/**
 * Dot diameter in CSS px at REFERENCE_POINT_COUNT samples on a
 * REFERENCE_VIEWPORT_HEIGHT_PX tall viewport, before clamping.
 *
 * Ink on screen is `count * dot_area * opacity`, and the dot area is fixed at
 * this reference, so raising the quality preset buys a smoother cloud instead of
 * a brighter one. The value is sized so that the body of an average orbital
 * lands near half coverage: fewer, fatter dots at low counts, more, finer ones
 * at high counts, with the same apparent density.
 */
const BASE_DOT_SIZE_PX = 4.6;
const MIN_DOT_SIZE_PX = 0.8;
const MAX_DOT_SIZE_PX = 9;
export const REFERENCE_POINT_COUNT = 60_000;
const REFERENCE_VIEWPORT_HEIGHT_PX = 900;

// Point cloud rendering.
//
// The cloud is a Monte Carlo sample of |psi|^2, so the *number* of dots per unit
// volume already is the probability density. The only thing the shader has to
// add is a transfer function: |psi|^2 spans up to ~20 decades between the core
// of a hydrogenic orbital and the halo of a contracted one, and drawing every
// accepted sample with the same opacity is what turns a diffuse orbital into a
// white blob. Mapping the density onto opacity logarithmically keeps the core,
// the lobes and the halo simultaneously readable without inventing structure:
// the mapping is monotone, so it can only re-weight, never create or destroy,
// features of the real density.
const pointVertexShader = `
  attribute float a_sign;
  attribute float a_density;
  varying float vWeight;
  varying float vSign;
  varying float vRadiusNorm;

  uniform float u_contrast;
  uniform float u_floor;
  uniform float u_pointRadius;
  uniform float u_radiusRef;
  uniform float u_viewportHalfHeight;

  void main() {
    vSign = a_sign;
    vRadiusNorm = length(position) / u_radiusRef;

    // Same contrast curve the isosurface and raymarching modes use, so a given
    // slider setting means the same thing in all three render modes. It lifts
    // the faint tail, i.e. it buys extra visibility of the diffuse cloud.
    float d = u_contrast > 0.0
      ? log(1.0 + u_contrast * a_density) / log(1.0 + u_contrast)
      : a_density;

    // Log window between the derived floor and the peak, shaped with a
    // smoothstep. This is the whole reason diffuse orbitals stay readable: a
    // linear map of |psi|^2 would either burn the core to white or crush the
    // lobes into noise, because the two differ by up to 20 decades. The ramp is
    // monotone, so it re-weights the real density without inventing structure,
    // and the smoothstep edges make the body read as a solid shape instead of
    // as fog.
    float t = clamp(1.0 - log(max(d, 1e-30)) / log(u_floor), 0.0, 1.0);
    vWeight = t * t * (3.0 - 2.0 * t);

    // Drop the samples below the floor in the vertex stage: they are
    // invisible by construction, and skipping them saves the fill rate the
    // invisible outer shell would otherwise cost.
    if (vWeight <= 0.0) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective attenuation derived from the projection matrix, so a dot is
    // the same size in CSS pixels at any display density, camera or FOV.
    // projectionMatrix[1][1] is 1 / tan(fovY / 2).
    float pixels = u_pointRadius * projectionMatrix[1][1] * u_viewportHalfHeight
                 / max(-mvPosition.z, 1e-4);
    // Denser samples get slightly larger dots, so the core reads as a solid
    // body while the halo stays fine grained.
    gl_PointSize = clamp(pixels * mix(0.7, 1.35, vWeight), 1.0, 96.0);
  }
`;

const pointFragmentShader = `
  varying float vWeight;
  varying float vSign;
  varying float vRadiusNorm;

  uniform float u_alphaScale;
  uniform float u_opacity;
  uniform int u_palette;
  uniform bool u_useReal;

  #define PI 3.14159265359

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  vec3 getPointPaletteColor(float t, float signVal, int paletteId, bool useReal) {
    // For pure eigenstates: signVal carries the continuous quantum phase Arg(psi) in [-PI, PI]
    if (!useReal) {
      float hue = fract((signVal + PI) / (2.0 * PI));
      if (paletteId == 3) { // Spectrum: full chromatic phase wheel
        return hsv2rgb(vec3(hue, 0.85, 1.0));
      } else if (paletteId == 1) { // Fire
        return mix(vec3(1.0, 0.2, 0.0), vec3(1.0, 0.9, 0.3), 0.5 + 0.5 * sin(signVal));
      } else if (paletteId == 2) { // Emerald
        return mix(vec3(0.0, 0.7, 0.6), vec3(0.6, 1.0, 0.2), 0.5 + 0.5 * sin(signVal));
      }
      // Default: smooth phase progression around the color wheel
      return hsv2rgb(vec3(fract(hue * 0.75 + 0.5), 0.85, 1.0));
    }

    if (paletteId == 1) { // Fire
      if (signVal > 0.0) return mix(vec3(1.0, 0.7, 0.1), vec3(1.0, 0.9, 0.3), t);
      return mix(vec3(0.9, 0.1, 0.1), vec3(0.5, 0.0, 0.5), t);
    } else if (paletteId == 2) { // Emerald
      if (signVal > 0.0) return mix(vec3(0.2, 1.0, 0.6), vec3(0.5, 1.0, 0.8), t);
      return mix(vec3(0.9, 0.6, 0.1), vec3(0.8, 0.3, 0.0), t);
    } else if (paletteId == 3) { // Spectrum
      if (signVal > 0.0) return mix(vec3(0.8, 0.2, 1.0), vec3(0.4, 0.6, 1.0), t);
      return mix(vec3(1.0, 0.2, 0.4), vec3(1.0, 0.6, 0.1), t);
    }
    // Default Cyan (+ phase) & Orange/Red (- phase)
    if (signVal > 0.0) return mix(vec3(0.2, 0.85, 1.0), vec3(0.0, 0.95, 1.0), t);
    return mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.7, 0.2), t);
  }

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    // Soft radial falloff, squared so the dot has no visible rim.
    float falloff = 1.0 - dist * 2.0;
    float alpha = falloff * falloff * vWeight * u_opacity * u_alphaScale;
    if (alpha < 0.002) discard;

    float t = clamp(vRadiusNorm, 0.0, 1.0);
    vec3 finalColor = getPointPaletteColor(t, vSign, u_palette, u_useReal);
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Derives the density floor that still shows VISIBLE_QUANTILE of the electron.
 *
 * Rejection sampling draws each accepted point with probability proportional
 * to |psi|^2, so the fraction of accepted points whose density exceeds a
 * threshold is exactly the probability mass above that threshold. The
 * (1 - VISIBLE_QUANTILE) quantile of the sampled densities is therefore the
 * floor that keeps VISIBLE_QUANTILE of the electron on screen - no magic
 * constant, and the same statistical standard for a 1s and a 7s.
 *
 * A log histogram keeps this O(count) so dragging Z_eff stays responsive.
 */
export function computeDensityFloor(buffer: Float32Array, count: number): number {
  const bins = 512;
  const minLog = -16;
  const maxLog = 0;
  const histogram = new Uint32Array(bins);

  // `Math.floor` rather than `Math.round` so that the bin edges are exactly the
  // boundaries between bins, which is what makes `bin + within` below invert the
  // mapping without a half-bin offset.
  for (let i = 0; i < count; i++) {
    const rel = buffer[i * SAMPLE_STRIDE + 4];
    const log = rel > 0 ? Math.log10(rel) : minLog;
    const bin = Math.min(
      bins - 1,
      Math.max(0, Math.floor(((log - minLog) / (maxLog - minLog)) * (bins - 1)))
    );
    histogram[bin]++;
  }

  const target = (1 - VISIBLE_QUANTILE) * count;
  let cumulative = 0;
  for (let bin = 0; bin < bins; bin++) {
    if (cumulative + histogram[bin] >= target) {
      const within = histogram[bin] > 0 ? (target - cumulative) / histogram[bin] : 0.5;
      const log = minLog + ((bin + within) / (bins - 1)) * (maxLog - minLog);
      return THREE.MathUtils.clamp(Math.pow(10, log), MIN_DENSITY_FLOOR, MAX_DENSITY_FLOOR);
    }
    cumulative += histogram[bin];
  }

  return MIN_DENSITY_FLOOR;
}

/**
 * Distance at which a sphere of `radius` just fits the viewport.
 *
 * A single fixed camera distance cannot serve this app: a hydrogenic 1s orbital
 * is barely 1 a0 across while the valence 4d cloud of silver reaches ~19 a0,
 * so one camera renders the first as a single dot and the second as a
 * screen-filling fog. Framing from the radius that encloses 98.5% of the
 * electron probability keeps every orbital legible at any n, l and Z_eff, and
 * the scene itself is never rescaled, so the a0 / pm readout stays true.
 */
export function computeFrameDistance(
  radius: number,
  fovYDeg: number,
  aspect: number,
  margin: number
): number {
  const halfV = THREE.MathUtils.degToRad(fovYDeg) / 2;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return (margin * radius) / Math.sin(Math.min(halfV, halfH));
}

/**
 * Wraps a sample buffer from `sampleOrbitalPoints` into a `THREE.Points`.
 *
 * The buffer layout is the WASM side's: `[x, y, z, phase_sign, relative_density]`
 * per sample, so one interleaved buffer feeds all three attributes and the
 * accepted points never have to be copied into a second one.
 */
export function createPointCloud(buffer: Float32Array, options: {
  contrast: number;
  useRealOrbital: boolean;
  palette: ColorPalette;
  frameRadius: number;
}): { points: THREE.Points; material: THREE.ShaderMaterial; count: number } {
  const count = Math.floor(buffer.length / SAMPLE_STRIDE);
  const interleaved = new THREE.InterleavedBuffer(buffer, SAMPLE_STRIDE);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
  geometry.setAttribute('a_sign', new THREE.InterleavedBufferAttribute(interleaved, 1, 3));
  geometry.setAttribute('a_density', new THREE.InterleavedBufferAttribute(interleaved, 1, 4));

  const palette = PALETTE_CONFIG[options.palette];
  const material = new THREE.ShaderMaterial({
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    uniforms: {
      u_alphaScale: { value: 1.0 },
      u_contrast: { value: options.contrast },
      u_floor: { value: computeDensityFloor(buffer, count) },
      u_opacity: { value: POINT_OPACITY },
      u_pointRadius: { value: 1.0 },
      u_radiusRef: { value: options.frameRadius },
      u_viewportHalfHeight: { value: 1.0 },
      u_palette: { value: palette.id },
      u_useReal: { value: options.useRealOrbital },
    },
    // Alpha compositing, not additive: overlapping samples converge to the
    // average of their phase colours instead of summing past white. Additive
    // blending is what used to burn the core of every dense orbital into a
    // featureless white disc and drown the nodal structure.
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
  });

  return { points: new THREE.Points(geometry, material), material, count };
}

/**
 * Chooses a dot size and pushes the uniforms that depend on it.
 *
 * The size is kept as a *fraction of the viewport height* rather than in
 * pixels, so a 4K export looks like the screen instead of like a field of
 * invisible dust, and a window resize does not change the look of the cloud.
 *
 * Total ink scales as `count * area * alpha`, so sizing the dots as
 * 1/sqrt(count) keeps the image stable across quality presets: raising the
 * sample count buys a smoother cloud, not a brighter one.
 */
export function updatePointSizing(
  material: THREE.ShaderMaterial,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  frameDistance: number,
  count: number,
  drawingBufferSize: THREE.Vector2
): void {
  const uniforms = material.uniforms;

  const referenceDiameter = THREE.MathUtils.clamp(
    BASE_DOT_SIZE_PX * Math.sqrt(REFERENCE_POINT_COUNT / Math.max(count, 1)),
    MIN_DOT_SIZE_PX,
    MAX_DOT_SIZE_PX,
  );
  const heightFraction = referenceDiameter / REFERENCE_VIEWPORT_HEIGHT_PX;

  renderer.getDrawingBufferSize(drawingBufferSize);
  const halfHeight = Math.max(drawingBufferSize.y / 2, 1);
  // gl_PointSize has a one device pixel floor; below it the alpha has to be
  // given back, or the cloud would get denser as the dots get thinner.
  const targetDeviceDiameter = heightFraction * drawingBufferSize.y;

  const fovScale = camera.projectionMatrix.elements[5];
  uniforms.u_viewportHalfHeight.value = halfHeight;
  uniforms.u_alphaScale.value = Math.min(1, targetDeviceDiameter) ** 2;
  // Solving `dotPixels = u_pointRadius * (1/tan(fovY/2)) * (heightPx/2) / z`
  // for the radius that lands at the target size at the framing distance.
  uniforms.u_pointRadius.value = (2 * heightFraction * frameDistance) / fovScale;
}
