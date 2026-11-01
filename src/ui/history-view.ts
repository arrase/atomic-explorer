import {
  ATOMIC_ERAS,
  AtomicEraId,
  DeBroglieWaveState,
  getDeBroglieWaveState,
} from '../core/atomic-history-physics';
import { getStrings, I18nStrings, onLanguageChange } from '../i18n';
import { HistoryEraText } from '../i18n/types';
import {
  HistoryRenderer,
  RutherfordStats,
  SchrodingerPresetId,
} from '../render/history-renderer';
import { icon } from './icons';
import { escapeHtml } from './modal-utils';

const SCHRODINGER_PRESET_IDS: readonly SchrodingerPresetId[] = ['1s', '2p', '3d'];
const BOHR_INTEGERS: readonly number[] = [1, 2, 3, 4, 5, 6];

function syncRangeFill(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min);
  const max = Number.parseFloat(input.max);
  const value = Number.parseFloat(input.value);
  if (Number.isNaN(min) || Number.isNaN(max) || max === min) return;
  const pct = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
}

function getEraText(strings: I18nStrings, era: AtomicEraId): HistoryEraText {
  switch (era) {
    case 'dalton':
      return strings.historyEraDalton;
    case 'thomson':
      return strings.historyEraThomson;
    case 'rutherford':
      return strings.historyEraRutherford;
    case 'bohr':
      return strings.historyEraBohr;
    case 'schrodinger':
      return strings.historyEraSchrodinger;
  }
}

function resolveStepperKeyTarget(key: string, index: number, count: number): number {
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return index < count - 1 ? index + 1 : -1;
  }
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return index > 0 ? index - 1 : -1;
  }
  if (key === 'Home') {
    return index > 0 ? 0 : -1;
  }
  if (key === 'End') {
    return index < count - 1 ? count - 1 : -1;
  }
  return -1;
}

function formatWaveStatusLabel(state: DeBroglieWaveState, strings: I18nStrings): string {
  const statusText = state.isAllowed ? strings.historyBohrAllowed : strings.historyBohrForbidden;
  return `${statusText} · Δφ = ${state.phaseMismatchDeg}°`;
}

export class HistoryView {
  public onStateChange?: () => void;

  private readonly container: HTMLElement;
  private readonly renderer: HistoryRenderer;
  private readonly onExploreQuantumViewer: (orbital: { n: number; l: number; m: number }) => void;

  private currentEra: AtomicEraId = 'dalton';
  private isCollapsed = false;
  private thomsonOscPct = 50;
  private rutherfordEnergyMeV = 5.0;
  private rutherfordSpreadFm = 800;
  private bohrNWave = 3.0;
  private schrodingerPreset: SchrodingerPresetId = '2p';

  constructor(
    container: HTMLElement,
    renderer: HistoryRenderer,
    onExploreQuantumViewer: (orbital: { n: number; l: number; m: number }) => void,
  ) {
    this.container = container;
    this.renderer = renderer;
    this.onExploreQuantumViewer = onExploreQuantumViewer;

    this.renderer.onRutherfordStats = (stats) => this.updateRutherfordStatsDom(stats);

    this.syncRendererParameters();
    this.render();
    onLanguageChange(() => this.render());
  }

  public activate(): void {
    this.syncRendererParameters();
    this.renderer.setEra(this.currentEra);
    this.renderer.onScaleChange?.(this.renderer.getScaleText());
    if (this.currentEra === 'rutherford') {
      this.updateRutherfordStatsDom(this.renderer.getRutherfordStats());
    }
  }

  public getEra(): AtomicEraId {
    return this.currentEra;
  }

  public setEra(era: AtomicEraId): void {
    if (!ATOMIC_ERAS.includes(era) || era === this.currentEra) return;

    this.currentEra = era;
    this.syncRendererParameters();
    this.renderer.setEra(era);

    this.refreshEraDom();
    this.onStateChange?.();
  }

  private syncRendererParameters(): void {
    this.renderer.setThomsonOscillation(this.thomsonOscPct / 100);
    this.renderer.setRutherfordParams(this.rutherfordEnergyMeV, this.rutherfordSpreadFm);
    this.renderer.setBohrWaveNumber(this.bohrNWave);
    this.renderer.setSchrodingerPreset(this.schrodingerPreset);
  }

  private render(): void {
    const strings = getStrings();
    const eraIndex = ATOMIC_ERAS.indexOf(this.currentEra);

    this.container.innerHTML = `
      <div class="mobile-drawer-backdrop" id="history-drawer-backdrop"></div>

      <div class="mobile-floating-actions">
        <button
          type="button"
          class="mobile-float-btn"
          id="btn-prev-era"
          aria-label="${escapeHtml(strings.guidedPrev)}"
          ${eraIndex <= 0 ? 'disabled' : ''}
        >
          ${icon('chevron-left')}
        </button>
        <button
          type="button"
          class="mobile-float-btn"
          id="btn-show-history"
          title="${escapeHtml(strings.historyTitle)}"
          aria-label="${escapeHtml(strings.historyTitle)}"
          aria-expanded="false"
          aria-controls="history-panel"
        >
          <span class="btn-icon">${icon('history')}</span>
          <span class="btn-label">${escapeHtml(strings.historyTitle)}</span>
        </button>
        <button
          type="button"
          class="mobile-float-btn"
          id="btn-next-era"
          aria-label="${escapeHtml(strings.guidedNext)}"
          ${eraIndex >= ATOMIC_ERAS.length - 1 ? 'disabled' : ''}
        >
          ${icon('chevron-right')}
        </button>
      </div>

      <button
        type="button"
        class="dock-tab-pill dock-left-pill ${this.isCollapsed ? 'visible' : ''}"
        id="btn-expand-history"
        title="${escapeHtml(strings.expandPanel)}"
        aria-label="${escapeHtml(strings.expandPanel)}"
        aria-expanded="${!this.isCollapsed}"
        aria-controls="history-panel"
      >
        ${icon('history')}
        <span>${escapeHtml(strings.historyTitle)}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="history-overlay-panel ${this.isCollapsed ? 'collapsed' : ''}" id="history-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="panel-header">
          <div class="panel-title-group">
            <span class="panel-header-icon">${icon('history')}</span>
            <h3>${escapeHtml(strings.historyTitle)}</h3>
          </div>
          <div class="panel-header-actions">
            <button
              type="button"
              class="panel-icon-btn panel-collapse-btn desktop-only"
              id="btn-collapse-history"
              title="${escapeHtml(strings.collapsePanel)}"
              aria-label="${escapeHtml(strings.collapsePanel)}"
              aria-expanded="${!this.isCollapsed}"
              aria-controls="history-panel"
            >
              ${icon('chevron-left')}
            </button>
            <button
              type="button"
              class="panel-close-btn mobile-only"
              id="btn-close-history"
              aria-label="${escapeHtml(strings.infoModalClose)}"
            >
              ${icon('close')}
            </button>
          </div>
        </div>

        <div
          class="history-timeline"
          role="listbox"
          aria-label="${escapeHtml(strings.historyTimelineLabel)}"
        >
          ${this.renderTimelineSteps(strings)}
        </div>

        <div class="history-era-card" id="history-era-card">
          ${this.renderEraCard(strings)}
        </div>

        <div class="history-controls-card" id="history-controls-card">
          ${this.renderControlsCard(strings)}
        </div>
      </div>
    `;

    this.attachPanelListeners();
    this.attachTimelineListeners();
    this.attachEraControlListeners();
  }

  private renderTimelineSteps(strings: I18nStrings): string {
    return ATOMIC_ERAS.map((eraId) => {
      const isActive = eraId === this.currentEra;
      const eraText = getEraText(strings, eraId);
      return `
        <button
          type="button"
          class="history-era-step${isActive ? ' active' : ''}"
          role="option"
          data-era="${eraId}"
          aria-selected="${isActive}"
          tabindex="${isActive ? '0' : '-1'}"
        >
          <span class="era-year-badge">${escapeHtml(eraText.year)}</span>
          <span class="era-scientist">${escapeHtml(eraText.scientist)}</span>
        </button>
      `;
    }).join('');
  }

  private renderEraCard(strings: I18nStrings): string {
    const eraText = getEraText(strings, this.currentEra);
    return `
      <div class="history-era-header">
        <div class="history-era-meta">
          <span class="era-year-badge">${escapeHtml(eraText.year)}</span>
          <span class="era-scientist">${escapeHtml(eraText.scientist)}</span>
        </div>
        <h4 class="history-era-title">${escapeHtml(eraText.title)}</h4>
      </div>
      <div class="history-callout is-discovered">
        <span class="history-callout-label">${escapeHtml(strings.historyDiscoveredLabel)}</span>
        <p>${escapeHtml(eraText.discovered)}</p>
      </div>
      <div class="history-callout is-limitation">
        <span class="history-callout-label">${escapeHtml(strings.historyLimitationLabel)}</span>
        <p>${escapeHtml(eraText.limitation)}</p>
      </div>
    `;
  }

  private renderControlsCard(strings: I18nStrings): string {
    switch (this.currentEra) {
      case 'dalton':
        return `
          <div class="history-stoichiometry-pill">
            <code>2 H + 1 O → H₂O</code>
          </div>
        `;
      case 'thomson':
        return this.renderThomsonControls(strings);
      case 'rutherford':
        return this.renderRutherfordControls(strings);
      case 'bohr':
        return this.renderBohrControls(strings);
      case 'schrodinger':
        return this.renderSchrodingerControls(strings);
    }
  }

  private renderThomsonControls(strings: I18nStrings): string {
    return `
      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="thomson-osc-slider">
            ${escapeHtml(strings.historyThomsonOscillation)}
          </label>
          <span class="val-badge" id="thomson-osc-val">${this.thomsonOscPct}%</span>
        </div>
        <input
          type="range"
          id="thomson-osc-slider"
          min="0"
          max="100"
          step="5"
          value="${this.thomsonOscPct}"
        />
      </div>
    `;
  }

  private renderRutherfordControls(strings: I18nStrings): string {
    const streaming = this.renderer.isRutherfordStreaming();
    const stats = this.renderer.getRutherfordStats();
    const [lblTotal, lblDeflected, lblBack] = strings.historyRutherfordStatsLabels;

    return `
      <div class="history-action-row">
        <button type="button" class="btn-primary" id="btn-rutherford-fire">
          ${icon('zap')}
          <span>${escapeHtml(strings.historyRutherfordFireBtn)}</span>
        </button>
        <button
          type="button"
          class="btn-action-toggle${streaming ? ' active' : ''}"
          id="btn-rutherford-stream"
          aria-pressed="${streaming}"
        >
          ${icon(streaming ? 'pause' : 'play')}
          <span>${escapeHtml(strings.historyRutherfordStreamBtn)}</span>
        </button>
      </div>

      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="rutherford-energy-slider">
            ${escapeHtml(strings.historyRutherfordEnergy)}
          </label>
          <span class="val-badge" id="rutherford-energy-val">${this.rutherfordEnergyMeV.toFixed(1)} MeV</span>
        </div>
        <input
          type="range"
          id="rutherford-energy-slider"
          min="2"
          max="10"
          step="0.5"
          value="${this.rutherfordEnergyMeV}"
        />
      </div>

      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="rutherford-spread-slider">
            ${escapeHtml(strings.historyRutherfordSpread)}
          </label>
          <span class="val-badge" id="rutherford-spread-val">${this.rutherfordSpreadFm} fm</span>
        </div>
        <input
          type="range"
          id="rutherford-spread-slider"
          min="80"
          max="1500"
          step="20"
          value="${this.rutherfordSpreadFm}"
        />
      </div>

      <div class="history-stats-grid">
        <div class="stat-tile">
          <span class="stat-value" id="stat-alpha-total">${stats.total}</span>
          <span class="stat-label">${escapeHtml(lblTotal)}</span>
        </div>
        <div class="stat-tile">
          <span class="stat-value" id="stat-alpha-deflected">${stats.deflected}</span>
          <span class="stat-label">${escapeHtml(lblDeflected)}</span>
        </div>
        <div class="stat-tile is-backscatter">
          <span class="stat-value" id="stat-alpha-back">${stats.backscattered}</span>
          <span class="stat-label">${escapeHtml(lblBack)}</span>
        </div>
      </div>

      <button type="button" class="btn-secondary history-reset-btn" id="btn-rutherford-reset">
        ${icon('rotate-ccw')}
        <span>${escapeHtml(strings.historyRutherfordResetStats)}</span>
      </button>
    `;
  }

  private renderBohrControls(strings: I18nStrings): string {
    const state = getDeBroglieWaveState(this.bohrNWave);
    const statusClass = state.isAllowed ? 'is-allowed' : 'is-forbidden';
    const snapButtons = BOHR_INTEGERS.map((k) => {
      const isActive = state.isAllowed && state.nearestInteger === k;
      return `
        <button
          type="button"
          class="history-snap-btn${isActive ? ' active' : ''}"
          data-nwave="${k}"
        >
          n = ${k}
        </button>
      `;
    }).join('');

    return `
      <div class="history-wave-status ${statusClass}" id="bohr-wave-status">
        ${escapeHtml(formatWaveStatusLabel(state, strings))}
      </div>

      <div class="control-group">
        <div class="control-label-row">
          <label class="control-label" for="bohr-nwave-slider">
            ${escapeHtml(strings.historyBohrWaveNumber)}
          </label>
          <span class="val-badge" id="bohr-nwave-val">n = ${this.bohrNWave.toFixed(2)}</span>
        </div>
        <input
          type="range"
          id="bohr-nwave-slider"
          min="1"
          max="6"
          step="0.05"
          value="${this.bohrNWave.toFixed(2)}"
        />
      </div>

      <div class="history-snap-grid">
        ${snapButtons}
      </div>
    `;
  }

  private renderSchrodingerControls(strings: I18nStrings): string {
    const presetButtons = SCHRODINGER_PRESET_IDS.map((preset) => {
      const isActive = preset === this.schrodingerPreset;
      return `
        <button
          type="button"
          class="history-preset-btn${isActive ? ' active' : ''}"
          data-preset="${preset}"
          aria-pressed="${isActive}"
        >
          ${preset}
        </button>
      `;
    }).join('');

    return `
      <div class="control-group">
        <span class="control-label">${escapeHtml(strings.historySchrodingerExperimentLabel)}</span>
        <div class="history-preset-grid">
          ${presetButtons}
        </div>
      </div>

      <button type="button" class="btn-primary history-cta-btn" id="btn-schrodinger-cta">
        ${icon('atom')}
        <span>${escapeHtml(strings.historySchrodingerCta)}</span>
      </button>
    `;
  }

  private refreshEraDom(): void {
    const strings = getStrings();
    const eraIndex = ATOMIC_ERAS.indexOf(this.currentEra);

    const steps = this.container.querySelectorAll<HTMLButtonElement>('.history-era-step');
    steps.forEach((step) => {
      const isMatch = step.dataset.era === this.currentEra;
      step.classList.toggle('active', isMatch);
      step.setAttribute('aria-selected', String(isMatch));
      step.tabIndex = isMatch ? 0 : -1;
    });

    const btnPrev = this.container.querySelector<HTMLButtonElement>('#btn-prev-era');
    const btnNext = this.container.querySelector<HTMLButtonElement>('#btn-next-era');
    if (btnPrev) btnPrev.disabled = eraIndex <= 0;
    if (btnNext) btnNext.disabled = eraIndex >= ATOMIC_ERAS.length - 1;

    const eraCard = this.container.querySelector<HTMLElement>('#history-era-card');
    if (eraCard) {
      eraCard.innerHTML = this.renderEraCard(strings);
    }

    const controlsCard = this.container.querySelector<HTMLElement>('#history-controls-card');
    if (controlsCard) {
      controlsCard.innerHTML = this.renderControlsCard(strings);
      this.attachEraControlListeners();
    }
  }

  private toggleDrawer(): void {
    const panel = this.container.querySelector<HTMLElement>('#history-panel')!;
    if (panel.classList.contains('mobile-open')) {
      this.closeDrawer();
      return;
    }

    const backdrop = this.container.querySelector<HTMLElement>('#history-drawer-backdrop')!;
    const btnShow = this.container.querySelector<HTMLElement>('#btn-show-history')!;
    panel.classList.add('mobile-open');
    panel.removeAttribute('aria-hidden');
    backdrop.classList.add('active');
    btnShow.classList.add('active');
    btnShow.setAttribute('aria-expanded', 'true');
    this.container.querySelector<HTMLElement>('#btn-close-history')?.focus();
  }

  private closeDrawer(): void {
    const panel = this.container.querySelector<HTMLElement>('#history-panel')!;
    const backdrop = this.container.querySelector<HTMLElement>('#history-drawer-backdrop')!;
    const btnShow = this.container.querySelector<HTMLElement>('#btn-show-history')!;

    panel.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    btnShow.classList.remove('active');
    btnShow.setAttribute('aria-expanded', 'false');
  }

  private stepAdjacentEra(delta: -1 | 1): void {
    const nextIdx = ATOMIC_ERAS.indexOf(this.currentEra) + delta;
    if (nextIdx >= 0 && nextIdx < ATOMIC_ERAS.length) {
      this.setEra(ATOMIC_ERAS[nextIdx]);
    }
  }

  private attachPanelListeners(): void {
    const backdrop = this.container.querySelector<HTMLElement>('#history-drawer-backdrop')!;
    const btnShow = this.container.querySelector<HTMLElement>('#btn-show-history')!;
    const btnClose = this.container.querySelector<HTMLElement>('#btn-close-history')!;
    const btnPrev = this.container.querySelector<HTMLButtonElement>('#btn-prev-era')!;
    const btnNext = this.container.querySelector<HTMLButtonElement>('#btn-next-era')!;
    const btnCollapse = this.container.querySelector<HTMLElement>('#btn-collapse-history')!;
    const btnExpand = this.container.querySelector<HTMLElement>('#btn-expand-history')!;
    const panel = this.container.querySelector<HTMLElement>('#history-panel')!;

    btnShow.addEventListener('click', () => this.toggleDrawer());
    btnClose.addEventListener('click', () => this.closeDrawer());
    backdrop.addEventListener('click', () => this.closeDrawer());
    btnPrev.addEventListener('click', () => this.stepAdjacentEra(-1));
    btnNext.addEventListener('click', () => this.stepAdjacentEra(1));

    btnCollapse.addEventListener('click', () => {
      this.isCollapsed = true;
      panel.classList.add('collapsed');
      btnExpand.classList.add('visible');
      btnCollapse.setAttribute('aria-expanded', 'false');
      btnExpand.setAttribute('aria-expanded', 'false');
    });

    btnExpand.addEventListener('click', () => {
      this.isCollapsed = false;
      panel.classList.remove('collapsed');
      btnExpand.classList.remove('visible');
      btnExpand.setAttribute('aria-expanded', 'true');
      btnCollapse.setAttribute('aria-expanded', 'true');
    });
  }

  private attachTimelineListeners(): void {
    const steps = Array.from(
      this.container.querySelectorAll<HTMLButtonElement>('.history-era-step'),
    );

    steps.forEach((step, index) => {
      const eraId = step.dataset.era as AtomicEraId;
      step.addEventListener('click', () => this.setEra(eraId));
      step.addEventListener('keydown', (e) => this.handleTimelineKeydown(e, index, steps));
    });
  }

  private handleTimelineKeydown(
    e: KeyboardEvent,
    index: number,
    steps: readonly HTMLButtonElement[],
  ): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const targetIdx = resolveStepperKeyTarget(e.key, index, steps.length);
    if (targetIdx === -1) return;

    e.preventDefault();
    const targetStep = steps[targetIdx];
    this.setEra(targetStep.dataset.era as AtomicEraId);
    targetStep.focus();
    targetStep.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private attachEraControlListeners(): void {
    const sliders = this.container.querySelectorAll<HTMLInputElement>(
      '#history-controls-card input[type="range"]',
    );
    sliders.forEach((slider) => syncRangeFill(slider));

    if (this.currentEra === 'thomson') {
      this.bindThomsonListeners();
    } else if (this.currentEra === 'rutherford') {
      this.bindRutherfordListeners();
    } else if (this.currentEra === 'bohr') {
      this.bindBohrListeners();
    } else if (this.currentEra === 'schrodinger') {
      this.bindSchrodingerListeners();
    }
  }

  private bindThomsonListeners(): void {
    const slider = this.container.querySelector<HTMLInputElement>('#thomson-osc-slider')!;
    const badge = this.container.querySelector<HTMLElement>('#thomson-osc-val')!;

    slider.addEventListener('input', () => {
      this.thomsonOscPct = Number.parseInt(slider.value, 10);
      badge.textContent = `${this.thomsonOscPct}%`;
      syncRangeFill(slider);
      this.renderer.setThomsonOscillation(this.thomsonOscPct / 100);
    });
  }

  private bindRutherfordListeners(): void {
    const btnFire = this.container.querySelector<HTMLButtonElement>('#btn-rutherford-fire')!;
    const btnStream = this.container.querySelector<HTMLButtonElement>('#btn-rutherford-stream')!;
    const btnReset = this.container.querySelector<HTMLButtonElement>('#btn-rutherford-reset')!;
    const energySlider = this.container.querySelector<HTMLInputElement>('#rutherford-energy-slider')!;
    const energyVal = this.container.querySelector<HTMLElement>('#rutherford-energy-val')!;
    const spreadSlider = this.container.querySelector<HTMLInputElement>('#rutherford-spread-slider')!;
    const spreadVal = this.container.querySelector<HTMLElement>('#rutherford-spread-val')!;

    btnFire.addEventListener('click', () => this.renderer.fireRutherfordBurst(12));

    btnStream.addEventListener('click', () => {
      const next = !this.renderer.isRutherfordStreaming();
      this.renderer.setRutherfordStreaming(next);
      const strings = getStrings();
      btnStream.classList.toggle('active', next);
      btnStream.setAttribute('aria-pressed', String(next));
      btnStream.innerHTML = `${icon(next ? 'pause' : 'play')} <span>${escapeHtml(strings.historyRutherfordStreamBtn)}</span>`;
    });

    btnReset.addEventListener('click', () => this.renderer.resetRutherfordStats());

    energySlider.addEventListener('input', () => {
      this.rutherfordEnergyMeV = Number.parseFloat(energySlider.value);
      energyVal.textContent = `${this.rutherfordEnergyMeV.toFixed(1)} MeV`;
      syncRangeFill(energySlider);
      this.renderer.setRutherfordParams(this.rutherfordEnergyMeV, this.rutherfordSpreadFm);
    });

    spreadSlider.addEventListener('input', () => {
      this.rutherfordSpreadFm = Number.parseInt(spreadSlider.value, 10);
      spreadVal.textContent = `${this.rutherfordSpreadFm} fm`;
      syncRangeFill(spreadSlider);
      this.renderer.setRutherfordParams(this.rutherfordEnergyMeV, this.rutherfordSpreadFm);
    });
  }

  private updateRutherfordStatsDom(stats: RutherfordStats): void {
    if (this.currentEra !== 'rutherford') return;
    const elTotal = this.container.querySelector<HTMLElement>('#stat-alpha-total');
    const elDeflected = this.container.querySelector<HTMLElement>('#stat-alpha-deflected');
    const elBack = this.container.querySelector<HTMLElement>('#stat-alpha-back');
    if (elTotal) elTotal.textContent = String(stats.total);
    if (elDeflected) elDeflected.textContent = String(stats.deflected);
    if (elBack) elBack.textContent = String(stats.backscattered);
  }

  private applyBohrWaveValue(nWave: number): void {
    this.bohrNWave = nWave;
    const state = this.renderer.setBohrWaveNumber(nWave);

    const valBadge = this.container.querySelector<HTMLElement>('#bohr-nwave-val')!;
    const statusEl = this.container.querySelector<HTMLElement>('#bohr-wave-status')!;
    const snapButtons = this.container.querySelectorAll<HTMLButtonElement>('.history-snap-btn');

    valBadge.textContent = `n = ${nWave.toFixed(2)}`;
    statusEl.className = `history-wave-status ${state.isAllowed ? 'is-allowed' : 'is-forbidden'}`;
    statusEl.textContent = formatWaveStatusLabel(state, getStrings());
    for (const btn of snapButtons) {
      const k = Number.parseInt(btn.dataset.nwave!, 10);
      btn.classList.toggle('active', state.isAllowed && state.nearestInteger === k);
    }
  }

  private bindBohrListeners(): void {
    const slider = this.container.querySelector<HTMLInputElement>('#bohr-nwave-slider')!;
    const snapButtons = this.container.querySelectorAll<HTMLButtonElement>('.history-snap-btn');

    slider.addEventListener('input', () => {
      syncRangeFill(slider);
      this.applyBohrWaveValue(Number.parseFloat(slider.value));
    });

    for (const btn of snapButtons) {
      btn.addEventListener('click', () => {
        const k = Number.parseInt(btn.dataset.nwave!, 10);
        slider.value = k.toFixed(2);
        syncRangeFill(slider);
        this.applyBohrWaveValue(k);
      });
    }
  }

  private selectSchrodingerPreset(preset: SchrodingerPresetId): void {
    this.schrodingerPreset = preset;
    this.renderer.setSchrodingerPreset(preset);
    const presetBtns = this.container.querySelectorAll<HTMLButtonElement>('.history-preset-btn');
    for (const other of presetBtns) {
      const isMatch = other.dataset.preset === preset;
      other.classList.toggle('active', isMatch);
      other.setAttribute('aria-pressed', String(isMatch));
    }
  }

  private bindSchrodingerListeners(): void {
    const presetBtns = this.container.querySelectorAll<HTMLButtonElement>('.history-preset-btn');
    const ctaBtn = this.container.querySelector<HTMLButtonElement>('#btn-schrodinger-cta')!;

    for (const btn of presetBtns) {
      const preset = btn.dataset.preset as SchrodingerPresetId;
      btn.addEventListener('click', () => this.selectSchrodingerPreset(preset));
    }

    ctaBtn.addEventListener('click', () => {
      this.onExploreQuantumViewer(this.renderer.getSchrodingerPreset());
    });
  }
}
