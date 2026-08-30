import { getStrings } from '../i18n';

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
      // Bisection refinement
      let left = prevRho;
      let right = rho;
      for (let b = 0; b < 16; b++) {
        const mid = 0.5 * (left + right);
        const midVal = associatedLaguerre(p, q, mid);
        if (midVal === 0) {
          left = mid;
          right = mid;
          break;
        }
        if ((prevVal > 0 && midVal > 0) || (prevVal < 0 && midVal < 0)) {
          left = mid;
        } else {
          right = mid;
        }
      }
      const rootRho = 0.5 * (left + right);
      const rootR = (n * rootRho) / (2 * zEff);
      nodes.push(rootR);
      if (nodes.length === p) break;
    }
    prevRho = rho;
    prevVal = val;
  }

  return nodes;
}

export class RadialDistributionChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private resizeObserver: ResizeObserver;

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
      this.draw();
    });
    this.resizeObserver.observe(this.container);

    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
  }

  public update(n: number, l: number, zEff: number): void {
    this.n = n;
    this.l = l;
    this.zEff = zEff;

    this.expR = (0.5 / this.zEff) * (3 * n * n - l * (l + 1));
    this.radialNodes = findRadialNodes(n, l, this.zEff);
    this.calculatePeak();
    this.draw();
  }

  public getPeakRadius(): { rBohr: number; rPm: number } {
    return {
      rBohr: this.peakR,
      rPm: this.peakR * 52.917721,
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

  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 44;
    const padRight = 16;
    const plotWidth = rect.width - padLeft - padRight;

    if (x >= padLeft && x <= rect.width - padRight && plotWidth > 0) {
      const rMax = Math.max(2.4 * this.expR, 4.0 / this.zEff);
      const ratio = (x - padLeft) / plotWidth;
      this.hoverR = Math.max(0, Math.min(rMax, ratio * rMax));
    } else {
      this.hoverR = null;
    }
    this.draw();
  };

  private handleMouseLeave = (): void => {
    this.hoverR = null;
    this.draw();
  };

  public draw(): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    const ctx = this.ctx;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    const padLeft = 44;
    const padRight = 16;
    const padTop = 22;
    const padBottom = 28;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    if (plotW <= 0 || plotH <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const rMax = Math.max(2.4 * this.expR, 4.0 / this.zEff);

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
    const yMax = pMax * 1.18;

    const toX = (r: number) => padLeft + (r / rMax) * plotW;
    const toY = (p: number) => padTop + plotH - (p / yMax) * plotH;

    // Draw Grid & Axes
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillStyle = '#8080a0';
    ctx.font = '10px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Horizontal grid lines
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = (i / yTicks) * yMax;
      const yPos = toY(yVal);

      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(w - padRight, yPos);
      ctx.stroke();

      const label = yVal.toFixed(yMax < 0.1 ? 3 : 2);
      ctx.fillText(label, padLeft - 6, yPos);
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

      ctx.fillText(`${xVal.toFixed(1)}`, xPos, padTop + plotH + 6);
    }

    // Axis Labels
    const strings = getStrings();
    ctx.fillStyle = '#a0a0c0';
    ctx.font = '10px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(strings.chartRadiusAxis, w - padRight, padTop + plotH + 6);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(strings.chartProbAxis, padLeft, padTop - 6);

    // Area Fill under Curve
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    for (let i = 0; i <= pointCount; i++) {
      ctx.lineTo(toX(rValues[i]), toY(pValues[i]));
    }
    ctx.lineTo(toX(rMax), toY(0));
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    areaGrad.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
    areaGrad.addColorStop(0.6, 'rgba(32, 128, 255, 0.18)');
    areaGrad.addColorStop(1, 'rgba(124, 58, 237, 0.02)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Curve Stroke
    ctx.beginPath();
    ctx.moveTo(toX(rValues[0]), toY(pValues[0]));
    for (let i = 1; i <= pointCount; i++) {
      ctx.lineTo(toX(rValues[i]), toY(pValues[i]));
    }

    const strokeGrad = ctx.createLinearGradient(padLeft, 0, w - padRight, 0);
    strokeGrad.addColorStop(0, '#00e5ff');
    strokeGrad.addColorStop(0.5, '#38bdf8');
    strokeGrad.addColorStop(1, '#a855f7');

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = strokeGrad;
    ctx.stroke();

    // Radial Nodes Markers (P(r) = 0)
    this.radialNodes.forEach((nodeR) => {
      if (nodeR <= rMax) {
        const nx = toX(nodeR);
        const ny = toY(0);

        // Dashed line
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(nx, padTop);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        ctx.restore();

        // Glowing node dot on baseline
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fca5a5';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(strings.chartNodeLabel, nx, ny - 4);
      }
    });

    // Expectation Radius <r> Marker
    if (this.expR <= rMax) {
      const ex = toX(this.expR);
      const ey = toY(calculateRadialProbabilityDensity(this.n, this.l, this.zEff, this.expR));

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ex, padTop);
      ctx.lineTo(ex, padTop + plotH);
      ctx.stroke();
      ctx.restore();

      // Top badge
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`⟨r⟩ ${this.expR.toFixed(2)}`, ex, padTop + 2);

      // Dot on curve
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Peak Radius r_max Marker
    if (this.peakR <= rMax) {
      const px = toX(this.peakR);
      const py = toY(calculateRadialProbabilityDensity(this.n, this.l, this.zEff, this.peakR));

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();
      ctx.restore();

      // Diamond marker on peak
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(px, py - 5);
      ctx.lineTo(px + 4, py);
      ctx.lineTo(px, py + 5);
      ctx.lineTo(px - 4, py);
      ctx.closePath();
      ctx.fill();

      // Top label
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`r_max ${this.peakR.toFixed(2)}`, px, py - 6);
    }

    // Hover Crosshair & Dynamic Values
    if (this.hoverR !== null && this.hoverR <= rMax) {
      const hx = toX(this.hoverR);
      const hp = calculateRadialProbabilityDensity(this.n, this.l, this.zEff, this.hoverR);
      const hy = toY(hp);
      const hPm = this.hoverR * 52.917721;

      // Crosshair line
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.stroke();
      ctx.restore();

      // Glowing dot at hover curve point
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2080ff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hover Card Badge
      const tooltipText1 = `r = ${this.hoverR.toFixed(2)} a₀ (${hPm.toFixed(1)} pm)`;
      const tooltipText2 = `P(r) = ${hp.toFixed(4)}`;

      ctx.font = '10px monospace';
      const tw = Math.max(ctx.measureText(tooltipText1).width, ctx.measureText(tooltipText2).width) + 16;
      const th = 34;

      let tx = hx + 10;
      if (tx + tw > w - padRight) {
        tx = hx - tw - 10;
      }
      let ty = Math.max(padTop + 4, Math.min(padTop + plotH - th - 4, hy - th / 2));

      ctx.fillStyle = 'rgba(14, 14, 28, 0.88)';
      ctx.strokeStyle = 'rgba(64, 192, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, th, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(tooltipText1, tx + 8, ty + 5);

      ctx.fillStyle = '#40c0ff';
      ctx.fillText(tooltipText2, tx + 8, ty + 18);
    }
  }

  public destroy(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
  }
}
