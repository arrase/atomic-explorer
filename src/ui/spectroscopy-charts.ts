import { energyLevelEv } from '../core/physics-constants';
import { SeriesLine, TransitionMode, wavelengthToRgb } from '../core/spectroscopy';
import { getStrings } from '../i18n';

export interface EnergyDiagramState {
  zEff: number;
  nLower: number;
  nUpper: number;
  mode: TransitionMode;
  isAllowed: boolean;
  photonHex: string;
}

export interface SpectrumStripState {
  lines: SeriesLine[];
  activeUpperN: number;
  mode: TransitionMode;
  isAllowed: boolean;
}

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
const LEVEL_COUNT = 7;
const RYDBERG_COMPRESSION_DENOM = 1 - Math.pow(LEVEL_COUNT, -0.38);

const CHART_COLORS = {
  levelInactive: 'rgba(255, 255, 255, 0.16)',
  levelHover: 'rgba(255, 255, 255, 0.45)',
  continuum: 'rgba(255, 255, 255, 0.24)',
  textMuted: '#7f8899',
  textSecondary: '#a9b1c2',
  textPrimary: '#eef1f7',
  forbidden: '#94a3b8',
  tubeBg: '#07080c',
  tubeBorder: 'rgba(255, 255, 255, 0.16)',
  zoneDivider: 'rgba(255, 255, 255, 0.18)',
} as const;

function levelYNorm(n: number): number {
  return ((1 - Math.pow(n, -0.38)) / RYDBERG_COMPRESSION_DENOM) * 0.88;
}

function formatEnergyEv(ev: number): string {
  const absVal = Math.abs(ev);
  if (absVal >= 100) return `${ev.toFixed(1)} eV`;
  return `${ev.toFixed(2)} eV`;
}

function formatCompactWavelength(nm: number): string {
  if (nm >= 1000) return `${Math.round(nm)} nm`;
  return `${nm.toFixed(1)} nm`;
}

interface InteractiveCanvasSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  prepareFrame: () => { w: number; h: number } | null;
  destroy: () => void;
}

function createInteractiveCanvas(
  container: HTMLElement,
  className: string,
  onDraw: () => void,
  onMove: (e: MouseEvent) => void,
  onLeave: () => void,
  onClick: (e: MouseEvent) => void,
): InteractiveCanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let rafId = 0;

  const resizeObserver = new ResizeObserver(() => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => onDraw());
  });
  resizeObserver.observe(container);

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('click', onClick);

  const prepareFrame = (): { w: number; h: number } | null => {
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
  };

  const destroy = (): void => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    resizeObserver.disconnect();
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mouseleave', onLeave);
    canvas.removeEventListener('click', onClick);
  };

  return { canvas, ctx, prepareFrame, destroy };
}

interface EnergyLayout {
  w: number;
  h: number;
  xLeft: number;
  xRight: number;
  padTop: number;
  plotH: number;
  levelY: (n: number) => number;
}

export class EnergyLevelDiagram {
  private readonly surface: InteractiveCanvasSurface;
  private readonly onSelectLevel: (n: number) => void;
  private hoveredLevel: number | null = null;
  private state: EnergyDiagramState = {
    zEff: 1.0,
    nLower: 2,
    nUpper: 3,
    mode: 'emission',
    isAllowed: true,
    photonHex: '#ff2b2b',
  };

  constructor(container: HTMLElement, onSelectLevel: (n: number) => void) {
    this.onSelectLevel = onSelectLevel;
    this.surface = createInteractiveCanvas(
      container,
      'energy-diagram-canvas radial-chart-canvas',
      () => this.draw(),
      (e) => this.handleMouseMove(e),
      () => this.handleMouseLeave(),
      (e) => this.handleClick(e),
    );
  }

  public update(state: EnergyDiagramState): void {
    this.state = state;
    this.draw();
  }

  public destroy(): void {
    this.surface.destroy();
  }

  private computeLayout(w: number, h: number): EnergyLayout | null {
    const padTop = 14;
    const padBottom = 14;
    const xLeft = 38;
    const xRight = w - 64;
    const plotH = h - padTop - padBottom;
    if (xRight <= xLeft + 24 || plotH <= 24) return null;
    const levelY = (n: number) => padTop + plotH * (1 - levelYNorm(n));
    return { w, h, xLeft, xRight, padTop, plotH, levelY };
  }

  private hitTestLevel(clientY: number): number | null {
    const rect = this.surface.canvas.getBoundingClientRect();
    const layout = this.computeLayout(rect.width, rect.height);
    if (!layout) return null;

    const y = clientY - rect.top;
    let bestN: number | null = null;
    let bestDist = 10.01;
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const dist = Math.abs(y - layout.levelY(n));
      if (dist <= 10 && dist < bestDist) {
        bestDist = dist;
        bestN = n;
      }
    }
    return bestN;
  }

  private handleMouseMove(e: MouseEvent): void {
    const nextHover = this.hitTestLevel(e.clientY);
    if (nextHover !== this.hoveredLevel) {
      this.hoveredLevel = nextHover;
      this.surface.canvas.style.cursor = nextHover !== null ? 'pointer' : 'default';
      this.draw();
    }
  }

  private handleMouseLeave(): void {
    if (this.hoveredLevel !== null) {
      this.hoveredLevel = null;
      this.surface.canvas.style.cursor = 'default';
      this.draw();
    }
  }

  private handleClick(e: MouseEvent): void {
    const level = this.hitTestLevel(e.clientY);
    if (level !== null) {
      this.onSelectLevel(level);
    }
  }

  private draw(): void {
    const size = this.surface.prepareFrame();
    if (!size) return;
    const layout = this.computeLayout(size.w, size.h);
    if (!layout) return;

    this.drawContinuum(layout);
    this.drawLevels(layout);
    this.drawEnergyLabels(layout);
    this.drawTransition(layout);
  }

  private drawContinuum(layout: EnergyLayout): void {
    const ctx = this.surface.ctx;
    const yInf = layout.padTop;

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = CHART_COLORS.continuum;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.xLeft, yInf);
    ctx.lineTo(layout.xRight, yInf);
    ctx.stroke();
    ctx.restore();

    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = CHART_COLORS.textMuted;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText('n=∞', layout.xLeft - 6, yInf);
    ctx.textAlign = 'left';
    ctx.fillText('0 eV', layout.xRight + 6, yInf);
  }

  private resolveLevelStroke(isActive: boolean, isHovered: boolean, activeColor: string): string {
    if (isActive) return activeColor;
    if (isHovered) return CHART_COLORS.levelHover;
    return CHART_COLORS.levelInactive;
  }

  private resolveLevelText(isActive: boolean, isHovered: boolean): string {
    if (isActive) return CHART_COLORS.textPrimary;
    if (isHovered) return CHART_COLORS.textSecondary;
    return CHART_COLORS.textMuted;
  }

  private drawLevels(layout: EnergyLayout): void {
    const ctx = this.surface.ctx;
    const { nLower, nUpper, isAllowed, photonHex } = this.state;
    const activeColor = isAllowed ? photonHex : CHART_COLORS.forbidden;

    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const y = layout.levelY(n);
      const isActive = n === nLower || n === nUpper;
      const isHovered = n === this.hoveredLevel;

      ctx.beginPath();
      ctx.moveTo(layout.xLeft, y);
      ctx.lineTo(layout.xRight, y);
      ctx.lineWidth = isActive ? 2 : 1.1;
      ctx.strokeStyle = this.resolveLevelStroke(isActive, isHovered, activeColor);
      ctx.stroke();

      ctx.font = `${isActive ? '600 ' : ''}10px ${FONT}`;
      ctx.fillStyle = this.resolveLevelText(isActive, isHovered);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`n=${n}`, layout.xLeft - 6, y);
    }
  }

  private drawEnergyLabels(layout: EnergyLayout): void {
    const { zEff, nLower, nUpper } = this.state;
    const occupiedY: number[] = [layout.padTop];

    const yUpperRaw = layout.levelY(nUpper);
    const yLowerRaw = layout.levelY(nLower);
    const minGap = 11;
    let yUpper = Math.max(layout.padTop + minGap, yUpperRaw);
    let yLower = yLowerRaw;
    if (yLower - yUpper < minGap) {
      yUpper = Math.max(layout.padTop + minGap, yLower - minGap);
      yLower = Math.max(yUpper + minGap, yLowerRaw);
    }

    this.drawSingleEnergyLabel(layout.xRight + 6, yUpper, energyLevelEv(nUpper, zEff), true);
    this.drawSingleEnergyLabel(layout.xRight + 6, yLower, energyLevelEv(nLower, zEff), true);
    occupiedY.push(yUpper, yLower);

    const keyLevels = [1, 2, 3, 4];
    for (const n of keyLevels) {
      if (n === nLower || n === nUpper) continue;
      const y = layout.levelY(n);
      const clear = occupiedY.every((prevY) => Math.abs(prevY - y) >= 12);
      if (clear) {
        this.drawSingleEnergyLabel(layout.xRight + 6, y, energyLevelEv(n, zEff), false);
        occupiedY.push(y);
      }
    }
  }

  private drawSingleEnergyLabel(x: number, y: number, energyEv: number, active: boolean): void {
    const ctx = this.surface.ctx;
    ctx.font = `${active ? '600 ' : ''}10px ${FONT}`;
    ctx.fillStyle = active ? CHART_COLORS.textPrimary : CHART_COLORS.textMuted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatEnergyEv(energyEv), x, y);
  }

  private drawTransition(layout: EnergyLayout): void {
    const ctx = this.surface.ctx;
    const { nLower, nUpper, mode, isAllowed, photonHex } = this.state;
    const yUpper = layout.levelY(nUpper);
    const yLower = layout.levelY(nLower);
    const yStart = mode === 'emission' ? yUpper : yLower;
    const yEnd = mode === 'emission' ? yLower : yUpper;
    const dir = yEnd > yStart ? 1 : -1;
    const arrowX = layout.xLeft + (layout.xRight - layout.xLeft) * 0.36;
    const strokeColor = isAllowed ? photonHex : CHART_COLORS.forbidden;

    ctx.save();
    if (isAllowed) {
      ctx.shadowColor = photonHex;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.2;
    } else {
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.6;
    }
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(arrowX, yStart);
    ctx.lineTo(arrowX, yEnd - dir * 5);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(arrowX, yStart, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(arrowX, yEnd);
    ctx.lineTo(arrowX - 4.5, yEnd - dir * 7);
    ctx.lineTo(arrowX + 4.5, yEnd - dir * 7);
    ctx.closePath();
    ctx.fill();

    if (isAllowed) {
      const yMid = 0.5 * (yUpper + yLower);
      const waveLeft = arrowX + 8;
      const waveRight = Math.min(layout.xRight - 22, arrowX + 48);
      if (waveRight > waveLeft + 14) {
        const xFrom = mode === 'emission' ? waveLeft : waveRight;
        const xTo = mode === 'emission' ? waveRight : waveLeft;
        this.drawWavyPhoton(xFrom, xTo, yMid, photonHex, waveRight + 5);
      }
    }
  }

  private drawWavyPhoton(
    xFrom: number,
    xTo: number,
    yMid: number,
    color: string,
    labelX: number,
  ): void {
    const ctx = this.surface.ctx;
    const dx = xTo - xFrom;
    const sign = dx >= 0 ? 1 : -1;
    const bodySpan = dx - sign * 5;
    const steps = 28;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = xFrom + bodySpan * t;
      const y = yMid + Math.sin(t * Math.PI * 5) * 3.2 * Math.sin(t * Math.PI);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xTo, yMid);
    ctx.lineTo(xTo - sign * 5.5, yMid - 3.5);
    ctx.lineTo(xTo - sign * 5.5, yMid + 3.5);
    ctx.closePath();
    ctx.fill();

    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('hν', labelX, yMid);
  }
}

function wavelengthToNormX(nm: number): number {
  if (nm <= 380) {
    const t = Math.max(0.02, Math.min(1, (nm - 20) / (380 - 20)));
    return t * 0.22;
  }
  if (nm <= 750) {
    const t = (nm - 380) / (750 - 380);
    return 0.22 + t * 0.56;
  }
  const logMin = Math.log(750);
  const logMax = Math.log(8000);
  const t = Math.max(0, Math.min(0.98, (Math.log(nm) - logMin) / (logMax - logMin)));
  return 0.78 + t * 0.22;
}

interface TubeRect {
  w: number;
  h: number;
  x: number;
  y: number;
  width: number;
  height: number;
  toX: (nm: number) => number;
}

function fillVisibleSpectrumGradient(
  ctx: CanvasRenderingContext2D,
  xVisStart: number,
  xVisEnd: number,
): CanvasGradient {
  const grad = ctx.createLinearGradient(xVisStart, 0, xVisEnd, 0);
  const sampleCount = 16;
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const nm = 380 + t * (750 - 380);
    grad.addColorStop(t, wavelengthToRgb(nm).hex);
  }
  return grad;
}

export class DischargeSpectrumStrip {
  private readonly surface: InteractiveCanvasSurface;
  private readonly onSelectUpperN: (nUpper: number) => void;
  private hoveredUpperN: number | null = null;
  private state: SpectrumStripState = {
    lines: [],
    activeUpperN: 3,
    mode: 'emission',
    isAllowed: true,
  };

  constructor(container: HTMLElement, onSelectUpperN: (nUpper: number) => void) {
    this.onSelectUpperN = onSelectUpperN;
    this.surface = createInteractiveCanvas(
      container,
      'spectrum-strip-canvas radial-chart-canvas',
      () => this.draw(),
      (e) => this.handleMouseMove(e),
      () => this.handleMouseLeave(),
      (e) => this.handleClick(e),
    );
  }

  public update(state: SpectrumStripState): void {
    this.state = state;
    this.draw();
  }

  public destroy(): void {
    this.surface.destroy();
  }

  private computeTube(w: number, h: number): TubeRect | null {
    const x = 8;
    const width = w - 16;
    const y = 20;
    const height = h - 36;
    if (width <= 40 || height <= 16) return null;
    const toX = (nm: number) => x + wavelengthToNormX(nm) * width;
    return { w, h, x, y, width, height, toX };
  }

  private hitTestUpperN(clientX: number): number | null {
    const rect = this.surface.canvas.getBoundingClientRect();
    const tube = this.computeTube(rect.width, rect.height);
    if (!tube || this.state.lines.length === 0) return null;

    const px = clientX - rect.left;
    let bestUpperN: number | null = null;
    let bestDist = 11.01;
    for (const line of this.state.lines) {
      const dist = Math.abs(px - tube.toX(line.wavelengthNm));
      if (dist <= 11 && dist < bestDist) {
        bestDist = dist;
        bestUpperN = line.nUpper;
      }
    }
    return bestUpperN;
  }

  private handleMouseMove(e: MouseEvent): void {
    const nextHover = this.hitTestUpperN(e.clientX);
    if (nextHover !== this.hoveredUpperN) {
      this.hoveredUpperN = nextHover;
      this.surface.canvas.style.cursor = nextHover !== null ? 'pointer' : 'default';
      this.draw();
    }
  }

  private handleMouseLeave(): void {
    if (this.hoveredUpperN !== null) {
      this.hoveredUpperN = null;
      this.surface.canvas.style.cursor = 'default';
      this.draw();
    }
  }

  private handleClick(e: MouseEvent): void {
    const nUpper = this.hitTestUpperN(e.clientX);
    if (nUpper !== null) {
      this.onSelectUpperN(nUpper);
    }
  }

  private draw(): void {
    const size = this.surface.prepareFrame();
    if (!size) return;
    const tube = this.computeTube(size.w, size.h);
    if (!tube) return;

    const ctx = this.surface.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tube.x, tube.y, tube.width, tube.height, 6);
    ctx.clip();

    if (this.state.mode === 'emission') {
      this.drawEmissionInterior(tube);
    } else {
      this.drawAbsorptionInterior(tube);
    }
    this.drawZoneDividers(tube);
    ctx.restore();

    ctx.strokeStyle = CHART_COLORS.tubeBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tube.x, tube.y, tube.width, tube.height, 6);
    ctx.stroke();

    this.drawActiveMarker(tube);
    this.drawFooterLabels(tube);
  }

  private drawEmissionInterior(tube: TubeRect): void {
    const ctx = this.surface.ctx;
    ctx.fillStyle = CHART_COLORS.tubeBg;
    ctx.fillRect(tube.x, tube.y, tube.width, tube.height);

    const xVisStart = tube.x + tube.width * 0.22;
    const xVisEnd = tube.x + tube.width * 0.78;
    ctx.fillStyle = fillVisibleSpectrumGradient(ctx, xVisStart, xVisEnd);
    ctx.fillRect(xVisStart, tube.y + tube.height - 3, xVisEnd - xVisStart, 3);

    for (const line of this.state.lines) {
      const lx = tube.toX(line.wavelengthNm);
      const isActive = line.nUpper === this.state.activeUpperN;
      const isForbiddenActive = isActive && !this.state.isAllowed;
      this.drawSingleEmissionLine(lx, tube, line.color.hex, isActive, isForbiddenActive);
    }
  }

  private drawSingleEmissionLine(
    lx: number,
    tube: TubeRect,
    hex: string,
    isActive: boolean,
    isForbiddenActive: boolean,
  ): void {
    const ctx = this.surface.ctx;
    ctx.save();
    if (isForbiddenActive) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.5;
    } else {
      ctx.shadowColor = hex;
      ctx.shadowBlur = isActive ? 12 : 6;
      ctx.strokeStyle = hex;
      ctx.globalAlpha = isActive ? 1.0 : 0.78;
      ctx.lineWidth = isActive ? 2.6 : 1.7;
    }
    ctx.beginPath();
    ctx.moveTo(lx, tube.y);
    ctx.lineTo(lx, tube.y + tube.height - 3);
    ctx.stroke();

    if (isActive && !isForbiddenActive) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, tube.y + 1);
      ctx.lineTo(lx, tube.y + tube.height - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAbsorptionInterior(tube: TubeRect): void {
    const ctx = this.surface.ctx;
    const xVisStart = tube.x + tube.width * 0.22;
    const xVisEnd = tube.x + tube.width * 0.78;

    const uvGrad = ctx.createLinearGradient(tube.x, 0, xVisStart, 0);
    uvGrad.addColorStop(0, '#0d0918');
    uvGrad.addColorStop(1, '#311456');
    ctx.fillStyle = uvGrad;
    ctx.fillRect(tube.x, tube.y, xVisStart - tube.x, tube.height);

    ctx.fillStyle = fillVisibleSpectrumGradient(ctx, xVisStart, xVisEnd);
    ctx.fillRect(xVisStart, tube.y, xVisEnd - xVisStart, tube.height);

    const irGrad = ctx.createLinearGradient(xVisEnd, 0, tube.x + tube.width, 0);
    irGrad.addColorStop(0, '#4a0d19');
    irGrad.addColorStop(1, '#11070b');
    ctx.fillStyle = irGrad;
    ctx.fillRect(xVisEnd, tube.y, tube.x + tube.width - xVisEnd, tube.height);

    for (const line of this.state.lines) {
      const lx = tube.toX(line.wavelengthNm);
      const isActive = line.nUpper === this.state.activeUpperN;
      const isForbiddenActive = isActive && !this.state.isAllowed;

      ctx.save();
      if (isForbiddenActive) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = '#05060a';
        ctx.lineWidth = isActive ? 2.8 : 1.8;
      }
      ctx.beginPath();
      ctx.moveTo(lx, tube.y);
      ctx.lineTo(lx, tube.y + tube.height);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawZoneDividers(tube: TubeRect): void {
    const ctx = this.surface.ctx;
    const dividers = [tube.x + tube.width * 0.22, tube.x + tube.width * 0.78];
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = CHART_COLORS.zoneDivider;
    ctx.lineWidth = 1;
    for (const dx of dividers) {
      ctx.beginPath();
      ctx.moveTo(dx, tube.y);
      ctx.lineTo(dx, tube.y + tube.height);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawActiveMarker(tube: TubeRect): void {
    const activeLine = this.state.lines.find((l) => l.nUpper === this.state.activeUpperN);
    if (!activeLine) return;

    const ctx = this.surface.ctx;
    const ax = tube.toX(activeLine.wavelengthNm);
    const markerColor = this.state.isAllowed ? activeLine.color.hex : CHART_COLORS.forbidden;

    ctx.fillStyle = markerColor;
    ctx.beginPath();
    ctx.moveTo(ax, tube.y - 1);
    ctx.lineTo(ax - 4.5, tube.y - 7);
    ctx.lineTo(ax + 4.5, tube.y - 7);
    ctx.closePath();
    ctx.fill();

    const caption = formatCompactWavelength(activeLine.wavelengthNm);
    ctx.font = `600 10px ${FONT}`;
    const textW = ctx.measureText(caption).width;
    const clampedX = Math.max(tube.x, Math.min(tube.x + tube.width - textW, ax - textW / 2));
    ctx.fillStyle = this.state.isAllowed ? CHART_COLORS.textPrimary : CHART_COLORS.forbidden;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(caption, clampedX, tube.y - 8);
  }

  private drawFooterLabels(tube: TubeRect): void {
    const ctx = this.surface.ctx;
    const strings = getStrings();
    const yFooter = tube.y + tube.height + 4;

    ctx.font = `9.5px ${FONT}`;
    ctx.fillStyle = CHART_COLORS.textMuted;
    ctx.textBaseline = 'top';

    ctx.textAlign = 'center';
    ctx.fillText(strings.bandUV, tube.x + tube.width * 0.11, yFooter);
    ctx.fillText(strings.bandVisible, tube.x + tube.width * 0.5, yFooter);
    ctx.fillText(strings.bandIR, tube.x + tube.width * 0.89, yFooter);

    ctx.fillStyle = CHART_COLORS.textSecondary;
    ctx.fillText('380', tube.x + tube.width * 0.22, yFooter);
    ctx.fillText('750', tube.x + tube.width * 0.78, yFooter);
  }
}
