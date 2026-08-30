import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { captureWebGLSnapshot, SnapshotOptions } from './render-utils';
import { OrientationGizmo } from './orientation-gizmo';

export interface MoleculeAtom {
  symbol: string;
  position: [number, number, number];
  color: string;
  radius: number;
}

export interface MoleculeBond {
  fromIndex: number;
  toIndex: number;
  type: 'single' | 'double' | 'triple';
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
  name: string;
  formula: string;
  geometry: string;
  hybridization: string;
  bond_angle: string;
  description: string;
  atoms: MoleculeAtom[];
  bonds: MoleculeBond[];
  hybrid_lobes: HybridLobe[];
}

export class MoleculeRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private animationId: number = 0;
  private cameraTransitionId: number = 0;
  private autoRotate: boolean = false;
  private gizmo: OrientationGizmo | null = null;
  private defaultCameraPos = new THREE.Vector3(0, 0, 10);

  private moleculeGroup: THREE.Group;
  private lobesGroup: THREE.Group;
  private anglesGroup: THREE.Group;

  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  public onLobeClick?: (type: 'bonding' | 'lone_pair') => void;
  public onAtomClick?: (symbol: string) => void;

  private showLobes: boolean = true;
  private showAngles: boolean = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(new THREE.Color('#0a0a1a'));

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 10);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.moleculeGroup = new THREE.Group();
    this.lobesGroup = new THREE.Group();
    this.anglesGroup = new THREE.Group();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.renderer.domElement.addEventListener('click', this.onMouseClick);

    this.scene.add(this.moleculeGroup);
    this.scene.add(this.lobesGroup);
    this.scene.add(this.anglesGroup);

    this.setupLighting();
    window.addEventListener('resize', this.onWindowResize);
    this.onWindowResize();
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

    data.atoms.forEach((atom) => {
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
    });

    data.bonds.forEach((bond) => {
      const start = new THREE.Vector3(...data.atoms[bond.fromIndex].position);
      const end = new THREE.Vector3(...data.atoms[bond.toIndex].position);

      if (bond.type === 'single') {
        this.createCylinderBond(start, end, 0.12, 0x888888, this.moleculeGroup);
      } else if (bond.type === 'double') {
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const perp = this.getPerpendicularVector(dir).multiplyScalar(0.12);
        this.createCylinderBond(start.clone().add(perp), end.clone().add(perp), 0.08, 0x888888, this.moleculeGroup);
        this.createCylinderBond(start.clone().sub(perp), end.clone().sub(perp), 0.08, 0x888888, this.moleculeGroup);
      } else if (bond.type === 'triple') {
        this.createCylinderBond(start, end, 0.08, 0x888888, this.moleculeGroup);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const perp = this.getPerpendicularVector(dir).multiplyScalar(0.16);
        this.createCylinderBond(start.clone().add(perp), end.clone().add(perp), 0.07, 0x888888, this.moleculeGroup);
        this.createCylinderBond(start.clone().sub(perp), end.clone().sub(perp), 0.07, 0x888888, this.moleculeGroup);
      }
    });

    data.hybrid_lobes.forEach((lobe) => {
      const lobeMesh = this.createTeardropLobe(
        new THREE.Color(lobe.color),
        lobe.type === 'lone_pair' ? 0.75 : 0.65,
        lobe.scale
      );
      lobeMesh.position.set(...lobe.position);

      const dir = new THREE.Vector3(...lobe.direction).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
      lobeMesh.quaternion.copy(quaternion);
      lobeMesh.userData = { isLobe: true, lobeType: lobe.type };

      this.lobesGroup.add(lobeMesh);
    });

    this.createBondAngles(data);
    this.toggleLobes(this.showLobes);
    this.toggleAngles(this.showAngles);
  }

  private getPerpendicularVector(dir: THREE.Vector3): THREE.Vector3 {
    let perp = new THREE.Vector3(1, 0, 0).cross(dir);
    if (perp.lengthSq() < 0.001) {
      perp = new THREE.Vector3(0, 1, 0).cross(dir);
    }
    return perp.normalize();
  }

  private createCylinderBond(start: THREE.Vector3, end: THREE.Vector3, radius: number, colorHex: number, group: THREE.Group): void {
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
    const up = new THREE.Vector3(0, 1, 0);
    cylinder.quaternion.setFromUnitVectors(up, dir);

    group.add(cylinder);
  }

  private createTeardropLobe(color: THREE.Color, opacity: number, scale: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.7 * scale, 32, 32);
    // Deform sphere to create orbital lobe shape
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      let x = pos.getX(i);
      let z = pos.getZ(i);

      // Teardrop stretch along +y: elongate the lobe in +y direction
      // and taper the cross-section proportionally to simulate the
      // asymmetric pear shape of hybrid sp/sp2/sp3 orbital lobes.
      if (y > 0) {
        const ELONGATION_FACTOR = 1.4;
        const TAPER_RATE = 0.15;
        y *= ELONGATION_FACTOR;
        x *= (1.0 - y * TAPER_RATE);
        z *= (1.0 - y * TAPER_RATE);
      } else {
        const MINOR_SCALE = 0.25;
        y *= MINOR_SCALE;
        x *= MINOR_SCALE;
        z *= MINOR_SCALE;
      }
      pos.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.4,
      opacity,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
  }

  private createBondAngles(data: MoleculeData): void {
    const neighbors: number[][] = data.atoms.map(() => []);
    data.bonds.forEach((bond) => {
      if (!neighbors[bond.fromIndex].includes(bond.toIndex)) {
        neighbors[bond.fromIndex].push(bond.toIndex);
      }
      if (!neighbors[bond.toIndex].includes(bond.fromIndex)) {
        neighbors[bond.toIndex].push(bond.fromIndex);
      }
    });

    data.atoms.forEach((atom, centerIdx) => {
      const nList = neighbors[centerIdx];
      if (nList.length < 2) return;

      const centerPos = new THREE.Vector3(...atom.position);

      interface CandidatePair {
        idx1: number;
        idx2: number;
        theta: number;
        thetaDeg: number;
        u1: THREE.Vector3;
        u2: THREE.Vector3;
        v1Len: number;
        v2Len: number;
      }

      const pairs: CandidatePair[] = [];

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
          if (nList.length > 2 && thetaDeg > 175 && (data.id === 'PCl5' || data.id === 'SF6' || data.id === 'XeF4')) {
            // In highly coordinated symmetric systems, prioritize adjacent angles
            continue;
          }

          pairs.push({ idx1, idx2, theta, thetaDeg, u1, u2, v1Len, v2Len });
        }
      }

      pairs.sort((a, b) => a.thetaDeg - b.thetaDeg);

      const selectedPairs: CandidatePair[] = [];
      const angleCountMap = new Map<number, number>();

      for (const pair of pairs) {
        const roundedAngle = Math.round(pair.thetaDeg);
        const count = angleCountMap.get(roundedAngle) || 0;
        const maxForAngle = nList.length <= 4 ? 6 : 4;
        if (count < maxForAngle) {
          selectedPairs.push(pair);
          angleCountMap.set(roundedAngle, count + 1);
        }
      }

      selectedPairs.forEach((pair) => {
        this.renderAngleArcAndLabel(centerPos, pair);
      });
    });
  }

  private renderAngleArcAndLabel(
    centerPos: THREE.Vector3,
    pair: {
      theta: number;
      thetaDeg: number;
      u1: THREE.Vector3;
      u2: THREE.Vector3;
      v1Len: number;
      v2Len: number;
    }
  ): void {
    const { theta, thetaDeg, u1, u2, v1Len, v2Len } = pair;

    const minBondLen = Math.min(v1Len, v2Len);
    const radius = THREE.MathUtils.clamp(minBondLen * 0.42, 0.38, 0.62);

    const e1 = u1.clone();
    const w = u2.clone().addScaledVector(u1, -u1.dot(u2));
    let e2: THREE.Vector3;
    if (w.lengthSq() < 1e-5) {
      const perp = Math.abs(u1.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
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

    // Label Sprite
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
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = 180;
    const h = 64;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    const r = 20;

    // Universal rounded rectangle path
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

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#67e8f9';
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
    sprite.scale.set(0.65, 0.325, 1);
    sprite.renderOrder = 100;
    return sprite;
  }

  public toggleLobes(visible?: boolean): boolean {
    this.showLobes = visible === undefined ? !this.showLobes : visible;
    this.lobesGroup.visible = this.showLobes;
    return this.showLobes;
  }

  public toggleAngles(visible?: boolean): boolean {
    this.showAngles = visible === undefined ? !this.showAngles : visible;
    this.anglesGroup.visible = this.showAngles;
    return this.showAngles;
  }

  public isShowingAngles(): boolean {
    return this.showAngles;
  }

  public isShowingLobes(): boolean {
    return this.showLobes;
  }

  public clear(): void {
    const clearGroup = (group: THREE.Group) => {
      while (group.children.length > 0) {
        const obj = group.children[group.children.length - 1];
        group.remove(obj);
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
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
    };
    clearGroup(this.moleculeGroup);
    clearGroup(this.lobesGroup);
    clearGroup(this.anglesGroup);
  }

  private onWindowResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public async captureSnapshot(options: SnapshotOptions): Promise<string> {
    return captureWebGLSnapshot(this.renderer, this.scene, this.camera, options, this.onWindowResize);
  }

  public setGizmo(gizmo: OrientationGizmo | null): void {
    this.gizmo = gizmo;
    if (gizmo) {
      gizmo.setCamera(this.camera, (dir, up) => this.alignCameraTo(dir, up));
    }
  }

  public toggleAutoRotate(enabled?: boolean): boolean {
    this.autoRotate = enabled === undefined ? !this.autoRotate : enabled;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 2.0;
    return this.autoRotate;
  }

  public isAutoRotating(): boolean {
    return this.autoRotate;
  }

  public resetCamera(smooth: boolean = true): void {
    if (smooth) {
      this.animateCameraTo(this.defaultCameraPos.clone(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 450);
    } else {
      this.camera.position.copy(this.defaultCameraPos);
      this.camera.up.set(0, 1, 0);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      if (this.gizmo) this.gizmo.update();
    }
  }

  public alignCameraTo(dir: THREE.Vector3, up: THREE.Vector3, smooth: boolean = true): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const targetPos = this.controls.target.clone().addScaledVector(dir, Math.max(dist, 4.0));
    if (smooth) {
      this.animateCameraTo(targetPos, up, this.controls.target.clone(), 400);
    } else {
      this.camera.position.copy(targetPos);
      this.camera.up.copy(up);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
      if (this.gizmo) this.gizmo.update();
    }
  }

  public animateCameraTo(targetPos: THREE.Vector3, targetUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0), targetLookAt?: THREE.Vector3, duration: number = 400): void {
    cancelAnimationFrame(this.cameraTransitionId);
    const startPos = this.camera.position.clone();
    const startUp = this.camera.up.clone();
    const startTarget = this.controls.target.clone();
    const endTarget = targetLookAt ? targetLookAt.clone() : startTarget.clone();
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.camera.up.lerpVectors(startUp, targetUp, ease);
      this.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.camera.lookAt(this.controls.target);
      this.controls.update();

      if (this.gizmo) {
        this.gizmo.update();
      }

      if (progress < 1.0) {
        this.cameraTransitionId = requestAnimationFrame(step);
      }
    };

    this.cameraTransitionId = requestAnimationFrame(step);
  }

  private isAnimating: boolean = false;

  public start(): void {
    if (!this.isAnimating) {
      this.isAnimating = true;
      cancelAnimationFrame(this.animationId);
      this.animate();
    }
  }

  public stop(): void {
    this.isAnimating = false;
    cancelAnimationFrame(this.animationId);
  }

  public animate = (): void => {
    if (!this.isAnimating) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();

    if (this.gizmo) {
      this.gizmo.update();
    }

    this.renderer.render(this.scene, this.camera);
  };

  private onMouseClick = (event: MouseEvent): void => {
    if (!this.isAnimating) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const objectsToCheck = [...this.moleculeGroup.children, ...this.lobesGroup.children];
    const visibleObjects = objectsToCheck.filter(obj => obj.visible);

    const intersects = this.raycaster.intersectObjects(visibleObjects, false);
    if (intersects.length > 0) {
      const object = intersects[0].object;
      if (object.userData.isLobe && this.onLobeClick) {
        this.onLobeClick(object.userData.lobeType);
      } else if (object.userData.isAtom && this.onAtomClick) {
        this.onAtomClick(object.userData.symbol);
      }
    }
  };

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    cancelAnimationFrame(this.cameraTransitionId);
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.domElement.removeEventListener('click', this.onMouseClick);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
