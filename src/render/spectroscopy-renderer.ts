import * as THREE from 'three';
import {
  BaseThreeRenderer,
  RendererTarget,
  createCircleBadgeSprite,
  drawRoundedRect,
} from './render-utils';
import { computeDensityFloor, computeFrameDistance } from './orbital-point-cloud';
import { QuantumState, TransitionMode } from '../core/spectroscopy';
import {
  SAMPLE_STRIDE,
  getOrbitalPeakDensity,
  resolveOrbitalGeometry,
  sampleOrbitalPoints,
} from '../core/wasm-bridge';

export type SpectroscopyVisualMode = 'slice' | 'volume';

export interface SpectroscopyRenderParams {
  lower: QuantumState;
  upper: QuantumState;
  zEff: number;
  mode: TransitionMode;
  isAllowed: boolean;
  photonColorRgb: [number, number, number]; // 0..1 from WavelengthColor
  dipoleIntegralBohr: number;
  visualMode: SpectroscopyVisualMode;
}

const FRAME_MARGIN = 1.16;
const CLIP_HEADROOM = 1.05;
const INITIAL_FRAME_RADIUS = 18;
const INITIAL_CLIP_REACH = INITIAL_FRAME_RADIUS * 1.8 * CLIP_HEADROOM;
const RAYMARCH_STEPS = 112;
const RAYMARCH_ABSORPTION = 5.0;
const SLICE_BACK_ABSORPTION = 0.55 * RAYMARCH_ABSORPTION;
const FLOOR_SAMPLE_COUNT = 20_000;
const PHOTON_SAMPLE_COUNT = 120;
const RING_SEGMENTS = 64;
const BASE_PHASE_OMEGA = 3.2;
const MAX_FRAME_DT = 0.1;
const TWO_PI = Math.PI * 2;
const DEFAULT_CAMERA_DIR = new THREE.Vector3(0.42, 0.88, 1.05).normalize();

const sharedSuperpositionGlsl = `
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
  uniform float u_peakDensity;
  uniform float u_densityFloor;

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
    float radialPow = l == 0 ? 1.0 : pow(max(rho, 1e-10), float(l));
    return prefactor * exp(-zr / nf) * radialPow * lag;
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

  vec3 resolveSuperpositionColor(float ramped, float constructive) {
    float boost = clamp(0.5 + 0.5 * constructive, 0.0, 1.0);
    if (!u_isAllowed) {
      vec3 slateOuter = vec3(0.20, 0.34, 0.48);
      vec3 cyanCore = vec3(0.46, 0.74, 0.88);
      return mix(slateOuter, cyanCore, clamp(ramped * (0.55 + 0.45 * boost), 0.0, 1.0));
    }

    vec3 depletedColor = mix(vec3(0.11, 0.17, 0.30), vec3(0.20, 0.34, 0.52), ramped);
    vec3 luminousCore = mix(u_photonColor, vec3(1.0), 0.60);
    vec3 surgeColor = mix(u_photonColor, luminousCore, clamp(ramped * 0.88, 0.0, 1.0));
    return mix(depletedColor, surgeColor, smoothstep(0.32, 0.80, boost));
  }

  vec3 evalSuperpositionSample(vec3 p) {
    float r = length(p);
    if (r < 1e-4) return vec3(0.0);

    float ct = clamp(p.z / r, -1.0, 1.0);
    float phi = (abs(p.x) + abs(p.y)) > 1e-6 ? atan(p.y, p.x) : 0.0;

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

    float boost = clamp(0.5 + 0.5 * constructive, 0.0, 1.0);
    float weight = u_isAllowed ? mix(0.45, 1.0, smoothstep(0.15, 0.85, boost)) : 1.0;
    return vec3(ramped, constructive, ramped * weight);
  }
`;

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

  uniform vec3 u_boxMin;
  uniform vec3 u_boxMax;
  uniform int u_steps;
  uniform float u_frameRadius;
  uniform float u_absorption;
  uniform bool u_clipTopHalf;

  ${sharedSuperpositionGlsl}

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

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec3 boxMax = u_clipTopHalf ? vec3(u_boxMax.x, 0.0, u_boxMax.z) : u_boxMax;
    vec2 tHit = rayBoxIntersection(vOrigin, rayDir, u_boxMin, boxMax);

    if (tHit.x > tHit.y || tHit.y < 0.0) {
      discard;
    }

    float tStart = max(tHit.x, 0.0);
    float dist = tHit.y - tStart;

    int maxSteps = clamp(u_steps, 32, 256);
    float stepSize = dist / float(maxSteps);
    float stepFraction = stepSize / max(u_frameRadius, 1e-4);
    vec4 accumColor = vec4(0.0);

    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float startOffset = (dither - 0.5) * stepSize * 0.5;

    for (int i = 0; i < 256; i++) {
      if (i >= maxSteps) break;
      float tCurr = tStart + startOffset + (float(i) + 0.5) * stepSize;
      if (tCurr >= tHit.y) break;

      vec3 p = vOrigin + rayDir * max(tCurr, tStart);
      vec3 sampleVal = evalSuperpositionSample(p);
      float ramped = sampleVal.x;
      float constructive = sampleVal.y;
      float effectiveDensity = sampleVal.z;

      if (effectiveDensity > 1e-6) {
        vec3 color = resolveSuperpositionColor(ramped, constructive);
        float alphaSample = 1.0 - exp(-effectiveDensity * stepFraction * u_absorption);

        accumColor.rgb += (1.0 - accumColor.a) * color * alphaSample;
        accumColor.a += (1.0 - accumColor.a) * alphaSample;

        if (accumColor.a >= 0.96) break;
      }
    }

    gl_FragColor = accumColor;
  }
`;

const sliceVertexShader = `
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const sliceFragmentShader = `
  varying vec3 vWorldPos;
  varying vec2 vUv;

  ${sharedSuperpositionGlsl}

  void main() {
    vec3 sampleVal = evalSuperpositionSample(vec3(vWorldPos.x, 0.0, vWorldPos.z));
    float ramped = sampleVal.x;
    float constructive = sampleVal.y;
    float effectiveDensity = sampleVal.z;
    if (ramped <= 1e-4) {
      discard;
    }

    vec3 baseColor = resolveSuperpositionColor(ramped, constructive);

    const float CONTOUR_BANDS = 6.0;
    float level = ramped * CONTOUR_BANDS;
    float distToLine = abs(fract(level - 0.5) - 0.5);
    float fw = max(fwidth(level), 1e-4);
    float contour = 1.0 - smoothstep(0.0, fw * 1.45, distToLine);
    contour *= smoothstep(0.04, 0.14, ramped) * (1.0 - smoothstep(0.94, 0.995, ramped));

    vec2 edgeDist = min(vUv, 1.0 - vUv);
    float borderFade = smoothstep(0.0, 0.05, min(edgeDist.x, edgeDist.y));

    vec3 color = mix(baseColor, vec3(0.96, 0.98, 1.0), 0.72 * contour);
    float baseAlpha = smoothstep(0.0, 0.08, effectiveDensity) * (0.28 + 0.58 * effectiveDensity);
    float alpha = clamp(baseAlpha + 0.36 * contour, 0.0, 0.94) * borderFade;
    if (alpha <= 1e-3) {
      discard;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

function paintPillBadge(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  texture: THREE.CanvasTexture,
  text: string,
  borderColor: string,
  textColor: string,
): void {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  drawRoundedRect(ctx, 6, 8, width - 12, height - 16, 24);
  ctx.fillStyle = 'rgba(10, 15, 28, 0.88)';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = '700 38px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 1);
  texture.needsUpdate = true;
}

function createPillBadge(
  text: string,
  borderColor: string,
  textColor: string,
): {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  paintPillBadge(canvas, ctx, texture, text, borderColor, textColor);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 12;
  sprite.frustumCulled = false;
  return { sprite, canvas, ctx, texture, material };
}

function createDipoleRingGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const theta = (i / RING_SEGMENTS) * TWO_PI;
    points.push(new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createPhotonRibbonGeometry(positions: Float32Array): {
  geometry: THREE.BufferGeometry;
  positionAttr: THREE.BufferAttribute;
} {
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);

  const indices = new Uint16Array((PHOTON_SAMPLE_COUNT - 1) * 6);
  let ptr = 0;
  for (let i = 0; i < PHOTON_SAMPLE_COUNT - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices[ptr++] = a;
    indices[ptr++] = b;
    indices[ptr++] = c;
    indices[ptr++] = b;
    indices[ptr++] = d;
    indices[ptr++] = c;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positionAttr);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return { geometry, positionAttr };
}

export class SpectroscopyRenderer extends BaseThreeRenderer {
  private readonly defaultCameraDir = DEFAULT_CAMERA_DIR;

  private readonly ambientLight: THREE.AmbientLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.DirectionalLight;

  private readonly raymarchGeometry: THREE.BoxGeometry;
  private readonly raymarchMaterial: THREE.ShaderMaterial;
  private readonly raymarchMesh: THREE.Mesh;

  private readonly sliceGeometry: THREE.PlaneGeometry;
  private readonly sliceMaterial: THREE.ShaderMaterial;
  private readonly sliceMesh: THREE.Mesh;

  private readonly nucleusGeometry: THREE.SphereGeometry;
  private readonly nucleusMaterial: THREE.MeshStandardMaterial;
  private readonly nucleusMesh: THREE.Mesh;

  private readonly axisGeometry: THREE.BufferGeometry;
  private readonly axisMaterial: THREE.LineDashedMaterial;
  private readonly axisLine: THREE.Line;

  private readonly zBadgeTexture: THREE.CanvasTexture;
  private readonly zBadgeMaterial: THREE.SpriteMaterial;
  private readonly zBadgeSprite: THREE.Sprite;

  private readonly dipoleSegmentGeometry: THREE.BufferGeometry;
  private readonly dipoleSegmentMaterial: THREE.LineBasicMaterial;
  private readonly dipoleSegmentGuide: THREE.LineSegments;

  private readonly dipoleRingGeometry: THREE.BufferGeometry;
  private readonly dipoleRingMaterial: THREE.LineDashedMaterial;
  private readonly dipoleRingGuide: THREE.Line;

  private readonly dipoleArrow: THREE.ArrowHelper;
  private readonly dipoleBadgeTexture: THREE.CanvasTexture;
  private readonly dipoleBadgeMaterial: THREE.SpriteMaterial;
  private readonly dipoleBadgeSprite: THREE.Sprite;

  private readonly photonCenters = new Float32Array(PHOTON_SAMPLE_COUNT * 3);
  private readonly photonPositions = new Float32Array(PHOTON_SAMPLE_COUNT * 2 * 3);
  private readonly photonPositionAttr: THREE.BufferAttribute;
  private readonly photonGeometry: THREE.BufferGeometry;
  private readonly photonMaterial: THREE.MeshBasicMaterial;
  private readonly photonMesh: THREE.Mesh;

  private readonly photonArrowGeometry: THREE.ConeGeometry;
  private readonly photonArrowMaterial: THREE.MeshBasicMaterial;
  private readonly photonArrowMesh: THREE.Mesh;

  private readonly photonBadgeCanvas: HTMLCanvasElement;
  private readonly photonBadgeCtx: CanvasRenderingContext2D;
  private readonly photonBadgeTexture: THREE.CanvasTexture;
  private readonly photonBadgeMaterial: THREE.SpriteMaterial;
  private readonly photonBadgeSprite: THREE.Sprite;
  private lastPhotonBadgeBorder = '';

  private readonly scratchDir = new THREE.Vector3(0, 0, 1);
  private readonly scratchPacketCenter = new THREE.Vector3();
  private readonly scratchViewDir = new THREE.Vector3();
  private readonly scratchTangent = new THREE.Vector3();
  private readonly scratchOffset = new THREE.Vector3();
  private readonly fallbackUp = new THREE.Vector3(0, 1, 0);
  private readonly fallbackZ = new THREE.Vector3(0, 0, 1);
  private readonly scratchColor = new THREE.Color();

  private atomRadius = INITIAL_FRAME_RADIUS;
  private framingRadius = INITIAL_FRAME_RADIUS;
  protected override clipReach = INITIAL_CLIP_REACH;
  private updateToken = 0;
  private hasTransition = false;
  private hasFramedOnce = false;

  private playing: boolean;
  private speed = 1.0;
  private phase = 0;
  private lastFrameTime = 0;
  private currentParams: SpectroscopyRenderParams | null = null;

  constructor(target: RendererTarget) {
    super(target, DEFAULT_CAMERA_DIR.clone().multiplyScalar(36));
    this.autoRotateSpeed = 1.4;
    this.playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    this.keyLight.position.set(12, 20, 14);
    this.fillLight = new THREE.DirectionalLight(0x88ccff, 0.65);
    this.fillLight.position.set(-14, -10, -12);
    this.scene.add(this.ambientLight, this.keyLight, this.fillLight);

    this.raymarchMaterial = new THREE.ShaderMaterial({
      vertexShader: superpositionVertexShader,
      fragmentShader: superpositionFragmentShader,
      uniforms: {
        ...this.createSharedUniforms(),
        u_boxMin: { value: new THREE.Vector3(-INITIAL_FRAME_RADIUS, -INITIAL_FRAME_RADIUS, -INITIAL_FRAME_RADIUS) },
        u_boxMax: { value: new THREE.Vector3(INITIAL_FRAME_RADIUS, INITIAL_FRAME_RADIUS, INITIAL_FRAME_RADIUS) },
        u_steps: { value: RAYMARCH_STEPS },
        u_frameRadius: { value: INITIAL_FRAME_RADIUS },
        u_absorption: { value: SLICE_BACK_ABSORPTION },
        u_clipTopHalf: { value: true },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.raymarchGeometry = new THREE.BoxGeometry(2, 2, 2);
    this.raymarchMesh = new THREE.Mesh(this.raymarchGeometry, this.raymarchMaterial);
    this.raymarchMesh.renderOrder = 1;
    this.raymarchMesh.frustumCulled = false;
    this.raymarchMesh.visible = false;
    this.scene.add(this.raymarchMesh);

    this.sliceGeometry = new THREE.PlaneGeometry(2, 2);
    this.sliceGeometry.rotateX(-Math.PI / 2);
    this.sliceMaterial = new THREE.ShaderMaterial({
      vertexShader: sliceVertexShader,
      fragmentShader: sliceFragmentShader,
      uniforms: this.createSharedUniforms(),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sliceMesh = new THREE.Mesh(this.sliceGeometry, this.sliceMaterial);
    this.sliceMesh.renderOrder = 2;
    this.sliceMesh.frustumCulled = false;
    this.sliceMesh.visible = false;
    this.scene.add(this.sliceMesh);

    this.nucleusGeometry = new THREE.SphereGeometry(1, 20, 14);
    this.nucleusMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8f1ff,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.32,
      roughness: 0.22,
      metalness: 0.35,
      depthTest: false,
      depthWrite: false,
    });
    this.nucleusMesh = new THREE.Mesh(this.nucleusGeometry, this.nucleusMaterial);
    this.nucleusMesh.renderOrder = 10;
    this.nucleusMesh.frustumCulled = false;
    this.nucleusMesh.visible = false;
    this.scene.add(this.nucleusMesh);

    this.axisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 1),
    ]);
    this.axisMaterial = new THREE.LineDashedMaterial({
      color: 0x94a3b8,
      dashSize: 0.22,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
    });
    this.axisLine = new THREE.Line(this.axisGeometry, this.axisMaterial);
    this.axisLine.renderOrder = 7;
    this.axisLine.frustumCulled = false;
    this.axisLine.visible = false;
    this.scene.add(this.axisLine);

    const zBadge = createCircleBadgeSprite('Z', '#94a3b8');
    this.zBadgeTexture = zBadge.texture;
    this.zBadgeMaterial = zBadge.material;
    this.zBadgeSprite = zBadge.sprite;
    this.zBadgeSprite.visible = false;
    this.scene.add(this.zBadgeSprite);

    this.dipoleSegmentGeometry = new THREE.BufferGeometry();
    this.dipoleSegmentGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6 * 3), 3),
    );
    this.dipoleSegmentMaterial = new THREE.LineBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
    });
    this.dipoleSegmentGuide = new THREE.LineSegments(
      this.dipoleSegmentGeometry,
      this.dipoleSegmentMaterial,
    );
    this.dipoleSegmentGuide.renderOrder = 7;
    this.dipoleSegmentGuide.frustumCulled = false;
    this.dipoleSegmentGuide.visible = false;
    this.scene.add(this.dipoleSegmentGuide);

    this.dipoleRingGeometry = createDipoleRingGeometry();
    this.dipoleRingMaterial = new THREE.LineDashedMaterial({
      color: 0xfde047,
      dashSize: 0.18,
      gapSize: 0.11,
      transparent: true,
      opacity: 0.48,
      depthTest: false,
      depthWrite: false,
    });
    this.dipoleRingGuide = new THREE.Line(this.dipoleRingGeometry, this.dipoleRingMaterial);
    this.dipoleRingGuide.computeLineDistances();
    this.dipoleRingGuide.renderOrder = 7;
    this.dipoleRingGuide.frustumCulled = false;
    this.dipoleRingGuide.visible = false;
    this.scene.add(this.dipoleRingGuide);

    this.dipoleArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      1,
      0xfde047,
      0.3,
      0.2,
    );
    const arrowLineMat = this.dipoleArrow.line.material as THREE.LineBasicMaterial;
    arrowLineMat.depthTest = false;
    arrowLineMat.depthWrite = false;
    const arrowConeMat = this.dipoleArrow.cone.material as THREE.MeshBasicMaterial;
    arrowConeMat.depthTest = false;
    arrowConeMat.depthWrite = false;
    this.dipoleArrow.line.renderOrder = 11;
    this.dipoleArrow.cone.renderOrder = 11;
    this.dipoleArrow.line.frustumCulled = false;
    this.dipoleArrow.cone.frustumCulled = false;
    this.dipoleArrow.renderOrder = 11;
    this.dipoleArrow.visible = false;
    this.scene.add(this.dipoleArrow);

    const dipoleBadge = createPillBadge('d(t)', '#fde047', '#fef08a');
    this.dipoleBadgeTexture = dipoleBadge.texture;
    this.dipoleBadgeMaterial = dipoleBadge.material;
    this.dipoleBadgeSprite = dipoleBadge.sprite;
    this.dipoleBadgeSprite.visible = false;
    this.scene.add(this.dipoleBadgeSprite);

    const ribbon = createPhotonRibbonGeometry(this.photonPositions);
    this.photonGeometry = ribbon.geometry;
    this.photonPositionAttr = ribbon.positionAttr;
    this.photonMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.photonMesh = new THREE.Mesh(this.photonGeometry, this.photonMaterial);
    this.photonMesh.renderOrder = 11;
    this.photonMesh.frustumCulled = false;
    this.photonMesh.visible = false;
    this.scene.add(this.photonMesh);

    this.photonArrowGeometry = new THREE.ConeGeometry(1, 1, 16);
    this.photonArrowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    });
    this.photonArrowMesh = new THREE.Mesh(this.photonArrowGeometry, this.photonArrowMaterial);
    this.photonArrowMesh.renderOrder = 11;
    this.photonArrowMesh.frustumCulled = false;
    this.photonArrowMesh.visible = false;
    this.scene.add(this.photonArrowMesh);

    const photonBadge = createPillBadge('hν', '#e2e8f0', '#f8fafc');
    this.photonBadgeCanvas = photonBadge.canvas;
    this.photonBadgeCtx = photonBadge.ctx;
    this.photonBadgeTexture = photonBadge.texture;
    this.photonBadgeMaterial = photonBadge.material;
    this.photonBadgeSprite = photonBadge.sprite;
    this.photonBadgeSprite.visible = false;
    this.scene.add(this.photonBadgeSprite);

    this.updateClipping();
    this.onWindowResize();
    this.stop();
  }

  private createSharedUniforms(): Record<string, THREE.IUniform> {
    return {
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
      u_peakDensity: { value: 1.0 },
      u_densityFloor: { value: 1e-4 },
    };
  }

  private syncSharedUniforms(
    uniforms: Record<string, THREE.IUniform>,
    params: SpectroscopyRenderParams,
    peakDensity: number,
    densityFloor: number,
  ): void {
    const { lower, upper, zEff } = params;
    uniforms.u_n1.value = lower.n;
    uniforms.u_l1.value = lower.l;
    uniforms.u_m1.value = lower.m;
    uniforms.u_n2.value = upper.n;
    uniforms.u_l2.value = upper.l;
    uniforms.u_m2.value = upper.m;
    uniforms.u_zEff.value = zEff;
    uniforms.u_isAllowed.value = params.isAllowed;
    (uniforms.u_photonColor.value as THREE.Vector3).set(
      params.photonColorRgb[0],
      params.photonColorRgb[1],
      params.photonColorRgb[2],
    );
    uniforms.u_peakDensity.value = peakDensity;
    uniforms.u_densityFloor.value = densityFloor;
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
    if (!this.hasTransition) return;

    if (this.playing) {
      const dt = Math.min(Math.max(rawDt, 0), MAX_FRAME_DT);
      this.phase = (this.phase + dt * BASE_PHASE_OMEGA * this.speed) % TWO_PI;
    }
    this.syncAnimatedOverlays();
  }

  protected override onViewportChanged(): void {
    if (this.hasFramedOnce) {
      this.applyFraming(this.framingRadius, false);
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

    this.framingRadius = radius;
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
    const effectiveRadius = params.isAllowed ? frameRadius * 1.32 : frameRadius;
    const boxExtent = Math.max(geom1.boxExtent, geom2.boxExtent);
    const peakDensity = Math.max(peak1, peak2);
    const densityFloor = THREE.MathUtils.clamp(
      (0.5 * Math.min(peak1 * floor1, peak2 * floor2)) / peakDensity,
      1e-9,
      0.05,
    );

    this.atomRadius = frameRadius;
    this.clipReach = Math.max(boxExtent * Math.sqrt(3), effectiveRadius * 1.8) * CLIP_HEADROOM;

    const isSlice = params.visualMode === 'slice';

    this.syncSharedUniforms(this.raymarchMaterial.uniforms, params, peakDensity, densityFloor);
    const rayUniforms = this.raymarchMaterial.uniforms;
    (rayUniforms.u_boxMin.value as THREE.Vector3).set(-boxExtent, -boxExtent, -boxExtent);
    (rayUniforms.u_boxMax.value as THREE.Vector3).set(boxExtent, boxExtent, boxExtent);
    rayUniforms.u_frameRadius.value = frameRadius;
    rayUniforms.u_absorption.value = isSlice ? SLICE_BACK_ABSORPTION : RAYMARCH_ABSORPTION;
    rayUniforms.u_clipTopHalf.value = isSlice;
    this.raymarchMesh.scale.setScalar(boxExtent);
    this.raymarchMesh.visible = true;

    this.syncSharedUniforms(this.sliceMaterial.uniforms, params, peakDensity, densityFloor);
    this.sliceMesh.scale.setScalar(boxExtent);
    this.sliceMesh.visible = isSlice;

    this.nucleusMesh.scale.setScalar(Math.max(0.12, frameRadius * 0.028));
    this.nucleusMesh.visible = true;

    const axisExtent = frameRadius * 1.05;
    const axisPos = this.axisGeometry.getAttribute('position') as THREE.BufferAttribute;
    axisPos.setXYZ(0, 0, 0, -axisExtent);
    axisPos.setXYZ(1, 0, 0, axisExtent);
    axisPos.needsUpdate = true;
    this.axisMaterial.dashSize = frameRadius * 0.045;
    this.axisMaterial.gapSize = frameRadius * 0.03;
    this.axisLine.computeLineDistances();
    this.axisLine.visible = true;

    const zBadgeScale = frameRadius * 0.095;
    this.zBadgeSprite.position.set(0, 0, axisExtent * 1.06);
    this.zBadgeSprite.scale.set(zBadgeScale, zBadgeScale, 1);
    this.zBadgeSprite.visible = true;

    this.dipoleBadgeSprite.scale.set(frameRadius * 0.16, frameRadius * 0.08, 1);

    const deltaM = upper.m - lower.m;
    const maxLen = this.getDipoleMaxLen(params);
    if (params.isAllowed && deltaM === 0) {
      const tick = maxLen * 0.14;
      const segPos = this.dipoleSegmentGeometry.getAttribute('position') as THREE.BufferAttribute;
      segPos.setXYZ(0, 0, 0, -maxLen);
      segPos.setXYZ(1, 0, 0, maxLen);
      segPos.setXYZ(2, -tick, 0, -maxLen);
      segPos.setXYZ(3, tick, 0, -maxLen);
      segPos.setXYZ(4, -tick, 0, maxLen);
      segPos.setXYZ(5, tick, 0, maxLen);
      segPos.needsUpdate = true;
      this.dipoleSegmentGuide.visible = true;
      this.dipoleRingGuide.visible = false;
    } else if (params.isAllowed) {
      this.dipoleSegmentGuide.visible = false;
      this.dipoleRingGuide.scale.setScalar(maxLen);
      this.dipoleRingGuide.visible = true;
    } else {
      this.dipoleSegmentGuide.visible = false;
      this.dipoleRingGuide.visible = false;
    }

    this.scratchColor.setRGB(
      params.photonColorRgb[0] * 0.78 + 0.22,
      params.photonColorRgb[1] * 0.78 + 0.22,
      params.photonColorRgb[2] * 0.78 + 0.22,
    );
    this.photonMaterial.color.copy(this.scratchColor);
    this.photonArrowMaterial.color.copy(this.scratchColor);

    const borderStyle = this.scratchColor.getStyle();
    if (borderStyle !== this.lastPhotonBadgeBorder) {
      this.lastPhotonBadgeBorder = borderStyle;
      paintPillBadge(
        this.photonBadgeCanvas,
        this.photonBadgeCtx,
        this.photonBadgeTexture,
        'hν',
        borderStyle,
        '#f8fafc',
      );
    }

    const coneRadius = frameRadius * 0.048;
    const coneLength = frameRadius * 0.11;
    this.photonArrowMesh.scale.set(coneRadius, coneLength, coneRadius);
    this.photonArrowMesh.rotation.set(0, 0, params.mode === 'emission' ? -Math.PI / 2 : Math.PI / 2);

    this.photonBadgeSprite.position.set(frameRadius * 0.71, frameRadius * 0.25, 0);
    this.photonBadgeSprite.scale.set(frameRadius * 0.18, frameRadius * 0.09, 1);

    this.applyFraming(effectiveRadius, true);
    this.syncAnimatedOverlays();
  }

  private getDipoleMaxLen(params: SpectroscopyRenderParams): number {
    const dipoleScale = THREE.MathUtils.clamp(
      0.28 + 0.06 * Math.abs(params.dipoleIntegralBohr),
      0.28,
      0.5,
    );
    return dipoleScale * this.atomRadius;
  }

  private syncAnimatedOverlays(): void {
    this.raymarchMaterial.uniforms.u_phase.value = this.phase;
    this.sliceMaterial.uniforms.u_phase.value = this.phase;

    const params = this.currentParams;
    if (!params?.isAllowed) {
      this.dipoleArrow.visible = false;
      this.dipoleBadgeSprite.visible = false;
      this.photonMesh.visible = false;
      this.photonArrowMesh.visible = false;
      this.photonBadgeSprite.visible = false;
      return;
    }

    const deltaM = params.upper.m - params.lower.m;
    this.updateDipoleArrow(params, deltaM);
    this.updatePhotonWave(params, deltaM);
  }

  private updateDipoleArrow(params: SpectroscopyRenderParams, deltaM: number): void {
    const maxLen = this.getDipoleMaxLen(params);

    if (deltaM === 0) {
      const osc = Math.cos(this.phase);
      const len = Math.abs(osc) * maxLen;
      if (len < 1e-3 * this.atomRadius) {
        this.dipoleArrow.visible = false;
        this.dipoleBadgeSprite.visible = false;
        return;
      }
      this.dipoleArrow.visible = true;
      this.dipoleBadgeSprite.visible = true;
      this.scratchDir.set(0, 0, osc >= 0 ? 1 : -1);
      this.dipoleArrow.setDirection(this.scratchDir);
      const headLen = Math.min(maxLen * 0.3, len * 0.52);
      this.dipoleArrow.setLength(len, headLen, headLen * 0.65);
      this.dipoleBadgeSprite.position.copy(this.scratchDir).multiplyScalar(len + this.atomRadius * 0.095);
      return;
    }

    this.dipoleArrow.visible = true;
    this.dipoleBadgeSprite.visible = true;
    const angle = deltaM * this.phase;
    this.scratchDir.set(Math.cos(angle), Math.sin(angle), 0);
    this.dipoleArrow.setDirection(this.scratchDir);
    const headLen = maxLen * 0.3;
    this.dipoleArrow.setLength(maxLen, headLen, headLen * 0.65);
    this.dipoleBadgeSprite.position.copy(this.scratchDir).multiplyScalar(maxLen + this.atomRadius * 0.095);
  }

  private updatePhotonWave(params: SpectroscopyRenderParams, deltaM: number): void {
    this.photonMesh.visible = true;
    this.photonArrowMesh.visible = true;
    this.photonBadgeSprite.visible = true;

    const xStart = 0.44 * this.atomRadius;
    const xSpan = 0.54 * this.atomRadius;
    const dirSign = params.mode === 'emission' ? 1.0 : -1.0;

    this.samplePhotonPacketCenters(xStart, xSpan, dirSign, deltaM);
    this.buildPhotonRibbonGeometry(xStart + 0.5 * xSpan);

    this.photonPositionAttr.needsUpdate = true;

    const tipIdx = params.mode === 'emission' ? (PHOTON_SAMPLE_COUNT - 1) * 3 : 0;
    const centers = this.photonCenters;
    this.photonArrowMesh.position.set(centers[tipIdx], centers[tipIdx + 1], centers[tipIdx + 2]);
  }

  private samplePhotonPacketCenters(
    xStart: number,
    xSpan: number,
    dirSign: number,
    deltaM: number,
  ): void {
    const amplitude = 0.13 * this.atomRadius;
    const waveK = Math.PI * 8.0;
    const invLast = 1.0 / (PHOTON_SAMPLE_COUNT - 1);
    const centers = this.photonCenters;
    const isLinear = deltaM === 0;

    for (let i = 0; i < PHOTON_SAMPLE_COUNT; i++) {
      const s = i * invLast;
      const centered = (s - 0.5) / 0.21;
      const envelope = amplitude * Math.exp(-0.5 * centered * centered);
      const wavePhase = waveK * s - dirSign * 2.0 * this.phase;
      const cosWave = envelope * Math.cos(wavePhase);

      const idx = i * 3;
      centers[idx] = xStart + s * xSpan;
      centers[idx + 1] = isLinear ? 0 : cosWave;
      centers[idx + 2] = isLinear ? cosWave : envelope * deltaM * Math.sin(wavePhase);
    }
  }

  private buildPhotonRibbonGeometry(centerX: number): void {
    const halfWidth = 0.022 * this.atomRadius;
    const centers = this.photonCenters;
    const pos = this.photonPositions;

    this.scratchPacketCenter.set(centerX, 0, 0);
    this.scratchViewDir.copy(this.camera.position).sub(this.scratchPacketCenter);
    if (this.scratchViewDir.lengthSq() < 1e-8) {
      this.scratchViewDir.copy(this.fallbackUp);
    } else {
      this.scratchViewDir.normalize();
    }

    for (let i = 0; i < PHOTON_SAMPLE_COUNT; i++) {
      const prevIdx = Math.max(0, i - 1) * 3;
      const nextIdx = Math.min(PHOTON_SAMPLE_COUNT - 1, i + 1) * 3;
      this.scratchTangent
        .set(
          centers[nextIdx] - centers[prevIdx],
          centers[nextIdx + 1] - centers[prevIdx + 1],
          centers[nextIdx + 2] - centers[prevIdx + 2],
        )
        .normalize();

      this.scratchOffset.crossVectors(this.scratchTangent, this.scratchViewDir);
      if (this.scratchOffset.lengthSq() < 1e-8) {
        this.scratchOffset.crossVectors(this.scratchTangent, this.fallbackUp);
      }
      if (this.scratchOffset.lengthSq() < 1e-8) {
        this.scratchOffset.crossVectors(this.scratchTangent, this.fallbackZ);
      }
      this.scratchOffset.normalize().multiplyScalar(halfWidth);

      const cIdx = i * 3;
      const vIdx = i * 6;
      const cx = centers[cIdx];
      const cy = centers[cIdx + 1];
      const cz = centers[cIdx + 2];
      const ox = this.scratchOffset.x;
      const oy = this.scratchOffset.y;
      const oz = this.scratchOffset.z;

      pos[vIdx] = cx - ox;
      pos[vIdx + 1] = cy - oy;
      pos[vIdx + 2] = cz - oz;
      pos[vIdx + 3] = cx + ox;
      pos[vIdx + 4] = cy + oy;
      pos[vIdx + 5] = cz + oz;
    }
  }

  protected override cleanupScene(): void {
    this.updateToken += 1;
    this.scene.remove(
      this.ambientLight,
      this.keyLight,
      this.fillLight,
      this.raymarchMesh,
      this.sliceMesh,
      this.nucleusMesh,
      this.axisLine,
      this.zBadgeSprite,
      this.dipoleSegmentGuide,
      this.dipoleRingGuide,
      this.dipoleArrow,
      this.dipoleBadgeSprite,
      this.photonMesh,
      this.photonArrowMesh,
      this.photonBadgeSprite,
    );

    this.ambientLight.dispose();
    this.keyLight.dispose();
    this.fillLight.dispose();

    this.raymarchGeometry.dispose();
    this.raymarchMaterial.dispose();
    this.sliceGeometry.dispose();
    this.sliceMaterial.dispose();

    this.nucleusGeometry.dispose();
    this.nucleusMaterial.dispose();

    this.axisGeometry.dispose();
    this.axisMaterial.dispose();
    this.zBadgeTexture.dispose();
    this.zBadgeMaterial.dispose();

    this.dipoleSegmentGeometry.dispose();
    this.dipoleSegmentMaterial.dispose();
    this.dipoleRingGeometry.dispose();
    this.dipoleRingMaterial.dispose();

    this.dipoleArrow.dispose();
    this.dipoleBadgeTexture.dispose();
    this.dipoleBadgeMaterial.dispose();

    this.photonGeometry.dispose();
    this.photonMaterial.dispose();
    this.photonArrowGeometry.dispose();
    this.photonArrowMaterial.dispose();
    this.photonBadgeTexture.dispose();
    this.photonBadgeMaterial.dispose();
  }
}
