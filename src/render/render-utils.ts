import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OrientationGizmo } from './orientation-gizmo';

export type RendererTarget =
  | HTMLCanvasElement
  | THREE.WebGLRenderer
  | { canvas?: HTMLCanvasElement; renderer: THREE.WebGLRenderer };

export interface ResolvedRenderer {
  renderer: THREE.WebGLRenderer;
  isShared: boolean;
}

export function initRendererTarget(target: RendererTarget, clearColorHex: string = '#0a0a1a'): ResolvedRenderer {
  const isShared = target instanceof THREE.WebGLRenderer || 'renderer' in target;
  if (target instanceof THREE.WebGLRenderer) {
    return { renderer: target, isShared };
  }
  if ('renderer' in target) {
    return { renderer: target.renderer, isShared };
  }
  const renderer = new THREE.WebGLRenderer({
    canvas: target,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    precision: 'highp',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
  renderer.setClearColor(new THREE.Color(clearColorHex));
  return { renderer, isShared };
}

export interface CameraAnimationOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  targetPos: THREE.Vector3;
  targetUp?: THREE.Vector3;
  targetLookAt?: THREE.Vector3;
  duration?: number;
  onUpdate?: () => void;
}

export function runCameraAnimation(options: CameraAnimationOptions): number {
  const {
    camera,
    controls,
    targetPos,
    targetUp = new THREE.Vector3(0, 1, 0),
    targetLookAt,
    duration = 400,
    onUpdate,
  } = options;

  const startPos = camera.position.clone();
  const startUp = camera.up.clone();
  const startTarget = controls.target.clone();
  const endTarget = targetLookAt ? targetLookAt.clone() : startTarget.clone();
  const startTime = performance.now();

  let transitionId = 0;

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1.0);
    const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(startPos, targetPos, ease);
    camera.up.lerpVectors(startUp, targetUp, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    camera.lookAt(controls.target);
    controls.update();

    if (onUpdate) onUpdate();

    if (progress < 1.0) {
      transitionId = requestAnimationFrame(step);
    }
  };

  transitionId = requestAnimationFrame(step);
  return transitionId;
}

export function setCameraInstant(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  targetPos: THREE.Vector3,
  targetUp: THREE.Vector3,
  targetLookAt?: THREE.Vector3,
  onUpdate?: () => void
): void {
  camera.position.copy(targetPos);
  camera.up.copy(targetUp);
  if (targetLookAt) {
    controls.target.copy(targetLookAt);
  }
  camera.lookAt(controls.target);
  controls.update();
  if (onUpdate) onUpdate();
}

export interface SnapshotOptions {
  width: number;
  height: number;
  superSampling: number;
  format: 'image/png' | 'image/jpeg' | 'image/webp';
  background: 'dark' | 'black' | 'white' | 'transparent';
}


export function captureWebGLSnapshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  options: SnapshotOptions,
  onRestore: () => void
): string {
  const origPixelRatio = renderer.getPixelRatio();
  const origClearColor = new THREE.Color();
  renderer.getClearColor(origClearColor);
  const origClearAlpha = renderer.getClearAlpha();

  const targetWidth = Math.round(options.width);
  const targetHeight = Math.round(options.height);

  renderer.setPixelRatio(options.superSampling);
  renderer.setSize(targetWidth, targetHeight, false);

  camera.aspect = targetWidth / targetHeight;
  camera.updateProjectionMatrix();

  if (options.background === 'black') {
    renderer.setClearColor(0x000000, 1.0);
  } else if (options.background === 'white') {
    renderer.setClearColor(0xffffff, 1.0);
  } else if (options.background === 'transparent') {
    renderer.setClearColor(0x000000, 0.0);
  } else {
    renderer.setClearColor(0x0a0a1a, 1.0);
  }

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL(options.format, 0.95);

  renderer.setPixelRatio(origPixelRatio);
  renderer.setClearColor(origClearColor, origClearAlpha);
  onRestore();

  return dataUrl;
}

export abstract class BaseThreeRenderer {
  protected readonly renderer: THREE.WebGLRenderer;
  protected readonly scene: THREE.Scene;
  protected readonly camera: THREE.PerspectiveCamera;
  protected readonly controls: OrbitControls;
  protected readonly isShared: boolean;
  protected autoRotate: boolean = false;
  protected autoRotateSpeed: number = 2.0;
  protected minAlignDistance: number = 2.0;
  protected defaultCameraPos: THREE.Vector3;
  protected defaultTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  protected gizmo: OrientationGizmo | null = null;
  protected isAnimating: boolean = false;
  private animationId: number = 0;
  private cameraTransitionId: number = 0;

  constructor(target: RendererTarget, initialCameraPos: THREE.Vector3, clearColorHex: string = '#0a0a1a') {
    const { renderer, isShared } = initRendererTarget(target, clearColorHex);
    this.renderer = renderer;
    this.isShared = isShared;
    this.defaultCameraPos = initialCameraPos.clone();

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.copy(initialCameraPos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    if (!this.isShared) {
      window.addEventListener('resize', this.onWindowResize);
    }
    this.onWindowResize();
  }

  protected getEffectivePixelRatio(): number {
    return Math.min(window.devicePixelRatio, 2.0);
  }

  public readonly onWindowResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.getEffectivePixelRatio());
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
    this.autoRotate = enabled ?? !this.autoRotate;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = this.autoRotateSpeed;
    return this.autoRotate;
  }

  public isAutoRotating(): boolean {
    return this.autoRotate;
  }

  public resetCamera(): void {
    this.animateCameraTo(this.defaultCameraPos.clone(), new THREE.Vector3(0, 1, 0), this.defaultTarget.clone(), 450);
  }

  public resetCameraInstant(): void {
    this.camera.position.copy(this.defaultCameraPos);
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(this.defaultTarget);
    this.controls.update();
    if (this.gizmo) this.gizmo.update();
  }

  public alignCameraTo(dir: THREE.Vector3, up: THREE.Vector3): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const targetPos = this.controls.target.clone().addScaledVector(dir, Math.max(dist, this.minAlignDistance));
    this.animateCameraTo(targetPos, up, this.controls.target.clone(), 400);
  }

  public alignCameraToInstant(dir: THREE.Vector3, up: THREE.Vector3): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const targetPos = this.controls.target.clone().addScaledVector(dir, Math.max(dist, this.minAlignDistance));
    setCameraInstant(this.camera, this.controls, targetPos, up, undefined, () => this.gizmo?.update());
  }

  public animateCameraTo(
    targetPos: THREE.Vector3,
    targetUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
    targetLookAt?: THREE.Vector3,
    duration: number = 400
  ): void {
    cancelAnimationFrame(this.cameraTransitionId);
    this.cameraTransitionId = runCameraAnimation({
      camera: this.camera,
      controls: this.controls,
      targetPos,
      targetUp,
      targetLookAt,
      duration,
      onUpdate: () => this.gizmo?.update(),
    });
  }

  public start(): void {
    this.controls.enabled = true;
    if (!this.isAnimating) {
      this.isAnimating = true;
      cancelAnimationFrame(this.animationId);
      this.animate();
    }
  }

  public stop(): void {
    this.controls.enabled = false;
    this.isAnimating = false;
    cancelAnimationFrame(this.animationId);
  }

  public readonly animate = (): void => {
    if (!this.isAnimating) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();

    if (this.gizmo) {
      this.gizmo.update();
    }

    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    cancelAnimationFrame(this.cameraTransitionId);
    window.removeEventListener('resize', this.onWindowResize);
    this.cleanupScene();
    this.controls.dispose();
    if (!this.isShared) {
      this.renderer.dispose();
    }
  }

  protected abstract cleanupScene(): void;
}
