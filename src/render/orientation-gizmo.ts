import * as THREE from 'three';

type AxisId = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

interface AxisInfo {
  id: AxisId;
  dir: THREE.Vector3;
  up: THREE.Vector3;
  color: string;
  label: string;
  isPositive: boolean;
}

const AXES: AxisInfo[] = [
  { id: '+x', dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), color: '#ef4444', label: 'X', isPositive: true },
  { id: '-x', dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), color: '#ef4444', label: '-X', isPositive: false },
  { id: '+y', dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), color: '#22c55e', label: 'Y', isPositive: true },
  { id: '-y', dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1), color: '#22c55e', label: '-Y', isPositive: false },
  { id: '+z', dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), color: '#3b82f6', label: 'Z', isPositive: true },
  { id: '-z', dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), color: '#3b82f6', label: '-Z', isPositive: false },
];

export class OrientationGizmo {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: THREE.Camera | null = null;
  private onAlignCamera?: (dir: THREE.Vector3, up: THREE.Vector3) => void;

  private size: number = 88;
  private radius: number = 32;
  private hoveredAxis: AxisId | null = null;
  private projectedAxes: Array<{ axis: AxisInfo; x: number; y: number; z: number; radius: number }> = [];

  private tempMatrix = new THREE.Matrix4();
  private tempVec = new THREE.Vector3();

  constructor(
    parent: HTMLElement,
    onAlignCamera?: (dir: THREE.Vector3, up: THREE.Vector3) => void
  ) {
    this.onAlignCamera = onAlignCamera;

    this.container = document.createElement('div');
    this.container.className = 'orientation-gizmo';
    this.container.title = 'Gizmo 3D (Clic en un eje para vista ortogonal)';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'orientation-gizmo-canvas';
    this.container.appendChild(this.canvas);
    parent.appendChild(this.container);

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context for OrientationGizmo');
    }
    this.ctx = context;

    this.initCanvas();
    this.attachEvents();
  }

  private initCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    this.ctx.scale(dpr, dpr);
  }

  public setCamera(camera: THREE.Camera, onAlignCamera?: (dir: THREE.Vector3, up: THREE.Vector3) => void): void {
    this.camera = camera;
    if (onAlignCamera) {
      this.onAlignCamera = onAlignCamera;
    }
    this.update();
  }

  public update(): void {
    if (!this.camera) return;

    const ctx = this.ctx;
    const center = this.size / 2;

    ctx.clearRect(0, 0, this.size, this.size);

    // Subtle glass circular background
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(18, 18, 36, 0.65)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();
    ctx.restore();

    // Compute view rotation matrix (camera rotation only)
    this.tempMatrix.extractRotation(this.camera.matrixWorldInverse);

    this.projectedAxes = AXES.map((axis) => {
      this.tempVec.copy(axis.dir).applyMatrix4(this.tempMatrix);
      const x = center + this.tempVec.x * this.radius;
      const y = center - this.tempVec.y * this.radius;
      const z = this.tempVec.z;
      const nodeRadius = axis.isPositive ? 10 : 5.5;
      return { axis, x, y, z, radius: nodeRadius };
    });

    // Sort back-to-front (painter's algorithm)
    this.projectedAxes.sort((a, b) => a.z - b.z);

    // Draw axes lines and nodes
    for (const item of this.projectedAxes) {
      const isHovered = this.hoveredAxis === item.axis.id;

      // Draw axis line from center
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(item.x, item.y);
      ctx.strokeStyle = item.axis.color;
      ctx.lineWidth = item.axis.isPositive ? 2.5 : 1.2;
      ctx.globalAlpha = item.axis.isPositive ? 0.9 : 0.45;
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Draw pole circle node
      ctx.beginPath();
      const drawRadius = isHovered ? item.radius + 2 : item.radius;
      ctx.arc(item.x, item.y, drawRadius, 0, Math.PI * 2);

      if (item.axis.isPositive) {
        ctx.fillStyle = item.axis.color;
        ctx.fill();
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Draw axis letter label
        ctx.font = `bold 10px Inter, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.axis.label, item.x, item.y + 0.5);
      } else {
        // Negative axis node
        ctx.fillStyle = item.axis.color;
        ctx.globalAlpha = 0.55;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.stroke();

        if (isHovered) {
          ctx.font = `9px Inter, sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.axis.label, item.x, item.y);
        }
      }
    }
  }

  private handlePointerMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let found: AxisId | null = null;
    for (let i = this.projectedAxes.length - 1; i >= 0; i--) {
      const item = this.projectedAxes[i];
      const dist = Math.hypot(mouseX - item.x, mouseY - item.y);
      if (dist <= item.radius + 4) {
        found = item.axis.id;
        break;
      }
    }

    if (this.hoveredAxis !== found) {
      this.hoveredAxis = found;
      this.canvas.style.cursor = found ? 'pointer' : 'default';
      this.update();
    }
  };

  private handlePointerLeave = (): void => {
    if (this.hoveredAxis !== null) {
      this.hoveredAxis = null;
      this.canvas.style.cursor = 'default';
      this.update();
    }
  };

  private handlePointerDown = (e: MouseEvent): void => {
    e.stopPropagation();
    if (!this.hoveredAxis) return;

    const selected = AXES.find((a) => a.id === this.hoveredAxis);
    if (selected && this.onAlignCamera) {
      this.onAlignCamera(selected.dir, selected.up);
    }
  };

  private attachEvents(): void {
    this.canvas.addEventListener('mousemove', this.handlePointerMove);
    this.canvas.addEventListener('mouseleave', this.handlePointerLeave);
    this.canvas.addEventListener('click', this.handlePointerDown);
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  public destroy(): void {
    this.canvas.removeEventListener('mousemove', this.handlePointerMove);
    this.canvas.removeEventListener('mouseleave', this.handlePointerLeave);
    this.canvas.removeEventListener('click', this.handlePointerDown);
    this.container.remove();
  }
}
