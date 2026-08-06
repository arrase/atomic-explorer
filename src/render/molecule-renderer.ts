import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

  private moleculeGroup: THREE.Group;
  private lobesGroup: THREE.Group;

  private showLobes: boolean = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
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

    this.scene.add(this.moleculeGroup);
    this.scene.add(this.lobesGroup);

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

    // 1. Render Atoms
    data.atoms.forEach((atom) => {
      const geometry = new THREE.SphereGeometry(atom.radius, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(atom.color),
        roughness: 0.2,
        metalness: 0.3,
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(...atom.position);
      this.moleculeGroup.add(sphere);
    });

    // 2. Render Bonds
    data.bonds.forEach((bond) => {
      const start = new THREE.Vector3(...data.atoms[bond.fromIndex].position);
      const end = new THREE.Vector3(...data.atoms[bond.toIndex].position);

      if (bond.type === 'single') {
        this.createCylinderBond(start, end, 0.12, 0x888888);
      } else if (bond.type === 'double') {
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(0.12);
        this.createCylinderBond(start.clone().add(perp), end.clone().add(perp), 0.08, 0x888888);
        this.createCylinderBond(start.clone().sub(perp), end.clone().sub(perp), 0.08, 0x888888);
      } else if (bond.type === 'triple') {
        this.createCylinderBond(start, end, 0.08, 0x888888);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(0.16);
        this.createCylinderBond(start.clone().add(perp), end.clone().add(perp), 0.07, 0x888888);
        this.createCylinderBond(start.clone().sub(perp), end.clone().sub(perp), 0.07, 0x888888);
      }
    });

    // 3. Render Hybrid Orbital Lobes
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

      this.lobesGroup.add(lobeMesh);
    });

    this.lobesGroup.visible = this.showLobes;
  }

  private createCylinderBond(start: THREE.Vector3, end: THREE.Vector3, radius: number, colorHex: number): void {
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

    this.moleculeGroup.add(cylinder);
  }

  private createTeardropLobe(color: THREE.Color, opacity: number, scale: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.7 * scale, 32, 32);
    // Deform sphere to create orbital lobe shape
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      let x = pos.getX(i);
      let z = pos.getZ(i);

      // Teardrop stretch along +y
      if (y > 0) {
        y *= 1.4;
        x *= (1.0 - y * 0.15);
        z *= (1.0 - y * 0.15);
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

  public toggleLobes(visible?: boolean): boolean {
    this.showLobes = visible ?? !this.showLobes;
    this.lobesGroup.visible = this.showLobes;
    return this.showLobes;
  }

  public clear(): void {
    while (this.moleculeGroup.children.length > 0) {
      const obj = this.moleculeGroup.children.pop()!;
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
    while (this.lobesGroup.children.length > 0) {
      const obj = this.lobesGroup.children.pop()!;
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
  }

  private onWindowResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();

    this.moleculeGroup.rotation.y += 0.003;
    this.lobesGroup.rotation.y += 0.003;

    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
