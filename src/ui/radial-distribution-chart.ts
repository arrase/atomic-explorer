import { getStrings } from '../i18n';
import { bohrToPm, meanRadiusBohr } from '../core/physics-constants';

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

function associatedLaguerre(p: number, q: number, x: number): number {
  if (p === 0) return 1;
  const l0 = 1;
  const l1 = q + 1 - x;
  if (p === 1) return l1;

  let prev2 = l0;
  let prev1 = l1;
  let current = l1;

  for (let k = 2; k <= p; k++) {
    current = ((2 * k - 1 + q - x) * prev1 - (k - 1 + q) * prev2) / k;
    prev2 = prev1;
    prev1 = current;
  }
  return current;
}

function calculateRadialWavefunction(n: number, l: number, zEff: number, r: number): number {
  const rho = (2 * zEff * r) / n;
  const p = n - l - 1;
  const q = 2 * l + 1;

  const laguerre = associatedLaguerre(p, q, rho);
  const num = Math.pow((2 * zEff) / n, 3) * factorial(n - l - 1);
  const den = 2 * n * factorial(n + l);
  const prefactor = Math.sqrt(num / den);

  return prefactor * Math.exp((-zEff * r) / n) * Math.pow(rho, l) * laguerre;
}

function calculateRadialProbabilityDensity(n: number, l: number, zEff: number, r: number): number {
  const rNl = calculateRadialWavefunction(n, l, zEff, r);
  return r * r * rNl * rNl;
}

function refineLaguerreRoot(p: number, q: number, left: number, right: number, prevVal: number): number {
  for (let b = 0; b < 16; b++) {
    const mid = 0.5 * (left + right);
    const midVal = associatedLaguerre(p, q, mid);
    if (midVal === 0) {
      return mid;
    }
    if ((prevVal > 0 && midVal > 0) || (prevVal < 0 && midVal < 0)) {
      left = mid;
    } else {
      right = mid;
    }
  }
  return 0.5 * (left + right);
}

function findRadialNodes(n: number, l: number, zEff: number): number[] {
  const p = n - l - 1;
  if (p <= 0) return [];

  const q = 2 * l + 1;
  const nodes: number[] = [];
  const maxRho = 80;
  const steps = 1000;
  const dRho = maxRho / steps;

  let prevRho = 0.001;
  let prevVal = associatedLaguerre(p, q, prevRho);

  for (let i = 1; i <= steps; i++) {
    const rho = i * dRho;
    const val = associatedLaguerre(p, q, rho);
    if ((prevVal > 0 && val <= 0) || (prevVal < 0 && val >= 0)) {
      const rootRho = refineLaguerreRoot(p, q, prevRho, rho, prevVal);
      nodes.push((n * rootRho) / (2 * zEff));
      if (nodes.length === p) break;
    }
    prevRho = rho;
    prevVal = val;
  }

  return nodes;
}

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

/** Plot insets, in CSS pixels. The bottom room fits the ticks + axis title. */
const PAD = { top: 20, right: 14, bottom: 32, left: 42 } as const;

interface ChartLayout {
  w: number;
  h: number;
  plotW: number;
  plotH: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  rMax: number;
  yMax: number;
  toX: (r: number) => number;
  toY: (p: number) => number;
}

/** Palette mirrored from the CSS design tokens. */
const CHART = {
  gridLine: 'rgba(255, 255, 255, 0.06)',
  axisLine: 'rgba(255, 255, 255, 0.12)',
  tick: '#7f8899',
  axisLabel: '#a9b1c2',
  curve: '#4f8ff7',
  curveAlt: '#8ab4ff',
  areaTop: 'rgba(79, 143, 247, 0.28)',
  areaBottom: 'rgba(79, 143, 247, 0.02)',
  peak: '#8ab4ff',
  expectation: '#f5b544',
  node: '#f87171',
  tooltipBg: 'rgba(16, 19, 25, 0.96)',
  tooltipBorder: 'rgba(255, 255, 255, 0.17)',
  text: '#eef1f7',
} as const;

export class RadialDistributionChart {

  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private animationFrameId: number = 0;

  private n: number = 1;
  private l: number = 0;
  private zEff: number = 1.0;

  private hoverR: number | null = null;
  private peakR: number = 1.0;
  private expR: number = 1.5;
  private radialNodes: number[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'radial-chart-canvas';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = requestAnimationFrame(() => {
        this.draw();
      });
    });
    this.resizeObserver.observe(this.container);

    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
  }

  public update(n: number, l: number, zEff: number): void {
    this.n = n;
    this.l = l;
    this.zEff = zEff;

    this.expR = meanRadiusBohr(n, l, this.zEff);
    this.radialNodes = findRadialNodes(n, l, this.zEff);
    this.calculatePeak();
    this.draw();
  }

  public getPeakRadius(): { rBohr: number; rPm: number } {
    return {
      rBohr: this.peakR,
      rPm: bohrToPm(this.peakR),
    };
  }

  private calculatePeak(): void {
    const rMax = Math.max(2.4 * this.expR, 4.0 / this.zEff);
    const sampleCount = 600;
    let maxP = -1;
    let bestR = 0;

    for (let i = 0; i <= sampleCount; i++) {
      const r = (i / sampleCount) * rMax;
      const p = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, r);
      if (p > maxP) {
        maxP = p;
        bestR = r;
      }
    }

    // Golden section refinement around bestR
    const dr = rMax / sampleCount;
    let a = Math.max(0, bestR - dr);
    let b = Math.min(rMax, bestR + dr);
    const phi = (Math.sqrt(5) - 1) / 2;
    let x1 = b - phi * (b - a);
    let x2 = a + phi * (b - a);
    let f1 = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, x1);
    let f2 = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, x2);

    for (let iter = 0; iter < 20; iter++) {
      if (f1 > f2) {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = b - phi * (b - a);
        f1 = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, x1);
      } else {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = a + phi * (b - a);
        f2 = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, x2);
      }
    }

    this.peakR = 0.5 * (a + b);
  }

  private readonly handleMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;

    const padLeft = PAD.left;
    const padRight = PAD.right;
    const plotWidth = rect.width - padLeft - padRight;
    const x = e.clientX - rect.left;

    if (x >= padLeft && x <= rect.width - padRight && plotWidth > 0) {
      const rMax = this.currentRMax();
      const ratio = (x - padLeft) / plotWidth;
      this.hoverR = Math.max(0, Math.min(rMax, ratio * rMax));
    } else {
      this.hoverR = null;
    }
    this.draw();
  };

  private readonly handleMouseLeave = (): void => {
    this.hoverR = null;
    this.draw();
  };

  private currentRMax(): number {
    return Math.max(2.4 * this.expR, 4.0 / this.zEff);
  }

  public draw(): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.max(1, window.devicePixelRatio);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const ctx = this.ctx;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    const padLeft = PAD.left;
    const padRight = PAD.right;
    const padTop = PAD.top;
    const padBottom = PAD.bottom;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    if (plotW <= 0 || plotH <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const rMax = this.currentRMax();

    // Sample points across plot width
    const pointCount = Math.max(120, Math.floor(plotW * 1.5));
    const rValues: number[] = [];
    const pValues: number[] = [];
    let pMax = 0;

    for (let i = 0; i <= pointCount; i++) {
      const r = (i / pointCount) * rMax;
      const p = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, r);
      rValues.push(r);
      pValues.push(p);
      if (p > pMax) pMax = p;
    }

    if (pMax <= 0) pMax = 1.0;
    // Head-room for the marker labels that sit above the curve.
    const yMax = pMax * 1.22;

    const toX = (r: number) => padLeft + (r / rMax) * plotW;
    const toY = (p: number) => padTop + plotH - (p / yMax) * plotH;

    const layout: ChartLayout = { w, h, plotW, plotH, padLeft, padRight, padTop, rMax, yMax, toX, toY };
    this.drawGrid(layout);

    // Area Fill under Curve
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    for (let i = 0; i <= pointCount; i++) {
      ctx.lineTo(toX(rValues[i]), toY(pValues[i]));
    }
    ctx.lineTo(toX(rMax), toY(0));
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    areaGrad.addColorStop(0, CHART.areaTop);
    areaGrad.addColorStop(1, CHART.areaBottom);
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Curve Stroke
    ctx.beginPath();
    ctx.moveTo(toX(rValues[0]), toY(pValues[0]));
    for (let i = 1; i <= pointCount; i++) {
      ctx.lineTo(toX(rValues[i]), toY(pValues[i]));
    }

    const strokeGrad = ctx.createLinearGradient(padLeft, 0, w - padRight, 0);
    strokeGrad.addColorStop(0, CHART.curve);
    strokeGrad.addColorStop(1, CHART.curveAlt);
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeGrad;
    ctx.lineJoin = 'round';
    ctx.stroke();

    this.drawMarkers(layout);
    this.drawHover(layout);
  }

  private drawGrid(layout: ChartLayout): void {
    const { w, plotH, padLeft, padRight, padTop, rMax, yMax, toX, toY } = layout;
    const ctx = this.ctx;

    ctx.lineWidth = 1;

    // Horizontal grid lines
    ctx.strokeStyle = CHART.gridLine;
    ctx.fillStyle = CHART.tick;
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = (i / yTicks) * yMax;
      const yPos = toY(yVal);

      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(w - padRight, yPos);
      ctx.stroke();

      ctx.fillText(yVal.toFixed(yMax < 0.1 ? 3 : 2), padLeft - 6, yPos);
    }

    // Vertical grid lines
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const xVal = (i / xTicks) * rMax;
      const xPos = toX(xVal);

      ctx.beginPath();
      ctx.moveTo(xPos, padTop);
      ctx.lineTo(xPos, padTop + plotH);
      ctx.stroke();

      ctx.fillText(xVal.toFixed(1), xPos, padTop + plotH + 6);
    }

    // Baseline
    ctx.strokeStyle = CHART.axisLine;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    ctx.lineTo(w - padRight, padTop + plotH);
    ctx.stroke();

    // Axis titles. The radius label is centred on its own reserved row below
    // the tick numbers instead of overprinting the last tick.
    const strings = getStrings();
    ctx.fillStyle = CHART.axisLabel;
    ctx.font = '10px ' + FONT;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(strings.chartRadiusAxis, padLeft + (w - padLeft - padRight) / 2, padTop + plotH + 19);

    ctx.save();
    ctx.translate(10, padTop - 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(strings.chartProbAxis, 0, 0);
    ctx.restore();
  }

  /**
   * Lays out the marker labels in a single row above the plot. Each label is
   * nudged horizontally until it no longer overlaps its neighbour, which is
   * what previously caused the `<r>` / `r_max` / node captions to stack on top
   * of each other.
   */
  private drawMarkers(layout: ChartLayout): void {
    const { plotH, padTop, rMax, toX, toY } = layout;
    const ctx = this.ctx;
    const strings = getStrings();
    const rowY = padTop + 8;

    type Label = { x: number; text: string; color: string };
    const labels: Label[] = [];

    // Radial nodes (P(r) = 0). The caption is drawn once, above the first
    // node — repeating it for every node just produced "nodo nodo nodo".
    this.radialNodes.forEach((nodeR, i) => {
      if (nodeR > rMax) return;
      const nx = toX(nodeR);

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(nx, padTop);
      ctx.lineTo(nx, toY(0));
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = CHART.node;
      ctx.beginPath();
      ctx.arc(nx, toY(0), 3, 0, Math.PI * 2);
      ctx.fill();

      if (i === 0) {
        labels.push({ x: nx, text: strings.chartNodeLabel, color: CHART.node });
      }
    });

    // Expectation radius <r>
    if (this.expR <= rMax) {
      const ex = toX(this.expR);
      const ey = toY(calculateRadialProbabilityDensity(this.n, this.l, this.zEff, this.expR));

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245, 181, 68, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex, padTop);
      ctx.lineTo(ex, padTop + plotH);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = CHART.expectation;
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();

      labels.push({ x: ex, text: `⟨r⟩ ${this.expR.toFixed(2)}`, color: CHART.expectation });
    }

    // Peak radius r_max
    if (this.peakR <= rMax) {
      const px = toX(this.peakR);
      const py = toY(calculateRadialProbabilityDensity(this.n, this.l, this.zEff, this.peakR));

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(138, 180, 255, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = CHART.peak;
      ctx.beginPath();
      ctx.moveTo(px, py - 5);
      ctx.lineTo(px + 4, py);
      ctx.lineTo(px, py + 5);
      ctx.lineTo(px - 4, py);
      ctx.closePath();
      ctx.fill();

      labels.push({ x: px, text: `r_max ${this.peakR.toFixed(2)}`, color: CHART.peak });
    }

    this.drawLabelRow(labels, rowY, layout);
  }

  /** Anti-collision label placement: clamp to the plot, then push apart. */
  private drawLabelRow(labels: { x: number; text: string; color: string }[], rowY: number, layout: ChartLayout): void {
    if (labels.length === 0) return;

    const ctx = this.ctx;
    ctx.font = '600 10px ' + FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const left = layout.padLeft;
    const right = layout.w - layout.padRight;
    const gap = 6;

    const boxes = labels
      .map((l) => {
        const width = ctx.measureText(l.text).width;
        return { ...l, width, start: l.x - width / 2 };
      })
      .sort((a, b) => a.x - b.x);

    // Clamp into the plot area.
    for (const b of boxes) {
      b.start = Math.max(left, Math.min(right - b.width, b.start));
    }

    // Resolve overlaps left-to-right, then a single reverse pass for the
    // overflow pushed past the right edge.
    for (let i = 1; i < boxes.length; i++) {
      const prev = boxes[i - 1];
      const min = prev.start + prev.width + gap;
      if (boxes[i].start < min) boxes[i].start = min;
    }
    for (let i = boxes.length - 1; i >= 0; i--) {
      const next = boxes[i + 1];
      const max = next ? next.start - gap - boxes[i].width : Infinity;
      if (boxes[i].start > max) boxes[i].start = max;
    }

    for (const b of boxes) {
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, b.start, rowY);
    }
  }

  private drawHover(layout: ChartLayout): void {
    const { w, plotH, padTop, padRight, rMax, toX, toY } = layout;
    if (this.hoverR === null || this.hoverR > rMax) return;
    const ctx = this.ctx;

    const hx = toX(this.hoverR);
    const hp = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, this.hoverR);
    const hy = toY(hp);
    const hPm = bohrToPm(this.hoverR);

    // Crosshair line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padTop);
    ctx.lineTo(hx, padTop + plotH);
    ctx.stroke();
    ctx.restore();

    // Marker at the hovered curve point
    ctx.fillStyle = CHART.text;
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CHART.curve;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tooltip card
    const line1 = `r = ${this.hoverR.toFixed(2)} a₀`;
    const line2 = `${hPm.toFixed(1)} pm · P(r) = ${hp.toFixed(4)}`;

    ctx.font = '10px ' + FONT;
    const tw = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 20;
    const th = 40;

    let tx = hx + 12;
    if (tx + tw > w - padRight) tx = hx - tw - 12;
    tx = Math.max(layout.padLeft, tx);
    const ty = Math.max(padTop + 16, Math.min(padTop + plotH - th - 4, hy - th / 2));

    ctx.fillStyle = CHART.tooltipBg;
    ctx.strokeStyle = CHART.tooltipBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = CHART.text;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '600 10px ' + FONT;
    ctx.fillText(line1, tx + 10, ty + 7);

    ctx.fillStyle = CHART.axisLabel;
    ctx.font = '10px ' + FONT;
    ctx.fillText(line2, tx + 10, ty + 22);
  }

  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
  }
}
