import * as THREE from 'three';
import { computeDecayDaughter, DecayMode } from '../core/nuclear';
import { BaseThreeRenderer, RendererTarget } from './render-utils';

const MAX_NUCLEONS = 300;
const NUCLEON_SPACING_FM = 1.56;
const NUCLEON_SPHERE_RADIUS = 0.84;
const VIBRATION_AMPLITUDE = 0.055;
const DECAY_DURATION_MS = 1150;
const SCALE_COMPARE_NUCLEUS_FACTOR = 0.18;
const VALENCE_SHELL_RADIUS = 38;
const RETICLE_RADIUS = 1.8;

const PROTON_HEX = 0xf87171;
const NEUTRON_HEX = 0x38bdf8;
const PROTON_COLOR = new THREE.Color(PROTON_HEX);
const NEUTRON_COLOR = new THREE.Color(NEUTRON_HEX);

const EMISSION_DIR = new THREE.Vector3(0.76, 0.48, 0.44).normalize();
const EMISSION_TANGENT_A = new THREE.Vector3(-0.48, 0.76, 0).normalize();
const EMISSION_TANGENT_B = new THREE.Vector3().crossVectors(EMISSION_DIR, EMISSION_TANGENT_A).normalize();

interface LatticeSite {
  x: number;
  y: number;
  z: number;
  score: number;
}

interface ActiveNucleon {
  x: number;
  y: number;
  z: number;
  isProton: boolean;
}

interface ActiveDecayAnimation {
  startTime: number;
  nextZ: number;
  nextN: number;
  update: (t: number) => void;
  onComplete: (nextZ: number, nextN: number) => void;
}

function buildFccLatticeSites(): readonly THREE.Vector3[] {
  const halfGrid = 6;
  const span = halfGrid * 2 + 1;
  const total = span * span * span;
  const step = NUCLEON_SPACING_FM / Math.SQRT2;
  const candidates: LatticeSite[] = [];

  for (let idx = 0; idx < total; idx++) {
    const ix = (idx % span) - halfGrid;
    const iy = (Math.floor(idx / span) % span) - halfGrid;
    const iz = Math.floor(idx / (span * span)) - halfGrid;
    if (((ix + iy + iz) & 1) !== 0) continue;

    const x = ix * step;
    const y = iy * step;
    const z = iz * step;
    const r2 = x * x + y * y + z * z;
    const tie = 0.06 * Math.sin(ix * 12.9898 + iy * 78.233 + iz * 37.719);
    candidates.push({ x, y, z, score: r2 + tie });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, MAX_NUCLEONS).map((s) => new THREE.Vector3(s.x, s.y, s.z));
}

const FCC_SITES = buildFccLatticeSites();

const TETRA_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 1, 1).multiplyScalar(0.5),
  new THREE.Vector3(-1, -1, 1).multiplyScalar(0.5),
  new THREE.Vector3(-1, 1, -1).multiplyScalar(0.5),
  new THREE.Vector3(1, -1, -1).multiplyScalar(0.5),
];

function disposeObjectResources(obj: THREE.Object3D): void {
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
    obj.geometry.dispose();
    if (Array.isArray(obj.material)) {
      for (const mat of obj.material) mat.dispose();
    } else {
      obj.material.dispose();
    }
  }
}

function disposeGroupChildren(group: THREE.Group): void {
  group.traverse((child) => {
    if (child !== group) disposeObjectResources(child);
  });
  group.clear();
}

export class NucleusRenderer extends BaseThreeRenderer {
  private readonly nucleusGroup = new THREE.Group();
  private readonly decayGroup = new THREE.Group();
  private readonly scaleGroup = new THREE.Group();
  private readonly instancedMesh: THREE.InstancedMesh;
  private readonly dummyMatrix = new THREE.Matrix4();
  private readonly scratchColor = new THREE.Color();
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  private activeNucleons: ActiveNucleon[] = [];
  private readonly hiddenIndices = new Set<number>();
  private currentZ = 6;
  private currentN = 8;
  private currentRadiusFm = 3.01;
  private hasFramedOnce = false;
  private scaleCompareActive = false;
  private decayAnim: ActiveDecayAnimation | null = null;

  constructor(target: RendererTarget) {
    super(target, new THREE.Vector3(0, 0, 12));
    this.autoRotateSpeed = 1.4;

    this.setupLighting();

    const geometry = new THREE.SphereGeometry(NUCLEON_SPHERE_RADIUS, 24, 24);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.28,
      metalness: 0.16,
    });
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, MAX_NUCLEONS);
    this.instancedMesh.count = 0;
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Pre-initialize instanceColor buffer for all 300 slots.
    for (let i = 0; i < MAX_NUCLEONS; i++) {
      this.instancedMesh.setColorAt(i, PROTON_COLOR);
    }

    this.nucleusGroup.add(this.instancedMesh);
    this.scene.add(this.nucleusGroup);
    this.scene.add(this.decayGroup);

    this.buildScaleComparisonGroup();
    this.scaleGroup.visible = false;
    this.scene.add(this.scaleGroup);

    this.stop();
  }

  private setupLighting(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.68));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(12, 16, 15);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x4080ff, 0.55);
    fillLight.position.set(-12, -10, -10);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffb870, 0.32);
    rimLight.position.set(0, -14, 10);
    this.scene.add(rimLight);
  }

  private buildScaleComparisonGroup(): void {
    const shellWire = new THREE.Mesh(
      new THREE.SphereGeometry(VALENCE_SHELL_RADIUS, 28, 20),
      new THREE.MeshBasicMaterial({
        color: 0x4f8ff7,
        wireframe: true,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );
    this.scaleGroup.add(shellWire);

    const stadiumRing = new THREE.Mesh(
      new THREE.TorusGeometry(VALENCE_SHELL_RADIUS, 0.22, 12, 96),
      new THREE.MeshBasicMaterial({
        color: 0x4f8ff7,
        transparent: true,
        opacity: 0.68,
      }),
    );
    stadiumRing.rotation.x = Math.PI / 2;
    this.scaleGroup.add(stadiumRing);

    const reticleXY = new THREE.Mesh(
      new THREE.TorusGeometry(RETICLE_RADIUS, 0.06, 10, 64),
      new THREE.MeshBasicMaterial({
        color: 0xf5b544,
        transparent: true,
        opacity: 0.82,
      }),
    );
    this.scaleGroup.add(reticleXY);

    const reticleXZ = new THREE.Mesh(
      new THREE.TorusGeometry(RETICLE_RADIUS, 0.045, 10, 64),
      new THREE.MeshBasicMaterial({
        color: 0xf5b544,
        transparent: true,
        opacity: 0.45,
      }),
    );
    reticleXZ.rotation.x = Math.PI / 2;
    this.scaleGroup.add(reticleXZ);
  }

  public setNuclide(z: number, n: number, radiusFm: number): void {
    if (this.decayAnim !== null) {
      this.resetDecayVisuals();
      this.decayAnim = null;
    }

    this.currentZ = z;
    this.currentN = n;
    this.currentRadiusFm = radiusFm;

    this.rebuildNucleonCluster(z, n);
    this.updateCameraFraming(radiusFm);
  }

  private rebuildNucleonCluster(z: number, n: number): void {
    const a = Math.min(MAX_NUCLEONS, Math.max(1, z + n));
    let cx = 0;
    let cy = 0;
    let cz = 0;

    for (let i = 0; i < a; i++) {
      const s = FCC_SITES[i];
      cx += s.x;
      cy += s.y;
      cz += s.z;
    }
    cx /= a;
    cy /= a;
    cz /= a;

    this.activeNucleons = new Array<ActiveNucleon>(a);
    for (let i = 0; i < a; i++) {
      const s = FCC_SITES[i];
      const isProton = Math.floor(((i + 1) * z) / a) > Math.floor((i * z) / a);
      this.activeNucleons[i] = {
        x: s.x - cx,
        y: s.y - cy,
        z: s.z - cz,
        isProton,
      };
      this.instancedMesh.setColorAt(i, isProton ? PROTON_COLOR : NEUTRON_COLOR);
    }

    this.instancedMesh.count = a;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.updateInstancedMatrices(0, 0);
  }

  private updateCameraFraming(radiusFm: number): void {
    const dist = Math.max(radiusFm * 3.4, 7.5);
    this.defaultCameraPos.set(0, 0, dist);

    if (this.scaleCompareActive) return;

    if (!this.hasFramedOnce) {
      this.hasFramedOnce = true;
      this.resetCameraInstant();
      return;
    }

    const viewDir = this.camera.position.clone().sub(this.controls.target);
    if (viewDir.lengthSq() < 1e-6) {
      viewDir.set(0, 0, 1);
    } else {
      viewDir.normalize();
    }
    this.camera.position.copy(this.controls.target).addScaledVector(viewDir, dist);
    this.controls.update();
  }

  public isDecayAnimating(): boolean {
    return this.decayAnim !== null;
  }

  public isScaleComparisonActive(): boolean {
    return this.scaleCompareActive;
  }

  public toggleScaleComparison(enabled?: boolean): boolean {
    const next = enabled === undefined ? !this.scaleCompareActive : enabled;
    this.scaleCompareActive = next;
    this.scaleGroup.visible = next;

    const baseScale = next ? SCALE_COMPARE_NUCLEUS_FACTOR : 1;
    this.nucleusGroup.scale.setScalar(baseScale);

    if (next) {
      this.animateCameraTo(
        new THREE.Vector3(0, 18, 92),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0),
        550,
      );
    } else {
      this.resetCamera();
    }
    return next;
  }

  public triggerDecay(
    mode: DecayMode,
    onComplete: (nextZ: number, nextN: number) => void,
  ): boolean {
    if (this.decayAnim !== null) return false;
    const daughter = computeDecayDaughter(this.currentZ, this.currentN, mode);
    if (!daughter || mode === 'stable') return false;

    this.resetDecayVisuals();
    const update = this.createDecayUpdater(mode);

    this.decayAnim = {
      startTime: performance.now(),
      nextZ: daughter.z,
      nextN: daughter.n,
      update,
      onComplete,
    };
    return true;
  }

  private createDecayUpdater(mode: Exclude<DecayMode, 'stable'>): (t: number) => void {
    switch (mode) {
      case 'alpha':
        return this.spawnAlphaDecay();
      case 'beta_minus':
        return this.spawnBetaDecay(false);
      case 'beta_plus':
        return this.spawnBetaDecay(true);
      case 'gamma':
        return this.spawnGammaDecay();
      case 'proton_drip':
        return this.spawnDripDecay(true);
      case 'neutron_drip':
        return this.spawnDripDecay(false);
    }
  }

  private pickOuterNucleons(wantProton: boolean, count: number): number[] {
    const scored: { idx: number; score: number }[] = [];
    for (let i = 0; i < this.activeNucleons.length; i++) {
      const nuc = this.activeNucleons[i];
      if (nuc.isProton !== wantProton) continue;
      const r = Math.hypot(nuc.x, nuc.y, nuc.z);
      const proj = nuc.x * EMISSION_DIR.x + nuc.y * EMISSION_DIR.y + nuc.z * EMISSION_DIR.z;
      scored.push({ idx: i, score: r + 0.7 * proj });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map((item) => item.idx);
  }

  private getNucleonWorldPosition(idx: number): THREE.Vector3 {
    const nuc = this.activeNucleons[idx];
    const factor = this.scaleCompareActive ? SCALE_COMPARE_NUCLEUS_FACTOR : 1;
    return new THREE.Vector3(nuc.x * factor, nuc.y * factor, nuc.z * factor);
  }

  private spawnAlphaDecay(): (t: number) => void {
    const protons = this.pickOuterNucleons(true, 2);
    const neutrons = this.pickOuterNucleons(false, 2);
    const picked = [...protons, ...neutrons];
    const startOrigin = new THREE.Vector3();

    for (const idx of picked) {
      this.hiddenIndices.add(idx);
      startOrigin.add(this.getNucleonWorldPosition(idx));
    }
    startOrigin.divideScalar(Math.max(1, picked.length));

    const cluster = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(0.78, 20, 20);
    const pMat = new THREE.MeshStandardMaterial({
      color: PROTON_HEX,
      emissive: PROTON_HEX,
      emissiveIntensity: 0.28,
      roughness: 0.25,
    });
    const nMat = new THREE.MeshStandardMaterial({
      color: NEUTRON_HEX,
      emissive: NEUTRON_HEX,
      emissiveIntensity: 0.28,
      roughness: 0.25,
    });

    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(sphereGeo.clone(), (i < 2 ? pMat : nMat).clone());
      m.position.copy(TETRA_OFFSETS[i]);
      cluster.add(m);
    }
    sphereGeo.dispose();
    pMat.dispose();
    nMat.dispose();

    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xf5b544,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.75, 20, 20), haloMat);
    cluster.add(halo);
    cluster.position.copy(startOrigin);
    this.decayGroup.add(cluster);

    const endPos = EMISSION_DIR.clone().multiplyScalar(this.currentRadiusFm + 22);

    return (t: number) => {
      const ease = 1 - (1 - t) * (1 - t);
      cluster.position.lerpVectors(startOrigin, endPos, ease);
      cluster.rotation.x = t * 3.4;
      cluster.rotation.y = t * 4.2;
      haloMat.opacity = 0.36 * (1 - t * 0.75);
      const recoil = -0.35 * Math.sin(Math.PI * t);
      this.nucleusGroup.position.copy(EMISSION_DIR).multiplyScalar(recoil);
    };
  }

  private spawnBetaDecay(isBetaPlus: boolean): (t: number) => void {
    const picked = this.pickOuterNucleons(isBetaPlus, 1);
    const targetIdx = picked[0];
    const startOrigin = this.getNucleonWorldPosition(targetIdx);

    const fromColor = isBetaPlus ? PROTON_COLOR : NEUTRON_COLOR;
    const toColor = isBetaPlus ? NEUTRON_COLOR : PROTON_COLOR;
    const leptonHex = isBetaPlus ? 0xf59e0b : 0x60a5fa;
    const flashHex = isBetaPlus ? 0xfbbf24 : 0x93c5fd;

    const flashMat = new THREE.MeshBasicMaterial({
      color: flashHex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 18), flashMat);
    flashMesh.position.copy(startOrigin);
    this.decayGroup.add(flashMesh);

    const leptonMat = new THREE.MeshBasicMaterial({
      color: leptonHex,
      transparent: true,
      opacity: 0.96,
    });
    const leptonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), leptonMat);
    this.decayGroup.add(leptonMesh);

    const neutrinoMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.7,
    });
    const neutrinoMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), neutrinoMat);
    this.decayGroup.add(neutrinoMesh);

    const halfAngle = (17.5 * Math.PI) / 180;
    const cosA = Math.cos(halfAngle);
    const sinA = Math.sin(halfAngle);
    const dirLepton = EMISSION_DIR.clone()
      .multiplyScalar(cosA)
      .addScaledVector(EMISSION_TANGENT_A, sinA)
      .normalize();
    const dirNeutrino = EMISSION_DIR.clone()
      .multiplyScalar(cosA)
      .addScaledVector(EMISSION_TANGENT_A, -sinA)
      .normalize();
    const travel = this.currentRadiusFm + 24;

    return (t: number) => {
      const colorProgress = Math.min(1, t * 1.65);
      this.scratchColor.lerpColors(fromColor, toColor, colorProgress);
      this.instancedMesh.setColorAt(targetIdx, this.scratchColor);
      if (this.instancedMesh.instanceColor) {
        this.instancedMesh.instanceColor.needsUpdate = true;
      }

      flashMesh.scale.setScalar(0.8 + 1.35 * t);
      flashMat.opacity = 0.85 * Math.pow(1 - t, 1.8);

      const dist = (1 - Math.pow(1 - t, 2)) * travel;
      leptonMesh.position.copy(startOrigin).addScaledVector(dirLepton, dist);
      neutrinoMesh.position.copy(startOrigin).addScaledVector(dirNeutrino, dist * 1.08);
      leptonMat.opacity = 1 - t * 0.35;
      neutrinoMat.opacity = 0.72 * (1 - t * 0.55);
    };
  }

  private spawnGammaDecay(): (t: number) => void {
    const coreRadius = Math.max(1.2, this.currentRadiusFm * 0.9);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const flashSphere = new THREE.Mesh(new THREE.SphereGeometry(coreRadius, 24, 24), flashMat);
    this.decayGroup.add(flashSphere);

    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    });
    const shellMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), shellMat);
    this.decayGroup.add(shellMesh);

    const waveSegments = 64;
    const wavePositions = new Float32Array(waveSegments * 3);
    const waveGeo = new THREE.BufferGeometry();
    waveGeo.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3));
    const waveMat = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
    });
    const waveLine = new THREE.Line(waveGeo, waveMat);
    this.decayGroup.add(waveLine);

    const packetLength = 7.5;
    const maxDistance = this.currentRadiusFm + 22;

    return (t: number) => {
      const baseScale = this.scaleCompareActive ? SCALE_COMPARE_NUCLEUS_FACTOR : 1;
      const pulse = 1 + 0.08 * Math.sin(4 * Math.PI * t) * (1 - t);
      this.nucleusGroup.scale.setScalar(baseScale * pulse);

      flashMat.opacity = 0.55 * Math.pow(1 - t, 1.6);
      flashSphere.scale.setScalar(baseScale * (1 + 0.5 * t));

      shellMesh.scale.setScalar(coreRadius * baseScale + t * 18);
      shellMat.opacity = 0.25 * (1 - t);

      const headStart = t * maxDistance;
      for (let i = 0; i < waveSegments; i++) {
        const u = i / (waveSegments - 1);
        const s = headStart + (u - 0.5) * packetLength;
        const envelope = Math.sin(Math.PI * u) * 0.85;
        const osc = Math.sin(u * Math.PI * 6 - t * 18) * envelope;
        const px = EMISSION_DIR.x * s + EMISSION_TANGENT_A.x * osc + EMISSION_TANGENT_B.x * (osc * 0.25);
        const py = EMISSION_DIR.y * s + EMISSION_TANGENT_A.y * osc + EMISSION_TANGENT_B.y * (osc * 0.25);
        const pz = EMISSION_DIR.z * s + EMISSION_TANGENT_A.z * osc + EMISSION_TANGENT_B.z * (osc * 0.25);
        wavePositions[i * 3] = px;
        wavePositions[i * 3 + 1] = py;
        wavePositions[i * 3 + 2] = pz;
      }
      waveGeo.attributes.position.needsUpdate = true;
      waveMat.opacity = 0.95 * (1 - t * 0.45);
    };
  }

  private spawnDripDecay(isProton: boolean): (t: number) => void {
    const picked = this.pickOuterNucleons(isProton, 1);
    const targetIdx = picked[0];
    this.hiddenIndices.add(targetIdx);
    const startOrigin = this.getNucleonWorldPosition(targetIdx);
    const colorHex = isProton ? PROTON_HEX : NEUTRON_HEX;

    const nucleonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(NUCLEON_SPHERE_RADIUS, 22, 22),
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.25,
        roughness: 0.28,
        metalness: 0.16,
      }),
    );
    nucleonMesh.position.copy(startOrigin);
    this.decayGroup.add(nucleonMesh);

    const endPos = EMISSION_DIR.clone().multiplyScalar(this.currentRadiusFm + 20);

    return (t: number) => {
      const ease = 1 - (1 - t) * (1 - t);
      nucleonMesh.position.lerpVectors(startOrigin, endPos, ease);
      const recoil = -0.15 * Math.sin(Math.PI * t);
      this.nucleusGroup.position.copy(EMISSION_DIR).multiplyScalar(recoil);
    };
  }

  private resetDecayVisuals(): void {
    disposeGroupChildren(this.decayGroup);
    this.hiddenIndices.clear();
    this.nucleusGroup.position.set(0, 0, 0);
    this.nucleusGroup.scale.setScalar(this.scaleCompareActive ? SCALE_COMPARE_NUCLEUS_FACTOR : 1);
  }

  protected override onFrame(): void {
    const now = performance.now();
    const amp = this.reducedMotionQuery.matches ? 0 : VIBRATION_AMPLITUDE;
    this.updateInstancedMatrices(now * 0.001, amp);
    this.stepDecayAnimation(now);
  }

  private updateInstancedMatrices(timeSec: number, amp: number): void {
    const count = this.activeNucleons.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      if (this.hiddenIndices.has(i)) {
        this.dummyMatrix.makeScale(0, 0, 0);
      } else {
        const nuc = this.activeNucleons[i];
        const dx = amp * Math.sin(timeSec * 5.3 + i * 1.73);
        const dy = amp * Math.cos(timeSec * 4.7 + i * 2.39);
        const dz = amp * Math.sin(timeSec * 6.1 + i * 3.11);
        this.dummyMatrix.makeTranslation(nuc.x + dx, nuc.y + dy, nuc.z + dz);
      }
      this.instancedMesh.setMatrixAt(i, this.dummyMatrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private stepDecayAnimation(now: number): void {
    const anim = this.decayAnim;
    if (!anim) return;

    const t = Math.min(1, (now - anim.startTime) / DECAY_DURATION_MS);
    anim.update(t);

    if (t >= 1) {
      const { nextZ, nextN, onComplete } = anim;
      this.decayAnim = null;
      this.resetDecayVisuals();
      onComplete(nextZ, nextN);
    }
  }

  protected cleanupScene(): void {
    this.decayAnim = null;
    this.resetDecayVisuals();
    disposeObjectResources(this.instancedMesh);
    disposeGroupChildren(this.scaleGroup);
  }
}
