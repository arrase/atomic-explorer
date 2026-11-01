import * as THREE from 'three';
import {
  ALPHA_Z,
  AtomicEraId,
  COULOMB_E2_MEV_FM,
  computeRutherfordTrajectory,
  computeThomsonElectronPositions,
  DeBroglieWaveState,
  evaluateRutherfordPoint,
  getDeBroglieWaveState,
  GOLD_Z,
  RutherfordTrajectory,
  sampleDeBroglieWavePoints,
  sampleRutherfordImpact,
  Vec3Tuple,
} from '../core/atomic-history-physics';
import { resolveOrbitalGeometry, sampleOrbitalPoints } from '../core/wasm-bridge';
import {
  computeFrameDistance,
  createPointCloud,
  updatePointSizing,
} from './orbital-point-cloud';
import { BaseThreeRenderer, RendererTarget } from './render-utils';

export interface RutherfordStats {
  total: number;
  deflected: number;
  backscattered: number;
}

export type SchrodingerPresetId = '1s' | '2p' | '3d';

interface SchrodingerPresetSpec {
  readonly id: SchrodingerPresetId;
  readonly n: number;
  readonly l: number;
  readonly m: number;
}

interface AlphaParticleSlot {
  active: boolean;
  counted: boolean;
  progress: number;
  traj: RutherfordTrajectory | null;
  readonly head: THREE.Mesh;
  readonly headMat: THREE.MeshBasicMaterial;
  readonly trail: THREE.Line;
  readonly trailMat: THREE.LineBasicMaterial;
  readonly trailPositions: Float32Array;
  readonly trailAttr: THREE.BufferAttribute;
}

const SCHRODINGER_PRESETS: Record<SchrodingerPresetId, SchrodingerPresetSpec> = {
  '1s': { id: '1s', n: 1, l: 0, m: 0 },
  '2p': { id: '2p', n: 2, l: 1, m: 0 },
  '3d': { id: '3d', n: 3, l: 2, m: 1 },
};

const ORIGIN = new THREE.Vector3(0, 0, 0);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const SCHRODINGER_VIEW_DIR = new THREE.Vector3(0.52, 0.36, 1).normalize();

const ALPHA_POOL_SIZE = 36;
const ALPHA_TRAIL_VERTICES = 32;
const ALPHA_STREAM_RATE = 14;
const ALPHA_TRAIL_SPAN = 0.26;

const BOHR_SEGMENTS_PER_REV = 144;
const BOHR_MAX_STEPS = 4 * BOHR_SEGMENTS_PER_REV;
const BOHR_RADIAL_SEGMENTS = 6;
const BOHR_TUBE_RADIUS = 0.068;

const RADIAL_COS = Float32Array.from({ length: BOHR_RADIAL_SEGMENTS }, (_, j) =>
  Math.cos((j / BOHR_RADIAL_SEGMENTS) * Math.PI * 2),
);
const RADIAL_SIN = Float32Array.from({ length: BOHR_RADIAL_SEGMENTS }, (_, j) =>
  Math.sin((j / BOHR_RADIAL_SEGMENTS) * Math.PI * 2),
);

function createLabelSprite(
  text: string,
  textColor: string,
  bgColor: string,
  scale: number,
  depthTest = false,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();

  ctx.font = '700 56px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.fillText(text, 64, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function createDashedXzRing(
  radius: number,
  y: number,
  color: number,
  opacity: number,
  segments = 128,
): THREE.Line {
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    positions[i * 3] = radius * Math.cos(theta);
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = radius * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize: 0.22,
    gapSize: 0.16,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  return line;
}

function classifyAlphaColor(scatteringAngleDeg: number): number {
  if (scatteringAngleDeg > 90) return 0xf87171;
  if (scatteringAngleDeg > 15) return 0xfbbf24;
  return 0x7dd3fc;
}

function createBohrTubeGeometry(): {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  normals: Float32Array;
} {
  const vertexCount = (BOHR_MAX_STEPS + 1) * BOHR_RADIAL_SEGMENTS;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(BOHR_MAX_STEPS * BOHR_RADIAL_SEGMENTS * 6);

  let ptr = 0;
  for (let i = 0; i < BOHR_MAX_STEPS; i += 1) {
    const ringA = i * BOHR_RADIAL_SEGMENTS;
    const ringB = (i + 1) * BOHR_RADIAL_SEGMENTS;
    for (let j = 0; j < BOHR_RADIAL_SEGMENTS; j += 1) {
      const jNext = (j + 1) % BOHR_RADIAL_SEGMENTS;
      const a0 = ringA + j;
      const a1 = ringA + jNext;
      const b0 = ringB + j;
      const b1 = ringB + jNext;
      indices[ptr] = a0;
      indices[ptr + 1] = b0;
      indices[ptr + 2] = a1;
      indices[ptr + 3] = a1;
      indices[ptr + 4] = b0;
      indices[ptr + 5] = b1;
      ptr += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  normAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', normAttr);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return { geometry, positions, normals };
}

function writeBohrTubeVertices(
  points: readonly Vec3Tuple[],
  isClosed: boolean,
  positions: Float32Array,
  normals: Float32Array,
): number {
  const stepCount = points.length - 1;
  for (let i = 0; i <= stepCount; i += 1) {
    const prevIdx = isClosed ? (i - 1 + stepCount) % stepCount : Math.max(0, i - 1);
    const nextIdx = isClosed ? (i + 1) % stepCount : Math.min(stepCount, i + 1);
    const prev = points[prevIdx];
    const next = points[nextIdx];
    const curr = points[i];

    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const invTLen = 1 / Math.max(Math.hypot(dx, dy, dz), 1e-6);
    const tx = dx * invTLen;
    const ty = dy * invTLen;
    const tz = dz * invTLen;

    // B = normalize(T x UP) where UP = (0, 1, 0) => (-tz, 0, tx)
    const invBLen = 1 / Math.max(Math.hypot(tz, tx), 1e-6);
    const bx = -tz * invBLen;
    const bz = tx * invBLen;

    // N = B x T
    const nxAxis = -bz * ty;
    const nyAxis = bz * tx - bx * tz;
    const nzAxis = bx * ty;

    const ringOffset = i * BOHR_RADIAL_SEGMENTS * 3;
    for (let j = 0; j < BOHR_RADIAL_SEGMENTS; j += 1) {
      const c = RADIAL_COS[j];
      const s = RADIAL_SIN[j];
      const nx = c * bx + s * nxAxis;
      const ny = s * nyAxis;
      const nz = c * bz + s * nzAxis;
      const vIdx = ringOffset + j * 3;
      normals[vIdx] = nx;
      normals[vIdx + 1] = ny;
      normals[vIdx + 2] = nz;
      positions[vIdx] = curr.x + BOHR_TUBE_RADIUS * nx;
      positions[vIdx + 1] = curr.y + BOHR_TUBE_RADIUS * ny;
      positions[vIdx + 2] = curr.z + BOHR_TUBE_RADIUS * nz;
    }
  }
  return stepCount;
}

function collectObjectResources(
  obj: THREE.Object3D,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
): void {
  if ('geometry' in obj && obj.geometry instanceof THREE.BufferGeometry) {
    geometries.add(obj.geometry);
  }
  if (!('material' in obj) || !obj.material) return;
  if (Array.isArray(obj.material)) {
    for (const mat of obj.material) materials.add(mat);
  } else if (obj.material instanceof THREE.Material) {
    materials.add(obj.material);
  }
}

function disposeMaterial(mat: THREE.Material): void {
  if ('map' in mat && mat.map instanceof THREE.Texture) {
    mat.map.dispose();
  }
  mat.dispose();
}

export class HistoryRenderer extends BaseThreeRenderer {
  public onRutherfordStats?: (stats: RutherfordStats) => void;
  public onScaleChange?: (scaleText: string) => void;

  private readonly eraGroup = new THREE.Group();
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly drawingBufferSize = new THREE.Vector2();

  private currentEra: AtomicEraId = 'dalton';
  private elapsedSec = 0;
  private lastFrameMs = performance.now();

  // Era 1: Dalton
  private daltonAssembly: THREE.Group | null = null;

  // Era 2: Thomson
  private thomsonAmplitude = 0.5;
  private thomsonElectrons: THREE.Mesh[] = [];

  // Era 3: Rutherford
  private rutherfordEnergyMeV = 5.0;
  private rutherfordSpreadFm = 800;
  private rutherfordStreaming = true;
  private rutherfordSpawnAcc = 0;
  private particleCounter = 0;
  private rutherfordStats: RutherfordStats = { total: 0, deflected: 0, backscattered: 0 };
  private alphaPool: AlphaParticleSlot[] = [];

  // Era 4: Bohr & De Broglie
  private bohrNWave = 3.0;
  private bohrTubeGeometry: THREE.BufferGeometry | null = null;
  private bohrTubeMaterial: THREE.MeshStandardMaterial | null = null;
  private bohrTubePositions: Float32Array | null = null;
  private bohrTubeNormals: Float32Array | null = null;
  private bohrGapMarker: THREE.Mesh | null = null;

  // Era 5: Schrödinger & Born
  private schrodingerPreset: SchrodingerPresetId = '2p';
  private schrodingerToken = 0;
  private schrodingerMaterial: THREE.ShaderMaterial | null = null;
  private schrodingerPointCount = 0;
  private schrodingerFrameRadius = 0;
  private schrodingerFrameDist = 10;

  constructor(target: RendererTarget) {
    super(target, new THREE.Vector3(0, 2.8, 10.5));
    this.setupLighting();
    this.scene.add(this.eraGroup);
    this.rebuildEraScene(true);
    this.stop();
  }

  private setupLighting(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(8, 12, 10);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.55);
    fillLight.position.set(-8, -6, -8);
    this.scene.add(fillLight);
  }

  public override start(): void {
    this.lastFrameMs = performance.now();
    super.start();
  }

  public setEra(era: AtomicEraId): void {
    if (era === this.currentEra) return;
    this.currentEra = era;
    this.rebuildEraScene(false);
    this.notifyScaleChange();
  }

  public getEra(): AtomicEraId {
    return this.currentEra;
  }

  public getScaleText(): string {
    switch (this.currentEra) {
      case 'dalton':
        return 'Dalton (1803) · 2 H : 1 O';
      case 'thomson':
        return 'Thomson (1904) · R ≈ 10⁻¹⁰ m';
      case 'rutherford':
        return `Au (Z=79) · d₀ = ${(455.03 / this.rutherfordEnergyMeV).toFixed(0)} fm`;
      case 'bohr':
        return `Bohr–De Broglie · 2πr = ${this.bohrNWave.toFixed(2)} λ`;
      case 'schrodinger':
        return `Schrödinger (1926) · H ${this.schrodingerPreset} |Ψ|²`;
    }
  }

  public setThomsonOscillation(amplitude: number): void {
    this.thomsonAmplitude = THREE.MathUtils.clamp(amplitude, 0, 1);
    if (this.currentEra === 'thomson') {
      this.updateThomsonFrame();
    }
  }

  public setRutherfordParams(energyMeV: number, spreadFm: number): void {
    this.rutherfordEnergyMeV = energyMeV;
    this.rutherfordSpreadFm = spreadFm;
    if (this.currentEra === 'rutherford') {
      this.notifyScaleChange();
    }
  }

  public setRutherfordStreaming(enabled: boolean): void {
    this.rutherfordStreaming = enabled;
  }

  public isRutherfordStreaming(): boolean {
    return this.rutherfordStreaming;
  }

  public fireRutherfordBurst(count = 12): void {
    if (this.currentEra !== 'rutherford' || this.alphaPool.length === 0) return;
    const semiMajorFm = (ALPHA_Z * GOLD_Z * COULOMB_E2_MEV_FM) / this.rutherfordEnergyMeV;

    for (let i = 0; i < count; i += 1) {
      this.particleCounter += 1;
      const sample =
        i === 0
          ? {
              impactParamFm: 0.45 * semiMajorFm,
              azimuthRad: (this.particleCounter * 1.9) % (Math.PI * 2),
            }
          : sampleRutherfordImpact(this.particleCounter, this.rutherfordSpreadFm);
      this.spawnAlphaParticle(sample.impactParamFm, sample.azimuthRad, -i * 0.024);
    }
  }

  public resetRutherfordStats(): void {
    this.rutherfordStats = { total: 0, deflected: 0, backscattered: 0 };
    this.onRutherfordStats?.({ ...this.rutherfordStats });
  }

  public getRutherfordStats(): RutherfordStats {
    return { ...this.rutherfordStats };
  }

  public setBohrWaveNumber(nWave: number): DeBroglieWaveState {
    this.bohrNWave = THREE.MathUtils.clamp(nWave, 1, 6);
    const state = getDeBroglieWaveState(this.bohrNWave);
    if (this.currentEra === 'bohr') {
      this.updateBohrWaveGeometry();
      this.notifyScaleChange();
    }
    return state;
  }

  public setSchrodingerPreset(preset: SchrodingerPresetId): void {
    this.schrodingerPreset = preset;
    if (this.currentEra === 'schrodinger') {
      void this.buildSchrodingerScene(false);
      this.notifyScaleChange();
    }
  }

  public getSchrodingerPreset(): { id: SchrodingerPresetId; n: number; l: number; m: number } {
    return { ...SCHRODINGER_PRESETS[this.schrodingerPreset] };
  }

  protected override onViewportChanged(): void {
    if (!this.schrodingerMaterial || this.schrodingerFrameRadius <= 0) return;
    this.schrodingerFrameDist = computeFrameDistance(
      this.schrodingerFrameRadius,
      this.camera.fov,
      this.camera.aspect,
      1.15,
    );
    updatePointSizing(
      this.schrodingerMaterial,
      this.renderer,
      this.camera,
      this.schrodingerFrameDist,
      this.schrodingerPointCount,
      this.drawingBufferSize,
    );
  }

  protected override onFrame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameMs) / 1000, 0.05);
    this.lastFrameMs = now;
    const reducedMotion = this.reducedMotionQuery.matches;

    if (!reducedMotion) {
      this.elapsedSec += dt;
    }

    if (this.currentEra === 'dalton' && this.daltonAssembly) {
      this.daltonAssembly.position.y = reducedMotion ? 0 : Math.sin(this.elapsedSec * 1.4) * 0.12;
    } else if (this.currentEra === 'thomson') {
      this.updateThomsonFrame();
    } else if (this.currentEra === 'rutherford') {
      this.updateRutherfordFrame(dt);
    } else if (this.currentEra === 'bohr') {
      this.updateBohrWaveGeometry();
    }
  }

  private notifyScaleChange(): void {
    this.onScaleChange?.(this.getScaleText());
  }

  private applyEraCamera(targetPos: THREE.Vector3, instant: boolean): void {
    this.defaultCameraPos.copy(targetPos);
    this.defaultTarget.copy(ORIGIN);
    if (instant || !this.isAnimating || this.reducedMotionQuery.matches) {
      this.resetCameraInstant();
    } else {
      this.animateCameraTo(targetPos, UP_AXIS, ORIGIN, 420);
    }
  }

  private rebuildEraScene(instant: boolean): void {
    this.schrodingerToken += 1;
    this.clearEraGroup();

    switch (this.currentEra) {
      case 'dalton':
        this.buildDaltonScene(instant);
        break;
      case 'thomson':
        this.buildThomsonScene(instant);
        break;
      case 'rutherford':
        this.buildRutherfordScene(instant);
        break;
      case 'bohr':
        this.buildBohrScene(instant);
        break;
      case 'schrodinger':
        void this.buildSchrodingerScene(instant);
        break;
    }
  }

  private buildDaltonScene(instant: boolean): void {
    this.applyEraCamera(new THREE.Vector3(0, 1.6, 9.2), instant);

    const assembly = new THREE.Group();
    const oRadius = 1.25;
    const hRadius = 0.78;
    const contactDist = oRadius + hRadius; // 2.03
    const halfAngle = THREE.MathUtils.degToRad(104.5 / 2);
    const oCenter = new THREE.Vector3(0, 0.38, 0);

    const oxygenMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.22,
      metalness: 0.15,
    });
    const oxygenMesh = new THREE.Mesh(new THREE.SphereGeometry(oRadius, 48, 36), oxygenMat);
    oxygenMesh.position.copy(oCenter);
    assembly.add(oxygenMesh);

    const oBadge = createLabelSprite('O', '#ffffff', 'rgba(127, 29, 29, 0.72)', 0.72);
    oBadge.position.set(oCenter.x, oCenter.y, oCenter.z + oRadius * 0.85);
    assembly.add(oBadge);

    const hydrogenGeom = new THREE.SphereGeometry(hRadius, 40, 28);
    const hydrogenMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.22,
      metalness: 0.15,
    });
    const collarGeom = new THREE.TorusGeometry(0.36, 0.032, 16, 48);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.55,
    });

    for (const sign of [-1, 1]) {
      const dir = new THREE.Vector3(
        sign * Math.sin(halfAngle),
        -Math.cos(halfAngle),
        0,
      ).normalize();
      const hCenter = oCenter.clone().addScaledVector(dir, contactDist);

      const hMesh = new THREE.Mesh(hydrogenGeom, hydrogenMat);
      hMesh.position.copy(hCenter);
      assembly.add(hMesh);

      const hBadge = createLabelSprite('H', '#0f172a', 'rgba(241, 245, 249, 0.82)', 0.54);
      hBadge.position.set(hCenter.x, hCenter.y, hCenter.z + hRadius * 0.88);
      assembly.add(hBadge);

      const collar = new THREE.Mesh(collarGeom, collarMat);
      collar.position.copy(oCenter).addScaledVector(dir, oRadius);
      collar.quaternion.setFromUnitVectors(Z_AXIS, dir);
      assembly.add(collar);
    }

    this.daltonAssembly = assembly;
    this.eraGroup.add(assembly);
  }

  private buildThomsonScene(instant: boolean): void {
    this.applyEraCamera(new THREE.Vector3(0, 2.2, 9.5), instant);

    const puddingMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.0, 56, 40),
      new THREE.MeshPhysicalMaterial({
        color: 0xfb7185,
        emissive: 0xe11d48,
        emissiveIntensity: 0.16,
        roughness: 0.18,
        transmission: 0.55,
        opacity: 0.3,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.eraGroup.add(puddingMesh);

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(2.15, 36, 24),
      new THREE.MeshBasicMaterial({
        color: 0xfda4af,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
    );
    this.eraGroup.add(innerGlow);

    const plusCoords: readonly [number, number, number][] = [
      [1.85, 0, 0],
      [-1.85, 0, 0],
      [0, 1.85, 0],
      [0, -1.85, 0],
      [0, 0, 1.85],
      [0, 0, -1.85],
    ];
    for (const [px, py, pz] of plusCoords) {
      const plus = createLabelSprite(
        '+',
        'rgba(254, 205, 211, 0.85)',
        'rgba(244, 63, 94, 0.16)',
        0.52,
        true,
      );
      plus.position.set(px, py, pz);
      this.eraGroup.add(plus);
    }

    this.eraGroup.add(createDashedXzRing(1.35, 0.85, 0xfda4af, 0.28));
    this.eraGroup.add(createDashedXzRing(1.35, -0.85, 0xfda4af, 0.28));

    const electronGeom = new THREE.SphereGeometry(0.23, 28, 20);
    const electronMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.thomsonElectrons = [];
    for (let i = 0; i < 8; i += 1) {
      const electron = new THREE.Mesh(electronGeom, electronMat);
      this.thomsonElectrons.push(electron);
      this.eraGroup.add(electron);
    }
    this.updateThomsonFrame();
  }

  private updateThomsonFrame(): void {
    const timeSec = this.reducedMotionQuery.matches ? 0 : this.elapsedSec;
    const positions = computeThomsonElectronPositions(timeSec, this.thomsonAmplitude);
    for (let i = 0; i < this.thomsonElectrons.length; i += 1) {
      const pos = positions[i];
      this.thomsonElectrons[i].position.set(pos.x, pos.y, pos.z);
    }
  }

  private buildRutherfordScene(instant: boolean): void {
    this.applyEraCamera(new THREE.Vector3(-1.2, 5.2, 16.5), instant);

    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.1,
        roughness: 0.2,
        metalness: 0.35,
      }),
    );
    this.eraGroup.add(nucleus);

    const nucleusHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 24, 18),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    this.eraGroup.add(nucleusHalo);

    const nucleusLight = new THREE.PointLight(0xfbbf24, 2.0, 14);
    this.eraGroup.add(nucleusLight);

    const foilGeom = new THREE.PlaneGeometry(13, 13);
    const foilMesh = new THREE.Mesh(
      foilGeom,
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    foilMesh.rotation.y = Math.PI / 2;
    this.eraGroup.add(foilMesh);

    const foilBorder = new THREE.LineSegments(
      new THREE.EdgesGeometry(foilGeom),
      new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.38,
      }),
    );
    foilBorder.rotation.y = Math.PI / 2;
    this.eraGroup.add(foilBorder);

    const emptyAtomShell = new THREE.Mesh(
      new THREE.SphereGeometry(7.2, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        wireframe: true,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
    );
    this.eraGroup.add(emptyAtomShell);

    const nozzleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.44, 1.3, 24),
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.35,
        metalness: 0.65,
      }),
    );
    nozzleBody.rotation.z = -Math.PI / 2;
    nozzleBody.position.set(-10.85, 0, 0);
    this.eraGroup.add(nozzleBody);

    const nozzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.055, 12, 32),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
    );
    nozzleRing.rotation.y = Math.PI / 2;
    nozzleRing.position.set(-10.2, 0, 0);
    this.eraGroup.add(nozzleRing);

    this.initAlphaPool();
    this.rutherfordSpawnAcc = 0;
  }

  private initAlphaPool(): void {
    const headGeom = new THREE.SphereGeometry(0.11, 14, 10);
    this.alphaPool = [];

    for (let i = 0; i < ALPHA_POOL_SIZE; i += 1) {
      const headMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
      const head = new THREE.Mesh(headGeom, headMat);
      head.visible = false;

      const trailPositions = new Float32Array(ALPHA_TRAIL_VERTICES * 3);
      const trailGeom = new THREE.BufferGeometry();
      const trailAttr = new THREE.BufferAttribute(trailPositions, 3);
      trailAttr.setUsage(THREE.DynamicDrawUsage);
      trailGeom.setAttribute('position', trailAttr);

      const trailMat = new THREE.LineBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.78,
      });
      const trail = new THREE.Line(trailGeom, trailMat);
      trail.visible = false;
      trail.frustumCulled = false;

      this.eraGroup.add(head);
      this.eraGroup.add(trail);
      this.alphaPool.push({
        active: false,
        counted: false,
        progress: 0,
        traj: null,
        head,
        headMat,
        trail,
        trailMat,
        trailPositions,
        trailAttr,
      });
    }
  }

  private acquireAlphaSlot(allowRecycle: boolean): AlphaParticleSlot | null {
    let oldestSlot: AlphaParticleSlot | null = null;
    for (const slot of this.alphaPool) {
      if (!slot.active) return slot;
      if (!oldestSlot || slot.progress > oldestSlot.progress) {
        oldestSlot = slot;
      }
    }
    return allowRecycle ? oldestSlot : null;
  }

  private spawnAlphaParticle(
    impactParamFm: number,
    azimuthRad: number,
    initialProgress: number,
    allowRecycle = true,
  ): void {
    const slot = this.acquireAlphaSlot(allowRecycle);
    if (!slot) return;

    const traj = computeRutherfordTrajectory({
      energyMeV: this.rutherfordEnergyMeV,
      impactParamFm,
      azimuthRad,
    });
    const color = classifyAlphaColor(traj.scatteringAngleDeg);

    slot.active = true;
    slot.counted = false;
    slot.progress = initialProgress;
    slot.traj = traj;
    slot.headMat.color.setHex(color);
    slot.trailMat.color.setHex(color);

    const visible = initialProgress >= 0;
    slot.head.visible = visible;
    slot.trail.visible = visible;
    if (visible) {
      this.syncAlphaGeometry(slot);
    }
  }

  private stepRutherfordStream(dt: number): void {
    if (!this.rutherfordStreaming) return;
    this.rutherfordSpawnAcc += dt * ALPHA_STREAM_RATE;
    while (this.rutherfordSpawnAcc >= 1) {
      this.rutherfordSpawnAcc -= 1;
      this.particleCounter += 1;
      const sample = sampleRutherfordImpact(this.particleCounter, this.rutherfordSpreadFm);
      this.spawnAlphaParticle(sample.impactParamFm, sample.azimuthRad, 0, false);
    }
  }

  private advanceAlphaSlot(slot: AlphaParticleSlot, progressDelta: number): boolean {
    if (!slot.active || !slot.traj) return false;
    slot.progress += progressDelta;
    if (slot.progress < 0) return false;

    let newlyCounted = false;
    if (!slot.counted && slot.progress >= 0.5) {
      slot.counted = true;
      newlyCounted = true;
      this.recordAlphaStat(slot.traj.scatteringAngleDeg);
    }

    if (slot.progress >= 1) {
      slot.active = false;
      slot.head.visible = false;
      slot.trail.visible = false;
      return newlyCounted;
    }

    slot.head.visible = true;
    slot.trail.visible = true;
    this.syncAlphaGeometry(slot);
    return newlyCounted;
  }

  private updateRutherfordFrame(dt: number): void {
    this.stepRutherfordStream(dt);

    const progressDelta = dt * 0.36 * Math.sqrt(this.rutherfordEnergyMeV / 5);
    let statsChanged = false;
    for (const slot of this.alphaPool) {
      if (this.advanceAlphaSlot(slot, progressDelta)) {
        statsChanged = true;
      }
    }

    if (statsChanged) {
      this.onRutherfordStats?.({ ...this.rutherfordStats });
    }
  }

  private recordAlphaStat(scatteringAngleDeg: number): void {
    this.rutherfordStats.total += 1;
    if (scatteringAngleDeg > 15) {
      this.rutherfordStats.deflected += 1;
    }
    if (scatteringAngleDeg > 90) {
      this.rutherfordStats.backscattered += 1;
    }
  }

  private syncAlphaGeometry(slot: AlphaParticleSlot): void {
    const traj = slot.traj!;
    const headPt = evaluateRutherfordPoint(traj, slot.progress);
    slot.head.position.set(headPt.x, headPt.y, headPt.z);

    const tEnd = slot.progress;
    const tStart = Math.max(0, tEnd - ALPHA_TRAIL_SPAN);
    const span = tEnd - tStart;

    for (let k = 0; k < ALPHA_TRAIL_VERTICES; k += 1) {
      const t = tStart + (k / (ALPHA_TRAIL_VERTICES - 1)) * span;
      const pt = evaluateRutherfordPoint(traj, t);
      slot.trailPositions[k * 3] = pt.x;
      slot.trailPositions[k * 3 + 1] = pt.y;
      slot.trailPositions[k * 3 + 2] = pt.z;
    }
    slot.trailAttr.needsUpdate = true;
  }

  private buildBohrScene(instant: boolean): void {
    this.applyEraCamera(new THREE.Vector3(0, 5.2, 10.2), instant);

    const proton = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 0.7,
        roughness: 0.25,
      }),
    );
    this.eraGroup.add(proton);

    for (let k = 1; k <= 6; k += 1) {
      const ringRadius = 1.65 + 0.55 * k;
      this.eraGroup.add(createDashedXzRing(ringRadius, 0, 0x64748b, 0.26));
    }

    const { geometry, positions, normals } = createBohrTubeGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x059669,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.15,
    });
    const waveMesh = new THREE.Mesh(geometry, material);
    waveMesh.frustumCulled = false;
    this.eraGroup.add(waveMesh);

    const gapMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.0,
        roughness: 0.2,
      }),
    );
    this.eraGroup.add(gapMarker);

    this.bohrTubeGeometry = geometry;
    this.bohrTubeMaterial = material;
    this.bohrTubePositions = positions;
    this.bohrTubeNormals = normals;
    this.bohrGapMarker = gapMarker;
    this.updateBohrWaveGeometry();
  }

  private updateBohrWaveGeometry(): void {
    if (
      !this.bohrTubeGeometry ||
      !this.bohrTubeMaterial ||
      !this.bohrTubePositions ||
      !this.bohrTubeNormals ||
      !this.bohrGapMarker
    ) {
      return;
    }

    const timeSec = this.reducedMotionQuery.matches ? 0 : this.elapsedSec;
    const state = getDeBroglieWaveState(this.bohrNWave);
    const points = sampleDeBroglieWavePoints(this.bohrNWave, timeSec, BOHR_SEGMENTS_PER_REV);
    const stepCount = writeBohrTubeVertices(
      points,
      state.isAllowed,
      this.bohrTubePositions,
      this.bohrTubeNormals,
    );

    this.bohrTubeGeometry.setDrawRange(0, stepCount * BOHR_RADIAL_SEGMENTS * 6);
    (this.bohrTubeGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.bohrTubeGeometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;

    if (state.isAllowed) {
      this.bohrTubeMaterial.color.setHex(0x34d399);
      this.bohrTubeMaterial.emissive.setHex(0x059669);
      this.bohrGapMarker.visible = false;
    } else {
      this.bohrTubeMaterial.color.setHex(0xf87171);
      this.bohrTubeMaterial.emissive.setHex(0xd97706);
      this.bohrGapMarker.visible = true;
      this.bohrGapMarker.position.set(state.orbitRadius, 0, 0);
      const pulse = 1 + 0.18 * Math.sin(timeSec * 6.5);
      this.bohrGapMarker.scale.setScalar(pulse);
    }
  }

  private async buildSchrodingerScene(instant: boolean): Promise<void> {
    this.schrodingerToken += 1;
    const token = this.schrodingerToken;
    const spec = SCHRODINGER_PRESETS[this.schrodingerPreset];

    const [geom, buffer] = await Promise.all([
      resolveOrbitalGeometry(spec.n, spec.l, 1.0),
      sampleOrbitalPoints({
        n: spec.n,
        l: spec.l,
        m: spec.m,
        useRealOrbital: true,
        zEff: 1.0,
        pointCount: 45_000,
      }),
    ]);

    if (token !== this.schrodingerToken || this.currentEra !== 'schrodinger') return;

    this.clearEraGroup();

    const { points, material, count } = createPointCloud(buffer, {
      palette: 'default',
      contrast: 0,
      useRealOrbital: true,
      frameRadius: geom.frameRadius,
    });
    this.eraGroup.add(points);

    const rBohr = spec.n * spec.n;
    this.eraGroup.add(createDashedXzRing(rBohr, 0, 0x94a3b8, 0.32, 160));

    this.schrodingerMaterial = material;
    this.schrodingerPointCount = count;
    this.schrodingerFrameRadius = geom.frameRadius;
    this.schrodingerFrameDist = computeFrameDistance(
      geom.frameRadius,
      this.camera.fov,
      this.camera.aspect,
      1.15,
    );

    const camPos = SCHRODINGER_VIEW_DIR.clone().multiplyScalar(this.schrodingerFrameDist);
    this.applyEraCamera(camPos, instant);
    this.onViewportChanged();
  }

  private clearEraGroup(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();

    this.eraGroup.traverse((obj) => collectObjectResources(obj, geometries, materials));

    for (const geom of geometries) geom.dispose();
    for (const mat of materials) disposeMaterial(mat);
    this.eraGroup.clear();

    this.daltonAssembly = null;
    this.thomsonElectrons = [];
    this.alphaPool = [];
    this.bohrTubeGeometry = null;
    this.bohrTubeMaterial = null;
    this.bohrTubePositions = null;
    this.bohrTubeNormals = null;
    this.bohrGapMarker = null;
    this.schrodingerMaterial = null;
    this.schrodingerPointCount = 0;
    this.schrodingerFrameRadius = 0;
  }

  protected cleanupScene(): void {
    this.schrodingerToken += 1;
    this.clearEraGroup();
  }
}
