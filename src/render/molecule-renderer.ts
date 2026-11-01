import * as THREE from 'three';
import { BaseThreeRenderer, RendererTarget } from './render-utils';
import {
  AtomPartialCharge,
  BondDipole,
  computeMolecularPolarity,
  MolecularPolarityResult,
} from '../core/molecular-polarity';

export interface MoleculeAtom {
  symbol: string;
  position: [number, number, number];
  color: string;
  radius: number;
}

export interface MoleculeBond {
  fromIndex: number;
  toIndex: number;
  type: 'single' | 'double' | 'triple' | 'aromatic';
}

export interface HybridLobe {
  position: [number, number, number];
  direction: [number, number, number];
  color: string;
  scale: number;
  type: 'bonding' | 'lone_pair';
}

export interface MoleculeData {
  id: string;
  formula: string;
  hybridization: string;
  bond_angle: string;
  atoms: MoleculeAtom[];
  bonds: MoleculeBond[];
  hybrid_lobes: HybridLobe[];
}

interface AngleCandidatePair {
  idx1: number;
  idx2: number;
  theta: number;
  thetaDeg: number;
  u1: THREE.Vector3;
  u2: THREE.Vector3;
  v1Len: number;
  v2Len: number;
}

interface AromaticRingGeometry {
  center: THREE.Vector3;
  radius: number;
  normal: THREE.Vector3;
}

interface DipoleArrowOptions {
  center: THREE.Vector3;
  dir: THREE.Vector3;
  crossAxis: THREE.Vector3;
  totalLen: number;
  shaftRadius: number;
  headRadius: number;
  headLen: number;
  crossbarRadius: number;
  crossbarLen: number;
  color: number;
  emissive: number;
  emissiveIntensity: number;
}

export type MoleculeRendererTarget = RendererTarget;

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class MoleculeRenderer extends BaseThreeRenderer {
  private readonly moleculeGroup: THREE.Group;
  private readonly lobesGroup: THREE.Group;
  private readonly anglesGroup: THREE.Group;
  private readonly piGroup: THREE.Group;
  private readonly dipolesGroup: THREE.Group;

  private readonly raycaster: THREE.Raycaster;
  private readonly mouse: THREE.Vector2;
  public onLobeClick?: (type: 'bonding' | 'lone_pair') => void;
  public onAtomClick?: (symbol: string) => void;
  public onPiBondClick?: () => void;
  public onDipoleClick?: () => void;

  private showLobes: boolean = true;
  private showAngles: boolean = true;
  private showPiBonds: boolean = true;
  private showDipoles: boolean = false;

  constructor(target: MoleculeRendererTarget) {
    super(target, new THREE.Vector3(0, 0, 10));

    this.moleculeGroup = new THREE.Group();
    this.lobesGroup = new THREE.Group();
    this.anglesGroup = new THREE.Group();
    this.piGroup = new THREE.Group();
    this.dipolesGroup = new THREE.Group();
    this.dipolesGroup.visible = this.showDipoles;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.renderer.domElement.addEventListener('click', this.onMouseClick);

    this.scene.add(this.moleculeGroup);
    this.scene.add(this.lobesGroup);
    this.scene.add(this.anglesGroup);
    this.scene.add(this.piGroup);
    this.scene.add(this.dipolesGroup);

    this.setupLighting();
    this.stop();
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(10, 15, 10);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x4080ff, 0.6);
    dirLight2.position.set(-10, -10, -10);
    this.scene.add(dirLight2);
  }

  public loadMolecule(data: MoleculeData): void {
    this.clear();

    this.renderAtoms(data);
    this.renderBonds(data);
    this.renderHybridLobes(data);
    this.renderPiOrbitals(data);
    this.renderDipoles(data);
    this.createBondAngles(data);

    this.toggleLobes(this.showLobes);
    this.toggleAngles(this.showAngles);
    this.togglePiBonds(this.showPiBonds);
    this.toggleDipoles(this.showDipoles);

    this.frameCameraToMolecule(data);
  }

  private renderAtoms(data: MoleculeData): void {
    for (const atom of data.atoms) {
      const geometry = new THREE.SphereGeometry(atom.radius, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(atom.color),
        roughness: 0.2,
        metalness: 0.3,
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(...atom.position);
      sphere.userData = { isAtom: true, symbol: atom.symbol };
      this.moleculeGroup.add(sphere);
    }
  }

  private renderBonds(data: MoleculeData): void {
    for (const bond of data.bonds) {
      const start = new THREE.Vector3(...data.atoms[bond.fromIndex].position);
      const end = new THREE.Vector3(...data.atoms[bond.toIndex].position);

      if (bond.type === 'single') {
        this.createCylinderBond(start, end, 0.12, 0x888888, this.moleculeGroup);
      } else if (bond.type === 'double') {
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const perp = this.getBondPerpendicularVector(bond, data, dir).multiplyScalar(0.12);
        this.createCylinderBond(start.clone().add(perp), end.clone().add(perp), 0.08, 0x888888, this.moleculeGroup);
        this.createCylinderBond(start.clone().sub(perp), end.clone().sub(perp), 0.08, 0x888888, this.moleculeGroup);
      } else if (bond.type === 'triple') {
        this.createCylinderBond(start, end, 0.08, 0x888888, this.moleculeGroup);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const perp = this.getBondPerpendicularVector(bond, data, dir).multiplyScalar(0.16);
        this.createCylinderBond(start.clone().add(perp), end.clone().add(perp), 0.07, 0x888888, this.moleculeGroup);
        this.createCylinderBond(start.clone().sub(perp), end.clone().sub(perp), 0.07, 0x888888, this.moleculeGroup);
      } else if (bond.type === 'aromatic') {
        this.createCylinderBond(start, end, 0.085, 0x888888, this.moleculeGroup);
      }
    }

    const ring = this.computeAromaticRingGeometry(data);
    if (ring) {
      const ringGeom = new THREE.TorusGeometry(ring.radius * 0.68, 0.032, 12, 48);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x6b21a8,
        emissiveIntensity: 0.35,
        roughness: 0.3,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.copy(ring.center);
      ringMesh.quaternion.setFromUnitVectors(Z_AXIS, ring.normal);
      this.moleculeGroup.add(ringMesh);
    }
  }

  private renderHybridLobes(data: MoleculeData): void {
    for (const lobe of data.hybrid_lobes) {
      const lobeMesh = this.createTeardropLobe(
        new THREE.Color(lobe.color),
        lobe.type === 'lone_pair' ? 0.5 : 0.42,
        lobe.scale,
      );
      lobeMesh.position.set(...lobe.position);

      const dir = new THREE.Vector3(...lobe.direction).normalize();
      lobeMesh.quaternion.setFromUnitVectors(UP_AXIS, dir);
      lobeMesh.userData = { isLobe: true, lobeType: lobe.type };

      this.lobesGroup.add(lobeMesh);
    }
  }

  private createPiMaterial(colorHex: number): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: colorHex,
      roughness: 0.15,
      metalness: 0.05,
      transmission: 0.5,
      thickness: 1.0,
      ior: 1.3,
      opacity: 0.44,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private addPiLobePair(
    mid: THREE.Vector3,
    dir: THREE.Vector3,
    normalAxis: THREE.Vector3,
    bondLen: number,
    offset: number,
    radius: number,
    colorHex: number,
  ): void {
    const capsuleLen = Math.max(0.18, bondLen * 0.52);
    const quat = new THREE.Quaternion().setFromUnitVectors(UP_AXIS, dir);

    for (const sign of [1, -1]) {
      const geom = new THREE.CapsuleGeometry(radius, capsuleLen, 16, 24);
      const mat = this.createPiMaterial(colorHex);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(mid).addScaledVector(normalAxis, sign * offset);
      mesh.quaternion.copy(quat);
      mesh.userData = { isPiBond: true };
      this.piGroup.add(mesh);
    }
  }

  private computeRingNormal(ringPositions: THREE.Vector3[], center: THREE.Vector3): THREE.Vector3 {
    const v1 = new THREE.Vector3().subVectors(ringPositions[0], center);
    for (let i = 1; i < ringPositions.length; i++) {
      const v2 = new THREE.Vector3().subVectors(ringPositions[i], center);
      const cross = new THREE.Vector3().crossVectors(v1, v2);
      if (cross.lengthSq() > 1e-6) {
        return cross.normalize();
      }
    }
    return Z_AXIS.clone();
  }

  private computeAromaticRingGeometry(data: MoleculeData): AromaticRingGeometry | null {
    const aromaticBonds = data.bonds.filter((b) => b.type === 'aromatic');
    if (aromaticBonds.length === 0) {
      return null;
    }

    const indexSet = new Set<number>();
    for (const bond of aromaticBonds) {
      indexSet.add(bond.fromIndex);
      indexSet.add(bond.toIndex);
    }

    const ringPositions = Array.from(indexSet, (idx) => new THREE.Vector3(...data.atoms[idx].position));
    const center = new THREE.Vector3();
    for (const pos of ringPositions) {
      center.add(pos);
    }
    center.multiplyScalar(1 / ringPositions.length);

    let radiusSum = 0;
    for (const pos of ringPositions) {
      radiusSum += pos.distanceTo(center);
    }
    const radius = radiusSum / ringPositions.length;
    const normal = this.computeRingNormal(ringPositions, center);

    return { center, radius, normal };
  }

  private renderPiOrbitals(data: MoleculeData): void {
    for (const bond of data.bonds) {
      if (bond.type !== 'double' && bond.type !== 'triple') continue;

      const start = new THREE.Vector3(...data.atoms[bond.fromIndex].position);
      const end = new THREE.Vector3(...data.atoms[bond.toIndex].position);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const bondLen = start.distanceTo(end);
      const dir = end.clone().sub(start).normalize();
      const inPlanePerp = this.getBondPerpendicularVector(bond, data, dir);
      const piNormal = new THREE.Vector3().crossVectors(dir, inPlanePerp).normalize();

      if (bond.type === 'double') {
        this.addPiLobePair(mid, dir, piNormal, bondLen, 0.45, 0.25, 0xa855f7);
      } else {
        this.addPiLobePair(mid, dir, piNormal, bondLen, 0.45, 0.21, 0xa855f7);
        this.addPiLobePair(mid, dir, inPlanePerp, bondLen, 0.45, 0.21, 0xe879f9);
      }
    }

    const ring = this.computeAromaticRingGeometry(data);
    if (ring) {
      const torusQuat = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, ring.normal);
      const layers: ReadonlyArray<readonly [number, number]> = [
        [0.5, 0xa855f7],
        [-0.5, 0xc084fc],
      ];
      for (const [offset, colorHex] of layers) {
        const torusGeom = new THREE.TorusGeometry(ring.radius, 0.3, 24, 64);
        const torusMat = this.createPiMaterial(colorHex);
        const torusMesh = new THREE.Mesh(torusGeom, torusMat);
        torusMesh.position.copy(ring.center).addScaledVector(ring.normal, offset);
        torusMesh.quaternion.copy(torusQuat);
        torusMesh.userData = { isPiBond: true };
        this.piGroup.add(torusMesh);
      }
    }
  }

  private renderDipoles(data: MoleculeData): void {
    const polarity = computeMolecularPolarity(data.atoms, data.bonds);
    const centroid = new THREE.Vector3(...polarity.centroid);

    this.renderPartialChargeBadges(data, polarity.partialCharges, centroid);
    this.renderBondDipoleArrows(data, polarity.bondDipoles, centroid);
    this.renderNetDipoleArrow(polarity, centroid);
  }

  private renderPartialChargeBadges(
    data: MoleculeData,
    partialCharges: readonly AtomPartialCharge[],
    centroid: THREE.Vector3,
  ): void {
    for (const pc of partialCharges) {
      if (pc.sign === 'neutral') continue;

      const atom = data.atoms[pc.atomIndex];
      const atomPos = new THREE.Vector3(...atom.position);
      const outward =
        atomPos.distanceToSquared(centroid) < 1e-6
          ? UP_AXIS.clone()
          : atomPos.clone().sub(centroid).normalize();

      const sprite =
        pc.sign === 'positive'
          ? this.createPillSprite('δ+', '#93c5fd', 'rgba(96, 165, 250, 0.85)', 0.5)
          : this.createPillSprite('δ−', '#fca5a5', 'rgba(248, 113, 113, 0.85)', 0.5);

      sprite.position.copy(atomPos).addScaledVector(outward, atom.radius + 0.28);
      sprite.userData = { isDipole: true };
      this.dipolesGroup.add(sprite);
    }
  }

  private computeBondLateralVector(
    mid: THREE.Vector3,
    dir: THREE.Vector3,
    centroid: THREE.Vector3,
  ): THREE.Vector3 {
    const radial = new THREE.Vector3().subVectors(mid, centroid);
    radial.addScaledVector(dir, -radial.dot(dir));
    return radial.lengthSq() > 1e-5 ? radial.normalize() : this.getDefaultPerpendicular(dir);
  }

  private addDipoleArrow(opts: DipoleArrowOptions): THREE.Vector3 {
    const {
      center,
      dir,
      crossAxis,
      totalLen,
      shaftRadius,
      headRadius,
      headLen,
      crossbarRadius,
      crossbarLen,
      color,
      emissive,
      emissiveIntensity,
    } = opts;

    const createArrowMaterial = () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity,
        roughness: 0.25,
        metalness: 0.15,
      });

    const dirQuat = new THREE.Quaternion().setFromUnitVectors(UP_AXIS, dir);
    const tail = center.clone().addScaledVector(dir, -totalLen * 0.5);
    const tip = center.clone().addScaledVector(dir, totalLen * 0.5);
    const shaftLen = Math.max(0.05, totalLen - headLen);

    const shaftMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 16),
      createArrowMaterial(),
    );
    shaftMesh.position.copy(center).addScaledVector(dir, -headLen * 0.5);
    shaftMesh.quaternion.copy(dirQuat);
    shaftMesh.userData = { isDipole: true };
    this.dipolesGroup.add(shaftMesh);

    const headMesh = new THREE.Mesh(
      new THREE.ConeGeometry(headRadius, headLen, 16),
      createArrowMaterial(),
    );
    headMesh.position.copy(tip).addScaledVector(dir, -headLen * 0.5);
    headMesh.quaternion.copy(dirQuat);
    headMesh.userData = { isDipole: true };
    this.dipolesGroup.add(headMesh);

    const crossbarMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(crossbarRadius, crossbarRadius, crossbarLen, 16),
      createArrowMaterial(),
    );
    crossbarMesh.position.copy(tail).addScaledVector(dir, crossbarLen * 0.6);
    crossbarMesh.quaternion.setFromUnitVectors(UP_AXIS, crossAxis);
    crossbarMesh.userData = { isDipole: true };
    this.dipolesGroup.add(crossbarMesh);

    return tip;
  }

  private renderBondDipoleArrows(
    data: MoleculeData,
    bondDipoles: readonly BondDipole[],
    centroid: THREE.Vector3,
  ): void {
    for (const bd of bondDipoles) {
      const posStart = new THREE.Vector3(...data.atoms[bd.positiveAtomIndex].position);
      const posEnd = new THREE.Vector3(...data.atoms[bd.negativeAtomIndex].position);
      const mid = new THREE.Vector3().addVectors(posStart, posEnd).multiplyScalar(0.5);
      const bondDist = posStart.distanceTo(posEnd);
      const dir = new THREE.Vector3(...bd.direction).normalize();
      const lateral = this.computeBondLateralVector(mid, dir, centroid);
      const totalLen = THREE.MathUtils.clamp(
        0.45 + bd.deltaChi * 0.25,
        0.52,
        Math.max(0.55, bondDist * 0.82),
      );

      this.addDipoleArrow({
        center: mid.clone().addScaledVector(lateral, 0.28),
        dir,
        crossAxis: lateral,
        totalLen,
        shaftRadius: 0.022,
        headRadius: 0.062,
        headLen: 0.16,
        crossbarRadius: 0.02,
        crossbarLen: 0.15,
        color: 0x2dd4bf,
        emissive: 0x0d9488,
        emissiveIntensity: 0.35,
      });
    }
  }

  private renderNetDipoleArrow(polarity: MolecularPolarityResult, centroid: THREE.Vector3): void {
    if (!polarity.isPolar) return;

    const netDir = new THREE.Vector3(...polarity.netDipoleVector).normalize();
    const netLen = THREE.MathUtils.clamp(0.95 + polarity.netDipoleMagnitude * 0.5, 1.15, 2.2);
    const netTip = this.addDipoleArrow({
      center: centroid.clone().addScaledVector(netDir, netLen * 0.15),
      dir: netDir,
      crossAxis: this.getDefaultPerpendicular(netDir),
      totalLen: netLen,
      shaftRadius: 0.044,
      headRadius: 0.115,
      headLen: 0.28,
      crossbarRadius: 0.036,
      crossbarLen: 0.24,
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
    });

    const muSprite = this.createPillSprite('μ', '#fde047', 'rgba(250, 204, 21, 0.9)', 0.46);
    muSprite.position.copy(netTip).addScaledVector(netDir, 0.22);
    muSprite.userData = { isDipole: true };
    this.dipolesGroup.add(muSprite);
  }

  private frameCameraToMolecule(data: MoleculeData): void {
    const box = new THREE.Box3();
    for (const atom of data.atoms) {
      const pos = new THREE.Vector3(...atom.position);
      box.expandByPoint(pos.clone().addScalar(atom.radius));
      box.expandByPoint(pos.clone().subScalar(atom.radius));
    }
    for (const lobe of data.hybrid_lobes) {
      const pos = new THREE.Vector3(...lobe.position);
      box.expandByPoint(pos.clone().addScalar(0.45));
      box.expandByPoint(pos.clone().subScalar(0.45));
    }

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    this.defaultTarget.copy(sphere.center);
    this.controls.target.copy(this.defaultTarget);

    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = Math.max(this.camera.aspect, 0.1);
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const distV = sphere.radius / Math.sin(fov / 2);
    const distH = sphere.radius / Math.sin(fovH / 2);
    const distance = Math.max(distV, distH) * 1.35;

    this.defaultCameraPos.set(
      this.defaultTarget.x,
      this.defaultTarget.y,
      this.defaultTarget.z + distance,
    );
    this.camera.position.copy(this.defaultCameraPos);
    this.camera.lookAt(this.defaultTarget);
    this.controls.update();
    if (this.gizmo) {
      this.gizmo.update();
    }
  }

  private getAdjacentPositions(
    bond: MoleculeBond,
    otherBond: MoleculeBond,
    data: MoleculeData,
    start: THREE.Vector3,
    end: THREE.Vector3,
  ): { otherPos: THREE.Vector3; refPos: THREE.Vector3 } | null {
    if (otherBond.fromIndex === bond.fromIndex && otherBond.toIndex !== bond.toIndex) {
      return { otherPos: new THREE.Vector3(...data.atoms[otherBond.toIndex].position), refPos: start };
    }
    if (otherBond.toIndex === bond.fromIndex && otherBond.fromIndex !== bond.toIndex) {
      return { otherPos: new THREE.Vector3(...data.atoms[otherBond.fromIndex].position), refPos: start };
    }
    if (otherBond.fromIndex === bond.toIndex && otherBond.toIndex !== bond.fromIndex) {
      return { otherPos: new THREE.Vector3(...data.atoms[otherBond.toIndex].position), refPos: end };
    }
    if (otherBond.toIndex === bond.toIndex && otherBond.fromIndex !== bond.fromIndex) {
      return { otherPos: new THREE.Vector3(...data.atoms[otherBond.fromIndex].position), refPos: end };
    }
    return null;
  }

  private findAdjacentPlaneNormal(
    bond: MoleculeBond,
    data: MoleculeData,
    dir: THREE.Vector3,
    start: THREE.Vector3,
    end: THREE.Vector3,
  ): THREE.Vector3 | null {
    for (const otherBond of data.bonds) {
      const pair = this.getAdjacentPositions(bond, otherBond, data, start, end);
      if (!pair) continue;
      const v = new THREE.Vector3().subVectors(pair.otherPos, pair.refPos);
      const planeNormal = new THREE.Vector3().crossVectors(dir, v);
      if (planeNormal.lengthSq() > 1e-4) {
        return planeNormal.normalize();
      }
    }
    return null;
  }

  private getDefaultPerpendicular(dir: THREE.Vector3): THREE.Vector3 {
    let perp = new THREE.Vector3().crossVectors(dir, Z_AXIS);
    if (perp.lengthSq() < 1e-4) {
      perp = new THREE.Vector3().crossVectors(dir, UP_AXIS);
    }
    return perp.normalize();
  }

  private getBondPerpendicularVector(
    bond: MoleculeBond,
    data: MoleculeData,
    dir: THREE.Vector3,
  ): THREE.Vector3 {
    const start = new THREE.Vector3(...data.atoms[bond.fromIndex].position);
    const end = new THREE.Vector3(...data.atoms[bond.toIndex].position);
    const planeNormal = this.findAdjacentPlaneNormal(bond, data, dir, start, end);

    if (planeNormal) {
      return new THREE.Vector3().crossVectors(planeNormal, dir).normalize();
    }
    return this.getDefaultPerpendicular(dir);
  }

  private createCylinderBond(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    colorHex: number,
    group: THREE.Group,
  ): void {
    const distance = start.distanceTo(end);
    const geometry = new THREE.CylinderGeometry(radius, radius, distance, 16);
    const material = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.3,
      metalness: 0.2,
    });
    const cylinder = new THREE.Mesh(geometry, material);

    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    cylinder.position.copy(midPoint);

    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    cylinder.quaternion.setFromUnitVectors(UP_AXIS, dir);

    group.add(cylinder);
  }

  private createTeardropLobe(color: THREE.Color, opacity: number, scale: number): THREE.Mesh {
    // The base radius must stay below the central atom radius, otherwise the
    // lobe engulfs the nucleus and hides the atom it belongs to.
    const radius = 0.52 * scale;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const u = y / radius;
      const yFactor = 0.825 + 0.575 * u;
      const xzFactor = 0.65 + 0.35 * u;

      pos.setXYZ(i, x * xzFactor, y * yFactor, z * xzFactor);
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.12,
      metalness: 0.05,
      transmission: 0.55,
      thickness: 1.2,
      ior: 1.3,
      opacity,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
  }

  private buildAtomNeighbors(data: MoleculeData): number[][] {
    const neighbors: number[][] = data.atoms.map(() => []);
    for (const bond of data.bonds) {
      if (!neighbors[bond.fromIndex].includes(bond.toIndex)) {
        neighbors[bond.fromIndex].push(bond.toIndex);
      }
      if (!neighbors[bond.toIndex].includes(bond.fromIndex)) {
        neighbors[bond.toIndex].push(bond.fromIndex);
      }
    }
    return neighbors;
  }

  private isAdjacentAngleExcluded(dataId: string, neighborCount: number, thetaDeg: number): boolean {
    return neighborCount > 2 && thetaDeg > 175 && (dataId === 'PCl5' || dataId === 'SF6' || dataId === 'XeF4');
  }

  private findCandidateAnglePairs(
    centerPos: THREE.Vector3,
    nList: number[],
    data: MoleculeData,
  ): AngleCandidatePair[] {
    const pairs: AngleCandidatePair[] = [];

    for (let i = 0; i < nList.length; i++) {
      for (let j = i + 1; j < nList.length; j++) {
        const idx1 = nList[i];
        const idx2 = nList[j];
        const v1 = new THREE.Vector3(...data.atoms[idx1].position).sub(centerPos);
        const v2 = new THREE.Vector3(...data.atoms[idx2].position).sub(centerPos);
        const v1Len = v1.length();
        const v2Len = v2.length();
        if (v1Len < 1e-4 || v2Len < 1e-4) continue;

        const u1 = v1.clone().normalize();
        const u2 = v2.clone().normalize();
        const dot = THREE.MathUtils.clamp(u1.dot(u2), -1, 1);
        const theta = Math.acos(dot);
        const thetaDeg = theta * (180 / Math.PI);

        if (thetaDeg < 10) continue;
        if (this.isAdjacentAngleExcluded(data.id, nList.length, thetaDeg)) {
          continue;
        }

        pairs.push({ idx1, idx2, theta, thetaDeg, u1, u2, v1Len, v2Len });
      }
    }

    pairs.sort((a, b) => a.thetaDeg - b.thetaDeg);
    return pairs;
  }

  private selectAnglePairs(pairs: AngleCandidatePair[], neighborCount: number): AngleCandidatePair[] {
    const selectedPairs: AngleCandidatePair[] = [];
    const angleCountMap = new Map<number, number>();
    const maxForAngle = neighborCount <= 4 ? 6 : 4;

    for (const pair of pairs) {
      const roundedAngle = Math.round(pair.thetaDeg);
      const count = angleCountMap.get(roundedAngle) ?? 0;
      if (count < maxForAngle) {
        selectedPairs.push(pair);
        angleCountMap.set(roundedAngle, count + 1);
      }
    }

    return selectedPairs;
  }

  private createBondAngles(data: MoleculeData): void {
    const neighbors = this.buildAtomNeighbors(data);
    const hasAromatic = data.bonds.some((b) => b.type === 'aromatic');

    data.atoms.forEach((atom, centerIdx) => {
      if (hasAromatic && centerIdx !== 0) return;
      const nList = neighbors[centerIdx];
      if (nList.length < 2) return;

      const centerPos = new THREE.Vector3(...atom.position);
      const pairs = this.findCandidateAnglePairs(centerPos, nList, data);
      const selectedPairs = this.selectAnglePairs(pairs, nList.length);

      for (const pair of selectedPairs) {
        this.renderAngleArcAndLabel(centerPos, atom.radius, pair);
      }
    });
  }

  private renderAngleArcAndLabel(
    centerPos: THREE.Vector3,
    centerRadius: number,
    pair: {
      theta: number;
      thetaDeg: number;
      u1: THREE.Vector3;
      u2: THREE.Vector3;
      v1Len: number;
      v2Len: number;
    },
  ): void {
    const { theta, thetaDeg, u1, u2, v1Len, v2Len } = pair;

    const minBondLen = Math.min(v1Len, v2Len);
    const radius = Math.max(centerRadius + 0.16, Math.min(minBondLen * 0.75, centerRadius + 0.28));

    const e1 = u1.clone();
    const w = u2.clone().addScaledVector(u1, -u1.dot(u2));
    let e2: THREE.Vector3;
    if (w.lengthSq() < 1e-5) {
      const perp = Math.abs(u1.y) < 0.9 ? UP_AXIS.clone() : new THREE.Vector3(1, 0, 0);
      e2 = perp.addScaledVector(u1, -u1.dot(perp)).normalize();
    } else {
      e2 = w.normalize();
    }

    const segments = 24;
    const curvePoints: THREE.Vector3[] = [];
    for (let s = 0; s <= segments; s++) {
      const phi = (s / segments) * theta;
      const pt = centerPos
        .clone()
        .addScaledVector(e1, radius * Math.cos(phi))
        .addScaledVector(e2, radius * Math.sin(phi));
      curvePoints.push(pt);
    }

    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const tubeGeom = new THREE.TubeGeometry(curve, 24, 0.016, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.1,
    });
    const arcMesh = new THREE.Mesh(tubeGeom, tubeMat);
    this.anglesGroup.add(arcMesh);

    const midPhi = theta / 2;
    const midDir = new THREE.Vector3()
      .addScaledVector(e1, Math.cos(midPhi))
      .addScaledVector(e2, Math.sin(midPhi))
      .normalize();
    const labelPos = centerPos.clone().addScaledVector(midDir, radius + 0.32);

    const rounded = Math.round(thetaDeg * 10) / 10;
    const labelText = `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}°`;

    const sprite = this.createAngleTextSprite(labelText);
    sprite.position.copy(labelPos);
    this.anglesGroup.add(sprite);
  }

  private createAngleTextSprite(text: string): THREE.Sprite {
    return this.createPillSprite(text, '#67e8f9', 'rgba(56, 189, 248, 0.75)', 0.65);
  }

  private createPillSprite(
    text: string,
    textColor: string,
    strokeColor: string,
    widthScale: number,
  ): THREE.Sprite {
    const heightScale = 0.325;
    const canvas = document.createElement('canvas');
    canvas.height = 128;
    canvas.width = Math.round(128 * (widthScale / heightScale));
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width - 76;
    const h = 64;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    const r = 20;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();

    ctx.fillStyle = 'rgba(10, 15, 30, 0.88)';
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(widthScale, heightScale, 1);
    sprite.renderOrder = 100;
    return sprite;
  }

  public toggleLobes(visible?: boolean): boolean {
    this.showLobes = visible ?? !this.showLobes;
    this.lobesGroup.visible = this.showLobes;
    return this.showLobes;
  }

  public toggleAngles(visible?: boolean): boolean {
    this.showAngles = visible ?? !this.showAngles;
    this.anglesGroup.visible = this.showAngles;
    return this.showAngles;
  }

  public togglePiBonds(visible?: boolean): boolean {
    this.showPiBonds = visible ?? !this.showPiBonds;
    this.piGroup.visible = this.showPiBonds;
    return this.showPiBonds;
  }

  public toggleDipoles(visible?: boolean): boolean {
    this.showDipoles = visible ?? !this.showDipoles;
    this.dipolesGroup.visible = this.showDipoles;
    return this.showDipoles;
  }

  private disposeGroupObject(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) {
          m.dispose();
        }
      } else {
        (obj.material as THREE.Material).dispose();
      }
    } else if (obj instanceof THREE.Sprite) {
      obj.geometry.dispose();
      if (obj.material.map) {
        obj.material.map.dispose();
      }
      obj.material.dispose();
    }
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const obj = group.children[group.children.length - 1];
      group.remove(obj);
      this.disposeGroupObject(obj);
    }
  }

  public clear(): void {
    this.clearGroup(this.moleculeGroup);
    this.clearGroup(this.lobesGroup);
    this.clearGroup(this.anglesGroup);
    this.clearGroup(this.piGroup);
    this.clearGroup(this.dipolesGroup);
  }

  protected override cleanupScene(): void {
    this.renderer.domElement.removeEventListener('click', this.onMouseClick);
    this.clear();
  }

  private collectPickableObjects(): THREE.Object3D[] {
    const groups = [this.moleculeGroup, this.lobesGroup, this.piGroup, this.dipolesGroup];
    return groups
      .filter((group) => group.visible)
      .flatMap((group) => group.children.filter((obj) => obj.visible));
  }

  private dispatchHit(userData: Record<string, unknown>): void {
    if (userData.isDipole) {
      this.onDipoleClick?.();
    } else if (userData.isPiBond) {
      this.onPiBondClick?.();
    } else if (userData.isLobe) {
      this.onLobeClick?.(userData.lobeType as 'bonding' | 'lone_pair');
    } else if (userData.isAtom) {
      this.onAtomClick?.(userData.symbol as string);
    }
  }

  private readonly onMouseClick = (event: MouseEvent): void => {
    if (!this.isAnimating) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.collectPickableObjects(), false);
    if (intersects.length > 0) {
      this.dispatchHit(intersects[0].object.userData as Record<string, unknown>);
    }
  };
}
