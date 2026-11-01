import {
  MAGIC_NUMBERS,
  MAX_CURVE_A,
  MAX_N,
  MAX_Z,
  NuclearChartsData,
} from '../core/nuclear';
import { getStrings } from '../i18n';

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

const CHART_PALETTE = {
  gridLine: 'rgba(255, 255, 255, 0.06)',
  axisLine: 'rgba(255, 255, 255, 0.14)',
  tick: '#7f8899',
  axisLabel: '#a9b1c2',
  magicLine: 'rgba(245, 181, 68, 0.22)',
  nzLine: 'rgba(255, 255, 255, 0.28)',
  valleyUnderlay: 'rgba(8, 9, 13, 0.6)',
  valleyStroke: '#34d399',
  crosshair: 'rgba(255, 255, 255, 0.36)',
  activeFill: '#f87171',
  activeRing: '#ffffff',
  curveStart: '#4f8ff7',
  curveMid: '#34d399',
  curveEnd: '#f5b544',
  areaTop: 'rgba(79, 143, 247, 0.28)',
  areaBottom: 'rgba(79, 143, 247, 0.02)',
  gold: '#f5b544',
  goldLine: 'rgba(245, 181, 68, 0.52)',
  fusionText: '#8ab4ff',
  fissionText: '#f5b544',
  tooltipBg: 'rgba(16, 19, 25, 0.96)',
  tooltipBorder: 'rgba(255, 255, 255, 0.18)',
  text: '#eef1f7',
} as const;

const SEGRE_RGBA: readonly (readonly [number, number, number, number])[] = [
  [52, 211, 153, 255],
  [56, 189, 248, 107],
  [251, 146, 60, 107],
  [245, 181, 68, 133],
];

const SEGRE_PAD = { top: 14, right: 12, bottom: 26, left: 34 } as const;
const BA_PAD = { top: 22, right: 12, bottom: 26, left: 32 } as const;
const BA_Y_MAX = 9.6;
const IRON_56_A = 56;

interface PlotBox {
  w: number;
  h: number;
  left: number;
  top: number;
  plotW: number;
  plotH: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function prepareHiDpiCanvas(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): { w: number; h: number } | null {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const dpr = Math.max(1, window.devicePixelRatio);
  const targetW = Math.round(rect.width * dpr);
  const targetH = Math.round(rect.height * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.resetTransform();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { w: rect.width, h: rect.height };
}

function drawCompactTooltip(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  anchorY: number,
  box: PlotBox,
): void {
  ctx.font = '600 10px ' + FONT;
  const tw = ctx.measureText(text).width + 14;
  const th = 20;

  let tx = anchorX + 10;
  if (tx + tw > box.left + box.plotW) {
    tx = anchorX - tw - 10;
  }
  tx = clamp(tx, box.left + 2, box.left + box.plotW - tw - 2);
  const ty = clamp(anchorY - th - 6, box.top + 2, box.top + box.plotH - th - 2);

  ctx.fillStyle = CHART_PALETTE.tooltipBg;
  ctx.strokeStyle = CHART_PALETTE.tooltipBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = CHART_PALETTE.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tx + 7, ty + th / 2);
}

function buildSegreOffscreenCanvas(segreGrid: Uint8Array): HTMLCanvasElement {
  const height = MAX_N + 1;
  const offscreen = document.createElement('canvas');
  offscreen.width = MAX_Z;
  offscreen.height = height;
  const offCtx = offscreen.getContext('2d')!;
  const imgData = offCtx.createImageData(MAX_Z, height);
  const pixels = imgData.data;

  for (let idx = 0; idx < segreGrid.length; idx++) {
    const code = segreGrid[idx];
    if (code >= SEGRE_RGBA.length) continue;

    const zIndex = Math.floor(idx / height);
    const n = idx % height;
    const row = MAX_N - n;
    const offset = (row * MAX_Z + zIndex) * 4;
    const rgba = SEGRE_RGBA[code];
    pixels[offset] = rgba[0];
    pixels[offset + 1] = rgba[1];
    pixels[offset + 2] = rgba[2];
    pixels[offset + 3] = rgba[3];
  }

  offCtx.putImageData(imgData, 0, 0);
  return offscreen;
}

export class SegreChart {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onSelect: (z: number, n: number) => void;
  private readonly resizeObserver: ResizeObserver;
  private rafId = 0;

  private offscreen: HTMLCanvasElement | null = null;
  private valleyPoints: [number, number][] = [];
  private activeZ = 6;
  private activeN = 8;
  private hoverNuclide: { z: number; n: number } | null = null;
  private isDragging = false;

  constructor(container: HTMLElement, onSelect: (z: number, n: number) => void) {
    this.container = container;
    this.onSelect = onSelect;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'radial-chart-canvas segre-chart-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', getStrings().segreChartTitle);
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => this.draw());
    });
    this.resizeObserver.observe(this.container);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('keydown', this.handleKeyDown);
  }

  public setData(data: NuclearChartsData): void {
    this.offscreen = buildSegreOffscreenCanvas(data.segreGrid);
    this.valleyPoints = data.valleyPoints;
    this.draw();
  }

  public setActiveNuclide(z: number, n: number): void {
    this.activeZ = clamp(Math.round(z), 1, MAX_Z);
    this.activeN = clamp(Math.round(n), 0, MAX_N);
    this.draw();
  }

  private getPlotBox(): PlotBox | null {
    const rect = this.canvas.getBoundingClientRect();
    const plotW = rect.width - SEGRE_PAD.left - SEGRE_PAD.right;
    const plotH = rect.height - SEGRE_PAD.top - SEGRE_PAD.bottom;
    if (plotW <= 0 || plotH <= 0) return null;
    return {
      w: rect.width,
      h: rect.height,
      left: SEGRE_PAD.left,
      top: SEGRE_PAD.top,
      plotW,
      plotH,
    };
  }

  private resolvePointerNuclide(
    e: PointerEvent,
    clampOutside: boolean,
  ): { z: number; n: number } | null {
    const box = this.getPlotBox();
    if (!box) return null;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside =
      x >= box.left &&
      x <= box.left + box.plotW &&
      y >= box.top &&
      y <= box.top + box.plotH;

    if (!inside && !clampOutside) return null;

    const relX = clamp((x - box.left) / box.plotW, 0, 0.999999);
    const relY = clamp((box.top + box.plotH - y) / box.plotH, 0, 0.999999);
    return {
      z: clamp(Math.floor(relX * MAX_Z) + 1, 1, MAX_Z),
      n: clamp(Math.floor(relY * (MAX_N + 1)), 0, MAX_N),
    };
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    const picked = this.resolvePointerNuclide(e, false);
    if (!picked) return;

    this.isDragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.hoverNuclide = picked;
    this.selectIfChanged(picked.z, picked.n);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    const picked = this.resolvePointerNuclide(e, this.isDragging);
    this.hoverNuclide = picked;
    if (this.isDragging && picked) {
      this.selectIfChanged(picked.z, picked.n);
    }
    this.draw();
  };

  private readonly handlePointerUp = (): void => {
    this.isDragging = false;
  };

  private readonly handlePointerLeave = (): void => {
    if (!this.isDragging) {
      this.hoverNuclide = null;
      this.draw();
    }
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    let nextZ = this.activeZ;
    let nextN = this.activeN;

    if (e.key === 'ArrowLeft') nextZ = Math.max(1, this.activeZ - 1);
    else if (e.key === 'ArrowRight') nextZ = Math.min(MAX_Z, this.activeZ + 1);
    else if (e.key === 'ArrowUp') nextN = Math.min(MAX_N, this.activeN + 1);
    else if (e.key === 'ArrowDown') nextN = Math.max(0, this.activeN - 1);
    else return;

    if (nextZ === this.activeZ && nextN === this.activeN) return;

    e.preventDefault();
    this.selectIfChanged(nextZ, nextN);
  };

  private selectIfChanged(z: number, n: number): void {
    if (z === this.activeZ && n === this.activeN) {
      this.draw();
      return;
    }
    this.activeZ = z;
    this.activeN = n;
    this.draw();
    this.onSelect(z, n);
  }

  private toX(z: number, box: PlotBox): number {
    return box.left + ((z - 0.5) / MAX_Z) * box.plotW;
  }

  private toY(n: number, box: PlotBox): number {
    return box.top + box.plotH - ((n + 0.5) / (MAX_N + 1)) * box.plotH;
  }

  public draw(): void {
    const size = prepareHiDpiCanvas(this.container, this.canvas, this.ctx);
    if (!size) return;

    const plotW = size.w - SEGRE_PAD.left - SEGRE_PAD.right;
    const plotH = size.h - SEGRE_PAD.top - SEGRE_PAD.bottom;
    if (plotW <= 0 || plotH <= 0) return;

    const box: PlotBox = {
      w: size.w,
      h: size.h,
      left: SEGRE_PAD.left,
      top: SEGRE_PAD.top,
      plotW,
      plotH,
    };

    this.canvas.setAttribute('aria-label', getStrings().segreChartTitle);

    this.drawAxesAndGrid(box);
    this.drawHeatmap(box);
    this.drawMagicAndReferenceLines(box);
    this.drawValleyCurve(box);
    this.drawMiniLegend(box);
    this.drawActiveMarker(box);
    this.drawHoverTooltip(box);
  }

  private drawAxesAndGrid(box: PlotBox): void {
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    ctx.font = '9.5px ' + FONT;
    ctx.strokeStyle = CHART_PALETTE.gridLine;
    ctx.fillStyle = CHART_PALETTE.tick;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const nTick of [0, 45, 90, 135, 180]) {
      const y = this.toY(nTick, box);
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(box.left + box.plotW, y);
      ctx.stroke();
      ctx.fillText(String(nTick), box.left - 5, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const zTick of [1, 30, 60, 90, 118]) {
      const x = this.toX(zTick, box);
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.top + box.plotH);
      ctx.stroke();
      ctx.fillText(String(zTick), x, box.top + box.plotH + 4);
    }

    ctx.strokeStyle = CHART_PALETTE.axisLine;
    ctx.strokeRect(box.left, box.top, box.plotW, box.plotH);

    ctx.fillStyle = CHART_PALETTE.axisLabel;
    ctx.font = '600 9.5px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Z', box.left + box.plotW / 2, box.top + box.plotH + 15);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', 6, box.top - 1);
  }

  private drawHeatmap(box: PlotBox): void {
    if (!this.offscreen) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.offscreen, box.left, box.top, box.plotW, box.plotH);
    ctx.restore();
  }

  private drawMagicAndReferenceLines(box: PlotBox): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = CHART_PALETTE.magicLine;

    for (const magic of MAGIC_NUMBERS) {
      if (magic <= MAX_Z) {
        const mx = this.toX(magic, box);
        ctx.beginPath();
        ctx.moveTo(mx, box.top);
        ctx.lineTo(mx, box.top + box.plotH);
        ctx.stroke();
      }
      if (magic <= MAX_N) {
        const my = this.toY(magic, box);
        ctx.beginPath();
        ctx.moveTo(box.left, my);
        ctx.lineTo(box.left + box.plotW, my);
        ctx.stroke();
      }
    }

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = CHART_PALETTE.nzLine;
    ctx.beginPath();
    ctx.moveTo(this.toX(1, box), this.toY(1, box));
    ctx.lineTo(this.toX(MAX_Z, box), this.toY(MAX_Z, box));
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = CHART_PALETTE.tick;
    ctx.font = '600 9px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('N = Z', box.left + box.plotW - 4, this.toY(MAX_Z, box) + 3);
  }

  private drawValleyCurve(box: PlotBox): void {
    if (this.valleyPoints.length < 2) return;
    const ctx = this.ctx;

    const tracePath = () => {
      ctx.beginPath();
      const [z0, n0] = this.valleyPoints[0];
      ctx.moveTo(this.toX(z0, box), this.toY(n0, box));
      for (let i = 1; i < this.valleyPoints.length; i++) {
        const [zi, ni] = this.valleyPoints[i];
        ctx.lineTo(this.toX(zi, box), this.toY(ni, box));
      }
    };

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    tracePath();
    ctx.strokeStyle = CHART_PALETTE.valleyUnderlay;
    ctx.lineWidth = 2.6;
    ctx.stroke();

    tracePath();
    ctx.strokeStyle = CHART_PALETTE.valleyStroke;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  private drawMiniLegend(box: PlotBox): void {
    const ctx = this.ctx;
    const items: readonly { color: string; label: string }[] = [
      { color: '#34d399', label: '●' },
      { color: '#38bdf8', label: 'β⁻' },
      { color: '#fb923c', label: 'β⁺' },
      { color: '#f5b544', label: 'α' },
    ];

    ctx.font = '600 9px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let cursorX = box.left + 6;
    const y = box.top + 5;

    for (const item of items) {
      ctx.fillStyle = item.color;
      ctx.fillText(item.label, cursorX, y);
      cursorX += ctx.measureText(item.label).width + 7;
    }
  }

  private drawActiveMarker(box: PlotBox): void {
    const ctx = this.ctx;
    const ax = this.toX(this.activeZ, box);
    const ay = this.toY(this.activeN, box);

    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = CHART_PALETTE.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, box.top);
    ctx.lineTo(ax, box.top + box.plotH);
    ctx.moveTo(box.left, ay);
    ctx.lineTo(box.left + box.plotW, ay);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = CHART_PALETTE.activeFill;
    ctx.strokeStyle = CHART_PALETTE.activeRing;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(ax, ay, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawHoverTooltip(box: PlotBox): void {
    if (!this.hoverNuclide) return;
    const { z, n } = this.hoverNuclide;
    const hx = this.toX(z, box);
    const hy = this.toY(n, box);
    const text = `Z=${z}, N=${n} (A=${z + n})`;
    drawCompactTooltip(this.ctx, text, hx, hy, box);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('keydown', this.handleKeyDown);
  }
}

export class BindingEnergyChart {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private rafId = 0;

  private baCurve: Float32Array = new Float32Array(0);
  private activeA = 14;
  private activeBaMeV = 7.52;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'radial-chart-canvas ba-chart-canvas';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => this.draw());
    });
    this.resizeObserver.observe(this.container);
  }

  public setCurve(baCurve: Float32Array): void {
    this.baCurve = baCurve;
    this.draw();
  }

  public setActiveNuclide(a: number, baMeV: number): void {
    this.activeA = Math.max(1, a);
    this.activeBaMeV = Math.max(0, baMeV);
    this.draw();
  }

  private toX(a: number, box: PlotBox): number {
    const clampedA = clamp(a, 1, MAX_CURVE_A);
    return box.left + ((clampedA - 1) / (MAX_CURVE_A - 1)) * box.plotW;
  }

  private toY(baMeV: number, box: PlotBox): number {
    const clampedBa = clamp(baMeV, 0, BA_Y_MAX);
    return box.top + box.plotH - (clampedBa / BA_Y_MAX) * box.plotH;
  }

  public draw(): void {
    const size = prepareHiDpiCanvas(this.container, this.canvas, this.ctx);
    if (!size) return;

    const plotW = size.w - BA_PAD.left - BA_PAD.right;
    const plotH = size.h - BA_PAD.top - BA_PAD.bottom;
    if (plotW <= 0 || plotH <= 0) return;

    const box: PlotBox = {
      w: size.w,
      h: size.h,
      left: BA_PAD.left,
      top: BA_PAD.top,
      plotW,
      plotH,
    };

    this.drawGridAndZones(box);
    this.drawBindingCurve(box);
    this.drawIronSummitAndActiveMarker(box);
  }

  private drawGridAndZones(box: PlotBox): void {
    const ctx = this.ctx;
    const strings = getStrings();

    ctx.lineWidth = 1;
    ctx.font = '9.5px ' + FONT;
    ctx.strokeStyle = CHART_PALETTE.gridLine;
    ctx.fillStyle = CHART_PALETTE.tick;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const yTick of [0, 3, 6, 9]) {
      const y = this.toY(yTick, box);
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(box.left + box.plotW, y);
      ctx.stroke();
      ctx.fillText(String(yTick), box.left - 5, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const aTick of [1, 56, 120, 180, 250]) {
      const x = this.toX(aTick, box);
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.top + box.plotH);
      ctx.stroke();
      ctx.fillText(String(aTick), x, box.top + box.plotH + 4);
    }

    ctx.strokeStyle = CHART_PALETTE.axisLine;
    ctx.beginPath();
    ctx.moveTo(box.left, box.top + box.plotH);
    ctx.lineTo(box.left + box.plotW, box.top + box.plotH);
    ctx.stroke();

    ctx.fillStyle = CHART_PALETTE.axisLabel;
    ctx.font = '600 9.5px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('A', box.left + box.plotW / 2, box.top + box.plotH + 15);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('MeV', 4, 10);

    const x56 = this.toX(IRON_56_A, box);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = CHART_PALETTE.goldLine;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x56, box.top);
    ctx.lineTo(x56, box.top + box.plotH);
    ctx.stroke();
    ctx.restore();

    ctx.font = '600 9.5px ' + FONT;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CHART_PALETTE.fusionText;
    ctx.textAlign = 'left';
    ctx.fillText(strings.chartFusionZone, box.left + 2, 10);

    ctx.fillStyle = CHART_PALETTE.fissionText;
    ctx.textAlign = 'right';
    ctx.fillText(strings.chartFissionZone, box.left + box.plotW - 2, 10);
  }

  private drawBindingCurve(box: PlotBox): void {
    const len = Math.min(this.baCurve.length, MAX_CURVE_A);
    if (len < 2) return;
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.moveTo(this.toX(1, box), this.toY(0, box));
    for (let a = 1; a <= len; a++) {
      ctx.lineTo(this.toX(a, box), this.toY(this.baCurve[a - 1], box));
    }
    ctx.lineTo(this.toX(len, box), this.toY(0, box));
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(0, box.top, 0, box.top + box.plotH);
    fillGrad.addColorStop(0, CHART_PALETTE.areaTop);
    fillGrad.addColorStop(1, CHART_PALETTE.areaBottom);
    ctx.fillStyle = fillGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(this.toX(1, box), this.toY(this.baCurve[0], box));
    for (let a = 2; a <= len; a++) {
      ctx.lineTo(this.toX(a, box), this.toY(this.baCurve[a - 1], box));
    }

    const strokeGrad = ctx.createLinearGradient(box.left, 0, box.left + box.plotW, 0);
    strokeGrad.addColorStop(0, CHART_PALETTE.curveStart);
    strokeGrad.addColorStop(0.24, CHART_PALETTE.curveMid);
    strokeGrad.addColorStop(1, CHART_PALETTE.curveEnd);
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (len >= 4) {
      const xHe = this.toX(4, box);
      const yHe = this.toY(this.baCurve[3], box);
      ctx.fillStyle = CHART_PALETTE.tick;
      ctx.font = '600 8.5px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('⁴He', xHe + 3, yHe - 1);
    }
  }

  private drawIronSummitAndActiveMarker(box: PlotBox): void {
    const ctx = this.ctx;

    if (this.baCurve.length >= IRON_56_A) {
      const x56 = this.toX(IRON_56_A, box);
      const y56 = this.toY(this.baCurve[IRON_56_A - 1], box);
      ctx.fillStyle = CHART_PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(x56, y56 - 4.5);
      ctx.lineTo(x56 + 4.5, y56);
      ctx.lineTo(x56, y56 + 4.5);
      ctx.lineTo(x56 - 4.5, y56);
      ctx.closePath();
      ctx.fill();

      ctx.font = '600 9px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('⁵⁶Fe', x56 + 5, y56 + 3);
    }

    const clampedA = Math.min(this.activeA, MAX_CURVE_A);
    const ax = this.toX(clampedA, box);
    const ay = this.toY(this.activeBaMeV, box);

    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = CHART_PALETTE.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, box.top);
    ctx.lineTo(ax, box.top + box.plotH);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = CHART_PALETTE.activeFill;
    ctx.strokeStyle = CHART_PALETTE.activeRing;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(ax, ay, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
  }
}
