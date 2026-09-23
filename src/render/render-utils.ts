import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
