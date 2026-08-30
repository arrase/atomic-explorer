import * as THREE from 'three';

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
