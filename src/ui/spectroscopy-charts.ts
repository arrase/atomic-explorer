import { energyLevelEv } from '../core/physics-constants';
import { SeriesLine, TransitionMode, wavelengthToRgb } from '../core/spectroscopy';
import { getStrings } from '../i18n';
import { CHART_FONT as FONT, ChartSurface, createChartSurface } from './chart-canvas';

export interface EnergyDiagramState {
  zEff: number;
  nLower: number;
  nUpper: number;
  lLower: number;
  lUpper: number;
  mLower: number;
  mUpper: number;
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

const LEVEL_COUNT = 7;
const RYDBERG_EXPONENT = -0.26;
const RYDBERG_COMPRESSION_DENOM = 1 - Math.pow(LEVEL_COUNT, RYDBERG_EXPONENT);
const SUBSHELL_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i'] as const;

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
  return ((1 - Math.pow(n, RYDBERG_EXPONENT)) / RYDBERG_COMPRESSION_DENOM) * 0.88;
}

function formatSubshellLabel(n: number, l: number, m: number): string {
  const letter = SUBSHELL_LETTERS[l];
  const mStr = m > 0 ? `+${m}` : `${m}`;
  return `${n}${letter} (m=${mStr})`;
}

function drawPillBadge(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  centerY: number,
  text: string,
  textColor: string,
  borderColor: string,
  fillColor: string,
): void {
  ctx.save();
  ctx.font = `600 9.5px ${FONT}`;
  const padX = 5;
  const pillH = 14;
  const pillW = ctx.measureText(text).width + padX * 2;
  const x = rightX - pillW;
  const y = centerY - pillH / 2;

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, pillW, pillH, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, rightX - padX, centerY);
  ctx.restore();
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

type InteractiveCanvasSurface = ChartSurface;

function createInteractiveCanvas(
  container: HTMLElement,
  className: string,
  onDraw: () => void,
  onMove: (e: MouseEvent) => void,
  onLeave: () => void,
  onClick: (e: MouseEvent) => void,
): InteractiveCanvasSurface {
  const surface = createChartSurface(container, className, onDraw);
  const { canvas } = surface;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('click', onClick);

  const destroy = (): void => {
    surface.destroy();
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mouseleave', onLeave);
    canvas.removeEventListener('click', onClick);
  };

  return { ...surface, destroy };
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
    lLower: 1,
    lUpper: 2,
    mLower: 0,
    mUpper: 0,
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
    this.drawHoverBadge(layout);
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

  private computeLeftLabelYs(layout: EnergyLayout): number[] {
    const minGap = 11;
    const minY = layout.padTop + 10;
    const maxY = layout.levelY(1);
    const labelY: number[] = [];

    for (let n = 1; n <= LEVEL_COUNT; n++) {
      labelY[n] = layout.levelY(n);
    }
    for (let n = 2; n <= LEVEL_COUNT; n++) {
      labelY[n] = Math.min(labelY[n], labelY[n - 1] - minGap);
    }
    labelY[LEVEL_COUNT] = Math.max(minY, labelY[LEVEL_COUNT]);
    for (let n = LEVEL_COUNT - 1; n >= 1; n--) {
      labelY[n] = Math.min(maxY, Math.max(labelY[n], labelY[n + 1] + minGap));
    }
    return labelY;
  }

  private drawLevels(layout: EnergyLayout): void {
    const ctx = this.surface.ctx;
    const { nLower, nUpper, isAllowed, photonHex } = this.state;
    const activeColor = isAllowed ? photonHex : CHART_COLORS.forbidden;
    const labelYs = this.computeLeftLabelYs(layout);

    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const y = layout.levelY(n);
      const ly = labelYs[n];
      const isActive = n === nLower || n === nUpper;
      const isHovered = n === this.hoveredLevel;
      const stroke = this.resolveLevelStroke(isActive, isHovered, activeColor);

      ctx.beginPath();
      ctx.moveTo(layout.xLeft, y);
      ctx.lineTo(layout.xRight, y);
      ctx.lineWidth = isActive ? 2 : 1.1;
      ctx.strokeStyle = stroke;
      ctx.stroke();

      if (Math.abs(ly - y) > 1.5) {
        ctx.beginPath();
        ctx.moveTo(layout.xLeft - 4.5, ly);
        ctx.lineTo(layout.xLeft, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      ctx.font = `${isActive ? '600 ' : ''}10px ${FONT}`;
      ctx.fillStyle = this.resolveLevelText(isActive, isHovered);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`n=${n}`, layout.xLeft - 6, ly);
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
    const { nLower, nUpper, mode, isAllowed, photonHex } = this.state;
    const yUpper = layout.levelY(nUpper);
    const yLower = layout.levelY(nLower);
    const [yStart, yEnd] = mode === 'emission' ? [yUpper, yLower] : [yLower, yUpper];
    const dir = yEnd > yStart ? 1 : -1;
    const arrowX = layout.xLeft + (layout.xRight - layout.xLeft) * 0.4;
    const strokeColor = isAllowed ? photonHex : CHART_COLORS.forbidden;

    this.drawTransitionArrow(arrowX, yStart, yEnd, dir, strokeColor);
    this.drawTransitionBadges(layout, arrowX, yUpper, yLower);

    if (!isAllowed) return;
    const yMid = 0.5 * (yUpper + yLower);
    const waveLeft = arrowX + 8;
    const waveRight = Math.min(layout.xRight - 22, arrowX + 48);
    if (waveRight <= waveLeft + 14) return;
    const [xFrom, xTo] = mode === 'emission' ? [waveLeft, waveRight] : [waveRight, waveLeft];
    this.drawWavyPhoton(xFrom, xTo, yMid, photonHex, waveRight + 5);
  }

  private drawTransitionArrow(
    arrowX: number,
    yStart: number,
    yEnd: number,
    dir: number,
    strokeColor: string,
  ): void {
    const ctx = this.surface.ctx;
    const { isAllowed, photonHex } = this.state;

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
  }

  private drawTransitionBadges(
    layout: EnergyLayout,
    arrowX: number,
    yUpper: number,
    yLower: number,
  ): void {
    const ctx = this.surface.ctx;
    const { nLower, nUpper, lLower, lUpper, mLower, mUpper, isAllowed } = this.state;
    const labelColor = isAllowed ? CHART_COLORS.textPrimary : CHART_COLORS.forbidden;
    const labelBorder = isAllowed ? 'rgba(255, 255, 255, 0.16)' : 'rgba(148, 163, 184, 0.28)';
    const upperLabelY = Math.max(layout.padTop + 8, yUpper - 11);
    const lowerLabelY = nLower === 1 ? yLower - 11 : yLower + 11;

    drawPillBadge(
      ctx,
      arrowX - 6,
      upperLabelY,
      formatSubshellLabel(nUpper, lUpper, mUpper),
      labelColor,
      labelBorder,
      'rgba(11, 14, 22, 0.86)',
    );
    drawPillBadge(
      ctx,
      arrowX - 6,
      lowerLabelY,
      formatSubshellLabel(nLower, lLower, mLower),
      labelColor,
      labelBorder,
      'rgba(11, 14, 22, 0.86)',
    );
  }

  private drawHoverBadge(layout: EnergyLayout): void {
    if (this.hoveredLevel === null) return;
    const n = this.hoveredLevel;
    const y = Math.max(layout.padTop + 8, Math.min(layout.h - 10, layout.levelY(n)));
    const text = `n=${n} · ${formatEnergyEv(energyLevelEv(n, this.state.zEff))}`;
    drawPillBadge(
      this.surface.ctx,
      layout.xRight - 4,
      y,
      text,
      CHART_COLORS.textPrimary,
      'rgba(255, 255, 255, 0.28)',
      'rgba(15, 20, 32, 0.94)',
    );
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

function pickLineMetric(
  isActive: boolean,
  isHovered: boolean,
  activeVal: number,
  hoverVal: number,
  baseVal: number,
): number {
  if (isActive) return activeVal;
  if (isHovered) return hoverVal;
  return baseVal;
}

function strokeVerticalLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  yBottom: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x, yBottom);
  ctx.stroke();
}

function drawForbiddenSpectrumLine(
  ctx: CanvasRenderingContext2D,
  lx: number,
  yTop: number,
  yBottom: number,
  isHovered: boolean,
  hoverColor: string,
  baseColor: string,
): void {
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = isHovered ? hoverColor : baseColor;
  ctx.lineWidth = isHovered ? 2.2 : 1.5;
  strokeVerticalLine(ctx, lx, yTop, yBottom);
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
    ctx.fillStyle = 'rgba(168, 85, 247, 0.06)';
    ctx.fillRect(tube.x, tube.y, xVisStart - tube.x, tube.height);
    ctx.fillStyle = 'rgba(190, 28, 61, 0.06)';
    ctx.fillRect(xVisEnd, tube.y, tube.x + tube.width - xVisEnd, tube.height);

    ctx.fillStyle = fillVisibleSpectrumGradient(ctx, xVisStart, xVisEnd);
    ctx.fillRect(xVisStart, tube.y + tube.height - 3, xVisEnd - xVisStart, 3);

    for (const line of this.state.lines) {
      const lx = tube.toX(line.wavelengthNm);
      const isActive = line.nUpper === this.state.activeUpperN;
      const isHovered = line.nUpper === this.hoveredUpperN;
      const isForbiddenActive = isActive && !this.state.isAllowed;
      this.drawSingleEmissionLine(lx, tube, line.color.hex, isActive, isHovered, isForbiddenActive);
    }
  }

  private drawSingleEmissionLine(
    lx: number,
    tube: TubeRect,
    hex: string,
    isActive: boolean,
    isHovered: boolean,
    isForbiddenActive: boolean,
  ): void {
    const ctx = this.surface.ctx;
    const yBottom = tube.y + tube.height - 3;
    ctx.save();

    if (isForbiddenActive) {
      drawForbiddenSpectrumLine(
        ctx,
        lx,
        tube.y,
        yBottom,
        isHovered,
        'rgba(203, 213, 225, 0.85)',
        'rgba(148, 163, 184, 0.55)',
      );
      ctx.restore();
      return;
    }

    const highlighted = isActive || isHovered;
    ctx.shadowColor = hex;
    ctx.shadowBlur = pickLineMetric(isActive, isHovered, 12, 11, 6);
    ctx.strokeStyle = hex;
    ctx.globalAlpha = highlighted ? 1.0 : 0.78;
    ctx.lineWidth = pickLineMetric(isActive, isHovered, 2.6, 2.4, 1.7);
    strokeVerticalLine(ctx, lx, tube.y, yBottom);

    if (highlighted) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isActive ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      strokeVerticalLine(ctx, lx, tube.y + 1, yBottom - 1);
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
      const isHovered = line.nUpper === this.hoveredUpperN;
      const isForbiddenActive = isActive && !this.state.isAllowed;
      this.drawSingleAbsorptionLine(lx, tube, isActive, isHovered, isForbiddenActive);
    }
  }

  private drawSingleAbsorptionLine(
    lx: number,
    tube: TubeRect,
    isActive: boolean,
    isHovered: boolean,
    isForbiddenActive: boolean,
  ): void {
    const ctx = this.surface.ctx;
    const yBottom = tube.y + tube.height;
    ctx.save();

    if (isForbiddenActive) {
      drawForbiddenSpectrumLine(
        ctx,
        lx,
        tube.y,
        yBottom,
        isHovered,
        'rgba(15, 23, 42, 0.85)',
        'rgba(15, 23, 42, 0.55)',
      );
      ctx.restore();
      return;
    }

    if (isHovered) {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 5;
    }
    ctx.strokeStyle = '#05060a';
    ctx.lineWidth = pickLineMetric(isActive, isHovered, 2.8, 2.6, 1.8);
    strokeVerticalLine(ctx, lx, tube.y, yBottom);
    ctx.restore();
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

  private resolveLowerN(): number {
    let minUpper = this.state.lines[0].nUpper;
    for (const line of this.state.lines) {
      if (line.nUpper < minUpper) minUpper = line.nUpper;
    }
    return minUpper - 1;
  }

  private drawActiveMarker(tube: TubeRect): void {
    const ctx = this.surface.ctx;
    const hoveredLine =
      this.hoveredUpperN !== null
        ? this.state.lines.find((l) => l.nUpper === this.hoveredUpperN)
        : undefined;

    let minLeft = tube.x;
    if (hoveredLine) {
      if (hoveredLine.nUpper !== this.state.activeUpperN) {
        const hx = tube.toX(hoveredLine.wavelengthNm);
        ctx.fillStyle = hoveredLine.color.hex;
        ctx.beginPath();
        ctx.moveTo(hx, tube.y - 1);
        ctx.lineTo(hx - 3.5, tube.y - 6);
        ctx.lineTo(hx + 3.5, tube.y - 6);
        ctx.closePath();
        ctx.fill();
      }

      const hoverCaption = `n=${hoveredLine.nUpper} → ${this.resolveLowerN()} · ${formatCompactWavelength(hoveredLine.wavelengthNm)}`;
      ctx.font = `500 10px ${FONT}`;
      const hoverW = ctx.measureText(hoverCaption).width;
      ctx.fillStyle = CHART_COLORS.textSecondary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(hoverCaption, tube.x, tube.y - 8);
      minLeft = tube.x + hoverW + 8;
    }

    const activeLine = this.state.lines.find((l) => l.nUpper === this.state.activeUpperN);
    if (!activeLine) return;

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
    const clampedX = Math.max(minLeft, Math.min(tube.x + tube.width - textW, ax - textW / 2));
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
