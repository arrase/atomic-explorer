export const CHART_FONT = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
export const DEFAULT_PLOT_PAD = { top: 20, right: 14, bottom: 32, left: 42 } as const;

export interface PlotPad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlotFrame {
  w: number;
  h: number;
  plotW: number;
  plotH: number;
}

export interface ChartSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  prepareFrame: () => { w: number; h: number } | null;
  destroy: () => void;
}

export function createChartSurface(
  container: HTMLElement,
  className: string,
  onDraw: () => void,
): ChartSurface {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let rafId = 0;

  const resizeObserver = new ResizeObserver(() => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => onDraw());
  });
  resizeObserver.observe(container);

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
  };

  return { canvas, ctx, prepareFrame, destroy };
}

export function preparePlotFrame(
  surface: ChartSurface,
  pad: PlotPad = DEFAULT_PLOT_PAD,
): PlotFrame | null {
  const size = surface.prepareFrame();
  if (!size) return null;

  const plotW = size.w - pad.left - pad.right;
  const plotH = size.h - pad.top - pad.bottom;
  if (plotW <= 0 || plotH <= 0) return null;

  return { w: size.w, h: size.h, plotW, plotH };
}
