import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { BaseThreeRenderer, RendererTarget } from './render-utils';
import {
  ColorPalette,
  PALETTE_CONFIG,
  REFERENCE_POINT_COUNT,
  computeDensityFloor,
  computeFrameDistance,
  createPointCloud,
  updatePointSizing,
} from './orbital-point-cloud';
import {
  SAMPLE_STRIDE,
  evaluateIsosurfaceGrid,
  getOrbitalPeakDensity,
  resolveOrbitalGeometry,
  sampleOrbitalPoints,
} from '../core/wasm-bridge';

export type RenderMode = 'points' | 'isosurface' | 'raymarching';
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'extreme' | 'custom';
export type { ColorPalette };

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
 * Slack on top of the geometric reach, as a multiplier.
 *
 * The far corner of a cube is exactly `sqrt(3)` of its half-size away, so the
 * reach computed from it would leave the corner sitting precisely on the far
 * plane. A few percent of clearance keeps it inside under any rounding.
 */
const CLIP_HEADROOM = 1.05;

/**
 * How far past the framed radius the point cloud can usefully draw.
 *
 * Points below the density floor are culled in the vertex shader, and the floor
 * is the quantile that keeps VISIBLE_QUANTILE of the electron, so the drawn
 * cloud never reaches much past the radius holding FRAMING_QUANTILE of the
 * probability. A little over that is enough.
 */
const POINT_CLIP_FACTOR = 1.5;

/** Same reach for the empty scene, before any orbital has been loaded. */
const INITIAL_CLIP_REACH = INITIAL_FRAME_RADIUS * POINT_CLIP_FACTOR;

/**
 * Optical depth a ray accumulates crossing one frame radius at full ramped
 * density, in units of `u_absorption`.
 *
 * Dimensionless, so the opacity of an orbital does not depend on its physical
 * size: a contracted 1s and a diffuse 7s shade the same. Higher is denser.
 *
 * The density arriving here is already logarithmic (see `u_densityFloor`), so it
 * spans 0..1 across the cloud instead of the twenty decades the raw ratio
 * covers, and `stepFraction` is the step size measured in frame radii, so
 * `maxSteps * stepFraction` is the chord and the shading does not depend on the
 * step count.
 *
 * 5.0 is what the measured profiles asked for. Accumulated alpha along a ray
 * crossing the body, sampled at impact parameters 0, 0.2, 0.4, 0.6 and 0.8 of
 * the frame radius: a 1s gives 0.97 / 0.95 / 0.85 / 0.49 / 0.04 and a 2p_z
 * 1.00 / 1.00 / 0.98 / 0.96 / 0.85, so the core is opaque and the rim reads as a
 * soft edge rather than a hard cut. Lower values leave a 7s see-through at 0.44
 * (its lobes are spread over 115 a0 with real density between the nodes, so it
 * needs more depth per frame radius than a compact orbital does); higher ones
 * flatten every state into a silhouette and throw the halo away.
 */
const RAYMARCH_ABSORPTION = 5.0;

/**
 * Samples drawn to place the raymarcher's density floor.
 *
 * The floor is the quantile that keeps VISIBLE_QUANTILE of the electron, so what
 * matters is the stability of a 3% tail quantile, not the resolution of the
 * cloud: 30k samples put the cutoff at the 900th smallest density, whose relative
 * spread is under 1%, well below the 3% of the density that the histogram
 * quantises to. Deliberately independent of the point count, since this sample is
 * thrown away - it only has to be representative, and a mode switch should not
 * get slower just because the quality preset is high.
 */
const DENSITY_FLOOR_SAMPLE_COUNT = 30_000;

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
  /**
   * Optical depth accumulated by a ray crossing one full box half-extent.
   *
   * Dimensionless, so the opacity of an orbital does not depend on its physical
   * size: a contracted 1s and a diffuse 7s shade the same. Higher is denser.
   */
  uniform float u_absorption;

  /** Radius of the orbital, a0; the length the step size is measured against. */
  uniform float u_frameRadius;

  /**
   * Lowest relative density still drawn, in (0, 1).
   *
   * The density ramp is logarithmic between this and the peak, exactly as in the
   * point cloud, so all three modes compress the same range of |psi|^2.
   */
  uniform float u_densityFloor;

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

  /**
   * Associated Legendre polynomial P_l^m(x), m >= 0, Condon-Shortley included.
   *
   * Line-for-line the recurrence in associated_legendre
   * (crates/atomic-math/src/math_utils.rs), so the sign of the wavefunction
   * agrees with the WASM grid the point cloud and the isosurface render from -
   * the palettes branch on psi > 0, and a flipped sign would paint a lobe in
   * one mode the colour it has in the other two.
   *
   * The loop bounds are the constant-plus-break form GLSL ES 1.00 requires. They
   * are sized for l <= 6, which is everything n <= 7 can reach.
   */
  float legendreP(int l, int mm, float x) {
    if (mm > l) return 0.0;
    float pmm = 1.0;
    if (mm > 0) {
      float somx2 = sqrt(max(1.0 - x * x, 0.0));
      float fact = 1.0;
      for (int i = 1; i <= 8; i++) {
        if (i > mm) break;
        pmm *= -fact * somx2;
        fact += 2.0;
      }
    }
    if (l == mm) return pmm;
    float pmm1 = x * float(2 * mm + 1) * pmm;
    if (l == mm + 1) return pmm1;

    float mf = float(mm);
    float pl = pmm1;
    for (int k = 2; k <= 8; k++) {
      int kk = mm + k;
      if (kk > l) break;
      float kf = float(kk);
      pl = ((2.0 * kf - 1.0) * x * pmm1 - (kf + mf - 1.0) * pmm) / (kf - mf);
      pmm = pmm1;
      pmm1 = pl;
    }
    return pl;
  }

  float evalY(int l, int m, bool useReal, float theta, float phi) {
    float ct = cos(theta);
    float st = sin(theta);
    float cp = cos(phi);
    float sp = sin(phi);

    // A pure eigenstate is a closed form for every l the UI can reach (n up to
    // 7, so l up to 6), so it is evaluated from P_l^m rather than from the table
    // below, which only holds the real chemist orbitals up to l = 3. Tabulating
    // the pure rows instead left every l >= 4 falling through to the s-like
    // default at the end of this function, which draws a radially-correct but
    // angularly featureless sphere: 5g, 6h, 7f and 7g came out as grey balls
    // with all their nodal structure gone, while the point cloud and the
    // isosurface showed the real orbital.
    //
    // |Y_l^m| is independent of phi, which is what makes this cheaper than the
    // real rows. The phase factor reproduces y_lm_theta_component
    // (spherical_harmonics.rs:46) so the two agree on the sign of each lobe.
    if (!useReal) {
      int ma = abs(m);
      float phase = (m >= 0 && (ma % 2 == 1)) ? -1.0 : 1.0;
      float prefactor = sqrt((2.0 * float(l) + 1.0) / (4.0 * PI)
                             * factorialF(l - ma) / factorialF(l + ma));
      return prefactor * phase * legendreP(l, ma, ct);
    }

    // Real chemist orbitals are only tabulated up to l = 3. Returning 0 rather
    // than falling through to the s-like default below is what stops an
    // unsupported real orbital from silently drawing a sphere.
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
      else if (m == 2) y = 0.25 * sqrt(15.0 / PI) * st * st * cos(2.0 * phi);
      else if (m == -2) y = 0.25 * sqrt(15.0 / PI) * st * st * sin(2.0 * phi);
    } else if (l == 3) {
      if (m == 0) y = 0.25 * sqrt(7.0 / PI) * (5.0 * ct * ct * ct - 3.0 * ct);
      else if (abs(m) == 1) y = 0.25 * sqrt(21.0 / PI) * st * (3.0 * ct * ct - 1.0) * (m > 0 ? cp : sp);
      else if (abs(m) == 2) y = 0.25 * sqrt(105.0 / PI) * st * st * ct * (m > 0 ? cos(2.0*phi) : sin(2.0*phi));
      else if (abs(m) == 3) y = 0.125 * sqrt(70.0 / PI) * st * st * st * (m > 0 ? cos(3.0*phi) : sin(3.0*phi));
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

    // Step length in units of the orbital's own radius.
    //
    // The optical depth has to be built from this rather than from the raw
    // stepSize, because stepSize is in a0 and a plain constant would make the
    // opacity scale with the physical size of the orbital: a 1s at Z_eff = 118 is
    // 0.03 a0 across and its 96 steps could only ever sum to ~0.1 alpha, so the
    // whole cloud quantised to black. Dividing by a length makes the constant
    // dimensionless. Using the frame radius rather than the box also keeps the
    // shading independent of the step count, since maxSteps * stepSize is the
    // chord: a ray crossing the body accumulates the same optical depth however
    // finely it was sampled.
    float stepFraction = stepSize / u_frameRadius;

    // Stochastic dithering to prevent slice banding. Jittering the start of the
    // march trades a little noise for the absence of visible shells, so it is
    // capped at half a step: a full step of jitter is enough to move the samples
    // past a thin radial node and erase it entirely.
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float startOffset = (dither - 0.5) * stepSize * 0.5;

    for (int i = 0; i < 512; i++) {
      if (i >= maxSteps) break;
      vec3 currentPos = entryPoint + rayDir * (startOffset + float(i) * stepSize);
      float psi = evalPsi(currentPos);
      float rawDensity = psi * psi;

      float normDensity = clamp(rawDensity / max(u_peakDensity, 1e-30), 0.0, 1.0);

      // Same log window the point cloud uses, so one slider means the same thing
      // in all three modes. This is what makes a many-lobe orbital visible: a 7s
      // has six radial nodes, and its outer lobes sit six or more decades below
      // the peak that sits in the innermost one, so a linear map renders the
      // whole cloud at alpha ~1e-6 and it disappears. The ramp is monotone, so
      // it re-weights the real density without inventing structure.
      float t = clamp(1.0 - log(max(normDensity, 1e-30)) / log(u_densityFloor), 0.0, 1.0);

      // Smoothstep the ramp, as the point cloud does.
      //
      // The log ramp is *linear in log density*, so it is steepest exactly where
      // the density is smallest: left unsmoothed, a region holding a millionth of
      // the peak density is still assigned 14% of full opacity, and a volume
      // renderer integrates the whole box rather than a set of accepted samples.
      // The empty far corners of the box then paint themselves in and the whole
      // cloud washes out to a flat fog with the nodal structure gone - measured
      // on a 1s, alpha stayed between 0.79 and 0.37 from the core all the way
      // out to the box wall, i.e. the orbital was drawn as a solid disc.
      // The smoothstep is flat at t = 0, so density just above the floor
      // contributes nothing and the visible body ends where the electron does.
      // It is still monotone, and still 0 at a node.
      float ramped = t * t * (3.0 - 2.0 * t);

      // Non-linear contrast enhancement for diffuse tails (preserves 0 nodes exactly)
      float enhancedDensity = u_contrast > 0.0 ? log(1.0 + u_contrast * ramped) / log(1.0 + u_contrast) : ramped;

      if (enhancedDensity > 1e-6) {
        vec3 color = getPaletteColor(psi, enhancedDensity, u_palette);

        float alphaSample = 1.0 - exp(-enhancedDensity * stepFraction * u_absorption);

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
  /**
   * Furthest distance from the orbit target that the current mode can draw, a0.
   *
   * Each mode sets this to match the geometry it builds; see `updateClipping`.
   */
  private clipReach = INITIAL_CLIP_REACH;
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
    return computeFrameDistance(radius, this.camera.fov, this.camera.aspect, FRAME_MARGIN);
  }

  /**
   * Brackets the depth range around the framed orbital.
   *
   * The depth range has to contain every drawn vertex, or the rasteriser drops
   * the ones outside it before the fragment shader ever runs - and a dropped
   * vertex leaves the clear colour, which reads as opaque black geometry rather
   * than as a missing surface.
   *
   * `clipReach` is how far from the orbit target the current mode can draw, so
   * the two ends are `distance -+ clipReach`. The volumetric modes draw a *cube*
   * of half-size `boxExtent`, whose far corner sits `sqrt(3) * boxExtent` from
   * the target in whatever direction the camera happens to look, which is why
   * the reach is not simply the orbital radius: a range fitted to the orbital
   * left the far plane inside the box and cut a hard-edged triangular wedge out
   * of the middle of the cloud. `CLIP_HEADROOM` keeps the corner clear as the
   * user orbits, and keeps the near plane clear of the near faces.
   */
  protected override updateClipping(): void {
    const reach = Math.max(this.clipReach, Number.EPSILON);
    const distance = this.camera.position.distanceTo(this.controls.target);
    const near = Math.max(distance - reach, reach * 1e-4);
    const far = distance + reach;
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

    if (buffer.length === 0) return;

    const { points, material, count } = createPointCloud(buffer, {
      contrast: p.contrast ?? 0.0,
      useRealOrbital: p.useRealOrbital,
      palette: p.colorPalette,
      frameRadius: orbitalGeometry.frameRadius,
    });

    this.pointsMaterial = material;
    this.pointsMesh = points;
    this.scene.add(this.pointsMesh);

    this.clipReach = orbitalGeometry.frameRadius * POINT_CLIP_FACTOR;
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
    updatePointSizing(
      this.pointsMaterial,
      this.renderer,
      this.camera,
      this.frameDistance,
      count,
      this.drawingBufferSize
    );
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
    // A cube of half-size h puts its far corner sqrt(3) * h from the target.
    this.clipReach = boxExtent * Math.sqrt(3) * CLIP_HEADROOM;
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
    const [orbitalGeometry, peakDensity, samples] = await Promise.all([
      resolveOrbitalGeometry(p.n, p.l, p.zEff),
      getOrbitalPeakDensity(p.n, p.l, p.m, p.useRealOrbital, p.zEff),
      // The log ramp has to be told how much dynamic range this state actually
      // spans before it can be integrated over a box, and the only honest way to
      // find out is to look at the state. So the raymarcher derives its floor
      // from the very same estimator the point cloud uses, rather than from a
      // constant: the modes then compress the same range of |psi|^2 and draw the
      // same body, and the density slider means one thing in all of them.
      //
      // A constant cannot do this. 1e-6 of the peak happens to be about right
      // for a 7s, whose outermost lobe is the faintest thing worth drawing, but
      // it is six decades of window for a 1s, whose whole visible range spans
      // three: the ramped density then sat between 0.35 and 1.0 everywhere in the
      // box and the orbital came out as a flat disc with no falloff.
      sampleOrbitalPoints({
        n: p.n,
        l: p.l,
        m: p.m,
        useRealOrbital: p.useRealOrbital,
        zEff: p.zEff,
        pointCount: DENSITY_FLOOR_SAMPLE_COUNT,
      }),
    ]);
    if (!this.isCurrentUpdate(token)) return;

    this.clearCurrentMesh();
    this.currentMode = 'raymarching';
    this.syncPixelRatio();

    const boxExtent = orbitalGeometry.boxExtent;
    // A cube of half-size h puts its far corner sqrt(3) * h from the target.
    this.clipReach = boxExtent * Math.sqrt(3) * CLIP_HEADROOM;
    const geometry = new THREE.BoxGeometry(boxExtent * 2, boxExtent * 2, boxExtent * 2);

    const steps = p.raymarchingSteps ?? this.getRaymarchingSteps(p.quality);

    const sampleCount = Math.floor(samples.length / SAMPLE_STRIDE);
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
        u_absorption: { value: RAYMARCH_ABSORPTION },
        u_frameRadius: { value: orbitalGeometry.frameRadius },
        u_densityFloor: {
          value: computeDensityFloor(samples, sampleCount),
        },
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
