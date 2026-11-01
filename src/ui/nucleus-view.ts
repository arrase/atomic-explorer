import {
  computeDecayDaughter,
  DecayMode,
  evaluateNuclide,
  FAMOUS_ISOTOPES,
  findGroundPreset,
  getPresetById,
  IsotopeNoteKey,
  IsotopePreset,
  loadNuclearChartsData,
  MAX_N,
  MAX_Z,
  NuclearChartsData,
  NuclideState,
} from '../core/nuclear';
import { getStrings, I18nStrings, onLanguageChange } from '../i18n';
import { NucleusRenderer } from '../render/nucleus-renderer';
import { icon } from './icons';
import { ExplanationModal } from './info-modal';
import { escapeHtml } from './modal-utils';
import { BindingEnergyChart, SegreChart } from './nucleus-charts';

type ArrowDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

const DEFAULT_PRESET_ID: IsotopeNoteKey = 'c14';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function syncRangeFill(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min);
  const max = Number.parseFloat(input.max);
  const val = Number.parseFloat(input.value);
  if (max === min) return;
  const pct = clamp(((val - min) / (max - min)) * 100, 0, 100);
  input.style.setProperty('--fill', `${pct}%`);
}

function isArrowDirection(key: string): key is ArrowDirection {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

function computeAxisGap(cur: DOMRect, cand: DOMRect, dir: ArrowDirection): number | null {
  const tol = 2;
  if (dir === 'ArrowRight' && cand.left >= cur.right - tol) return cand.left - cur.right;
  if (dir === 'ArrowLeft' && cand.right <= cur.left + tol) return cur.left - cand.right;
  if (dir === 'ArrowDown' && cand.top >= cur.bottom - tol) return cand.top - cur.bottom;
  if (dir === 'ArrowUp' && cand.bottom <= cur.top + tol) return cur.top - cand.bottom;
  return null;
}

function measureSpatialScore(cur: DOMRect, cand: DOMRect, dir: ArrowDirection): number | null {
  const rawGap = computeAxisGap(cur, cand, dir);
  if (rawGap === null) return null;

  const isHorizontal = dir === 'ArrowLeft' || dir === 'ArrowRight';
  const [curStart, curEnd, candStart, candEnd] = isHorizontal
    ? [cur.top, cur.bottom, cand.top, cand.bottom]
    : [cur.left, cur.right, cand.left, cand.right];

  const overlaps = Math.min(curEnd, candEnd) > Math.max(curStart, candStart) + 1;
  const perpOffset = Math.abs((curStart + curEnd - candStart - candEnd) * 0.5);
  const gap = Math.max(0, rawGap);

  return overlaps ? gap * 1000 + perpOffset : 1e6 + gap + 2.5 * perpOffset;
}

function findSpatialCandidate(
  current: HTMLElement,
  cards: readonly HTMLElement[],
  dir: ArrowDirection,
): HTMLElement | null {
  const curRect = current.getBoundingClientRect();
  let bestCard: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const cand of cards) {
    if (cand === current || !cand.checkVisibility()) continue;
    const score = measureSpatialScore(curRect, cand.getBoundingClientRect(), dir);
    if (score !== null && score < bestScore) {
      bestScore = score;
      bestCard = cand;
    }
  }
  return bestCard;
}

function formatDecayPillText(mode: DecayMode, strings: I18nStrings): string {
  switch (mode) {
    case 'stable':
      return strings.decayStable;
    case 'alpha':
      return 'α';
    case 'beta_minus':
      return 'β⁻';
    case 'beta_plus':
      return 'β⁺';
    case 'gamma':
      return 'γ';
    case 'proton_drip':
      return 'p';
    case 'neutron_drip':
      return 'n';
  }
}

function formatDecayFullLabel(mode: DecayMode, strings: I18nStrings): string {
  switch (mode) {
    case 'stable':
      return strings.decayStable;
    case 'alpha':
      return strings.decayAlpha;
    case 'beta_minus':
      return strings.decayBetaMinus;
    case 'beta_plus':
      return strings.decayBetaPlus;
    case 'gamma':
      return strings.decayGamma;
    case 'proton_drip':
      return strings.decayProtonDrip;
    case 'neutron_drip':
      return strings.decayNeutronDrip;
  }
}

function formatHalfLifeText(state: NuclideState, strings: I18nStrings): string {
  const preset = state.preset;
  if (preset && preset.halfLifeValue !== null && preset.halfLifeUnit !== null) {
    return `${preset.halfLifeValue.toLocaleString()} ${strings.halfLifeUnits[preset.halfLifeUnit]}`;
  }
  if (state.decayMode === 'stable') {
    return strings.decayStable;
  }
  return strings.semfPredictedBadge;
}

function resolveMagicBadgeText(state: NuclideState, strings: I18nStrings): string {
  if (state.isMagicZ && state.isMagicN) return strings.doublyMagicBadge;
  if (state.isMagicZ || state.isMagicN) return strings.magicNumberBadge;
  return '';
}

function formatActiveNuclideHtml(
  a: number,
  z: number,
  symbol: string,
  metastable: boolean,
  strings: I18nStrings,
): string {
  const metaSuffix = metastable ? 'm' : '';
  return `<sup>${a}${metaSuffix}</sup><sub>${z}</sub>${escapeHtml(symbol)} &middot; ${escapeHtml(strings.massNumberLabel)} = ${a}`;
}

export class NucleusView {
  private readonly container: HTMLElement;
  private readonly renderer: NucleusRenderer;
  private readonly onScaleHudChange: (scaleText: string) => void;
  private readonly onExportClick: () => void;

  public onStateChange?: () => void;

  private currentZ: number;
  private currentN: number;
  private explicitPreset: IsotopePreset | null;
  private rovingPresetId: IsotopeNoteKey = DEFAULT_PRESET_ID;
  private currentRadiusFm: number;
  private currentState: NuclideState | null = null;
  private chartsData: NuclearChartsData | null = null;

  private segreChart: SegreChart | null = null;
  private baChart: BindingEnergyChart | null = null;

  private isLeftCollapsed = false;
  private isRightCollapsed = false;
  private isActivated = false;
  private evalSeq = 0;

  constructor(
    container: HTMLElement,
    renderer: NucleusRenderer,
    onScaleHudChange: (scaleText: string) => void,
    onExportClick: () => void,
  ) {
    this.container = container;
    this.renderer = renderer;
    this.onScaleHudChange = onScaleHudChange;
    this.onExportClick = onExportClick;

    const initialPreset = getPresetById(DEFAULT_PRESET_ID);
    this.currentZ = initialPreset.z;
    this.currentN = initialPreset.n;
    this.explicitPreset = initialPreset;
    this.currentRadiusFm = 1.25 * Math.cbrt(initialPreset.z + initialPreset.n);

    this.render();
    void this.loadCharts();

    onLanguageChange(() => {
      this.render();
      if (this.chartsData) {
        this.segreChart?.setData(this.chartsData);
        this.baChart?.setCurve(this.chartsData.baCurve);
      }
      if (this.currentState) {
        this.syncStateToDom(this.currentState);
      }
    });
  }

  private async loadCharts(): Promise<void> {
    const data = await loadNuclearChartsData();
    this.chartsData = data;
    this.segreChart?.setData(data);
    this.baChart?.setCurve(data.baCurve);
  }

  public activate(): void {
    const firstActivation = !this.isActivated;
    this.isActivated = true;
    this.onScaleHudChange(this.getScaleHudText());

    if (firstActivation || !this.currentState) {
      void this.refreshNuclide(this.currentZ, this.currentN, this.explicitPreset, false);
      return;
    }

    this.segreChart?.draw();
    this.baChart?.draw();
  }

  public getScaleHudText(): string {
    return `R = ${this.currentRadiusFm.toFixed(2)} fm (1 fm = 10⁻³ pm)`;
  }

  public getDeepLinkParams(): { z: number; n: number } {
    return { z: this.currentZ, n: this.currentN };
  }

  public applyDeepLinkParams(params: { z?: number; n?: number }): void {
    const nextZ =
      params.z !== undefined && Number.isFinite(params.z)
        ? clamp(Math.round(params.z), 1, MAX_Z)
        : this.currentZ;
    const nextN =
      params.n !== undefined && Number.isFinite(params.n)
        ? clamp(Math.round(params.n), 0, MAX_N)
        : this.currentN;

    const preset = findGroundPreset(nextZ, nextN);
    this.currentZ = nextZ;
    this.currentN = nextN;
    this.explicitPreset = preset;
    this.currentRadiusFm = 1.25 * Math.cbrt(nextZ + nextN);
    if (preset) {
      this.rovingPresetId = preset.id;
    }

    this.syncSlidersInPlace(nextZ, nextN);
    if (this.isActivated) {
      void this.refreshNuclide(nextZ, nextN, preset, false);
    }
  }

  private async refreshNuclide(
    z: number,
    n: number,
    explicitPreset: IsotopePreset | null,
    notifyStateChange: boolean,
  ): Promise<void> {
    this.currentZ = clamp(Math.round(z), 1, MAX_Z);
    this.currentN = clamp(Math.round(n), 0, MAX_N);
    this.explicitPreset = explicitPreset;
    this.syncSlidersInPlace(this.currentZ, this.currentN);

    const seq = ++this.evalSeq;
    const state = await evaluateNuclide(this.currentZ, this.currentN, explicitPreset);
    if (seq !== this.evalSeq) return;

    this.currentState = state;
    this.currentRadiusFm = state.radiusFm;
    if (state.preset) {
      this.rovingPresetId = state.preset.id;
    }

    this.renderer.setNuclide(state.z, state.n, state.radiusFm);
    this.syncStateToDom(state);

    if (this.isActivated) {
      this.onScaleHudChange(this.getScaleHudText());
    }
    if (notifyStateChange) {
      this.onStateChange?.();
    }
  }

  private render(): void {
    const strings = getStrings();

    if (this.segreChart) {
      this.segreChart.destroy();
      this.segreChart = null;
    }
    if (this.baChart) {
      this.baChart.destroy();
      this.baChart = null;
    }

    this.container.innerHTML = `
      <div class="mobile-drawer-backdrop" id="nucleus-drawer-backdrop"></div>

      <div class="mobile-floating-actions">
        <button type="button" class="mobile-float-btn" id="btn-show-nucleus-controls" title="${escapeHtml(strings.nucleusTitle)}" aria-label="${escapeHtml(strings.nucleusTitle)}" aria-expanded="false" aria-controls="nucleus-controls-panel">
          <span class="btn-icon">${icon('nucleus')}</span>
          <span class="btn-label">${escapeHtml(strings.nucleusTitle)}</span>
        </button>
        <button type="button" class="mobile-float-btn" id="btn-show-nucleus-physics" title="${escapeHtml(strings.nuclearStabilityTitle)}" aria-label="${escapeHtml(strings.nuclearStabilityTitle)}" aria-expanded="false" aria-controls="nucleus-physics-panel">
          <span class="btn-icon">${icon('chart')}</span>
          <span class="btn-label">${escapeHtml(strings.nuclearStabilityTitle)}</span>
        </button>
      </div>

      <button type="button" class="dock-tab-pill dock-left-pill ${this.isLeftCollapsed ? 'visible' : ''}" id="btn-expand-nucleus-controls" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isLeftCollapsed}" aria-controls="nucleus-controls-panel">
        ${icon('nucleus')}
        <span>${escapeHtml(strings.nucleusTitle)}</span>
        ${icon('chevron-right', 'pill-chevron')}
      </button>

      <div class="control-panel nucleus-control-panel ${this.isLeftCollapsed ? 'collapsed' : ''}" id="nucleus-controls-panel">
        <div class="mobile-drawer-handle"></div>
        ${this.renderLeftHeader(strings)}
        <div class="control-accordion-container nucleus-controls-scroll">
          <div class="control-grid">
            ${this.renderSlidersCard(strings)}
            ${this.renderPrimaryActions(strings)}
            ${this.renderIsotopeCatalog(strings)}
          </div>
        </div>
      </div>

      <div class="physics-panel-container" id="nucleus-physics-container">
        ${this.renderRightPanel(strings)}
      </div>
    `;

    const segreHost = this.container.querySelector('#segre-chart-container') as HTMLElement;
    this.segreChart = new SegreChart(segreHost, (selZ, selN) => {
      void this.refreshNuclide(selZ, selN, null, true);
    });
    this.segreChart.setActiveNuclide(this.currentZ, this.currentN);

    const baHost = this.container.querySelector('#ba-chart-container') as HTMLElement;
    this.baChart = new BindingEnergyChart(baHost);

    this.attachEventListeners();
    this.syncSlidersInPlace(this.currentZ, this.currentN);
  }

  private renderLeftHeader(strings: I18nStrings): string {
    return `
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-header-icon">${icon('nucleus')}</span>
          <h3>${escapeHtml(strings.nucleusTitle)}</h3>
        </div>
        <div class="panel-header-actions">
          <button type="button" class="btn-export-hdr" id="btn-nucleus-export" title="${escapeHtml(strings.exportImage)}" aria-label="${escapeHtml(strings.exportImage)}">
            ${icon('camera')}
            <span>${escapeHtml(strings.exportImage)}</span>
          </button>
          <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-nucleus-controls" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isLeftCollapsed}" aria-controls="nucleus-controls-panel">
            ${icon('chevron-left')}
          </button>
          <button type="button" class="panel-close-btn mobile-only" id="btn-close-nucleus-controls" aria-label="${escapeHtml(strings.infoModalClose)}">
            ${icon('close')}
          </button>
        </div>
      </div>
    `;
  }

  private renderSlidersCard(strings: I18nStrings): string {
    return `
      <div class="nucleon-sliders-card">
        <div class="control-group">
          <div class="control-label-row">
            <label class="control-label" for="slider-protons">
              ${escapeHtml(strings.protonsLabel)}
              <span class="val-badge proton-badge" id="val-protons-badge">Z = ${this.currentZ}</span>
            </label>
            <button type="button" class="btn-info-icon" data-explain="explainAtomicNumber" aria-label="Info">${icon('info')}</button>
          </div>
          <input type="range" class="proton-slider" id="slider-protons" min="1" max="${MAX_Z}" step="1" value="${this.currentZ}" />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label class="control-label" for="slider-neutrons">
              ${escapeHtml(strings.neutronsLabel)}
              <span class="val-badge neutron-badge" id="val-neutrons-badge">N = ${this.currentN}</span>
            </label>
          </div>
          <input type="range" class="neutron-slider" id="slider-neutrons" min="0" max="${MAX_N}" step="1" value="${this.currentN}" />
        </div>
      </div>
    `;
  }

  private renderPrimaryActions(strings: I18nStrings): string {
    const mode: DecayMode = this.currentState ? this.currentState.decayMode : 'beta_minus';
    const canDecay =
      computeDecayDaughter(this.currentZ, this.currentN, mode) !== null &&
      !this.renderer.isDecayAnimating();
    const pillText = formatDecayPillText(mode, strings);
    const scaleActive = this.renderer.isScaleComparisonActive();

    return `
      <div class="nucleus-actions-group">
        <button type="button" class="btn-decay-trigger" id="btn-trigger-decay" data-mode="${mode}" ${canDecay ? '' : 'disabled'}>
          ${icon('radiation')}
          <span class="btn-decay-label">${escapeHtml(strings.simulateDecayBtn)}</span>
          <span class="decay-pill" id="btn-decay-mode-pill" data-mode="${mode}">${escapeHtml(pillText)}</span>
        </button>

        <button type="button" class="btn-action-toggle ${scaleActive ? 'active' : ''}" id="btn-toggle-scale" aria-pressed="${scaleActive}">
          ${icon('atom')}
          <span>${escapeHtml(strings.scaleCompareToggle)}</span>
        </button>

        <div class="scale-ratio-card ${scaleActive ? '' : 'hidden'}" id="scale-ratio-card">
          <div class="scale-ratio-headline" id="val-scale-ratio">R<sub>atom</sub> / R<sub>nucleus</sub> = ~22,240&times;</div>
          <div class="scale-ratio-sub" id="val-scale-radii">67 pm vs 3.01 fm</div>
          <p class="scale-analogy-text">${escapeHtml(strings.scaleAnalogyText)}</p>
        </div>
      </div>
    `;
  }

  private getActivePreset(): IsotopePreset | null {
    return this.currentState ? this.currentState.preset : this.explicitPreset;
  }

  private renderIsotopeCatalog(strings: I18nStrings): string {
    const activePreset = this.getActivePreset();

    const cardsHtml = FAMOUS_ISOTOPES.map((preset) => {
      const a = preset.z + preset.n;
      const isActive = activePreset !== null && preset.id === activePreset.id;
      const isTabStop = preset.id === this.rovingPresetId;
      const pillText = formatDecayPillText(preset.decayMode, strings);

      return `
        <button
          type="button"
          class="isotope-card ${isActive ? 'active' : ''}"
          data-preset-id="${preset.id}"
          role="option"
          aria-selected="${isActive}"
          tabindex="${isTabStop ? '0' : '-1'}"
        >
          <div class="card-header-row">
            <span class="nuclide-badge"><sup>${a}${preset.metastable ? 'm' : ''}</sup>${escapeHtml(preset.symbol)}</span>
            <span class="decay-pill" data-mode="${preset.decayMode}">${escapeHtml(pillText)}</span>
          </div>
          <div class="isotope-counts">${preset.z}p &middot; ${preset.n}n</div>
        </button>
      `;
    }).join('');

    return `
      <div class="molecule-gallery-section isotope-gallery-section">
        <div class="molecule-gallery-header">
          <span class="gallery-title" id="famous-isotopes-heading">${escapeHtml(strings.famousIsotopesTitle)}</span>
          <span class="gallery-count">${FAMOUS_ISOTOPES.length}</span>
        </div>
        <div class="isotope-gallery" id="isotope-gallery" role="listbox" aria-labelledby="famous-isotopes-heading">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  private renderRightPanel(strings: I18nStrings): string {
    const a = this.currentZ + this.currentN;
    const activePreset = this.getActivePreset();
    let symbol = 'C';
    if (this.currentState) {
      symbol = this.currentState.symbol;
    } else if (activePreset) {
      symbol = activePreset.symbol;
    }
    const metastable = activePreset !== null && activePreset.metastable;
    const activeHtml = formatActiveNuclideHtml(a, this.currentZ, symbol, metastable, strings);

    return `
      <button type="button" class="dock-tab-pill dock-right-pill ${this.isRightCollapsed ? 'visible' : ''}" id="btn-expand-nucleus-physics" title="${escapeHtml(strings.expandPanel)}" aria-label="${escapeHtml(strings.expandPanel)}" aria-expanded="${!this.isRightCollapsed}" aria-controls="nucleus-physics-panel">
        ${icon('chevron-left', 'pill-chevron')}
        <span>${escapeHtml(strings.nuclearStabilityTitle)}</span>
        ${icon('chart')}
      </button>

      <div class="orbital-physics-panel nucleus-physics-panel glass-panel ${this.isRightCollapsed ? 'collapsed' : ''}" id="nucleus-physics-panel">
        <div class="mobile-drawer-handle"></div>
        <div class="physics-header">
          <div class="physics-header-top">
            <div class="panel-title-group">
              <span class="panel-header-icon">${icon('chart')}</span>
              <h3>${escapeHtml(strings.nuclearStabilityTitle)}</h3>
            </div>
            <div class="panel-header-actions">
              <button type="button" class="panel-icon-btn panel-collapse-btn desktop-only" id="btn-collapse-nucleus-physics" title="${escapeHtml(strings.collapsePanel)}" aria-label="${escapeHtml(strings.collapsePanel)}" aria-expanded="${!this.isRightCollapsed}" aria-controls="nucleus-physics-panel">
                ${icon('chevron-right')}
              </button>
              <button type="button" class="panel-close-btn mobile-only" id="btn-close-nucleus-physics" aria-label="${escapeHtml(strings.infoModalClose)}">
                ${icon('close')}
              </button>
            </div>
          </div>
          <div class="active-state-badge nuclide-active-header">
            <span class="badge-value" id="val-active-nuclide">${activeHtml}</span>
            <span class="magic-shell-pill hidden" id="val-magic-pill"></span>
          </div>
        </div>

        <div class="physics-section">
          <div class="section-title">
            <h4>${escapeHtml(strings.segreChartTitle)}</h4>
            <button type="button" class="btn-info-icon" data-explain="explainValleyOfStability" aria-label="Info">${icon('info')}</button>
          </div>
          <div class="radial-chart-wrapper segre-chart-wrapper" id="segre-chart-container"></div>
        </div>

        <div class="physics-section">
          <div class="section-title">
            <h4>${escapeHtml(strings.bindingCurveTitle)}</h4>
            <button type="button" class="btn-info-icon" data-explain="explainBindingCurve" aria-label="Info">${icon('info')}</button>
          </div>
          <div class="radial-chart-wrapper ba-chart-wrapper" id="ba-chart-container"></div>
        </div>

        <div class="physics-section nucleus-metrics-section">
          <div class="expectation-grid">
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.bindingEnergyPerNucleon)}</span>
                <button type="button" class="btn-info-icon" data-explain="explainNuclearBinding" aria-label="Info">${icon('info')}</button>
              </div>
              <span class="node-value" id="val-ba-mev">--</span>
            </div>
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.bindingEnergyTotal)}</span>
              </div>
              <span class="node-value" id="val-b-total">--</span>
            </div>
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.nuclearRadiusLabel)}</span>
              </div>
              <span class="node-value" id="val-nuc-radius">--</span>
            </div>
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.optimalZLabel)}</span>
              </div>
              <span class="node-value" id="val-optimal-z">--</span>
            </div>
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.decayModeLabel)}</span>
              </div>
              <span class="node-value" id="val-decay-mode">--</span>
            </div>
            <div class="stat-tile expectation-item">
              <div class="node-header">
                <span class="node-label">${escapeHtml(strings.halfLifeLabel)}</span>
              </div>
              <span class="node-value" id="val-half-life">--</span>
            </div>
          </div>

          <p class="shielding-note isotope-outreach-note hidden" id="val-isotope-note"></p>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    this.bindCollapseListeners();
    this.bindMobileDrawerListeners();
    this.bindSliderAndActionListeners();
    this.bindIsotopeGalleryListeners();
    ExplanationModal.attachInfoButtons(this.container);
  }

  private bindCollapseListeners(): void {
    const leftPanel = this.container.querySelector('#nucleus-controls-panel') as HTMLElement;
    const btnCollapseLeft = this.container.querySelector('#btn-collapse-nucleus-controls') as HTMLElement;
    const btnExpandLeft = this.container.querySelector('#btn-expand-nucleus-controls') as HTMLElement;

    const rightPanel = this.container.querySelector('#nucleus-physics-panel') as HTMLElement;
    const btnCollapseRight = this.container.querySelector('#btn-collapse-nucleus-physics') as HTMLElement;
    const btnExpandRight = this.container.querySelector('#btn-expand-nucleus-physics') as HTMLElement;

    btnCollapseLeft.addEventListener('click', () => {
      this.isLeftCollapsed = true;
      leftPanel.classList.add('collapsed');
      btnCollapseLeft.setAttribute('aria-expanded', 'false');
      btnExpandLeft.classList.add('visible');
      btnExpandLeft.setAttribute('aria-expanded', 'false');
    });

    btnExpandLeft.addEventListener('click', () => {
      this.isLeftCollapsed = false;
      leftPanel.classList.remove('collapsed');
      btnCollapseLeft.setAttribute('aria-expanded', 'true');
      btnExpandLeft.classList.remove('visible');
      btnExpandLeft.setAttribute('aria-expanded', 'true');
    });

    btnCollapseRight.addEventListener('click', () => {
      this.isRightCollapsed = true;
      rightPanel.classList.add('collapsed');
      btnCollapseRight.setAttribute('aria-expanded', 'false');
      btnExpandRight.classList.add('visible');
      btnExpandRight.setAttribute('aria-expanded', 'false');
    });

    btnExpandRight.addEventListener('click', () => {
      this.isRightCollapsed = false;
      rightPanel.classList.remove('collapsed');
      btnCollapseRight.setAttribute('aria-expanded', 'true');
      btnExpandRight.classList.remove('visible');
      btnExpandRight.setAttribute('aria-expanded', 'true');
    });
  }

  private bindMobileDrawerListeners(): void {
    const leftPanel = this.container.querySelector('#nucleus-controls-panel') as HTMLElement;
    const rightContainer = this.container.querySelector('#nucleus-physics-container') as HTMLElement;
    const backdrop = this.container.querySelector('#nucleus-drawer-backdrop') as HTMLElement;
    const btnShowLeft = this.container.querySelector('#btn-show-nucleus-controls') as HTMLElement;
    const btnShowRight = this.container.querySelector('#btn-show-nucleus-physics') as HTMLElement;
    const btnCloseLeft = this.container.querySelector('#btn-close-nucleus-controls') as HTMLElement;
    const btnCloseRight = this.container.querySelector('#btn-close-nucleus-physics') as HTMLElement;

    const closeAllDrawers = () => {
      leftPanel.classList.remove('mobile-open');
      rightContainer.classList.remove('mobile-open');
      backdrop.classList.remove('active');
      btnShowLeft.classList.remove('active');
      btnShowRight.classList.remove('active');
      btnShowLeft.setAttribute('aria-expanded', 'false');
      btnShowRight.setAttribute('aria-expanded', 'false');
    };

    const toggleDrawer = (panel: HTMLElement, trigger: HTMLElement, closeBtn: HTMLElement) => {
      if (panel.classList.contains('mobile-open')) {
        closeAllDrawers();
        return;
      }
      closeAllDrawers();
      panel.classList.add('mobile-open');
      backdrop.classList.add('active');
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      closeBtn.focus();
    };

    btnShowLeft.addEventListener('click', () => toggleDrawer(leftPanel, btnShowLeft, btnCloseLeft));
    btnShowRight.addEventListener('click', () => toggleDrawer(rightContainer, btnShowRight, btnCloseRight));
    btnCloseLeft.addEventListener('click', closeAllDrawers);
    btnCloseRight.addEventListener('click', closeAllDrawers);
    backdrop.addEventListener('click', closeAllDrawers);
  }

  private bindSliderAndActionListeners(): void {
    const protonSlider = this.container.querySelector('#slider-protons') as HTMLInputElement;
    const neutronSlider = this.container.querySelector('#slider-neutrons') as HTMLInputElement;
    const exportBtn = this.container.querySelector('#btn-nucleus-export') as HTMLButtonElement;
    const decayBtn = this.container.querySelector('#btn-trigger-decay') as HTMLButtonElement;
    const scaleBtn = this.container.querySelector('#btn-toggle-scale') as HTMLButtonElement;
    const scaleCard = this.container.querySelector('#scale-ratio-card') as HTMLElement;

    const handleSliderInput = () => {
      const z = Number.parseInt(protonSlider.value, 10);
      const n = Number.parseInt(neutronSlider.value, 10);
      void this.refreshNuclide(z, n, null, true);
    };

    protonSlider.addEventListener('input', handleSliderInput);
    neutronSlider.addEventListener('input', handleSliderInput);

    exportBtn.addEventListener('click', () => this.onExportClick());

    decayBtn.addEventListener('click', () => {
      if (!this.currentState) return;
      const started = this.renderer.triggerDecay(this.currentState.decayMode, (nextZ, nextN) => {
        void this.refreshNuclide(nextZ, nextN, null, true);
      });
      if (started) {
        decayBtn.disabled = true;
      }
    });

    scaleBtn.addEventListener('click', () => {
      const active = this.renderer.toggleScaleComparison();
      scaleBtn.classList.toggle('active', active);
      scaleBtn.setAttribute('aria-pressed', String(active));
      scaleCard.classList.toggle('hidden', !active);
    });
  }

  private bindIsotopeGalleryListeners(): void {
    const gallery = this.container.querySelector('#isotope-gallery') as HTMLElement;

    gallery.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.isotope-card');
      if (!target) return;
      this.selectPresetCard(target, false);
    });

    gallery.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const innerTarget = e.composedPath()[0];
      if (
        innerTarget instanceof Element &&
        innerTarget.matches(':read-write, select, input[type="range"], [role="slider"]')
      ) {
        return;
      }

      const cards = Array.from(gallery.querySelectorAll<HTMLButtonElement>('.isotope-card'));
      const focused = document.activeElement as HTMLButtonElement | null;
      if (!focused || !cards.includes(focused)) return;

      const nextCard = this.resolveGalleryKeyTarget(e.key, focused, cards);
      if (!nextCard) return;

      e.preventDefault();
      this.selectPresetCard(nextCard, true);
    });
  }

  private resolveGalleryKeyTarget(
    key: string,
    focused: HTMLButtonElement,
    cards: readonly HTMLButtonElement[],
  ): HTMLButtonElement | null {
    if (isArrowDirection(key)) {
      return findSpatialCandidate(focused, cards, key) as HTMLButtonElement | null;
    }
    const visible = cards.filter((c) => c.checkVisibility());
    if (visible.length === 0) return null;
    if (key === 'Home') return visible[0];
    if (key === 'End') return visible[visible.length - 1];
    return null;
  }

  private selectPresetCard(card: HTMLButtonElement, moveFocus: boolean): void {
    const id = card.dataset.presetId as IsotopeNoteKey | undefined;
    if (!id) return;

    const preset = getPresetById(id);
    this.rovingPresetId = preset.id;

    if (moveFocus) {
      this.updateRovingTabindex(preset.id);
      card.focus();
      card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    void this.refreshNuclide(preset.z, preset.n, preset, true);
  }

  private updateRovingTabindex(tabStopId: IsotopeNoteKey): void {
    const cards = this.container.querySelectorAll<HTMLButtonElement>('.isotope-card');
    cards.forEach((c) => {
      c.setAttribute('tabindex', c.dataset.presetId === tabStopId ? '0' : '-1');
    });
  }

  private syncSlidersInPlace(z: number, n: number): void {
    const protonSlider = this.container.querySelector('#slider-protons') as HTMLInputElement | null;
    const neutronSlider = this.container.querySelector('#slider-neutrons') as HTMLInputElement | null;
    const protonBadge = this.container.querySelector('#val-protons-badge') as HTMLElement | null;
    const neutronBadge = this.container.querySelector('#val-neutrons-badge') as HTMLElement | null;

    if (protonSlider) {
      protonSlider.value = String(z);
      syncRangeFill(protonSlider);
    }
    if (neutronSlider) {
      neutronSlider.value = String(n);
      syncRangeFill(neutronSlider);
    }
    if (protonBadge) protonBadge.textContent = `Z = ${z}`;
    if (neutronBadge) neutronBadge.textContent = `N = ${n}`;
  }

  private syncStateToDom(state: NuclideState): void {
    const strings = getStrings();
    this.syncLeftPanelState(state, strings);
    this.syncIsotopeCardsState(state);
    this.syncRightPanelState(state, strings);
    this.segreChart?.setActiveNuclide(state.z, state.n);
    this.baChart?.setActiveNuclide(state.a, state.bindingPerNucleonMeV);
  }

  private syncLeftPanelState(state: NuclideState, strings: I18nStrings): void {
    const decayBtn = this.container.querySelector('#btn-trigger-decay') as HTMLButtonElement | null;
    const decayPill = this.container.querySelector('#btn-decay-mode-pill') as HTMLElement | null;
    const ratioHeadline = this.container.querySelector('#val-scale-ratio') as HTMLElement | null;
    const ratioSub = this.container.querySelector('#val-scale-radii') as HTMLElement | null;

    const canDecay =
      computeDecayDaughter(state.z, state.n, state.decayMode) !== null &&
      !this.renderer.isDecayAnimating();

    if (decayBtn) {
      decayBtn.disabled = !canDecay;
      decayBtn.dataset.mode = state.decayMode;
    }
    if (decayPill) {
      decayPill.dataset.mode = state.decayMode;
      decayPill.textContent = formatDecayPillText(state.decayMode, strings);
    }
    if (ratioHeadline) {
      const approxRatio = Math.round(state.scaleRatio).toLocaleString();
      ratioHeadline.innerHTML = `R<sub>atom</sub> / R<sub>nucleus</sub> = ~${escapeHtml(approxRatio)}&times;`;
    }
    if (ratioSub) {
      ratioSub.textContent = `${state.atomRadiusPm} pm vs ${state.radiusFm.toFixed(2)} fm`;
    }
  }

  private syncIsotopeCardsState(state: NuclideState): void {
    const activePreset = state.preset;
    const cards = this.container.querySelectorAll<HTMLButtonElement>('.isotope-card');

    cards.forEach((card) => {
      const id = card.dataset.presetId;
      const isActive = activePreset !== null && id === activePreset.id;
      card.classList.toggle('active', isActive);
      card.setAttribute('aria-selected', String(isActive));
      card.setAttribute('tabindex', id === this.rovingPresetId ? '0' : '-1');
    });
  }

  private syncRightPanelState(state: NuclideState, strings: I18nStrings): void {
    const activeBadge = this.container.querySelector('#val-active-nuclide') as HTMLElement | null;
    const magicPill = this.container.querySelector('#val-magic-pill') as HTMLElement | null;
    const valBa = this.container.querySelector('#val-ba-mev') as HTMLElement | null;
    const valB = this.container.querySelector('#val-b-total') as HTMLElement | null;
    const valR = this.container.querySelector('#val-nuc-radius') as HTMLElement | null;
    const valZOpt = this.container.querySelector('#val-optimal-z') as HTMLElement | null;
    const valMode = this.container.querySelector('#val-decay-mode') as HTMLElement | null;
    const valHalfLife = this.container.querySelector('#val-half-life') as HTMLElement | null;
    const noteEl = this.container.querySelector('#val-isotope-note') as HTMLElement | null;

    if (activeBadge) {
      activeBadge.innerHTML = formatActiveNuclideHtml(
        state.a,
        state.z,
        state.symbol,
        Boolean(state.preset?.metastable),
        strings,
      );
    }

    if (magicPill) {
      const magicText = resolveMagicBadgeText(state, strings);
      magicPill.textContent = magicText;
      magicPill.classList.toggle('hidden', magicText.length === 0);
    }

    if (valBa) valBa.textContent = `${state.bindingPerNucleonMeV.toFixed(2)} MeV`;
    if (valB) valB.textContent = `${state.bindingEnergyMeV.toFixed(1)} MeV`;
    if (valR) valR.textContent = `${state.radiusFm.toFixed(2)} fm`;
    if (valZOpt) valZOpt.textContent = state.optimalZ.toFixed(1);
    if (valMode) {
      valMode.textContent = formatDecayFullLabel(state.decayMode, strings);
      valMode.dataset.mode = state.decayMode;
    }
    if (valHalfLife) {
      valHalfLife.textContent = formatHalfLifeText(state, strings);
    }

    if (noteEl) {
      const note = state.preset ? strings.isotopeNotes[state.preset.id] : '';
      noteEl.textContent = note;
      noteEl.classList.toggle('hidden', note.length === 0);
    }
  }
}
