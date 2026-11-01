import { BOND_R_MAX, BOND_R_MIN, LCAO_CURVE_STRIDE, MoOrderMode } from '../core/lcao';
import { getStrings } from '../i18n';

export interface PotentialChartData {
  curve: Float32Array;
  currentR: number;
  rEqBohr: number;
  dEEv: number;
  mode: MoOrderMode;
  isUnstableDimer: boolean;
}

interface PotentialLayout {
  w: number;
  h: number;
  plotW: number;
  plotH: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  yMin: number;
  yMax: number;
  toX: (r: number) => number;
  toY: (e: number) => number;
}

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
const PAD = { top: 20, right: 14, bottom: 32, left: 42 } as const;

const PALETTE = {
  gridLine: 'rgba(255, 255, 255, 0.06)',
  axisLine: 'rgba(255, 255, 255, 0.14)',
  zeroAsymptote: 'rgba(255, 255, 255, 0.28)',
  tick: '#7f8899',
  axisLabel: '#a9b1c2',
  bonding: '#4f8ff7',
  bondingGlow: 'rgba(79, 143, 247, 0.28)',
  wellFillTop: 'rgba(79, 143, 247, 0.04)',
  wellFillBottom: 'rgba(79, 143, 247, 0.28)',
  antibonding: '#f87171',
  antibondingGlow: 'rgba(248, 113, 113, 0.28)',
  equilibrium: '#34d399',
  cursorLine: 'rgba(255, 255, 255, 0.34)',
  pillBg: 'rgba(16, 19, 25, 0.94)',
  pillBorder: 'rgba(255, 255, 255, 0.18)',
  text: '#eef1f7',
} as const;

export class PotentialEnergyChart {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onScrubR: (newR: number) => void;
  private readonly resizeObserver: ResizeObserver;
  private animationFrameId = 0;
  private isScrubbing = false;
  private data: PotentialChartData | null = null;

  constructor(container: HTMLElement, onScrubR: (newR: number) => void) {
    this.container = container;
    this.onScrubR = onScrubR;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'radial-chart-canvas potential-chart-canvas';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'ew-resize';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = requestAnimationFrame(() => this.draw());
    });
    this.resizeObserver.observe(this.container);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerEnd);
    this.canvas.addEventListener('pointercancel', this.handlePointerEnd);
    this.canvas.addEventListener('lostpointercapture', this.handlePointerEnd);
  }

  public update(data: PotentialChartData): void {
    this.data = data;
    this.draw();
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.isScrubbing = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.scrubAtClientX(e.clientX);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    if (!this.isScrubbing) return;
    this.scrubAtClientX(e.clientX);
  };

  private readonly handlePointerEnd = (): void => {
    this.isScrubbing = false;
  };

  private scrubAtClientX(clientX: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const plotW = rect.width - PAD.left - PAD.right;
    if (plotW <= 0) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - PAD.left) / plotW));
    const rawR = BOND_R_MIN + ratio * (BOND_R_MAX - BOND_R_MIN);
    const quantized = Math.round(rawR / 0.02) * 0.02;
    const clampedR = Math.max(BOND_R_MIN, Math.min(BOND_R_MAX, Number(quantized.toFixed(2))));
    this.onScrubR(clampedR);
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
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;
    if (plotW <= 0 || plotH <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const dEEv = this.data ? this.data.dEEv : 4.75;
    const yMin = -Math.max(dEEv * 1.35, 2.0);
    const yMax = Math.max(dEEv * 1.6, 4.0);

    const toX = (r: number) => PAD.left + ((r - BOND_R_MIN) / (BOND_R_MAX - BOND_R_MIN)) * plotW;
    const toY = (e: number) => PAD.top + ((yMax - e) / (yMax - yMin)) * plotH;

    const layout: PotentialLayout = {
      w,
      h,
      plotW,
      plotH,
      padLeft: PAD.left,
      padRight: PAD.right,
      padTop: PAD.top,
      yMin,
      yMax,
      toX,
      toY,
    };

    this.drawGridAndAxes(layout);

    if (!this.data || this.data.curve.length < LCAO_CURVE_STRIDE * 2) return;
    const count = Math.floor(this.data.curve.length / LCAO_CURVE_STRIDE);

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, plotW, plotH);
    ctx.clip();

    this.drawBondingWellFill(this.data.curve, count, layout);
    this.drawCurveStroke(this.data.curve, count, 2, layout, PALETTE.antibonding, this.data.mode === 'antibonding');
    this.drawCurveStroke(this.data.curve, count, 1, layout, PALETTE.bonding, this.data.mode === 'bonding');
    ctx.restore();

    this.drawEquilibriumMarker(this.data, layout);
    this.drawLiveCursor(this.data, count, layout);
  }

  private drawGridAndAxes(layout: PotentialLayout): void {
    const { w, plotW, plotH, padLeft, padRight, padTop, yMin, yMax, toX, toY } = layout;
    const ctx = this.ctx;

    ctx.lineWidth = 1;
    ctx.strokeStyle = PALETTE.gridLine;
    ctx.fillStyle = PALETTE.tick;
    ctx.font = `10px ${FONT}`;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const eVal = yMin + (i / yTicks) * (yMax - yMin);
      const yPos = toY(eVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(w - padRight, yPos);
      ctx.stroke();
      ctx.fillText(eVal.toFixed(1), padLeft - 6, yPos);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = [1, 3, 5, 7, 10];
    for (const rVal of xTicks) {
      const xPos = toX(rVal);
      ctx.beginPath();
      ctx.moveTo(xPos, padTop);
      ctx.lineTo(xPos, padTop + plotH);
      ctx.stroke();
      ctx.fillText(rVal.toFixed(0), xPos, padTop + plotH + 6);
    }

    const zeroY = toY(0);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = PALETTE.zeroAsymptote;
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroY);
    ctx.lineTo(w - padRight, zeroY);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = PALETTE.axisLine;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    ctx.lineTo(w - padRight, padTop + plotH);
    ctx.stroke();

    const strings = getStrings();
    ctx.fillStyle = PALETTE.axisLabel;
    ctx.font = `10px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(strings.chartDistanceAxis, padLeft + plotW / 2, padTop + plotH + 19);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(strings.chartEnergyAxis, 8, padTop - 5);
  }

  private drawBondingWellFill(curve: Float32Array, count: number, layout: PotentialLayout): void {
    const { plotW, plotH, padLeft, padTop, toX, toY } = layout;
    const ctx = this.ctx;
    const zeroY = toY(0);
    const bottomY = padTop + plotH;
    if (zeroY >= bottomY) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, zeroY, plotW, bottomY - zeroY);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(toX(curve[0]), zeroY);
    for (let i = 0; i < count; i++) {
      const idx = i * LCAO_CURVE_STRIDE;
      ctx.lineTo(toX(curve[idx]), toY(curve[idx + 1]));
    }
    ctx.lineTo(toX(curve[(count - 1) * LCAO_CURVE_STRIDE]), zeroY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, zeroY, 0, bottomY);
    grad.addColorStop(0, PALETTE.wellFillTop);
    grad.addColorStop(1, PALETTE.wellFillBottom);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  private drawCurveStroke(
    curve: Float32Array,
    count: number,
    offset: 1 | 2,
    layout: PotentialLayout,
    color: string,
    isActive: boolean,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = isActive ? 1.0 : 0.45;
    ctx.lineWidth = isActive ? 2.5 : 1.5;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const idx = i * LCAO_CURVE_STRIDE;
      const x = layout.toX(curve[idx]);
      const y = layout.toY(curve[idx + offset]);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawEquilibriumMarker(data: PotentialChartData, layout: PotentialLayout): void {
    const { w, plotH, padLeft, padRight, padTop, toX, toY } = layout;
    if (data.rEqBohr < BOND_R_MIN || data.rEqBohr > BOND_R_MAX) return;

    const ctx = this.ctx;
    const eqX = toX(data.rEqBohr);
    const eqY = Math.max(padTop + 5, Math.min(padTop + plotH - 5, toY(-data.dEEv)));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(eqX, eqY - 5);
    ctx.lineTo(eqX + 4.5, eqY);
    ctx.lineTo(eqX, eqY + 5);
    ctx.lineTo(eqX - 4.5, eqY);
    ctx.closePath();

    if (data.isUnstableDimer) {
      ctx.strokeStyle = PALETTE.equilibrium;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = PALETTE.equilibrium;
      ctx.fill();
    }

    const label = data.isUnstableDimer
      ? `R_eq(σ) ${data.rEqBohr.toFixed(2)}`
      : `R_eq ${data.rEqBohr.toFixed(2)}`;
    ctx.font = `600 10px ${FONT}`;
    const labelW = ctx.measureText(label).width;
    const lx = Math.max(padLeft + 2, Math.min(w - padRight - labelW - 2, eqX - labelW / 2));
    const ly = Math.min(padTop + plotH - 3, eqY + 13);
    ctx.fillStyle = PALETTE.equilibrium;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, lx, ly);
    ctx.restore();
  }

  private interpolateEnergyAtR(curve: Float32Array, count: number, r: number, mode: MoOrderMode): number {
    const ratio = (r - BOND_R_MIN) / (BOND_R_MAX - BOND_R_MIN);
    const pos = Math.max(0, Math.min(count - 1, ratio * (count - 1)));
    const idx0 = Math.min(count - 2, Math.floor(pos));
    const frac = pos - idx0;
    const offset = mode === 'bonding' ? 1 : 2;
    const e0 = curve[idx0 * LCAO_CURVE_STRIDE + offset];
    const e1 = curve[(idx0 + 1) * LCAO_CURVE_STRIDE + offset];
    return e0 + (e1 - e0) * frac;
  }

  private drawLiveCursor(data: PotentialChartData, count: number, layout: PotentialLayout): void {
    const { w, plotH, padLeft, padRight, padTop, toX, toY } = layout;
    const ctx = this.ctx;
    const cx = toX(data.currentR);
    const activeE = this.interpolateEnergyAtR(data.curve, count, data.currentR, data.mode);
    const cy = Math.max(padTop, Math.min(padTop + plotH, toY(activeE)));
    const isBonding = data.mode === 'bonding';
    const accent = isBonding ? PALETTE.bonding : PALETTE.antibonding;
    const glow = isBonding ? PALETTE.bondingGlow : PALETTE.antibondingGlow;

    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = PALETTE.cursorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, padTop);
    ctx.lineTo(cx, padTop + plotH);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.text;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    const sign = activeE >= 0 ? '+' : '';
    const pillText = `R = ${data.currentR.toFixed(2)} a₀ · ${sign}${activeE.toFixed(2)} eV`;
    ctx.font = `600 10px ${FONT}`;
    const pillW = ctx.measureText(pillText).width + 14;
    const pillH = 20;

    let px = cx + 10;
    if (px + pillW > w - padRight) {
      px = cx - pillW - 10;
    }
    px = Math.max(padLeft + 2, px);
    const py = Math.max(padTop + 3, Math.min(padTop + plotH - pillH - 16, cy - pillH / 2));

    ctx.fillStyle = PALETTE.pillBg;
    ctx.strokeStyle = PALETTE.pillBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(px, py, pillW, pillH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillText, px + 7, py + pillH / 2);
  }

  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerEnd);
    this.canvas.removeEventListener('pointercancel', this.handlePointerEnd);
    this.canvas.removeEventListener('lostpointercapture', this.handlePointerEnd);
  }
}
