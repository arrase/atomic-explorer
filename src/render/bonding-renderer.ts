import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { AtomOrbitalSpec } from '../core/lcao';
import { ColorPalette, PALETTE_CONFIG, computeFrameDistance } from './orbital-point-cloud';
import {
  BaseThreeRenderer,
  RendererTarget,
  createCircleBadgeSprite,
  drawRoundedRect,
} from './render-utils';

export type BondingVisualMode = 'slice' | 'isosurface' | 'volume';

export interface BondingRenderState {
  atomA: AtomOrbitalSpec;
  atomB: AtomOrbitalSpec;
  rBohr: number;
  cA: number;
  cB: number;
  peakRefDensity: number;
  showNodalPlanes: boolean;
  hasTransverseNode: boolean;
  nodalZ: number;
  hasPiPlane: boolean;
  palette: ColorPalette;
  contrast: number;
  visualMode: BondingVisualMode;
  showAtomGuides: boolean;
}

const FRAME_MARGIN = 1.12;
const INITIAL_FRAME_RADIUS = 4.3;
const CLIP_HEADROOM = 1.05;
const RAYMARCH_ABSORPTION = 4.6;
const SLICE_BACK_ABSORPTION = 0.55 * RAYMARCH_ABSORPTION;
const DENSITY_FLOOR = 5e-4;
const ISOSURFACE_RES = 44;
const ISOSURFACE_MAX_POLYS = 100000;
const RING_SEGMENTS = 64;
const DEFAULT_CAMERA_DIR = new THREE.Vector3(-0.68, 0.68, 0.27).normalize();

const sharedMolecularGlsl = `
  uniform int u_nA;
  uniform int u_lA;
  uniform int u_mA;
  uniform float u_zEffA;

  uniform int u_nB;
  uniform int u_lB;
  uniform int u_mB;
  uniform float u_zEffB;

  uniform float u_R;
  uniform float u_cA;
  uniform float u_cB;
  uniform float u_peakDensity;
  uniform float u_densityFloor;
  uniform float u_contrast;
  uniform int u_palette;

  #define PI 3.14159265359

  float evalAtomicPsi(vec3 p, int n, int l, int m, float zeff) {
    float r = length(p);
    float zr = zeff * r;
    float z15 = pow(zeff, 1.5);
    if (n == 1) {
      return (1.0 / sqrt(PI)) * z15 * exp(-zr);
    }
    if (l == 0) {
      return (1.0 / (4.0 * sqrt(2.0 * PI))) * z15 * (2.0 - zr) * exp(-0.5 * zr);
    }
    float axisCoord = p.z;
    if (m == 1) {
      axisCoord = p.x;
    } else if (m == -1) {
      axisCoord = p.y;
    }
    return (1.0 / (4.0 * sqrt(2.0 * PI))) * z15 * zeff * axisCoord * exp(-0.5 * zr);
  }

  float evalMolecularPsi(vec3 pos) {
    vec3 pA = pos - vec3(0.0, 0.0, -0.5 * u_R);
    vec3 pB = pos - vec3(0.0, 0.0,  0.5 * u_R);
    vec3 pBLocal = vec3(pB.x, pB.y, -pB.z);
    return u_cA * evalAtomicPsi(pA, u_nA, u_lA, u_mA, u_zEffA)
         + u_cB * evalAtomicPsi(pBLocal, u_nB, u_lB, u_mB, u_zEffB);
  }

  float evalEnhancedDensity(float psi) {
    float normDensity = clamp((psi * psi) / max(u_peakDensity, 1e-12), 0.0, 1.0);
    float t = clamp(1.0 - log(max(normDensity, 1e-30)) / log(u_densityFloor), 0.0, 1.0);
    float ramped = t * t * (3.0 - 2.0 * t);
    return u_contrast > 0.0
      ? log(1.0 + u_contrast * ramped) / log(1.0 + u_contrast)
      : ramped;
  }

  vec3 getPaletteColor(float psi, float enhancedDensity, int paletteId) {
    float t = clamp(enhancedDensity * 1.1, 0.0, 1.0);
    if (paletteId == 1) {
      if (psi > 0.0) return mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.9, 0.2), t);
      return mix(vec3(0.8, 0.0, 0.2), vec3(0.4, 0.0, 0.6), t);
    } else if (paletteId == 2) {
      if (psi > 0.0) return mix(vec3(0.0, 0.8, 0.5), vec3(0.4, 1.0, 0.7), t);
      return mix(vec3(0.8, 0.8, 0.1), vec3(0.2, 0.5, 0.2), t);
    } else if (paletteId == 3) {
      if (psi > 0.0) return mix(vec3(0.6, 0.1, 1.0), vec3(0.1, 0.8, 1.0), t);
      return mix(vec3(1.0, 0.1, 0.5), vec3(1.0, 0.6, 0.1), t);
    }
    if (psi > 0.0) return mix(vec3(0.1, 0.6, 1.0), vec3(0.0, 0.9, 1.0), t);
    return mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.8, 0.2), t);
  }
`;

const bondingVertexShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vOrigin = cameraPosition;
    vDirection = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const bondingFragmentShader = `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  uniform float u_frameRadius;
  uniform float u_absorption;
  uniform bool u_clipBackHalf;
  uniform vec3 u_boxMin;
  uniform vec3 u_boxMax;

  ${sharedMolecularGlsl}

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
    vec3 boxMax = u_clipBackHalf ? vec3(u_boxMax.x, 0.0, u_boxMax.z) : u_boxMax;
    vec2 tHit = rayBoxIntersection(vOrigin, rayDir, u_boxMin, boxMax);
    if (tHit.x > tHit.y || tHit.y < 0.0) {
      discard;
    }

    float tStart = max(tHit.x, 0.0);
    float dist = tHit.y - tStart;
    float stepSize = dist / 128.0;
    float stepFraction = stepSize / max(u_frameRadius, 0.1);

    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float startOffset = (dither - 0.5) * stepSize * 0.5;
    vec4 accumColor = vec4(0.0);

    for (int i = 0; i < 128; i++) {
      float tCurr = tStart + startOffset + (float(i) + 0.5) * stepSize;
      if (tCurr >= tHit.y) break;

      vec3 pos = vOrigin + rayDir * max(tCurr, tStart);
      float psi = evalMolecularPsi(pos);
      float enhanced = evalEnhancedDensity(psi);

      if (enhanced > 1e-6) {
        vec3 color = getPaletteColor(psi, enhanced, u_palette);
        float alphaSample = 1.0 - exp(-enhanced * stepFraction * u_absorption);
        accumColor.rgb += (1.0 - accumColor.a) * color * alphaSample;
        accumColor.a += (1.0 - accumColor.a) * alphaSample;
        if (accumColor.a >= 0.97) break;
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

  ${sharedMolecularGlsl}

  void main() {
    float psi = evalMolecularPsi(vec3(vWorldPos.x, 0.0, vWorldPos.z));
    float enhanced = evalEnhancedDensity(psi);
    if (enhanced <= 1e-4) {
      discard;
    }

    vec3 baseColor = getPaletteColor(psi, enhanced, u_palette);

    const float CONTOUR_BANDS = 6.0;
    float level = enhanced * CONTOUR_BANDS;
    float distToLine = abs(fract(level - 0.5) - 0.5);
    float fw = max(fwidth(level), 1e-4);
    float contour = 1.0 - smoothstep(0.0, fw * 1.45, distToLine);
    contour *= smoothstep(0.04, 0.14, enhanced) * (1.0 - smoothstep(0.94, 0.995, enhanced));

    vec2 edgeDist = min(vUv, 1.0 - vUv);
    float borderFade = smoothstep(0.0, 0.05, min(edgeDist.x, edgeDist.y));

    vec3 color = mix(baseColor, vec3(0.96, 0.98, 1.0), 0.72 * contour);
    float baseAlpha = smoothstep(0.0, 0.08, enhanced) * (0.28 + 0.58 * enhanced);
    float alpha = clamp(baseAlpha + 0.36 * contour, 0.0, 0.94) * borderFade;
    if (alpha <= 1e-3) {
      discard;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

function evalAtomicPsi(px: number, py: number, pz: number, spec: AtomOrbitalSpec): number {
  const r = Math.hypot(px, py, pz);
  const zr = spec.zEff * r;
  const z15 = Math.pow(spec.zEff, 1.5);
  if (spec.n === 1) {
    return (1.0 / Math.sqrt(Math.PI)) * z15 * Math.exp(-zr);
  }
  if (spec.l === 0) {
    return (1.0 / (4.0 * Math.sqrt(2.0 * Math.PI))) * z15 * (2.0 - zr) * Math.exp(-0.5 * zr);
  }
  let axisCoord = pz;
  if (spec.m === 1) {
    axisCoord = px;
  } else if (spec.m === -1) {
    axisCoord = py;
  }
  return (1.0 / (4.0 * Math.sqrt(2.0 * Math.PI))) * z15 * spec.zEff * axisCoord * Math.exp(-0.5 * zr);
}

function evalMolecularPsi(x: number, y: number, z: number, state: BondingRenderState): number {
  const halfR = 0.5 * state.rBohr;
  const psiA = evalAtomicPsi(x, y, z + halfR, state.atomA);
  const psiB = evalAtomicPsi(x, y, -(z - halfR), state.atomB);
  return state.cA * psiA + state.cB * psiB;
}

function createCircleLoopGeometry(plane: 'xz' | 'xy'): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const theta = (i / RING_SEGMENTS) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    points.push(plane === 'xz' ? new THREE.Vector3(c, 0, s) : new THREE.Vector3(c, s, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createDistanceBadge(): {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

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

export class BondingRenderer extends BaseThreeRenderer {
  private readonly defaultCameraDir = DEFAULT_CAMERA_DIR;

  private readonly ambientLight: THREE.AmbientLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.DirectionalLight;

  private readonly volumeGeometry: THREE.BoxGeometry;
  private readonly volumeMaterial: THREE.ShaderMaterial;
  private readonly volumeMesh: THREE.Mesh;

  private readonly sliceGeometry: THREE.PlaneGeometry;
  private readonly sliceMaterial: THREE.ShaderMaterial;
  private readonly sliceMesh: THREE.Mesh;

  private readonly isoMaterialPos: THREE.MeshPhysicalMaterial;
  private readonly isoMaterialNeg: THREE.MeshPhysicalMaterial;
  private readonly mcPos: MarchingCubes;
  private readonly mcNeg: MarchingCubes;
  private readonly isosurfaceGroup: THREE.Group;

  private readonly nucleusGeometry: THREE.SphereGeometry;
  private readonly nucleusAMaterial: THREE.MeshStandardMaterial;
  private readonly nucleusBMaterial: THREE.MeshStandardMaterial;
  private readonly nucleusAMesh: THREE.Mesh;
  private readonly nucleusBMesh: THREE.Mesh;

  private readonly labelATexture: THREE.CanvasTexture;
  private readonly labelAMaterial: THREE.SpriteMaterial;
  private readonly labelASprite: THREE.Sprite;
  private readonly labelBTexture: THREE.CanvasTexture;
  private readonly labelBMaterial: THREE.SpriteMaterial;
  private readonly labelBSprite: THREE.Sprite;

  private readonly distanceCanvas: HTMLCanvasElement;
  private readonly distanceCtx: CanvasRenderingContext2D;
  private readonly distanceTexture: THREE.CanvasTexture;
  private readonly distanceMaterial: THREE.SpriteMaterial;
  private readonly distanceSprite: THREE.Sprite;
  private lastDistanceText = '';

  private readonly axisGeometry: THREE.BufferGeometry;
  private readonly axisMaterial: THREE.LineDashedMaterial;
  private readonly axisLine: THREE.Line;

  private readonly segmentGeometry: THREE.BufferGeometry;
  private readonly segmentMaterial: THREE.LineBasicMaterial;
  private readonly segmentLine: THREE.Line;

  private readonly guideCircleGeometry: THREE.BufferGeometry;
  private readonly guideMaterial: THREE.LineDashedMaterial;
  private readonly guideRingA: THREE.Line;
  private readonly guideRingB: THREE.Line;

  private readonly transversePlaneGeometry: THREE.CircleGeometry;
  private readonly transversePlaneMaterial: THREE.MeshBasicMaterial;
  private readonly transversePlaneMesh: THREE.Mesh;
  private readonly transverseRimGeometry: THREE.BufferGeometry;
  private readonly transverseRimMaterial: THREE.LineDashedMaterial;
  private readonly transverseRimLine: THREE.Line;

  private readonly piPlaneGeometry: THREE.PlaneGeometry;
  private readonly piPlaneMaterial: THREE.MeshBasicMaterial;
  private readonly piPlaneMesh: THREE.Mesh;
  private readonly piRimGeometry: THREE.BufferGeometry;
  private readonly piRimMaterial: THREE.LineDashedMaterial;
  private readonly piRimLine: THREE.Line;

  private framingRadius = INITIAL_FRAME_RADIUS;
  protected override clipReach = INITIAL_FRAME_RADIUS * 2.0;
  private hasFramedOnce = false;

  constructor(target: RendererTarget) {
    super(target, DEFAULT_CAMERA_DIR.clone().multiplyScalar(16.0));
    this.autoRotateSpeed = 1.4;

    const lights = this.setupLighting();
    this.ambientLight = lights.ambientLight;
    this.keyLight = lights.keyLight;
    this.fillLight = lights.fillLight;

    this.volumeGeometry = new THREE.BoxGeometry(2, 2, 2);
    this.volumeMaterial = new THREE.ShaderMaterial({
      vertexShader: bondingVertexShader,
      fragmentShader: bondingFragmentShader,
      uniforms: {
        ...this.createSharedUniforms(),
        u_frameRadius: { value: 6.2 },
        u_absorption: { value: RAYMARCH_ABSORPTION },
        u_clipBackHalf: { value: false },
        u_boxMin: { value: new THREE.Vector3(-6.2, -6.2, -6.9) },
        u_boxMax: { value: new THREE.Vector3(6.2, 6.2, 6.9) },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.volumeMesh = new THREE.Mesh(this.volumeGeometry, this.volumeMaterial);
    this.volumeMesh.renderOrder = 1;
    this.volumeMesh.frustumCulled = false;
    this.scene.add(this.volumeMesh);

    this.sliceGeometry = new THREE.PlaneGeometry(2, 2);
    this.sliceGeometry.rotateX(-Math.PI / 2);
    this.sliceMaterial = new THREE.ShaderMaterial({
      vertexShader: sliceVertexShader,
      fragmentShader: sliceFragmentShader,
      uniforms: this.createSharedUniforms(),
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.sliceMesh = new THREE.Mesh(this.sliceGeometry, this.sliceMaterial);
    this.sliceMesh.renderOrder = 2;
    this.sliceMesh.frustumCulled = false;
    this.scene.add(this.sliceMesh);

    this.isoMaterialPos = new THREE.MeshPhysicalMaterial({
      color: PALETTE_CONFIG.default.posColor,
      roughness: 0.18,
      metalness: 0.15,
      clearcoat: 0.3,
      opacity: 0.88,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.isoMaterialNeg = new THREE.MeshPhysicalMaterial({
      color: PALETTE_CONFIG.default.negColor,
      roughness: 0.18,
      metalness: 0.15,
      clearcoat: 0.3,
      opacity: 0.88,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mcPos = new MarchingCubes(ISOSURFACE_RES, this.isoMaterialPos, false, false, ISOSURFACE_MAX_POLYS);
    this.mcNeg = new MarchingCubes(ISOSURFACE_RES, this.isoMaterialNeg, false, false, ISOSURFACE_MAX_POLYS);
    this.mcPos.frustumCulled = false;
    this.mcNeg.frustumCulled = false;
    this.isosurfaceGroup = new THREE.Group();
    this.isosurfaceGroup.add(this.mcPos, this.mcNeg);
    this.isosurfaceGroup.visible = false;
    this.scene.add(this.isosurfaceGroup);

    this.nucleusGeometry = new THREE.SphereGeometry(1, 24, 16);
    this.nucleusAMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8f1ff,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.28,
      roughness: 0.22,
      metalness: 0.35,
      depthTest: false,
      depthWrite: false,
    });
    this.nucleusBMaterial = new THREE.MeshStandardMaterial({
      color: 0xfef3e8,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.35,
      depthTest: false,
      depthWrite: false,
    });
    this.nucleusAMesh = new THREE.Mesh(this.nucleusGeometry, this.nucleusAMaterial);
    this.nucleusBMesh = new THREE.Mesh(this.nucleusGeometry, this.nucleusBMaterial);
    this.nucleusAMesh.renderOrder = 10;
    this.nucleusBMesh.renderOrder = 10;
    this.scene.add(this.nucleusAMesh, this.nucleusBMesh);

    const badgeA = createCircleBadgeSprite('A', '#60a5fa');
    this.labelATexture = badgeA.texture;
    this.labelAMaterial = badgeA.material;
    this.labelASprite = badgeA.sprite;

    const badgeB = createCircleBadgeSprite('B', '#fbbf24');
    this.labelBTexture = badgeB.texture;
    this.labelBMaterial = badgeB.material;
    this.labelBSprite = badgeB.sprite;

    const distBadge = createDistanceBadge();
    this.distanceCanvas = distBadge.canvas;
    this.distanceCtx = distBadge.ctx;
    this.distanceTexture = distBadge.texture;
    this.distanceMaterial = distBadge.material;
    this.distanceSprite = distBadge.sprite;
    this.scene.add(this.labelASprite, this.labelBSprite, this.distanceSprite);

    this.axisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -5),
      new THREE.Vector3(0, 0, 5),
    ]);
    this.axisMaterial = new THREE.LineDashedMaterial({
      color: 0x94a3b8,
      dashSize: 0.22,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.48,
      depthTest: false,
      depthWrite: false,
    });
    this.axisLine = new THREE.Line(this.axisGeometry, this.axisMaterial);
    this.axisLine.renderOrder = 7;
    this.axisLine.frustumCulled = false;

    this.segmentGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -0.7),
      new THREE.Vector3(0, 0, 0.7),
    ]);
    this.segmentMaterial = new THREE.LineBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
    });
    this.segmentLine = new THREE.Line(this.segmentGeometry, this.segmentMaterial);
    this.segmentLine.renderOrder = 8;
    this.segmentLine.frustumCulled = false;
    this.scene.add(this.axisLine, this.segmentLine);

    this.guideCircleGeometry = createCircleLoopGeometry('xz');
    this.guideMaterial = new THREE.LineDashedMaterial({
      color: 0xcbd5e1,
      dashSize: 0.14,
      gapSize: 0.09,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
    });
    this.guideRingA = new THREE.Line(this.guideCircleGeometry, this.guideMaterial);
    this.guideRingB = new THREE.Line(this.guideCircleGeometry, this.guideMaterial);
    this.guideRingA.computeLineDistances();
    this.guideRingB.computeLineDistances();
    this.guideRingA.renderOrder = 6;
    this.guideRingB.renderOrder = 6;
    this.scene.add(this.guideRingA, this.guideRingB);

    this.transversePlaneGeometry = new THREE.CircleGeometry(1, RING_SEGMENTS);
    this.transversePlaneMaterial = new THREE.MeshBasicMaterial({
      color: 0xfb7185,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.transversePlaneMesh = new THREE.Mesh(this.transversePlaneGeometry, this.transversePlaneMaterial);
    this.transversePlaneMesh.renderOrder = 6;

    this.transverseRimGeometry = createCircleLoopGeometry('xy');
    this.transverseRimMaterial = new THREE.LineDashedMaterial({
      color: 0xfecdd3,
      dashSize: 0.14,
      gapSize: 0.09,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.transverseRimLine = new THREE.Line(this.transverseRimGeometry, this.transverseRimMaterial);
    this.transverseRimLine.computeLineDistances();
    this.transverseRimLine.renderOrder = 6;
    this.scene.add(this.transversePlaneMesh, this.transverseRimLine);

    this.piPlaneGeometry = new THREE.PlaneGeometry(2, 2);
    this.piPlaneGeometry.rotateY(Math.PI / 2);
    this.piPlaneMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.piPlaneMesh = new THREE.Mesh(this.piPlaneGeometry, this.piPlaneMaterial);
    this.piPlaneMesh.renderOrder = 6;

    this.piRimGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -1, -1),
      new THREE.Vector3(0, 1, -1),
      new THREE.Vector3(0, 1, 1),
      new THREE.Vector3(0, -1, 1),
      new THREE.Vector3(0, -1, -1),
    ]);
    this.piRimMaterial = new THREE.LineDashedMaterial({
      color: 0xa5f3fc,
      dashSize: 0.14,
      gapSize: 0.09,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.piRimLine = new THREE.Line(this.piRimGeometry, this.piRimMaterial);
    this.piRimLine.computeLineDistances();
    this.piRimLine.renderOrder = 6;
    this.scene.add(this.piPlaneMesh, this.piRimLine);

    this.applyFraming(INITIAL_FRAME_RADIUS, false);
    this.resetCameraInstant();
    this.stop();
  }

  private setupLighting(): {
    ambientLight: THREE.AmbientLight;
    keyLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
  } {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(12, 20, 14);
    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.7);
    fillLight.position.set(-14, -10, -12);
    this.scene.add(ambientLight, keyLight, fillLight);
    return { ambientLight, keyLight, fillLight };
  }

  private createSharedUniforms(): Record<string, THREE.IUniform> {
    return {
      u_nA: { value: 1 },
      u_lA: { value: 0 },
      u_mA: { value: 0 },
      u_zEffA: { value: 1.0 },
      u_nB: { value: 1 },
      u_lB: { value: 0 },
      u_mB: { value: 0 },
      u_zEffB: { value: 1.0 },
      u_R: { value: 1.4 },
      u_cA: { value: 0.54 },
      u_cB: { value: 0.54 },
      u_peakDensity: { value: 0.35 },
      u_densityFloor: { value: DENSITY_FLOOR },
      u_contrast: { value: 0.0 },
      u_palette: { value: 0 },
    };
  }

  private syncMolecularUniforms(uniforms: Record<string, THREE.IUniform>, state: BondingRenderState): void {
    uniforms.u_nA.value = state.atomA.n;
    uniforms.u_lA.value = state.atomA.l;
    uniforms.u_mA.value = state.atomA.m;
    uniforms.u_zEffA.value = state.atomA.zEff;
    uniforms.u_nB.value = state.atomB.n;
    uniforms.u_lB.value = state.atomB.l;
    uniforms.u_mB.value = state.atomB.m;
    uniforms.u_zEffB.value = state.atomB.zEff;
    uniforms.u_R.value = state.rBohr;
    uniforms.u_cA.value = state.cA;
    uniforms.u_cB.value = state.cB;
    uniforms.u_peakDensity.value = state.peakRefDensity;
    uniforms.u_contrast.value = state.contrast;
    uniforms.u_palette.value = PALETTE_CONFIG[state.palette].id;
  }

  private updateDistanceBadge(rBohr: number): void {
    const text = `R = ${rBohr.toFixed(2)} a₀`;
    if (text === this.lastDistanceText) return;
    this.lastDistanceText = text;

    const { width, height } = this.distanceCanvas;
    const ctx = this.distanceCtx;
    ctx.clearRect(0, 0, width, height);

    drawRoundedRect(ctx, 4, 6, width - 8, height - 12, 24);
    ctx.fillStyle = 'rgba(10, 15, 28, 0.86)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2 + 1);
    this.distanceTexture.needsUpdate = true;
  }

  private updateIsosurfaces(state: BondingRenderState, halfXY: number, halfZ: number): void {
    const palette = PALETTE_CONFIG[state.palette];
    this.isoMaterialPos.color.setHex(palette.posColor);
    this.isoMaterialNeg.color.setHex(palette.negColor);
    this.isosurfaceGroup.scale.set(halfXY, halfXY, halfZ);

    const size = ISOSURFACE_RES;
    const halfSize = size / 2.0;
    const size2 = size * size;
    const normInv = 1.0 / Math.sqrt(Math.max(state.peakRefDensity, 1e-12));
    const isolation = Math.max(0.05, 0.26 - 0.14 * (state.contrast / 100));

    this.mcPos.reset();
    this.mcNeg.reset();
    this.mcPos.isolation = isolation;
    this.mcNeg.isolation = isolation;

    const posField = this.mcPos.field;
    const negField = this.mcNeg.field;

    for (let iz = 0; iz < size; iz++) {
      const z = ((iz - halfSize) / halfSize) * halfZ;
      const zOffset = iz * size2;
      for (let iy = 0; iy < size; iy++) {
        const y = ((iy - halfSize) / halfSize) * halfXY;
        const yOffset = zOffset + iy * size;
        for (let ix = 0; ix < size; ix++) {
          const x = ((ix - halfSize) / halfSize) * halfXY;
          const normPsi = evalMolecularPsi(x, y, z, state) * normInv;
          const idx = yOffset + ix;
          posField[idx] = normPsi;
          negField[idx] = -normPsi;
        }
      }
    }

    this.mcPos.update();
    this.mcNeg.update();
  }

  protected override onViewportChanged(): void {
    this.applyFraming(this.framingRadius, false);
  }

  private applyFraming(radius: number, reframeCamera: boolean): void {
    this.framingRadius = radius;
    const distance = computeFrameDistance(radius, this.camera.fov, this.camera.aspect, FRAME_MARGIN);
    this.defaultCameraPos.copy(this.defaultTarget).addScaledVector(this.defaultCameraDir, distance);
    this.updateClipping();

    if (!reframeCamera) return;
    if (!this.hasFramedOnce || !this.isAnimating) {
      this.hasFramedOnce = true;
      this.resetCameraInstant();
      return;
    }
    this.animateCameraTo(this.defaultCameraPos.clone(), new THREE.Vector3(0, 1, 0), this.defaultTarget.clone(), 380);
  }

  public updateState(state: BondingRenderState, reframeCamera: boolean): void {
    const extentA = (3.2 * state.atomA.n * state.atomA.n + 3.0) / state.atomA.zEff;
    const extentB = (3.2 * state.atomB.n * state.atomB.n + 3.0) / state.atomB.zEff;
    const atomicExtent = Math.max(extentA, extentB);
    const halfXY = atomicExtent;
    const halfZ = 0.5 * state.rBohr + atomicExtent;

    const effectiveRadiusA = (2.1 * state.atomA.n * state.atomA.n + 1.0) / state.atomA.zEff;
    const effectiveRadiusB = (2.1 * state.atomB.n * state.atomB.n + 1.0) / state.atomB.zEff;
    const effectiveCloudRadius = Math.max(effectiveRadiusA, effectiveRadiusB);
    const framingRadius = Math.max(
      3.2,
      Math.hypot(effectiveCloudRadius, 0.5 * state.rBohr + effectiveCloudRadius * 0.72),
    );

    this.clipReach = Math.hypot(halfXY, halfXY, halfZ) * CLIP_HEADROOM;

    const isSlice = state.visualMode === 'slice';
    const isIsosurface = state.visualMode === 'isosurface';

    this.volumeMesh.visible = !isIsosurface;
    this.sliceMesh.visible = isSlice;
    this.isosurfaceGroup.visible = isIsosurface;

    if (!isIsosurface) {
      this.volumeMesh.scale.set(halfXY, halfXY, halfZ);
      this.syncMolecularUniforms(this.volumeMaterial.uniforms, state);
      this.volumeMaterial.uniforms.u_frameRadius.value = atomicExtent;
      this.volumeMaterial.uniforms.u_absorption.value = isSlice ? SLICE_BACK_ABSORPTION : RAYMARCH_ABSORPTION;
      this.volumeMaterial.uniforms.u_clipBackHalf.value = isSlice;
      (this.volumeMaterial.uniforms.u_boxMin.value as THREE.Vector3).set(-halfXY, -halfXY, -halfZ);
      (this.volumeMaterial.uniforms.u_boxMax.value as THREE.Vector3).set(halfXY, halfXY, halfZ);
    }

    if (isSlice) {
      this.sliceMesh.scale.set(halfXY, 1, halfZ);
      this.syncMolecularUniforms(this.sliceMaterial.uniforms, state);
    }

    if (isIsosurface) {
      this.updateIsosurfaces(state, halfXY, halfZ);
    }

    const halfR = 0.5 * state.rBohr;
    const nucRadiusA = Math.max(0.14, Math.min(0.24, 0.18 / Math.sqrt(state.atomA.zEff)));
    const nucRadiusB = Math.max(0.14, Math.min(0.24, 0.18 / Math.sqrt(state.atomB.zEff)));
    this.nucleusAMesh.position.set(0, 0, -halfR);
    this.nucleusAMesh.scale.setScalar(nucRadiusA);
    this.nucleusBMesh.position.set(0, 0, halfR);
    this.nucleusBMesh.scale.setScalar(nucRadiusB);

    const badgeScale = framingRadius * 0.095;
    const labelOffset = framingRadius * 0.085;
    this.labelASprite.position.set(0, nucRadiusA + labelOffset, -halfR);
    this.labelASprite.scale.set(badgeScale, badgeScale, 1);
    this.labelBSprite.position.set(0, nucRadiusB + labelOffset, halfR);
    this.labelBSprite.scale.set(badgeScale, badgeScale, 1);

    this.updateDistanceBadge(state.rBohr);
    this.distanceSprite.position.set(0, -labelOffset * 1.15, 0);
    this.distanceSprite.scale.set(framingRadius * 0.28, framingRadius * 0.07, 1);

    const axisExtent = halfZ * 0.95;
    const axisPos = this.axisGeometry.getAttribute('position') as THREE.BufferAttribute;
    axisPos.setXYZ(0, 0, 0, -axisExtent);
    axisPos.setXYZ(1, 0, 0, axisExtent);
    axisPos.needsUpdate = true;
    this.axisMaterial.dashSize = framingRadius * 0.045;
    this.axisMaterial.gapSize = framingRadius * 0.03;
    this.axisLine.computeLineDistances();

    const segPos = this.segmentGeometry.getAttribute('position') as THREE.BufferAttribute;
    segPos.setXYZ(0, 0, 0, -halfR);
    segPos.setXYZ(1, 0, 0, halfR);
    segPos.needsUpdate = true;

    const guideRadiusA = (1.9 * state.atomA.n * state.atomA.n) / state.atomA.zEff;
    const guideRadiusB = (1.9 * state.atomB.n * state.atomB.n) / state.atomB.zEff;
    this.guideRingA.visible = state.showAtomGuides;
    this.guideRingB.visible = state.showAtomGuides;
    this.guideRingA.position.set(0, 0, -halfR);
    this.guideRingA.scale.set(guideRadiusA, 1, guideRadiusA);
    this.guideRingB.position.set(0, 0, halfR);
    this.guideRingB.scale.set(guideRadiusB, 1, guideRadiusB);

    const showTransverse = state.showNodalPlanes && state.hasTransverseNode;
    const planeRadius = effectiveCloudRadius * 1.1;
    this.transversePlaneMesh.visible = showTransverse;
    this.transverseRimLine.visible = showTransverse;
    if (showTransverse) {
      this.transversePlaneMesh.position.set(0, 0, state.nodalZ);
      this.transversePlaneMesh.scale.set(planeRadius, planeRadius, 1);
      this.transverseRimLine.position.set(0, 0, state.nodalZ);
      this.transverseRimLine.scale.set(planeRadius, planeRadius, 1);
    }

    const showPi = state.showNodalPlanes && state.hasPiPlane;
    const piHalfZ = halfR + planeRadius;
    this.piPlaneMesh.visible = showPi;
    this.piRimLine.visible = showPi;
    if (showPi) {
      this.piPlaneMesh.scale.set(1, planeRadius, piHalfZ);
      this.piRimLine.scale.set(1, planeRadius, piHalfZ);
    }

    this.applyFraming(framingRadius, reframeCamera);
  }

  protected override cleanupScene(): void {
    this.scene.remove(
      this.ambientLight,
      this.keyLight,
      this.fillLight,
      this.volumeMesh,
      this.sliceMesh,
      this.isosurfaceGroup,
      this.nucleusAMesh,
      this.nucleusBMesh,
      this.labelASprite,
      this.labelBSprite,
      this.distanceSprite,
      this.axisLine,
      this.segmentLine,
      this.guideRingA,
      this.guideRingB,
      this.transversePlaneMesh,
      this.transverseRimLine,
      this.piPlaneMesh,
      this.piRimLine,
    );

    this.ambientLight.dispose();
    this.keyLight.dispose();
    this.fillLight.dispose();

    this.volumeGeometry.dispose();
    this.volumeMaterial.dispose();
    this.sliceGeometry.dispose();
    this.sliceMaterial.dispose();

    this.mcPos.geometry.dispose();
    this.mcNeg.geometry.dispose();
    this.isoMaterialPos.dispose();
    this.isoMaterialNeg.dispose();

    this.nucleusGeometry.dispose();
    this.nucleusAMaterial.dispose();
    this.nucleusBMaterial.dispose();

    this.labelATexture.dispose();
    this.labelAMaterial.dispose();
    this.labelBTexture.dispose();
    this.labelBMaterial.dispose();
    this.distanceTexture.dispose();
    this.distanceMaterial.dispose();

    this.axisGeometry.dispose();
    this.axisMaterial.dispose();
    this.segmentGeometry.dispose();
    this.segmentMaterial.dispose();
    this.guideCircleGeometry.dispose();
    this.guideMaterial.dispose();

    this.transversePlaneGeometry.dispose();
    this.transversePlaneMaterial.dispose();
    this.transverseRimGeometry.dispose();
    this.transverseRimMaterial.dispose();
    this.piPlaneGeometry.dispose();
    this.piPlaneMaterial.dispose();
    this.piRimGeometry.dispose();
    this.piRimMaterial.dispose();
  }
}
