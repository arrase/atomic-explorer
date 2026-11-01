import elementsData from '../../assets/data/elements.json';
import { getElectronConfiguration, getSlaterZEff, SubshellOccupancy } from '../core/wasm-bridge';
import { calculateValenceQuantumNumbers, subshellName } from '../core/valence-orbital';
import { getLanguage, getStrings } from '../i18n';
import { escapeHtml } from './modal-utils';
import { icon } from './icons';

interface ElementRecord {
  Z: number;
  symbol: string;
  name_es: string;
  name_en: string;
  electron_config_str: string;
}

export interface SpinBoxExplorerState {
  atomicNumber: number;
  n: number;
  l: number;
  m: number;
  s: number;
}

export interface SpinBoxSelection extends SpinBoxExplorerState {
  zEff: number;
}

type ArrowDirection = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

interface CandidateMetric {
  element: HTMLButtonElement;
  gap: number;
  overlaps: boolean;
  perpOffset: number;
}

const ELEMENTS: readonly ElementRecord[] = elementsData as ElementRecord[];
const EDGE_TOLERANCE = 1.5;
const FALLBACK_PERP_WEIGHT = 2.5;

function isArrowDirection(key: string): key is ArrowDirection {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}

function measureHorizontalCandidate(
  isRight: boolean,
  cur: DOMRect,
  cand: DOMRect,
): Omit<CandidateMetric, 'element'> | null {
  if (isRight && cand.left < cur.right - EDGE_TOLERANCE) return null;
  if (!isRight && cand.right > cur.left + EDGE_TOLERANCE) return null;

  const gap = Math.max(0, isRight ? cand.left - cur.right : cur.left - cand.right);
  const overlaps = Math.min(cur.bottom, cand.bottom) > Math.max(cur.top, cand.top);
  const perpOffset = Math.abs((cand.top + cand.bottom) / 2 - (cur.top + cur.bottom) / 2);
  return { gap, overlaps, perpOffset };
}

function measureVerticalCandidate(
  isDown: boolean,
  cur: DOMRect,
  cand: DOMRect,
): Omit<CandidateMetric, 'element'> | null {
  if (isDown && cand.top < cur.bottom - EDGE_TOLERANCE) return null;
  if (!isDown && cand.bottom > cur.top + EDGE_TOLERANCE) return null;

  const gap = Math.max(0, isDown ? cand.top - cur.bottom : cur.top - cand.bottom);
  const overlaps = Math.min(cur.right, cand.right) > Math.max(cur.left, cand.left);
  const perpOffset = Math.abs((cand.left + cand.right) / 2 - (cur.left + cur.right) / 2);
  return { gap, overlaps, perpOffset };
}

function measureCandidate(
  dir: ArrowDirection,
  cur: DOMRect,
  cand: DOMRect,
): Omit<CandidateMetric, 'element'> | null {
  if (dir === 'ArrowLeft' || dir === 'ArrowRight') {
    return measureHorizontalCandidate(dir === 'ArrowRight', cur, cand);
  }
  return measureVerticalCandidate(dir === 'ArrowDown', cur, cand);
}

function pickAlignedCandidate(aligned: CandidateMetric[]): HTMLButtonElement {
  let best = aligned[0];
  for (let i = 1; i < aligned.length; i++) {
    const item = aligned[i];
    const gapDiff = item.gap - best.gap;
    if (gapDiff < -0.5 || (Math.abs(gapDiff) <= 0.5 && item.perpOffset < best.perpOffset)) {
      best = item;
    }
  }
  return best.element;
}

function pickFallbackCandidate(metrics: CandidateMetric[]): HTMLButtonElement {
  let best = metrics[0];
  let bestScore = best.gap + FALLBACK_PERP_WEIGHT * best.perpOffset;
  for (let i = 1; i < metrics.length; i++) {
    const item = metrics[i];
    const score = item.gap + FALLBACK_PERP_WEIGHT * item.perpOffset;
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best.element;
}

function findSpatialCandidate(
  diagram: HTMLElement,
  current: HTMLButtonElement,
  dir: ArrowDirection,
): HTMLButtonElement | null {
  const curRect = current.getBoundingClientRect();
  const buttons = diagram.querySelectorAll<HTMLButtonElement>('button.spin-slot.occupied');
  const metrics: CandidateMetric[] = [];

  for (const btn of buttons) {
    if (btn === current || !btn.checkVisibility()) continue;
    const measured = measureCandidate(dir, curRect, btn.getBoundingClientRect());
    if (measured) {
      metrics.push({ element: btn, ...measured });
    }
  }

  if (metrics.length === 0) return null;
  const aligned = metrics.filter((m) => m.overlaps);
  return aligned.length > 0 ? pickAlignedCandidate(aligned) : pickFallbackCandidate(metrics);
}

function renderSpinSlot(
  n: number,
  l: number,
  m: number,
  s: number,
  occupied: boolean,
  activeState: SpinBoxExplorerState,
): string {
  if (!occupied) {
    return '<span class="spin-slot empty" aria-hidden="true"></span>';
  }
  const isActive =
    activeState.n === n && activeState.l === l && activeState.m === m && activeState.s === s;
  const mSign = m >= 0 ? `+${m}` : `${m}`;
  const sLabel = s > 0 ? '+1/2' : '-1/2';
  const arrow = s > 0 ? '↑' : '↓';
  const label = `${subshellName(n, l)} (n=${n}, l=${l}, m=${mSign}, s=${sLabel})`;
  return `<button type="button" class="spin-slot occupied${isActive ? ' active' : ''}" data-n="${n}" data-l="${l}" data-m="${m}" data-s="${s}" aria-pressed="${isActive ? 'true' : 'false'}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" tabindex="-1">${arrow}</button>`;
}

function renderSubshellRow(subshell: SubshellOccupancy, activeState: SpinBoxExplorerState): string {
  const { n, l, electrons } = subshell;
  const boxCount = 2 * l + 1;
  const boxesHtml: string[] = [];

  for (let b = 0; b < boxCount; b++) {
    const m = -l + b;
    const upOccupied = electrons > b;
    const downOccupied = electrons > boxCount + b;
    boxesHtml.push(
      `<div class="spin-box">${renderSpinSlot(n, l, m, 0.5, upOccupied, activeState)}${renderSpinSlot(n, l, m, -0.5, downOccupied, activeState)}</div>`,
    );
  }

  return `
    <div class="subshell-row">
      <span class="subshell-tag">${subshellName(n, l)}<sup>${electrons}</sup></span>
      <div class="spin-boxes">${boxesHtml.join('')}</div>
    </div>
  `;
}

function syncRovingTabindex(diagram: HTMLElement): void {
  const buttons = Array.from(
    diagram.querySelectorAll<HTMLButtonElement>('button.spin-slot.occupied'),
  );
  if (buttons.length === 0) return;
  const tabStop = buttons.find((btn) => btn.classList.contains('active')) ?? buttons[0];
  for (const btn of buttons) {
    btn.tabIndex = btn === tabStop ? 0 : -1;
  }
}

export class SpinBoxExplorer {
  private readonly host: HTMLElement;
  private readonly onChange: (selection: SpinBoxSelection) => void;
  private state: SpinBoxExplorerState;
  private selectEl: HTMLSelectElement | null = null;
  private configPillEl: HTMLElement | null = null;
  private diagramEl: HTMLElement | null = null;
  private requestToken = 0;

  constructor(
    host: HTMLElement,
    initialState: SpinBoxExplorerState,
    onChange: (selection: SpinBoxSelection) => void,
  ) {
    this.host = host;
    this.state = { ...initialState };
    this.onChange = onChange;
    this.renderShell();
  }

  public async refreshDiagram(): Promise<void> {
    await this.renderDiagramForElement(this.state.atomicNumber);
  }

  public syncActiveQuantumState(n: number, l: number, m: number, s: number): void {
    this.state = { ...this.state, n, l, m, s };
    if (!this.diagramEl) return;

    const buttons = this.diagramEl.querySelectorAll<HTMLButtonElement>('button.spin-slot.occupied');
    for (const btn of buttons) {
      const isMatch =
        Number(btn.dataset.n) === n &&
        Number(btn.dataset.l) === l &&
        Number(btn.dataset.m) === m &&
        Number(btn.dataset.s) === s;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    }
    syncRovingTabindex(this.diagramEl);
  }

  public destroy(): void {
    this.requestToken++;
  }

  private getElementRecord(z: number): ElementRecord {
    return ELEMENTS[Math.max(1, Math.min(ELEMENTS.length, z)) - 1];
  }

  private renderShell(): void {
    const strings = getStrings();
    const isEs = getLanguage() === 'es';
    const currentEl = this.getElementRecord(this.state.atomicNumber);

    const optionsHtml = ELEMENTS.map((el) => {
      const localizedName = isEs ? el.name_es : el.name_en;
      const label = `${el.Z}. ${el.symbol} — ${localizedName} (${el.electron_config_str})`;
      const selected = el.Z === this.state.atomicNumber ? ' selected' : '';
      return `<option value="${el.Z}"${selected}>${escapeHtml(label)}</option>`;
    }).join('');

    this.host.innerHTML = `
      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="element-select">${escapeHtml(strings.elementPreset)}</label>
          <button type="button" class="btn-info-icon" data-explain="explainElectronConfig" aria-label="Info">${icon('info')}</button>
        </div>
        <select id="element-select">${optionsHtml}</select>
      </div>

      <div class="spin-explorer-card">
        <div class="spin-explorer-header">
          <span class="spin-explorer-title">${escapeHtml(strings.spinBoxExplorerTitle)}</span>
          <div class="spin-explorer-header-end">
            <span class="spin-config-pill" id="spin-config-pill">${escapeHtml(currentEl.electron_config_str)}</span>
            <button type="button" class="btn-info-icon" data-explain="explainSpinBox" aria-label="Info">${icon('info')}</button>
          </div>
        </div>
        <p class="spin-explorer-hint">${escapeHtml(strings.spinBoxExplorerHint)}</p>
        <div class="subshell-diagram" id="subshell-diagram" role="group" aria-label="${escapeHtml(strings.spinBoxExplorerTitle)}"></div>
      </div>
    `;

    this.selectEl = this.host.querySelector('#element-select');
    this.configPillEl = this.host.querySelector('#spin-config-pill');
    this.diagramEl = this.host.querySelector('#subshell-diagram');

    this.selectEl?.addEventListener('change', () => {
      if (!this.selectEl) return;
      const z = Number.parseInt(this.selectEl.value, 10);
      void this.handleElementSelection(z);
    });

    this.diagramEl?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        'button.spin-slot.occupied',
      );
      if (btn) {
        void this.handleSlotClick(btn);
      }
    });

    this.diagramEl?.addEventListener('keydown', (e) => this.handleDiagramKeyDown(e));
  }

  private async handleElementSelection(z: number): Promise<void> {
    const token = ++this.requestToken;
    const [valence, subshells] = await Promise.all([
      calculateValenceQuantumNumbers(z),
      getElectronConfiguration(z),
    ]);
    if (token !== this.requestToken) return;

    this.state = {
      atomicNumber: z,
      n: valence.n,
      l: valence.l,
      m: valence.m,
      s: valence.s,
    };
    this.applyDiagramDom(z, subshells);
    this.onChange({ atomicNumber: z, ...valence });
  }

  private async renderDiagramForElement(z: number): Promise<void> {
    const token = ++this.requestToken;
    const subshells = await getElectronConfiguration(z);
    if (token !== this.requestToken) return;
    this.applyDiagramDom(z, subshells);
  }

  private applyDiagramDom(z: number, subshells: SubshellOccupancy[]): void {
    const el = this.getElementRecord(z);
    if (this.configPillEl) {
      this.configPillEl.textContent = el.electron_config_str;
    }
    if (!this.diagramEl) return;

    const reversed = [...subshells].reverse();
    this.diagramEl.innerHTML = reversed
      .map((sub) => renderSubshellRow(sub, this.state))
      .join('');
    syncRovingTabindex(this.diagramEl);
  }

  private async handleSlotClick(btn: HTMLButtonElement): Promise<void> {
    const n = Number(btn.dataset.n);
    const l = Number(btn.dataset.l);
    const m = Number(btn.dataset.m);
    const s = Number(btn.dataset.s);

    this.syncActiveQuantumState(n, l, m, s);

    const token = ++this.requestToken;
    const rawZEff = await getSlaterZEff(this.state.atomicNumber, n, l);
    if (token !== this.requestToken) return;

    const zEff = Math.round(rawZEff * 100) / 100;
    this.onChange({
      atomicNumber: this.state.atomicNumber,
      n,
      l,
      m,
      s,
      zEff,
    });
  }

  private handleDiagramKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!isArrowDirection(e.key) || !this.diagramEl) return;

    const target = e.composedPath()[0];
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.classList.contains('spin-slot') || !target.classList.contains('occupied')) return;

    const candidate = findSpatialCandidate(this.diagramEl, target, e.key);
    if (!candidate) return;

    e.preventDefault();
    const buttons = this.diagramEl.querySelectorAll<HTMLButtonElement>('button.spin-slot.occupied');
    for (const btn of buttons) {
      btn.tabIndex = btn === candidate ? 0 : -1;
    }
    candidate.focus();
    candidate.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
