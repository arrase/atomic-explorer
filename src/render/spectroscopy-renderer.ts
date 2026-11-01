import * as THREE from 'three';
import { BaseThreeRenderer, RendererTarget } from './render-utils';
import { computeDensityFloor, computeFrameDistance } from './orbital-point-cloud';
import { QuantumState, TransitionMode } from '../core/spectroscopy';
import {
  SAMPLE_STRIDE,
  getOrbitalPeakDensity,
  resolveOrbitalGeometry,
  sampleOrbitalPoints,
} from '../core/wasm-bridge';

export interface SpectroscopyRenderParams {
  lower: QuantumState;
  upper: QuantumState;
  zEff: number;
  mode: TransitionMode;
  isAllowed: boolean;
  photonColorRgb: [number, number, number]; // 0..1 from WavelengthColor
  dipoleIntegralBohr: number;
}

const FRAME_MARGIN = 1.25;
const CLIP_HEADROOM = 1.05;
const INITIAL_FRAME_RADIUS = 18;
const INITIAL_CLIP_REACH = INITIAL_FRAME_RADIUS * 1.8 * CLIP_HEADROOM;
const RAYMARCH_STEPS = 112;
const RAYMARCH_ABSORPTION = 5.0;
const FLOOR_SAMPLE_COUNT = 20_000;
const PHOTON_VERTEX_COUNT = 120;
const BASE_PHASE_OMEGA = 3.2;
const MAX_FRAME_DT = 0.1;
const TWO_PI = Math.PI * 2;

const superpositionVertexShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vOrigin = cameraPosition;
    vDirection = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const superpositionFragmentShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  uniform int u_n1;
  uniform int u_l1;
  uniform int u_m1;
  uniform int u_n2;
  uniform int u_l2;
  uniform int u_m2;
  uniform float u_zEff;
  uniform float u_phase;
  uniform vec3 u_photonColor;
  uniform bool u_isAllowed;
  uniform vec3 u_boxMin;
  uniform vec3 u_boxMax;
  uniform int u_steps;
  uniform float u_peakDensity;
  uniform float u_densityFloor;
  uniform float u_frameRadius;
  uniform float u_absorption;

  #define PI 3.14159265359

  float factorialF(int n) {
    float f = 1.0;
    for (int i = 2; i <= 20; i++) {
      if (i > n) break;
      f *= float(i);
    }
    return f;
  }

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

  float evalR(int n, int l, float zeff, float r) {
    float zr = zeff * r;
    if (n == 1 && l == 0) {
      return 2.0 * pow(zeff, 1.5) * exp(-zr);
    } else if (n == 2 && l == 0) {
      return (1.0 / (2.0 * sqrt(2.0))) * pow(zeff, 1.5) * (2.0 - zr) * exp(-zr / 2.0);
    } else if (n == 2 && l == 1) {
      return (1.0 / (2.0 * sqrt(6.0))) * pow(zeff, 1.5) * zr * exp(-zr / 2.0);
    } else if (n == 3 && l == 0) {
      return (2.0 / (81.0 * sqrt(3.0))) * pow(zeff, 1.5) * (27.0 - 18.0 * zr + 2.0 * zr * zr) * exp(-zr / 3.0);
    } else if (n == 3 && l == 1) {
      return (4.0 / (81.0 * sqrt(6.0))) * pow(zeff, 1.5) * (6.0 * zr - zr * zr) * exp(-zr / 3.0);
    } else if (n == 3 && l == 2) {
      return (4.0 / (81.0 * sqrt(30.0))) * pow(zeff, 1.5) * (zr * zr) * exp(-zr / 3.0);
    } else if (n == 4 && l == 0) {
      return (1.0 / 768.0) * pow(zeff, 1.5) * (192.0 - 144.0 * zr + 24.0 * zr * zr - zr * zr * zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 1) {
      return (1.0 / (256.0 * sqrt(15.0))) * pow(zeff, 1.5) * (80.0 * zr - 20.0 * zr * zr + zr * zr * zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 2) {
      return (1.0 / (768.0 * sqrt(5.0))) * pow(zeff, 1.5) * (12.0 * zr * zr - zr * zr * zr) * exp(-zr / 4.0);
    } else if (n == 4 && l == 3) {
      return (1.0 / (768.0 * sqrt(35.0))) * pow(zeff, 1.5) * (zr * zr * zr) * exp(-zr / 4.0);
    }
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

  float evalTheta(int l, int m, float ct) {
    int ma = abs(m);
    float phase = (m >= 0 && (ma % 2 == 1)) ? -1.0 : 1.0;
    float prefactor = sqrt((2.0 * float(l) + 1.0) / (4.0 * PI)
                           * factorialF(l - ma) / factorialF(l + ma));
    return prefactor * phase * legendreP(l, ma, ct);
  }

  vec2 rayBoxIntersection(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
    vec3 safeDir = vec3(
      abs(rd.x) < 1e-7 ? (rd.x < 0.0 ? -1e-7 : 1e-7) : rd.x,
      abs(rd.y) < 1e-7 ? (rd.y < 0.0 ? -1e-7 : 1e-7) : rd.y,
      abs(rd.z) < 1e-7 ? (rd.z < 0.0 ? -1e-7 : 1e-7) : rd.z
    );
    vec3 invDir = 1.0 / safeDir;
    vec3 t0 = (boxMin - ro) * invDir;
    vec3 t1 = (boxMax - ro) * invDir;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tNear = max(max(tmin.x, tmin.y), tmin.z);
    float tFar = min(min(tmax.x, tmax.y), tmax.z);
    return vec2(tNear, tFar);
  }

  vec3 resolveSuperpositionColor(float ramped, float constructive) {
    float boost = clamp(0.5 + 0.5 * constructive, 0.0, 1.0);
    if (!u_isAllowed) {
      vec3 slateOuter = vec3(0.22, 0.36, 0.52);
      vec3 cyanCore = vec3(0.45, 0.72, 0.86);
      return mix(slateOuter, cyanCore, clamp(ramped * (0.55 + 0.45 * boost), 0.0, 1.0));
    }
    vec3 quantumBlue = vec3(0.20, 0.50, 0.92);
    vec3 interferenceTint = mix(quantumBlue, u_photonColor, smoothstep(0.32, 0.92, boost));
    vec3 luminousCore = mix(u_photonColor, vec3(1.0), 0.58);
    return mix(interferenceTint, luminousCore, clamp(ramped * boost * 0.88, 0.0, 1.0));
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

    int maxSteps = clamp(u_steps, 32, 256);
    float stepSize = dist / float(maxSteps);
    float stepFraction = stepSize / max(u_frameRadius, 1e-4);
    vec4 accumColor = vec4(0.0);

    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float startOffset = (dither - 0.5) * stepSize * 0.5;

    for (int i = 0; i < 256; i++) {
      if (i >= maxSteps) break;
      vec3 p = entryPoint + rayDir * (startOffset + float(i) * stepSize);
      float r = length(p);
      if (r >= 1e-4) {
        float ct = clamp(p.z / r, -1.0, 1.0);
        float phi = atan(p.y, p.x);

        float psi1 = evalR(u_n1, u_l1, u_zEff, r) * evalTheta(u_l1, u_m1, ct);
        float psi2 = evalR(u_n2, u_l2, u_zEff, r) * evalTheta(u_l2, u_m2, ct);

        float a1 = float(u_m1) * phi;
        float a2 = float(u_m2) * phi - u_phase;
        float re = 0.70710678 * (psi1 * cos(a1) + psi2 * cos(a2));
        float im = 0.70710678 * (psi1 * sin(a1) + psi2 * sin(a2));
        float rawDensity = re * re + im * im;
        float constructive = (2.0 * psi1 * psi2 * cos(a2 - a1)) / (psi1 * psi1 + psi2 * psi2 + 1e-30);

        float normDensity = clamp(rawDensity / max(u_peakDensity, 1e-30), 0.0, 1.0);
        float t = clamp(1.0 - log(max(normDensity, 1e-30)) / log(u_densityFloor), 0.0, 1.0);
        float ramped = t * t * (3.0 - 2.0 * t);

        if (ramped > 1e-6) {
          vec3 color = resolveSuperpositionColor(ramped, constructive);
          float alphaSample = 1.0 - exp(-ramped * stepFraction * u_absorption);

          accumColor.rgb += (1.0 - accumColor.a) * color * alphaSample;
          accumColor.a += (1.0 - accumColor.a) * alphaSample;

          if (accumColor.a >= 0.96) break;
        }
      }
    }

    gl_FragColor = accumColor;
  }
`;

export class SpectroscopyRenderer extends BaseThreeRenderer {
  private readonly defaultCameraDir = new THREE.Vector3(0.65, 0.8, 1.15).normalize();
  private readonly raymarchMaterial: THREE.ShaderMaterial;
  private readonly raymarchMesh: THREE.Mesh;
  private readonly dipoleArrow: THREE.ArrowHelper;
  private readonly photonPositions: Float32Array;
  private readonly photonPositionAttr: THREE.BufferAttribute;
  private readonly photonMaterial: THREE.LineBasicMaterial;
  private readonly photonLine: THREE.Line;
  private readonly scratchDir = new THREE.Vector3(0, 0, 1);
  private readonly scratchColor = new THREE.Color();

  private frameRadius = INITIAL_FRAME_RADIUS;
  private clipReach = INITIAL_CLIP_REACH;
  private updateToken = 0;
  private hasTransition = false;
  private hasFramedOnce = false;

  private playing: boolean;
  private speed = 1.0;
  private phase = 0;
  private lastFrameTime = 0;
  private currentParams: SpectroscopyRenderParams | null = null;

  constructor(target: RendererTarget) {
    super(target, new THREE.Vector3(18, 22, 32));
    this.autoRotateSpeed = 1.4;
    this.playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.raymarchMaterial = new THREE.ShaderMaterial({
      vertexShader: superpositionVertexShader,
      fragmentShader: superpositionFragmentShader,
      uniforms: {
        u_n1: { value: 2 },
        u_l1: { value: 1 },
        u_m1: { value: 0 },
        u_n2: { value: 3 },
        u_l2: { value: 2 },
        u_m2: { value: 0 },
        u_zEff: { value: 1.0 },
        u_phase: { value: 0.0 },
        u_photonColor: { value: new THREE.Vector3(1.0, 0.18, 0.18) },
        u_isAllowed: { value: true },
        u_boxMin: { value: new THREE.Vector3(-INITIAL_FRAME_RADIUS, -INITIAL_FRAME_RADIUS, -INITIAL_FRAME_RADIUS) },
        u_boxMax: { value: new THREE.Vector3(INITIAL_FRAME_RADIUS, INITIAL_FRAME_RADIUS, INITIAL_FRAME_RADIUS) },
        u_steps: { value: RAYMARCH_STEPS },
        u_peakDensity: { value: 1.0 },
        u_densityFloor: { value: 1e-4 },
        u_frameRadius: { value: INITIAL_FRAME_RADIUS },
        u_absorption: { value: RAYMARCH_ABSORPTION },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
    this.raymarchMesh = new THREE.Mesh(boxGeometry, this.raymarchMaterial);
    this.raymarchMesh.renderOrder = 1;
    this.raymarchMesh.visible = false;
    this.scene.add(this.raymarchMesh);

    this.dipoleArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      1,
      0xfef08a,
      0.26,
      0.14,
    );
    this.dipoleArrow.visible = false;
    this.scene.add(this.dipoleArrow);

    this.photonPositions = new Float32Array(PHOTON_VERTEX_COUNT * 3);
    this.photonPositionAttr = new THREE.BufferAttribute(this.photonPositions, 3);
    this.photonPositionAttr.setUsage(THREE.DynamicDrawUsage);

    const photonGeometry = new THREE.BufferGeometry();
    photonGeometry.setAttribute('position', this.photonPositionAttr);
    this.photonMaterial = new THREE.LineBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.92,
    });
    this.photonLine = new THREE.Line(photonGeometry, this.photonMaterial);
    this.photonLine.frustumCulled = false;
    this.photonLine.visible = false;
    this.scene.add(this.photonLine);

    this.updateClipping();
    this.onWindowResize();
    this.stop();
  }

  public override start(): void {
    this.lastFrameTime = performance.now();
    super.start();
  }

  public setPlaying(playing: boolean): void {
    this.playing = playing;
    this.lastFrameTime = performance.now();
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public setSpeed(speed: number): void {
    this.speed = speed;
  }

  protected override onFrame(): void {
    const now = performance.now();
    const rawDt = (now - this.lastFrameTime) * 0.001;
    this.lastFrameTime = now;
    if (!this.playing || !this.hasTransition) return;

    const dt = Math.min(Math.max(rawDt, 0), MAX_FRAME_DT);
    this.phase = (this.phase + dt * BASE_PHASE_OMEGA * this.speed) % TWO_PI;
    this.syncAnimatedOverlays();
  }

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

  protected override onViewportChanged(): void {
    if (this.hasFramedOnce) {
      this.applyFraming(this.frameRadius, false);
    }
  }

  private applyFraming(radius: number, animate: boolean): void {
    const distance = computeFrameDistance(radius, this.camera.fov, this.camera.aspect, FRAME_MARGIN);
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) {
      direction.copy(this.defaultCameraDir);
    } else {
      direction.normalize();
    }

    this.frameRadius = radius;
    this.defaultCameraPos.copy(this.controls.target).addScaledVector(this.defaultCameraDir, distance);

    if (!this.hasFramedOnce) {
      this.hasFramedOnce = true;
      this.camera.position.copy(this.defaultCameraPos);
      this.controls.update();
      this.updateClipping();
      return;
    }

    this.updateClipping();
    if (!animate) return;

    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    if (Math.abs(currentDistance - distance) < distance * 0.04) return;

    this.animateCameraTo(
      this.controls.target.clone().addScaledVector(direction, distance),
      this.camera.up.clone(),
      this.controls.target.clone(),
      400,
    );
  }

  public async updateTransition(params: SpectroscopyRenderParams): Promise<void> {
    const token = ++this.updateToken;
    const { lower, upper, zEff } = params;

    const [geom1, geom2, peak1, peak2, samples1, samples2] = await Promise.all([
      resolveOrbitalGeometry(lower.n, lower.l, zEff),
      resolveOrbitalGeometry(upper.n, upper.l, zEff),
      getOrbitalPeakDensity(lower.n, lower.l, lower.m, false, zEff),
      getOrbitalPeakDensity(upper.n, upper.l, upper.m, false, zEff),
      sampleOrbitalPoints({
        n: lower.n,
        l: lower.l,
        m: lower.m,
        useRealOrbital: false,
        zEff,
        pointCount: FLOOR_SAMPLE_COUNT,
      }),
      sampleOrbitalPoints({
        n: upper.n,
        l: upper.l,
        m: upper.m,
        useRealOrbital: false,
        zEff,
        pointCount: FLOOR_SAMPLE_COUNT,
      }),
    ]);

    if (token !== this.updateToken) return;

    this.currentParams = params;
    this.hasTransition = true;
    this.syncPixelRatio();

    const count1 = Math.floor(samples1.length / SAMPLE_STRIDE);
    const count2 = Math.floor(samples2.length / SAMPLE_STRIDE);
    const floor1 = computeDensityFloor(samples1, count1);
    const floor2 = computeDensityFloor(samples2, count2);

    const frameRadius = Math.max(geom1.frameRadius, geom2.frameRadius);
    const boxExtent = Math.max(geom1.boxExtent, geom2.boxExtent);
    const peakDensity = Math.max(peak1, peak2);
    const densityFloor = THREE.MathUtils.clamp(
      (0.5 * Math.min(peak1 * floor1, peak2 * floor2)) / peakDensity,
      1e-9,
      0.05,
    );

    this.clipReach = Math.max(boxExtent * Math.sqrt(3), frameRadius * 1.8) * CLIP_HEADROOM;

    const uniforms = this.raymarchMaterial.uniforms;
    uniforms.u_n1.value = lower.n;
    uniforms.u_l1.value = lower.l;
    uniforms.u_m1.value = lower.m;
    uniforms.u_n2.value = upper.n;
    uniforms.u_l2.value = upper.l;
    uniforms.u_m2.value = upper.m;
    uniforms.u_zEff.value = zEff;
    uniforms.u_isAllowed.value = params.isAllowed;
    uniforms.u_photonColor.value.set(
      params.photonColorRgb[0],
      params.photonColorRgb[1],
      params.photonColorRgb[2],
    );
    uniforms.u_boxMin.value.set(-boxExtent, -boxExtent, -boxExtent);
    uniforms.u_boxMax.value.set(boxExtent, boxExtent, boxExtent);
    uniforms.u_peakDensity.value = peakDensity;
    uniforms.u_densityFloor.value = densityFloor;
    uniforms.u_frameRadius.value = frameRadius;

    this.raymarchMesh.scale.setScalar(boxExtent);
    this.raymarchMesh.visible = true;

    this.scratchColor.setRGB(
      params.photonColorRgb[0] * 0.78 + 0.22,
      params.photonColorRgb[1] * 0.78 + 0.22,
      params.photonColorRgb[2] * 0.78 + 0.22,
    );
    this.photonMaterial.color.copy(this.scratchColor);

    this.applyFraming(frameRadius, true);
    this.syncAnimatedOverlays();
  }

  private syncAnimatedOverlays(): void {
    this.raymarchMaterial.uniforms.u_phase.value = this.phase;
    const params = this.currentParams;
    if (!params?.isAllowed) {
      this.dipoleArrow.visible = false;
      this.photonLine.visible = false;
      return;
    }

    const deltaM = params.upper.m - params.lower.m;
    this.updateDipoleArrow(params, deltaM);
    this.updatePhotonWave(params, deltaM);
  }

  private updateDipoleArrow(params: SpectroscopyRenderParams, deltaM: number): void {
    const dipoleScale = THREE.MathUtils.clamp(
      0.28 + 0.06 * Math.abs(params.dipoleIntegralBohr),
      0.28,
      0.5,
    );
    const maxLen = dipoleScale * this.frameRadius;

    if (deltaM === 0) {
      const osc = Math.cos(this.phase);
      const len = Math.abs(osc) * maxLen;
      if (len < 1e-3 * this.frameRadius) {
        this.dipoleArrow.visible = false;
        return;
      }
      this.dipoleArrow.visible = true;
      this.scratchDir.set(0, 0, osc >= 0 ? 1 : -1);
      this.dipoleArrow.setDirection(this.scratchDir);
      const headLen = Math.min(maxLen * 0.26, len * 0.48);
      this.dipoleArrow.setLength(len, headLen, headLen * 0.55);
      return;
    }

    this.dipoleArrow.visible = true;
    const angle = deltaM * this.phase;
    this.scratchDir.set(Math.cos(angle), Math.sin(angle), 0);
    this.dipoleArrow.setDirection(this.scratchDir);
    const headLen = maxLen * 0.26;
    this.dipoleArrow.setLength(maxLen, headLen, headLen * 0.55);
  }

  private updatePhotonWave(params: SpectroscopyRenderParams, deltaM: number): void {
    this.photonLine.visible = true;
    const xStart = 0.5 * this.frameRadius;
    const xSpan = 1.15 * this.frameRadius;
    const amplitude = 0.16 * this.frameRadius;
    const dirSign = params.mode === 'emission' ? 1.0 : -1.0;
    const waveK = Math.PI * 8.0;
    const invLast = 1.0 / (PHOTON_VERTEX_COUNT - 1);

    for (let i = 0; i < PHOTON_VERTEX_COUNT; i++) {
      const s = i * invLast;
      const centered = (s - 0.5) / 0.21;
      const envelope = amplitude * Math.exp(-0.5 * centered * centered);
      const wavePhase = waveK * s - dirSign * 2.0 * this.phase;

      const idx = i * 3;
      this.photonPositions[idx] = xStart + s * xSpan;
      this.photonPositions[idx + 1] = deltaM === 0 ? 0 : envelope * Math.cos(wavePhase);
      this.photonPositions[idx + 2] =
        deltaM === 0 ? envelope * Math.cos(wavePhase) : envelope * deltaM * Math.sin(wavePhase);
    }

    this.photonPositionAttr.needsUpdate = true;
  }

  protected override cleanupScene(): void {
    this.updateToken += 1;
    this.scene.remove(this.raymarchMesh);
    this.raymarchMesh.geometry.dispose();
    this.raymarchMaterial.dispose();

    this.scene.remove(this.dipoleArrow);
    this.dipoleArrow.dispose();

    this.scene.remove(this.photonLine);
    this.photonLine.geometry.dispose();
    this.photonMaterial.dispose();
  }
}
