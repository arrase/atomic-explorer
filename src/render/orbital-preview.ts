import * as THREE from 'three';
import { sampleOrbitalPoints, resolveOrbitalGeometry } from '../core/wasm-bridge';
import { ColorPalette, computeFrameDistance, createPointCloud, updatePointSizing } from './orbital-point-cloud';

export interface PreviewOrbital {
  n: number;
  l: number;
  m: number;
  useRealOrbital: boolean;
  zEff: number;
}

/**
 * Samples per preview cloud.
 *
 * The thumbnail is a couple of hundred pixels tall and rotates, so what matters
 * is that the lobes read as solid shapes and not that individual samples are
 * resolvable. This is well below the main viewer's "low" preset, and rejection
 * sampling spends most of its cost on candidates it throws away, so re-rendering
 * on every table click stays imperceptible.
 */
const PREVIEW_POINT_COUNT = 20_000;

/** Space left around the cloud, as a multiple of its frame radius. */
const PREVIEW_FRAME_MARGIN = 0.8;

const FOV = 32;

/** Off-axis view direction, so the cloud never sits in a pose the user has to reason about. */
const CAMERA_DIR = new THREE.Vector3(0.55, 0.3, 1).normalize();

/** Degrees per second the cloud turns at. */
const SPIN_DEG_PER_SEC = 18;

/**
 * A self-contained orbital thumbnail for the element inspector.
 *
 * It owns a second WebGL context on purpose. The main canvas is a viewport-sized
 * surface that the periodic-table tab hides, so a renderer drawing into it would
 * have to fight the orbital view for the drawing buffer, the camera and the
 * resize handling. A thumbnail is small enough to be worth its own context: it
 * draws a few thousand points and owns nothing but its canvas.
 *
 * The cloud itself comes from the shared `orbital-point-cloud` module, so the
 * thumbnail is the same Monte Carlo sample, the same density transfer function
 * and the same phase colours as the full orbital view. It is a smaller window
 * onto the same renderer, not a second, cheaper look at the wavefunction.
 */
export class OrbitalPreview {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
  /** Rotation is applied here, so the camera can stay where the framing put it. */
  private readonly pivot = new THREE.Group();
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly spinStep = (SPIN_DEG_PER_SEC * Math.PI) / 180 / 1000;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private resizeObserver: ResizeObserver | null = null;
  private points: THREE.Points | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private frameRadius = 1;
  private frameDistance = 1;
  private pointCount = 0;
  private updateToken = 0;
  private animationId = 0;
  private lastFrameTime = 0;
  private active = false;
  private inViewport = false;
  private mounted = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'orbital-preview-canvas';
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(new THREE.Color('#08090d'), 0);
    this.scene.add(this.pivot);

    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.inViewport = entries.some((entry) => entry.isIntersecting);
      this.syncAnimation();
    });
  }

  /**
   * Moves the canvas into `host`.
   *
   * The host is rebuilt from an HTML string on every selection change, so the
   * canvas is re-appended instead of re-created: a WebGL context belongs to the
   * element, so replacing the element would leak a context per click, and
   * browsers start dropping the oldest once they hit the per-page limit.
   */
  public mount(host: HTMLElement): void {
    host.appendChild(this.canvas);
    if (this.mounted) return;
    this.mounted = true;

    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(this.canvas);
    this.intersectionObserver.observe(this.canvas);
    this.syncSize();
    this.syncAnimation();
  }

  /**
   * Draws the valence cloud of one element.
   *
   * Both WASM round trips are async, so clicking quickly down a row of the table
   * can leave two updates in flight; the token drops the stale one, the same way
   * the main renderer keeps an out-of-date mode from landing on the canvas.
   */
  public async showOrbital(orbital: PreviewOrbital, palette: ColorPalette = 'default'): Promise<void> {
    const token = ++this.updateToken;
    const [{ frameRadius }, buffer] = await Promise.all([
      resolveOrbitalGeometry(orbital.n, orbital.l, orbital.zEff),
      sampleOrbitalPoints({ ...orbital, pointCount: PREVIEW_POINT_COUNT }),
    ]);
    if (token !== this.updateToken) return;

    this.clearPoints();
    if (buffer.length === 0) return;

    const { points, material, count } = createPointCloud(buffer, {
      contrast: 0,
      useRealOrbital: orbital.useRealOrbital,
      palette,
      frameRadius,
    });

    this.frameRadius = frameRadius;
    this.pointCount = count;
    this.material = material;
    this.points = points;
    this.pivot.add(points);

    this.syncSize();
    this.syncAnimation();
  }

  /**
   * Whether the preview is allowed to draw.
   *
   * The tab switch drives `active` and the viewport drives `inViewport`,
   * because a table cell can be selected while the whole tab is hidden, and
   * rotating something nobody can see is pure battery drain.
   */
  public setActive(active: boolean): void {
    this.active = active;
    this.syncAnimation();
  }

  public dispose(): void {
    this.updateToken++;
    this.setActive(false);
    this.resizeObserver?.disconnect();
    this.intersectionObserver.disconnect();
    this.clearPoints();
    this.renderer.dispose();
  }

  /** Refits the drawing buffer and the framing to the canvas' current box. */
  private syncSize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // A single fixed camera distance cannot serve this: a 1s is barely 1 a0
    // across while a 5f cloud reaches tens of a0, so one distance renders the
    // first as a dot and the second as fog that fills the box.
    this.frameDistance = computeFrameDistance(
      this.frameRadius,
      this.camera.fov,
      this.camera.aspect,
      PREVIEW_FRAME_MARGIN
    );
    this.camera.position.copy(CAMERA_DIR).multiplyScalar(this.frameDistance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    this.updateSizing();
  }

  private updateSizing(): void {
    if (!this.material) return;
    updatePointSizing(
      this.material,
      this.renderer,
      this.camera,
      this.frameDistance,
      this.pointCount,
      this.drawingBufferSize
    );
  }

  private clearPoints(): void {
    if (!this.points) return;
    this.pivot.remove(this.points);
    this.points.geometry.dispose();
    this.material?.dispose();
    this.points = null;
    this.material = null;
    this.pointCount = 0;
  }

  private syncAnimation(): void {
    const shouldRun = this.active && this.inViewport && this.points !== null;
    if (shouldRun === (this.animationId !== 0)) return;

    cancelAnimationFrame(this.animationId);
    this.animationId = 0;
    if (!shouldRun) return;

    this.lastFrameTime = performance.now();
    this.animationId = requestAnimationFrame(this.animate);
  }

  private readonly animate = (now: number): void => {
    this.animationId = 0;
    if (!this.active || !this.inViewport || !this.points) return;

    const delta = Math.min(now - this.lastFrameTime, 100);
    this.lastFrameTime = now;
    if (!this.reducedMotion) {
      this.pivot.rotation.y += this.spinStep * delta;
    }

    this.renderer.render(this.scene, this.camera);
    this.animationId = requestAnimationFrame(this.animate);
  };
}
