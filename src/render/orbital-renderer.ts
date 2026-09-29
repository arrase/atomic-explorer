import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { BaseThreeRenderer, RendererTarget } from './render-utils';
import {
  SAMPLE_STRIDE,
  evaluateIsosurfaceGrid,
  getOrbitalPeakDensity,
  resolveOrbitalGeometry,
} from '../core/wasm-bridge';

export type RenderMode = 'points' | 'isosurface' | 'raymarching';
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'extreme' | 'custom';
export type ColorPalette = 'default' | 'fire' | 'emerald' | 'spectrum';

export interface OrbitalRenderParams {
  n: number;
  l: number;
  m: number;
  useRealOrbital: boolean;
  zEff: number;
  mode: RenderMode;
  isolevel?: number;
  quality?: QualityPreset;
  raymarchingSteps?: number;
  pointCount?: number;
  resolutionScale?: number;
  colorPalette: ColorPalette;
  contrast?: number;
}

export type { RendererTarget };

/** Breathing room between the framed orbital and the edge of the viewport. */
const FRAME_MARGIN = 1.12;

/**
 * Framing used before any orbital has been loaded.
 *
 * The scene starts empty, so this only has to be a sane default: the first
 * `applyFraming` replaces it with a radius derived from the real wavefunction.
 */
const INITIAL_FRAME_RADIUS = 16;
const INITIAL_FRAME_DISTANCE = 46.8;

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
const REFERENCE_POINT_COUNT = 60_000;
const REFERENCE_VIEWPORT_HEIGHT_PX = 900;

export const PALETTE_CONFIG: Record<ColorPalette, { id: number; posColor: number; negColor: number }> = {
  default: { id: 0, posColor: 0x00ccff, negColor: 0xff6611 },
  fire: { id: 1, posColor: 0xffcc33, negColor: 0x6600cc },
  emerald: { id: 2, posColor: 0x66ffb2, negColor: 0xcc9900 },
  spectrum: { id: 3, posColor: 0x22ccff, negColor: 0xff2255 },
};

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

// Shaders for GLSL Volumetric Raymarching with Dynamic Steps & Dithering
const raymarchVertexShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vOrigin = cameraPosition;
    vDirection = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const raymarchFragmentShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  uniform int u_n;
  uniform int u_l;
  uniform int u_m;
  uniform bool u_useReal;
  uniform float u_zEff;
  uniform vec3 u_boxMin;
  uniform vec3 u_boxMax;
  uniform int u_steps;
  uniform int u_palette;
  uniform float u_peakDensity;
  uniform float u_contrast;

  #define PI 3.14159265359

  // Factorial for small n (sufficient for quantum numbers up to n=7)
  float factorialF(int n) {
    float f = 1.0;
    for (int i = 2; i <= 20; i++) {
      if (i > n) break;
      f *= float(i);
    }
    return f;
  }

  // Associated Laguerre polynomial L_p^q(x) via recurrence relation
  float assocLaguerre(int p, int q, float x) {
    if (p == 0) return 1.0;
    float qf = float(q);
    float l0 = 1.0;
    float l1 = (qf + 1.0) - x;
    if (p == 1) return l1;
    float lp = l1;
    for (int k = 1; k < 20; k++) {
      if (k >= p) break;
      float kf = float(k);
      float next = ((2.0 * kf + 1.0 + qf - x) * l1 - (kf + qf) * l0) / (kf + 1.0);
      l0 = l1;
      l1 = next;
      lp = next;
    }
    return lp;
  }

  // Radial hydrogen wavefunction R_nl(r) — analytic for n<=4, generic Laguerre for n>4
  float evalR(int n, int l, float zeff, float r) {
    float zr = zeff * r;
    if (n == 1 && l == 0) {
      return 2.0 * pow(zeff, 1.5) * exp(-zr);
    } else if (n == 2 && l == 0) {
      return (1.0 / (2.0 * sqrt(2.0))) * pow(zeff, 1.5) * (2.0 - zr) * exp(-zr / 2.0);
    } else if (n == 2 && l == 1) {
      return (1.0 / (2.0 * sqrt(6.0))) * pow(zeff, 1.5) * zr * exp(-zr / 2.0);
    } else if (n == 3 && l == 0) {
      return (2.0 / (81.0 * sqrt(3.0))) * pow(zeff, 1.5) * (27.0 - 18.0*zr + 2.0*zr*zr) * exp(-zr / 3.0);
    } else if (n == 3 && l == 1) {
      return (4.0 / (81.0 * sqrt(6.0))) * pow(zeff, 1.5) * (6.0*zr - zr*zr) * exp(-zr / 3.0);
    } else if (n == 3 && l == 2) {
      return (4.0 / (81.0 * sqrt(30.0))) * pow(zeff, 1.5) * (zr*zr) * exp(-zr / 3.0);
    } else if (n == 4 && l == 0) {
      return (1.0 / 768.0) * pow(zeff, 1.5) * (192.0 - 144.0*zr + 24.0*zr*zr - zr*zr*zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 1) {
      return (1.0 / (256.0 * sqrt(15.0))) * pow(zeff, 1.5) * (80.0*zr - 20.0*zr*zr + zr*zr*zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 2) {
      return (1.0 / (768.0 * sqrt(5.0))) * pow(zeff, 1.5) * (12.0*zr*zr - zr*zr*zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 3) {
      return (1.0 / (768.0 * sqrt(35.0))) * pow(zeff, 1.5) * (zr*zr*zr) * exp(-zr / 4.0);
    }
    // Generic formula using associated Laguerre polynomials for n > 4
    float nf = float(n);
    float rho = 2.0 * zr / nf;
    int p = n - l - 1;
    int q = 2 * l + 1;
    float lag = assocLaguerre(p, q, rho);
    float num = pow(2.0 * zeff / nf, 3.0) * factorialF(n - l - 1);
    float den = 2.0 * nf * factorialF(n + l);
    float prefactor = sqrt(num / den);
    return prefactor * exp(-zr / nf) * pow(rho, float(l)) * lag;
  }

  float evalY(int l, int m, bool useReal, float theta, float phi) {
    float ct = cos(theta);
    float st = sin(theta);
    float cp = useReal ? cos(phi) : 1.0;
    float sp = useReal ? sin(phi) : 1.0;

    // Real chemist orbitals are only tabulated up to l = 3, and a pure eigenstate
    // is (up to the shared 1/sqrt(2) factor below) the phi average of the real
    // set. Returning 0 for l > 3 renders nothing rather than falling through to
    // the s-like default below, which would silently draw a sphere for a g orbital.
    if (l > 3) return 0.0;

    float y = 0.5 * sqrt(1.0 / PI);

    if (l == 0) {
      y = 0.5 * sqrt(1.0 / PI);
    } else if (l == 1) {
      if (m == 0) y = 0.5 * sqrt(3.0 / PI) * ct;
      else if (m == 1) y = 0.5 * sqrt(3.0 / PI) * st * cp;
      else if (m == -1) y = 0.5 * sqrt(3.0 / PI) * st * sp;
    } else if (l == 2) {
      if (m == 0) y = 0.25 * sqrt(5.0 / PI) * (3.0 * ct * ct - 1.0);
      else if (m == 1) y = 0.5 * sqrt(15.0 / PI) * st * ct * cp;
      else if (m == -1) y = 0.5 * sqrt(15.0 / PI) * st * ct * sp;
      else if (m == 2) y = 0.25 * sqrt(15.0 / PI) * st * st * (useReal ? cos(2.0 * phi) : 1.0);
      else if (m == -2) y = 0.25 * sqrt(15.0 / PI) * st * st * (useReal ? sin(2.0 * phi) : 1.0);
    } else if (l == 3) {
      if (m == 0) y = 0.25 * sqrt(7.0 / PI) * (5.0 * ct * ct * ct - 3.0 * ct);
      else if (abs(m) == 1) y = 0.25 * sqrt(21.0 / PI) * st * (3.0 * ct * ct - 1.0) * (m > 0 ? cp : sp);
      else if (abs(m) == 2) y = 0.25 * sqrt(105.0 / PI) * st * st * ct * (useReal ? (m > 0 ? cos(2.0*phi) : sin(2.0*phi)) : 1.0);
      else if (abs(m) == 3) y = 0.125 * sqrt(70.0 / PI) * st * st * st * (useReal ? (m > 0 ? cos(3.0*phi) : sin(3.0*phi)) : 1.0);
    }
    
    if (!useReal && m != 0) {
      y *= 0.70710678;
    }
    return y;
  }

  float evalPsi(vec3 p) {
    float r = length(p);
    if (r < 1e-4) return 0.0;
    float theta = acos(clamp(p.z / r, -1.0, 1.0));
    float phi = atan(p.y, p.x);
    float R = evalR(u_n, u_l, u_zEff, r);
    float Y = evalY(u_l, u_m, u_useReal, theta, phi);
    return R * Y;
  }

  vec2 rayBoxIntersection(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
    vec3 invDir = 1.0 / rd;
    vec3 t0 = (boxMin - ro) * invDir;
    vec3 t1 = (boxMax - ro) * invDir;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tNear = max(max(tmin.x, tmin.y), tmin.z);
    float tFar = min(min(tmax.x, tmax.y), tmax.z);
    return vec2(tNear, tFar);
  }

  vec3 getPaletteColor(float psi, float enhancedDensity, int paletteId) {
    float t = clamp(enhancedDensity * 1.1, 0.0, 1.0);
    if (paletteId == 1) { // Atomic Fire
      if (psi > 0.0) return mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.9, 0.2), t);
      return mix(vec3(0.8, 0.0, 0.2), vec3(0.4, 0.0, 0.6), t);
    } else if (paletteId == 2) { // Emerald Glow
      if (psi > 0.0) return mix(vec3(0.0, 0.8, 0.5), vec3(0.4, 1.0, 0.7), t);
      return mix(vec3(0.8, 0.8, 0.1), vec3(0.2, 0.5, 0.2), t);
    } else if (paletteId == 3) { // Quantum Spectrum
      if (psi > 0.0) return mix(vec3(0.6, 0.1, 1.0), vec3(0.1, 0.8, 1.0), t);
      return mix(vec3(1.0, 0.1, 0.5), vec3(1.0, 0.6, 0.1), t);
    }
    // Default Cyan & Orange/Red
    if (psi > 0.0) return mix(vec3(0.1, 0.6, 1.0), vec3(0.0, 0.9, 1.0), t);
    return mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.8, 0.2), t);
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 tHit = rayBoxIntersection(vOrigin, rayDir, u_boxMin, u_boxMax);

    if (tHit.x > tHit.y || tHit.y < 0.0) {
      discard;
    }

    tHit.x = max(tHit.x, 0.0);
    vec3 entryPoint = vOrigin + rayDir * tHit.x;
    float dist = tHit.y - tHit.x;

    int maxSteps = clamp(u_steps, 32, 512);
    float stepSize = dist / float(maxSteps);
    vec4 accumColor = vec4(0.0);

    // Stochastic dithering to prevent slice banding
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float startOffset = dither * stepSize;

    for (int i = 0; i < 512; i++) {
      if (i >= maxSteps) break;
      vec3 currentPos = entryPoint + rayDir * (startOffset + float(i) * stepSize);
      float psi = evalPsi(currentPos);
      float rawDensity = psi * psi;

      float normDensity = clamp(rawDensity / max(u_peakDensity, 1e-12), 0.0, 1.0);

      // Non-linear contrast enhancement for diffuse tails (preserves 0 nodes exactly)
      float enhancedDensity = u_contrast > 0.0 ? log(1.0 + u_contrast * normDensity) / log(1.0 + u_contrast) : normDensity;

      if (enhancedDensity > 1e-6) {
        vec3 color = getPaletteColor(psi, enhancedDensity, u_palette);
        
        float alphaSample = 1.0 - exp(-enhancedDensity * stepSize * 3.5);

        accumColor.rgb += (1.0 - accumColor.a) * color * alphaSample;
        accumColor.a += (1.0 - accumColor.a) * alphaSample;

        if (accumColor.a >= 0.96) break;
      }
    }

    gl_FragColor = accumColor;
  }
`;

export class OrbitalRenderer extends BaseThreeRenderer {
  private pointsMesh: THREE.Points | null = null;
  private pointsMaterial: THREE.ShaderMaterial | null = null;
  private marchingCubesGroup: THREE.Group | null = null;
  private raymarchingMesh: THREE.Mesh | null = null;
  private raymarchingMaterial: THREE.ShaderMaterial | null = null;

  /** Radius of the orbital currently on screen, and the distance framing it. */
  private frameRadius = INITIAL_FRAME_RADIUS;
  private frameDistance = INITIAL_FRAME_DISTANCE;
  private readonly drawingBufferSize = new THREE.Vector2();
  private updateToken = 0;

  /** Direction "Reset View" returns to, independent of where the user has orbited to. */
  private readonly defaultCameraDir = new THREE.Vector3(1, 1, 1).normalize();

  private currentMode: RenderMode = 'points';
  private currentParams: OrbitalRenderParams = {
    n: 1,
    l: 0,
    m: 0,
    useRealOrbital: true,
    zEff: 1.0,
    mode: 'points',
    quality: 'medium',
    raymarchingSteps: 128,
    colorPalette: 'default',
    resolutionScale: 1.0,
    contrast: 0.0,
  };

  constructor(target: RendererTarget) {
    super(target, new THREE.Vector3(16, 16, 16));
    this.autoRotateSpeed = 1.5;
    this.frameRadius = INITIAL_FRAME_RADIUS;
    this.frameDistance = INITIAL_FRAME_DISTANCE;
    this.updateClipping();

    this.setupLighting();
    this.onWindowResize();
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x40c0ff, 1.2);
    dirLight1.position.set(20, 30, 20);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff8844, 0.8);
    dirLight2.position.set(-20, -20, -20);
    this.scene.add(dirLight2);
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
  private computeFrameDistance(radius: number): number {
    const halfV = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    return (FRAME_MARGIN * radius) / Math.sin(Math.min(halfV, halfH));
  }

  /**
   * Brackets the depth range around the framed orbital.
   *
   * The scene holds one body of radius `frameRadius` centred on the orbit
   * target, and the framing distance follows the orbital: a contracted 1s sits
   * ~0.1 a0 away while a diffuse 7s at Z_eff = 0.1 sits ~3200 a0 away. Fixed
   * near/far planes cannot serve both - at the small end the orbital falls
   * behind the near plane, at the large end every vertex is clipped by the far
   * plane and the viewport goes empty - so the planes are refitted to the
   * current distance instead. This also keeps them correct while the user zooms.
   */
  protected override updateClipping(): void {
    const radius = Math.max(this.frameRadius, Number.EPSILON);
    const distance = this.camera.position.distanceTo(this.controls.target);
    const extent = radius * 1.5;
    const near = Math.max(distance - extent, radius * 1e-4);
    const far = distance + extent;
    if (near === this.camera.near && far === this.camera.far) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Moves the camera to the distance that frames the orbital, preserving the
   * user's current viewing direction. Small changes are ignored so that dragging
   * Z_eff morphs the cloud in place instead of yanking the view around.
   */
  private applyFraming(radius: number, animate: boolean): void {
    const distance = this.computeFrameDistance(radius);
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) {
      direction.copy(this.defaultCameraDir);
    } else {
      direction.normalize();
    }

    this.frameRadius = radius;
    this.frameDistance = distance;
    this.updateClipping();

    // The reset pose stays on the canonical direction at the new distance, so
    // "Reset View" keeps meaning "the default view" instead of becoming
    // whatever the camera happened to be pointing at when the orbital last
    // changed size.
    this.defaultCameraPos
      .copy(this.controls.target)
      .addScaledVector(this.defaultCameraDir, distance);

    if (!animate) return;
    const current = this.camera.position.distanceTo(this.controls.target);
    if (Math.abs(current - distance) < distance * 0.04) return;

    this.animateCameraTo(
      this.controls.target.clone().addScaledVector(direction, distance),
      this.camera.up.clone(),
      this.controls.target.clone(),
      400,
    );
  }

  /**
   * Generation counter guarding the async scene updates.
   *
   * Every mode has to ask WASM for its geometry before it can build anything, so
   * two updates can be in flight at once - dragging a slider, or switching mode
   * while a cloud is still loading. Without this, the slower stale update would
   * land its mesh on top of the newer one (a raymarching box seen from inside
   * washes the whole screen out). Each update takes a token and re-checks it
   * after every await; a superseded update just returns.
   */
  private beginUpdate(): number {
    return ++this.updateToken;
  }

  private isCurrentUpdate(token: number): boolean {
    return token === this.updateToken;
  }

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
  private static computeDensityFloor(buffer: Float32Array, count: number): number {
    const bins = 512;
    const minLog = -16;
    const maxLog = 0;
    const histogram = new Uint32Array(bins);

    // `Math.floor` rather than `Math.round` so that the bin edges are exactly the
    // boundaries between bins, which is what makes `bin + within` below invert
    // the mapping without a half-bin offset.
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

  public async setPointCloud(buffer: Float32Array, params?: OrbitalRenderParams): Promise<void> {
    const token = this.beginUpdate();
    if (params) {
      this.currentParams = { ...this.currentParams, ...params };
    }
    // Snapshot before awaiting: `updateParams` can land a newer parameter set
    // while this call is suspended, and reading `this.currentParams` afterwards
    // would paint one cloud with another's palette and contrast curve.
    const p: OrbitalRenderParams = { ...this.currentParams };
    const orbitalGeometry = await resolveOrbitalGeometry(p.n, p.l, p.zEff);
    if (!this.isCurrentUpdate(token)) return;

    this.clearCurrentMesh();
    this.currentMode = 'points';
    this.syncPixelRatio();

    const count = Math.floor(buffer.length / SAMPLE_STRIDE);
    if (count === 0) return;

    const interleaved = new THREE.InterleavedBuffer(buffer, SAMPLE_STRIDE);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
    geometry.setAttribute('a_sign', new THREE.InterleavedBufferAttribute(interleaved, 1, 3));
    geometry.setAttribute('a_density', new THREE.InterleavedBufferAttribute(interleaved, 1, 4));

    const palette = PALETTE_CONFIG[p.colorPalette];
    const material = new THREE.ShaderMaterial({
      vertexShader: pointVertexShader,
      fragmentShader: pointFragmentShader,
      uniforms: {
        u_alphaScale: { value: 1.0 },
        u_contrast: { value: p.contrast ?? 0.0 },
        u_floor: { value: OrbitalRenderer.computeDensityFloor(buffer, count) },
        u_opacity: { value: POINT_OPACITY },
        u_pointRadius: { value: 1.0 },
        u_radiusRef: { value: orbitalGeometry.frameRadius },
        u_viewportHalfHeight: { value: 1.0 },
        u_palette: { value: palette.id },
        u_useReal: { value: p.useRealOrbital },
      },
      // Alpha compositing, not additive: overlapping samples converge to the
      // average of their phase colours instead of summing past white. Additive
      // blending is what used to burn the core of every dense orbital into a
      // featureless white disc and drown the nodal structure.
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    this.pointsMaterial = material;

    this.pointsMesh = new THREE.Points(geometry, material);
    this.scene.add(this.pointsMesh);

    this.applyFraming(orbitalGeometry.frameRadius, true);
    this.updatePointSizing(count);
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
  private updatePointSizing(count: number): void {
    if (!this.pointsMaterial) return;
    const uniforms = this.pointsMaterial.uniforms;

    const referenceDiameter = THREE.MathUtils.clamp(
      BASE_DOT_SIZE_PX * Math.sqrt(REFERENCE_POINT_COUNT / Math.max(count, 1)),
      MIN_DOT_SIZE_PX,
      MAX_DOT_SIZE_PX,
    );
    const heightFraction = referenceDiameter / REFERENCE_VIEWPORT_HEIGHT_PX;

    const bufferSize = this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    const halfHeight = Math.max(bufferSize.y / 2, 1);
    // gl_PointSize has a one device pixel floor; below it the alpha has to be
    // given back, or the cloud would get denser as the dots get thinner.
    const targetDeviceDiameter = heightFraction * bufferSize.y;

    const fovScale = this.camera.projectionMatrix.elements[5];
    uniforms.u_viewportHalfHeight.value = halfHeight;
    uniforms.u_alphaScale.value = Math.min(1, targetDeviceDiameter) ** 2;
    // Solving `dotPixels = u_pointRadius * (1/tan(fovY/2)) * (heightPx/2) / z`
    // for the radius that lands at the target size at the framing distance.
    uniforms.u_pointRadius.value = (2 * heightFraction * this.frameDistance) / fovScale;
  }

  /**
   * Dots are sized in device pixels, so the uniforms have to be recomputed
   * whenever the drawing buffer changes: window resize, pixel ratio, and the
   * high-resolution image exporter, which all move the projection under the
   * shader. The framing also depends on the aspect ratio, so it is refitted here
   * for every render mode, not just the point cloud.
   */
  protected override onViewportChanged(): void {
    this.applyFraming(this.frameRadius, false);
    if (!this.pointsMaterial) return;
    const count = this.pointsMesh?.geometry.getAttribute('position')?.count ?? REFERENCE_POINT_COUNT;
    this.updatePointSizing(count);
  }

  /**
   * Isosurface grid resolution per quality preset, in voxels per axis.
   *
   * The `qualityLow`..`qualityExtreme` labels in every locale advertise these
   * numbers, so the two have to be changed together. The point counts and
   * raymarching steps in those same labels are set in `ControlPanel`.
   */
  private getGridResolution(quality?: QualityPreset): number {
    switch (quality) {
      case 'low':
        return 32;
      case 'medium':
        return 40;
      case 'high':
        return 48;
      case 'ultra':
        return 64;
      case 'extreme':
        return 80;
      default:
        return 48;
    }
  }

  private getRaymarchingSteps(quality?: QualityPreset): number {
    switch (quality) {
      case 'low':
        return 64;
      case 'medium':
        return 96;
      case 'high':
        return 128;
      case 'ultra':
        return 256;
      case 'extreme':
        return 512;
      default:
        return 128;
    }
  }

  private createIsosurfaceMaterial(color: number): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.15,
      metalness: 0.2,
      transmission: 0.65,
      opacity: 0.85,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  private populateMarchingCubes(
    mcPos: MarchingCubes,
    mcNeg: MarchingCubes,
    gridData: Float32Array,
    isolevel: number
  ): void {
    let maxAbs = 0;
    for (const val of gridData) {
      const a = Math.abs(val);
      if (a > maxAbs) maxAbs = a;
    }

    // The grid comes back with the density normalised to its own peak and the
    // contrast remap anchored so that it is the identity at |psi|^2 = isolevel
    // and reaches 1.0 at the peak. So maxAbs is 1.0 for any contrast, the
    // effective threshold is exactly `isolevel` in normalised-density units, and
    // the contrast control only re-shades the surface instead of inflating it.
    // Any change to `apply_contrast_normalization` must preserve that anchoring.
    const effectiveIsolevel = isolevel * (maxAbs > 0 ? maxAbs : 1.0);
    mcPos.isolation = effectiveIsolevel;
    mcNeg.isolation = effectiveIsolevel;

    mcPos.field.set(gridData);
    const negField = mcNeg.field;
    for (let i = 0; i < gridData.length; i++) {
      negField[i] = -gridData[i];
    }

    mcPos.update();
    mcNeg.update();
  }

  public async updateIsosurface(params: OrbitalRenderParams): Promise<void> {
    const token = this.beginUpdate();
    this.currentParams = { ...params };
    const p: OrbitalRenderParams = { ...params };
    const orbitalGeometry = await resolveOrbitalGeometry(p.n, p.l, p.zEff);
    if (!this.isCurrentUpdate(token)) return;

    this.clearCurrentMesh();
    this.currentMode = 'isosurface';
    this.syncPixelRatio();

    const gridRes = this.getGridResolution(p.quality);
    const palette = PALETTE_CONFIG[p.colorPalette];

    const materialPos = this.createIsosurfaceMaterial(palette.posColor);
    const materialNeg = this.createIsosurfaceMaterial(palette.negColor);

    const mcPos = new MarchingCubes(gridRes, materialPos, false, false, 150000);
    const mcNeg = new MarchingCubes(gridRes, materialNeg, false, false, 150000);
    const boxExtent = orbitalGeometry.boxExtent;
    mcPos.scale.set(boxExtent, boxExtent, boxExtent);
    mcNeg.scale.set(boxExtent, boxExtent, boxExtent);

    const isolevel = p.isolevel ?? 0.05;
    const contrast = p.contrast ?? 0.0;
    mcPos.reset();
    mcNeg.reset();

    // Fast grid evaluation via WASM engine
    const gridData = await evaluateIsosurfaceGrid({
      n: p.n,
      l: p.l,
      m: p.m,
      useRealOrbital: p.useRealOrbital,
      zEff: p.zEff,
      gridSize: gridRes,
      bounds: boxExtent,
      contrast,
      isolevel,
    });
    if (!this.isCurrentUpdate(token)) return;

    this.populateMarchingCubes(mcPos, mcNeg, gridData, isolevel);

    this.marchingCubesGroup = new THREE.Group();
    this.marchingCubesGroup.add(mcPos);
    this.marchingCubesGroup.add(mcNeg);
    this.scene.add(this.marchingCubesGroup);
    this.applyFraming(orbitalGeometry.frameRadius, true);
  }

  public async updateRaymarching(params: OrbitalRenderParams): Promise<void> {
    const token = this.beginUpdate();
    this.currentParams = { ...params };
    const p: OrbitalRenderParams = { ...params };
    const [orbitalGeometry, peakDensity] = await Promise.all([
      resolveOrbitalGeometry(p.n, p.l, p.zEff),
      getOrbitalPeakDensity(p.n, p.l, p.m, p.useRealOrbital, p.zEff),
    ]);
    if (!this.isCurrentUpdate(token)) return;

    this.clearCurrentMesh();
    this.currentMode = 'raymarching';
    this.syncPixelRatio();

    const boxExtent = orbitalGeometry.boxExtent;
    const geometry = new THREE.BoxGeometry(boxExtent * 2, boxExtent * 2, boxExtent * 2);

    const steps = p.raymarchingSteps ?? this.getRaymarchingSteps(p.quality);

    const palette = PALETTE_CONFIG[p.colorPalette];
    const contrast = p.contrast ?? 0.0;

    this.raymarchingMaterial = new THREE.ShaderMaterial({
      vertexShader: raymarchVertexShader,
      fragmentShader: raymarchFragmentShader,
      uniforms: {
        u_n: { value: p.n },
        u_l: { value: p.l },
        u_m: { value: p.m },
        u_useReal: { value: p.useRealOrbital },
        u_zEff: { value: p.zEff },
        u_boxMin: { value: new THREE.Vector3(-boxExtent, -boxExtent, -boxExtent) },
        u_boxMax: { value: new THREE.Vector3(boxExtent, boxExtent, boxExtent) },
        u_steps: { value: steps },
        u_palette: { value: palette.id },
        u_peakDensity: { value: peakDensity },
        u_contrast: { value: contrast },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.raymarchingMesh = new THREE.Mesh(geometry, this.raymarchingMaterial);
    this.scene.add(this.raymarchingMesh);
    this.applyFraming(orbitalGeometry.frameRadius, true);
  }

  private clearCurrentMesh(): void {
    if (this.pointsMesh) {
      this.scene.remove(this.pointsMesh);
      this.pointsMesh.geometry.dispose();
      (this.pointsMesh.material as THREE.Material).dispose();
      this.pointsMesh = null;
      this.pointsMaterial = null;
    }
    if (this.marchingCubesGroup) {
      this.scene.remove(this.marchingCubesGroup);
      this.marchingCubesGroup.children.forEach(child => {
        const mc = child as MarchingCubes;
        mc.geometry.dispose();
        (mc.material as THREE.Material).dispose();
      });
      this.marchingCubesGroup = null;
    }
    if (this.raymarchingMesh) {
      this.scene.remove(this.raymarchingMesh);
      this.raymarchingMesh.geometry.dispose();
      if (this.raymarchingMaterial) {
        this.raymarchingMaterial.dispose();
        this.raymarchingMaterial = null;
      }
      this.raymarchingMesh = null;
    }
  }

  public updateParams(params: Partial<OrbitalRenderParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    this.syncPixelRatio();
    if (params.mode && params.mode !== this.currentMode) {
      // The caller drives the per-mode update itself, so all that is left when the
      // mode changes is to tell any in-flight update from the previous mode that
      // it lost the race, and drop the mesh it was going to land.
      this.beginUpdate();
      this.clearCurrentMesh();
    }
  }

  protected override getEffectivePixelRatio(): number {
    const resScale = this.currentParams.resolutionScale ?? 1.0;
    return Math.min(window.devicePixelRatio * resScale, 2.0);
  }

  protected override cleanupScene(): void {
    this.beginUpdate();
    this.clearCurrentMesh();
  }
}
